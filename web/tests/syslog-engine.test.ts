/**
 * syslog-5424 unit suite (Wave-4): the parser branches the fidelity suite doesn't exercise —
 * the malformed-input errors (the parser refuses to invent structure), the PRI range guard, the
 * SD-PARAM escape handling (§6.3.3), the BOM/no-BOM MSG paths, and the ParseTreeProbe accessors
 * (region/regionAt/decode). Every assertion is over RFC 5424 text; the parser is the oracle.
 * (Coverage floor 95/95 on web/src/engines/visual/syslog.ts.)
 */
import { describe, expect, test } from "bun:test";
import {
  parseSyslog,
  decodePri,
  NILVALUE,
  SYSLOG_FACILITIES,
  SYSLOG_SEVERITIES,
} from "../src/engines/visual/syslog";

const EX1 = "<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - ﻿'su root' failed for lonvick on /dev/pts/8";
const EX4 = '<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3" eventSource="Application" eventID="1011"][examplePriority@32473 class="high"]';

describe("decodePri — the §6.2.1 bit-unpack is pure arithmetic", () => {
  test("boundary PRIVALs decode correctly", () => {
    expect(decodePri(0)).toMatchObject({ facility: 0, severity: 0, facilityName: "kernel messages", severityName: "Emergency" });
    expect(decodePri(191)).toMatchObject({ facility: 23, severity: 7, severityName: "Debug" });
    expect(decodePri(34)).toMatchObject({ facility: 4, severity: 2 });
    expect(decodePri(165)).toMatchObject({ facility: 20, severity: 5 });
  });

  test("a PRIVAL outside the RFC range (0..191) throws", () => {
    expect(() => decodePri(192)).toThrow(/out of RFC 5424 range/);
    expect(() => decodePri(-1)).toThrow(/out of RFC 5424 range/);
    expect(() => decodePri(3.5)).toThrow(/out of RFC 5424 range/);
  });

  test("the exported registries + NILVALUE constant are the cited values", () => {
    expect(NILVALUE).toBe("-");
    expect(Object.keys(SYSLOG_FACILITIES).length).toBe(24); // codes 0..23
    expect(Object.keys(SYSLOG_SEVERITIES).length).toBe(8); // codes 0..7
  });
});

describe("parseSyslog — malformed HEADERs throw with precise messages (no invented structure)", () => {
  test("empty line is the one hard error", () => {
    expect(() => parseSyslog("")).toThrow(/empty syslog line/);
  });
  test("a line not starting with PRI '<' is rejected", () => {
    expect(() => parseSyslog("34>1 ...")).toThrow(/must begin with PRI/);
  });
  test("a PRI missing its '>' or with an empty PRIVAL is rejected", () => {
    expect(() => parseSyslog("<341 ...")).toThrow(/missing '>'/);
    expect(() => parseSyslog("<>1 ...")).toThrow(/missing '>' or empty PRIVAL/);
  });
  test("a non-numeric PRIVAL is rejected", () => {
    expect(() => parseSyslog("<xx>1 ...")).toThrow(/malformed PRIVAL/);
  });
  test("a missing VERSION after PRI is rejected", () => {
    expect(() => parseSyslog("<34> ts host app pid mid -")).toThrow(/missing VERSION/);
  });
  test("a VERSION not followed by a space is rejected", () => {
    expect(() => parseSyslog("<34>1")).toThrow(/VERSION must be followed by a space/);
  });
  test("a HEADER with fewer than five trailing tokens is rejected", () => {
    expect(() => parseSyslog("<34>1 ts host app")).toThrow(/only \d of 5 trailing tokens/);
  });
});

