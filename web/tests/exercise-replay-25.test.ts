/**
 * Golden/anti-transcript replay gate for the module-25 logging-telemetry-observability exercise
 * (root ISA ISC-73) — the syslog `visual` counterpart of exercise-replay-16/18/22.test.ts. The host
 * composes three surfaces over the SAME real RFC 5424 lines, exactly how module 22 composes several
 * oracles/modes in one host: the PEEL/Diff panels (each a parseSyslog tree), the born-vs-queried
 * pipeline TRACE, and the field->control MAP.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "read"?: <value> }   // PEEL/Diff
 *   { "order": [<cardIdx>, …] }                                          // TRACE (pipeline)
 *   { "place": <itemId>, "zone": <zone> }                                // MAP (field->control)
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a named region
 * (revealing the parser's real decode), read a field value, order the pipeline cards, place a card.
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input, tasks are
 * evaluated in spec order with sticky completion records, stopping at the first unrecorded failure.
 * The probe surfaces are the SAME the player builds — ctx.parseTree (active panel's syslog parse
 * tree), ctx.visual (the just-performed select/read), ctx.trace (the pipeline sim), ctx.map.
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: the panels are built by parsing the committed REAL RFC 5424 §6.5 lines through
 * the SAME `syslog` parser the browser surface uses, and the parser's decode is fidelity-checked
 * against the RFC's own worked values in syslog-fidelity.test.ts (PRIVAL 34 -> Facility 4 / Severity 2
 * Critical; the broken twin's PRIVAL 39 -> Severity 7 Debug). The PRI bit-unpack over the real
 * characters IS the oracle; the discriminating field is its computed arithmetic, never a stored answer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { parseSyslog } from "../src/engines/visual/syslog";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/25-logging-telemetry-observability");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const FIXTURE = join(ROOT, ".ci/fixtures/assets/logging/syslog-5424-examples.json");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

interface SyslogLine {
  id: string;
  raw: string;
}
interface DiffPair {
  id: string;
  clean: { line_ref: string };
  broken: { raw: string };
}
interface SyslogFixture {
  lines: SyslogLine[];
  diff_pairs: DiffPair[];
}

function loadFixture(): SyslogFixture {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as SyslogFixture;
}

/**
 * Build the module-25 VisualHost: one PEEL panel per real line + the clean/broken Diff pair (each a
 * parseSyslog tree over the REAL characters), the born-vs-queried pipeline as orderable TRACE cards,
 * and the field->control MAP board. The declared spec oracle/mode (syslog/diff-the-trace) keys the
 * Diff spine; the multi-mode host is exactly how module 22 composes several surfaces in one host.
 */
function newHost(): VisualHost {
  if (!spec.visual) throw new Error("lab-25 must declare a visual: block");
  const fx = loadFixture();
  const byId = (id: string) => fx.lines.find((l) => l.id === id)!.raw;
  const pair = fx.diff_pairs[0];

  const panels: VisualHostOptions["panels"] = [
    // PEEL: the real auth-failure line (Facility 4 / Severity 2 Critical).
    { id: "ex1-clean", label: "Auth failure (PRIVAL 34 → Critical)", tree: parseSyslog(byId("ex1_auth_failure")) },
    // PEEL: the structured line (one SD-ELEMENT; PRIVAL 165 → local4 / Notice).
    { id: "ex3-structured", label: "Structured event (SD-ELEMENT)", tree: parseSyslog(byId("ex3_sd_one")) },
    // The application-log line (do-nuts; the audit-vs-application classification leg).
    { id: "ex2-application", label: "Application log (do-nuts)", tree: parseSyslog(byId("ex2_donuts")) },
    // Diff-the-Trace: the clean Critical line vs the real downgraded-to-Debug twin.
    { id: "pair-auth-severity-clean", label: "auth-severity · clean (Critical)", tree: parseSyslog(byId(pair.clean.line_ref)) },
    { id: "pair-auth-severity-broken", label: "auth-severity · broken (Debug)", tree: parseSyslog(pair.broken.raw) },
  ];

  // TRACE: the log pipeline as five orderable cards. The canonical accepted sequence is the stages in
  // declared order (source → collector → store → query → alert); the sim's reachedEndState IS the
  // consequence, never an authored "correct". assign_routing stays off (cards carry canonical routing).
  const stages = [
    { from: "event", to: "collector", type: "source" },
    { from: "source", to: "store", type: "collector" },
    { from: "collector", to: "query", type: "store" },
    { from: "store", to: "alert", type: "query" },
    { from: "query", to: "operator", type: "alert" },
  ];
  const canonical = { "log-pipeline": stages.map((s) => ({ from: s.from, to: s.to, type: s.type })) };

  // MAP: each deciding field onto the control it evidences (cited NIST 800-53 / SOC 2 key) + the
  // audit-vs-application classification of two real lines. The cited key IS the oracle.
  const mapItems = [
    { id: "pri-severity", label: "PRI Severity (auth alerting)", keyZone: "ac7-ia5", keyRef: "NIST 800-53 AC-7 / IA-5" },
    { id: "audit-content", label: "Actor / time / outcome (audit content)", keyZone: "au3", keyRef: "NIST 800-53 AU-3; SOC 2 CC7.2" },
    { id: "retention-horizon", label: "Store retention horizon", keyZone: "au11", keyRef: "NIST 800-53 AU-11" },
    { id: "auth-failure-line", label: "su auth-failure line", keyZone: "audit", keyRef: "§4.7 audit record (who/what/when/outcome)" },
    { id: "do-nuts-line", label: "do-nuts line", keyZone: "application", keyRef: "§4.7 application log (debugging noise)" },
  ];

  return new VisualHost({
    mode: spec.visual.mode,
    oracle: spec.visual.oracle,
    panels,
    trace: { canonical, cards: stages, participants: ["event", "collector", "source", "store", "query", "alert", "operator"] },
    map: { zones: ["ac7-ia5", "au3", "au11", "audit", "application"], items: mapItems },
  });
}

