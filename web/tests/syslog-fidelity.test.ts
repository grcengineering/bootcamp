/**
 * syslog-5424 fidelity gate (Wave-4 honesty doctrine; the logging module's analogue of
 * pkt-fidelity.test.ts). The RFC 5424 ABNF parse over the §6.5 VERBATIM example lines IS the
 * oracle — this suite asserts the parser's field values equal the RFC-true values recorded in
 * .ci/fixtures/assets/logging/syslog-5424-examples.json. The right-hand side of every assertion
 * is RFC 5424 §6.5 / Table 1 / Table 2; if the parser ever drifts from the spec (or someone
 * edits the fixtures), CI fails. There is no authored answer key — PRIVAL → Facility/Severity is
 * the §6.2.1 arithmetic, and the field tokens are the §6.5 lines themselves.
 *
 * The fidelity suite also carries the task's named acceptance: PRI 34 → Facility 4 (auth),
 * Severity 2 (crit). The remaining branch coverage (BOM, malformed inputs, SD escapes, the
 * range/decode probe) lives in syslog-engine.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseSyslog, decodePri, SYSLOG_FACILITIES, SYSLOG_SEVERITIES } from "../src/engines/visual/syslog";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/logging");
const fixture = JSON.parse(readFileSync(join(ASSETS, "syslog-5424-examples.json"), "utf8")) as {
  lines: Array<{ id: string; chars: number; raw: string; rfc_field_truth: Record<string, unknown> }>;
  diff_pairs: Array<{ clean: { line_ref: string }; broken: { raw: string; discriminating_truth: Record<string, unknown> } }>;
};
const byId = (id: string) => fixture.lines.find((l) => l.id === id)!;

describe("syslog-5424 fidelity — RFC 5424 §6.5 verbatim lines vs the parser", () => {
  test("the task's named acceptance: PRI 34 → Facility 4 (auth), Severity 2 (crit)", () => {
    const d = decodePri(34);
    expect(d.facility).toBe(4);
    expect(d.facilityName).toBe("security/authorization messages");
    expect(d.severity).toBe(2);
    expect(d.severityName).toBe("Critical");
    // and it is read off the real §6.5 Example 1 line, not a constant
    const p = parseSyslog(byId("ex1_auth_failure").raw);
    expect(p.region("pri.facility")!.value).toBe("4 = security/authorization messages (PRIVAL 34 >> 3)");
    expect(p.region("pri.severity")!.value).toBe("2 = Critical (PRIVAL 34 & 7)");
  });

  test("PRIVAL 165 → Facility 20 (local4), Severity 5 (Notice) — the RFC's own worked example", () => {
    const d = decodePri(165);
    expect(d.facility).toBe(20);
    expect(d.severity).toBe(5);
    expect(d.severityName).toBe("Notice");
  });

  test("Example 1 (auth failure) tokenizes to its RFC-true HEADER, NILVALUEs, and BOM'd MSG", () => {
    const l = byId("ex1_auth_failure");
    expect(l.raw.length).toBe(l.chars); // the committed fixture cannot silently drift in length
    const p = parseSyslog(l.raw);
    const t = l.rfc_field_truth as {
      version: string;
      timestamp: string;
      hostname: string;
      app_name: string;
      msgid: string;
      msg: string;
    };
    expect(p.region("version")!.value).toBe(t.version);
    expect(p.region("timestamp")!.value).toBe(t.timestamp);
    expect(p.region("hostname")!.value).toBe(t.hostname);
    expect(p.region("app_name")!.value).toBe(t.app_name);
    // PROCID is NILVALUE "-" → read as a real "absent" (§6.2.6)
    expect(p.region("procid")!.value).toBe("- (NILVALUE — absent)");
    expect(p.region("msgid")!.value).toBe(t.msgid);
    // STRUCTURED-DATA NILVALUE (§6.3)
    expect(p.region("structured_data")!.value).toContain("NILVALUE");
    // MSG carried the real UTF-8 BOM (§6.4), stripped + flagged, then the cited text
    const msg = p.region("structured_data_msg")!;
    expect(msg.value.startsWith("[BOM] ")).toBe(true);
    expect(msg.value).toContain(t.msg as string);
  });

  test("Example 2 (do-nuts) reads PROCID present + MSGID NILVALUE, no SD, no BOM", () => {
    const l = byId("ex2_donuts");
    expect(l.raw.length).toBe(l.chars);
    const p = parseSyslog(l.raw);
    expect(p.region("procid")!.value).toBe("8710");
    expect(p.region("msgid")!.value).toBe("- (NILVALUE — absent)");
    expect(p.region("structured_data")!.value).toContain("NILVALUE");
    // no BOM → MSG is the cleartext line, no "[BOM]" prefix
    expect(p.region("structured_data_msg")!.value.startsWith("[BOM]")).toBe(false);
    expect(p.region("structured_data_msg")!.value).toContain("do-nuts");
  });

  test("Example 3 walks one SD-ELEMENT into its SD-ID and SD-PARAMs", () => {
    const l = byId("ex3_sd_one");
    expect(l.raw.length).toBe(l.chars);
    const p = parseSyslog(l.raw);
    expect(p.region("structured_data")!.value).toBe("1 SD-ELEMENT");
    expect(p.region("sd0.id")!.value).toBe("exampleSDID@32473");
    // the three named params, decoded from the quoted PARAM-VALUEs (§6.3.3)
    expect(p.region("sd0.param0")!.value).toBe('iut="3"');
    expect(p.region("sd0.param1")!.value).toBe('eventSource="Application"');
    expect(p.region("sd0.param2")!.value).toBe('eventID="1011"');
    expect(p.region("structured_data_msg")!.value).toContain("An application event log entry");
  });

  test("Example 4 walks TWO adjacent SD-ELEMENTs and no trailing MSG", () => {
    const l = byId("ex4_sd_two");
    expect(l.raw.length).toBe(l.chars);
    const p = parseSyslog(l.raw);
    expect(p.region("structured_data")!.value).toBe("2 SD-ELEMENTs");
    expect(p.region("sd0.id")!.value).toBe("exampleSDID@32473");
    expect(p.region("sd1.id")!.value).toBe("examplePriority@32473");
    expect(p.region("sd1.param0")!.value).toBe('class="high"');
    // no SP+MSG after the closing "]" → no MSG region
    expect(p.region("structured_data_msg")).toBeNull();
  });

  test("the Diff-the-Trace broken leg's Severity is the parser's computed divergence", () => {
    const pair = fixture.diff_pairs[0];
    // clean leg is Critical (severity 2); broken leg downgrades to Debug (severity 7)
    const clean = parseSyslog(byId(pair.clean.line_ref).raw);
    const broken = parseSyslog(pair.broken.raw);
    expect(clean.region("pri.severity")!.value.startsWith("2")).toBe(true);
    expect(broken.region("pri.severity")!.value.startsWith("7")).toBe(true);
    // same Facility (4) — only the severity moved, as the committed truth records
    const bt = pair.broken.discriminating_truth as { "pri.facility": { code: number }; "pri.severity": { code: number } };
    expect(decodePri(39).facility).toBe(bt["pri.facility"].code);
    expect(decodePri(39).severity).toBe(bt["pri.severity"].code);
  });

  test("Table 1 / Table 2 code registries match RFC 5424 at the canary codes", () => {
    expect(SYSLOG_FACILITIES[0]).toBe("kernel messages");
    expect(SYSLOG_FACILITIES[4]).toBe("security/authorization messages");
    expect(SYSLOG_FACILITIES[20]).toBe("local use 4 (local4)");
    expect(SYSLOG_SEVERITIES[0]).toBe("Emergency");
    expect(SYSLOG_SEVERITIES[2]).toBe("Critical");
    expect(SYSLOG_SEVERITIES[5]).toBe("Notice");
    expect(SYSLOG_SEVERITIES[7]).toBe("Debug");
  });
});