describe("parseSyslog — STRUCTURED-DATA + MSG branches", () => {
  test("NILVALUE structured-data with NO trailing MSG yields no MSG region", () => {
    // a well-formed line whose SD is '-' and which ends right after it
    const line = "<34>1 2003-10-11T22:14:15.003Z host app - ID47 -";
    const p = parseSyslog(line);
    expect(p.region("structured_data")!.value).toContain("NILVALUE");
    expect(p.region("structured_data_msg")).toBeNull();
  });

  test("an SD-PARAM value with escaped quote/backslash/bracket is unescaped (§6.3.3)", () => {
    const line = `<165>1 2003-10-11T22:14:15.003Z host app - - [ex@1 k="a\\"b\\\\c\\]d"]`;
    const p = parseSyslog(line);
    expect(p.region("sd0.id")!.value).toBe("ex@1");
    // the parser strips the escapes: a"b\c]d
    expect(p.region("sd0.param0")!.value).toBe('k="a"b\\c]d"');
  });

  test("a malformed SD-ELEMENT (unbalanced bracket) degrades, never throws", () => {
    // missing closing "]" — the walk stops at the unbalanced element honestly
    const line = `<165>1 2003-10-11T22:14:15.003Z host app - - [ex@1 k="v"`;
    const p = parseSyslog(line);
    // no fully-parsed SD-ELEMENT region is emitted (the walk stopped before "]")
    expect(p.region("sd0")).toBeNull();
    // the structured_data region still exists (degraded, not thrown)
    expect(p.region("structured_data")).not.toBeNull();
  });

  test("a bare-word SD-PARAM (no '=') breaks the element honestly (malformed)", () => {
    // SD-ID then a bareword that is not PARAM-NAME=DQUOTE… → the element can't close cleanly
    const noEq = `<165>1 2003-10-11T22:14:15.003Z host app - - [ex@1 bareword]`;
    const p1 = parseSyslog(noEq);
    expect(p1.region("structured_data")!.value).toContain("malformed");
    expect(p1.region("sd0")).toBeNull();
  });

  test("an SD-PARAM with '=' but no opening quote breaks the element honestly (malformed)", () => {
    // k=v has no DQUOTE after '=' → the element can't close cleanly; walk reports malformed
    const noQuote = `<165>1 2003-10-11T22:14:15.003Z host app - - [ex@1 k=v]`;
    const p2 = parseSyslog(noQuote);
    expect(p2.region("structured_data")!.value).toContain("malformed");
    expect(p2.region("sd0")).toBeNull();
  });

  test("a malformed SD field that is neither '-' nor '[' is spanned + reported, MSG aligns", () => {
    // SD field is "garbage" (no leading '['): the walk spans it to the next SP and the MSG
    // that follows is read from the correct offset (the off-by-one regression guard).
    const line = "<34>1 2003-10-11T22:14:15.003Z host app - - garbage the actual message";
    const p = parseSyslog(line);
    expect(p.region("structured_data")!.value).toContain("malformed");
    expect(p.region("structured_data")!.value).toContain("garbage");
    // MSG begins at the first char after the single SP — no off-by-one
    expect(p.region("structured_data_msg")!.value).toBe("the actual message");
  });

  test("a MSG with NO BOM is reported as plain text from the correct offset", () => {
    // SD is NILVALUE "-", then SP, then the plain MSG — its first char must survive
    const line = "<34>1 2003-10-11T22:14:15.003Z host app - - - plain message here";
    const p = parseSyslog(line);
    const msg = p.region("structured_data_msg")!;
    expect(msg.value).toBe("plain message here");
    expect(msg.value.startsWith("[BOM]")).toBe(false);
  });
});

describe("ParseTreeProbe accessors over a syslog line", () => {
  test("region()/regionAt()/decode() expose the parse tree read-only", () => {
    const p = parseSyslog(EX1);
    // PRI spans <34> = bytes 0..4; regionAt resolves the parent PRI (its facility/severity
    // children share the span and are reached by id, not range)
    expect(p.regionAt({ start: 0, end: 4 })!.id).toBe("pri");
    expect(p.region("pri.facility")!.start).toBe(0);
    // decode() returns the value string for an exact range, null otherwise
    expect(p.decode({ start: 0, end: 4 })).toContain("Facility 4");
    expect(p.decode({ start: 1, end: 999 })).toBeNull();
    expect(p.region("nope")).toBeNull();
    expect(p.regionAt({ start: 7, end: 9 })).toBeNull();
    // byteLength is the line length and equals the root region's end
    expect(p.byteLength).toBe(EX1.length);
    expect(p.byteLength).toBe(p.root.end);
    // every region is reachable in the flattened list
    expect(p.regions.some((r) => r.id === "header")).toBe(true);
    expect(p.regions.some((r) => r.id === "structured_data")).toBe(true);
  });

  test("the two-SD-ELEMENT line exposes both elements by id and range", () => {
    const p = parseSyslog(EX4);
    const sd0 = p.region("sd0")!;
    const sd1 = p.region("sd1")!;
    expect(sd0.label).toBe("SD-ELEMENT");
    expect(sd1.label).toBe("SD-ELEMENT");
    // the two elements are adjacent: sd0.end == sd1.start (they abut, no SP between)
    expect(sd0.end).toBe(sd1.start);
    // each element's span is addressable by range
    expect(p.regionAt({ start: sd0.start, end: sd0.end })!.id).toBe("sd0");
  });
});