interface VisualAction {
  panel?: string;
  select?: string;
  read?: string;
  /** TRACE: the assembled card order, as indices into the pipeline seed deck. */
  order?: number[];
  /** MAP: place a field/line card onto its control/classification zone. */
  place?: string;
  zone?: string;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: VisualHost, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.read !== undefined) host.setValue(input.read);
  if (input.order !== undefined) {
    host.resetTrace();
    for (const idx of input.order) host.appendTraceCard(idx);
  }
  if (input.place !== undefined && input.zone !== undefined) host.place(input.place, input.zone);
}

/** The VerifyContext the player builds for the visual surface. */
function ctxFor(host: VisualHost, taskId: string, i: number): VerifyContext {
  return {
    expectations: loadExpectations(),
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace: host.traceProbe(),
    map: host.mapProbe(),
  };
}

function loadExpectations(): Record<string, string> {
  const raw = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

interface ReplayState {
  recorded: Set<string>;
  gaps: Record<string, string>;
}

/** LabPlayer.verifyTasks semantics: ordered, sticky, first-failure stops the sweep. */
function verifySweep(host: VisualHost, state: ReplayState): void {
  for (const task of spec.tasks) {
    if (state.recorded.has(task.id)) continue;
    if (task.type === "reflection") break; // reflections gate by saving, not by checks
    let failed: string | null = null;
    for (let i = 0; i < task.verify.length; i++) {
      const out = runCheck(host.probeSession(), task.verify[i] as AnyCheckParams, ctxFor(host, task.id, i));
      if (!out.pass) {
        failed = out.gap;
        break;
      }
    }
    if (failed !== null) {
      state.gaps[task.id] = failed;
      break;
    }
    state.recorded.add(task.id);
  }
}

function loadTranscript(path: string): { header: { anti_for?: string; fails_check?: number; reason?: string } | null; inputs: VisualAction[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input as VisualAction) };
}

function replay(path: string): { header: { anti_for?: string; fails_check?: number } | null; state: ReplayState; host: VisualHost } {
  const host = newHost();
  const { header, inputs } = loadTranscript(path);
  const state: ReplayState = { recorded: new Set(), gaps: {} };
  for (const input of inputs) {
    replayInput(host, input);
    verifySweep(host, state);
  }
  return { header, state, host };
}

/** Per-index outcomes for one task against the CURRENT host state (H1 discrimination). */
function outcomesFor(host: VisualHost, taskId: string): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) => {
    try {
      return runCheck(host.probeSession(), chk as AnyCheckParams, ctxFor(host, taskId, i));
    } catch (e) {
      return { pass: false, evidence: "", gap: String(e) };
    }
  });
}

describe("module 25 exercise replay (syslog visual PEEL/TRACE/MAP engine)", () => {
  test("the exercise uses the visual engine over the real RFC 5424 syslog fixture (syslog oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("syslog");
    expect(spec.visual?.mode).toBe("diff-the-trace");
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay read the downgraded Severity off the REAL broken PRI byte (the oracle, not an answer key)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    // after the last action the active panel is the broken twin; its Severity is the parser's
    // arithmetic over the real PRI byte <39> = 4*8+7 → Severity 7 (Debug), the discriminating field.
    const tree = host.parseTree()!;
    expect(tree.region("pri.severity")!.value).toBe("7 = Debug (PRIVAL 39 & 7)");
    expect(tree.region("pri.facility")!.value).toContain("4 = security/authorization"); // same Facility
  });

  test("expectations.json documentation keys equal what the parser decodes (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    const clean = host.panel("ex1-clean")!.tree;
    expect(exp["_clean_hostname"]).toBe(clean.region("hostname")!.value);
    expect(exp["_clean_procid_nilvalue"]).toBe(clean.region("procid")!.value);
    expect(exp["_clean_pri_facility"]).toBe(clean.region("pri.facility")!.value);
    expect(exp["_clean_pri_severity"]).toBe(clean.region("pri.severity")!.value);
    const structured = host.panel("ex3-structured")!.tree;
    expect(exp["_structured_sd_id"]).toBe(structured.region("sd0.id")!.value);
    expect(exp["_structured_sd_eventid"]).toBe(structured.region("sd0.param2")!.value);
    const application = host.panel("ex2-application")!.tree;
    expect(exp["_application_pri_facility"]).toBe(application.region("pri.facility")!.value);
    const broken = host.panel("pair-auth-severity-broken")!.tree;
    expect(exp["_broken_pri_facility"]).toBe(broken.region("pri.facility")!.value);
    expect(exp["_broken_pri_severity"]).toBe(broken.region("pri.severity")!.value);
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, state, host } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
      expect(state.gaps[header!.anti_for!] ?? "").not.toBe("");
      // H1 discrimination: the named cheat (verify[fails_check]) is what failed, and (sticky
      // Lab-Player semantics) every action task before the target is recorded.
      assertAntiDiscriminates({
        anti,
        header,
        tasks: spec.tasks.map((t) => ({ id: t.id, type: t.type, verifyLength: t.verify?.length ?? 0 })),
        targetOutcomes: outcomesFor(host, header!.anti_for!),
        targetCompleted: state.recorded.has(header!.anti_for!),
        priorActionMode: "sticky",
        isCompleted: (id) => state.recorded.has(id),
      });
    });
  }
});
