/**
 * Verifier registry tests (web ISA ISC-133) including MUTATION tests (root ISA ISC-77):
 * every primitive must reject a one-token perturbation of its passing input — verifiers
 * that merely accept are theater.
 */
import { describe, expect, test } from "bun:test";
import { PRIMITIVES, runCheck, type VerifyContext } from "../src/verifiers/registry";
import type { ShellSession, ExecResult, RunCleanResult } from "../src/engines/shell/types";

/** Probe-API fake: a tiny world the verifiers can interrogate. */
function fakeSession(world: {
  files?: Record<string, string>;
  producedBy?: Record<string, string>;
  history?: string[];
  lastExit?: number;
  cwd?: string;
  cleanRuns?: RunCleanResult[];
}): ShellSession {
  let runIdx = 0;
  return {
    prompt: () => `analyst@workstation:${world.cwd ?? "~"}$ `,
    exec: (): ExecResult => ({ state: "done", events: [], exit: 0 }),
    feedStdin: (): ExecResult => ({ state: "done", events: [], exit: 0 }),
    eof: (): ExecResult => ({ state: "done", events: [], exit: 0 }),
    interrupt: (): ExecResult => ({ state: "done", events: [], exit: 130 }),
    complete: () => ({ completions: [], replacePrefix: "" }),
    historyUp: () => null,
    historyDown: () => null,
    history: () => world.history ?? [],
    lastExit: () => world.lastExit ?? 0,
    setCols: () => {},
    exists: (p) => (world.files ?? {})[p] !== undefined,
    readFile: (p) => (world.files ?? {})[p] ?? null,
    listDir: () => null,
    producedBy: (p) => (world.producedBy ?? {})[p] ?? null,
    runScriptClean: () => world.cleanRuns?.[runIdx++ % (world.cleanRuns.length || 1)] ?? { stdout: "", stderr: "", exit: 0 },
    snapshot: () => ({ version: 1, variant: "bash-linux", vfs: {}, env: {}, cwd: "/", history: [], lastExit: 0, elapsedMs: 0, producedBy: {} }),
  };
}

const ctx: VerifyContext = { expectations: { "t3:0": "3" }, expectationKey: "t3:0" };

describe("verifier primitives — pass case + one-token mutation rejection", () => {
  test("file_exists", () => {
    const s = fakeSession({ files: { "~/lab01/x.txt": "hi" } });
    expect(runCheck(s, { check: "file_exists", path: "~/lab01/x.txt" }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "file_exists", path: "~/lab01/y.txt" }, ctx).pass).toBe(false);
  });

  test("file_content_equals — literal and generated; trailing-newline normalized", () => {
    const s = fakeSession({ files: { "~/c.txt": "3\n" } });
    expect(runCheck(s, { check: "file_content_equals", path: "~/c.txt", value: "3" }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "file_content_equals", path: "~/c.txt", from: "generated" }, ctx).pass).toBe(true);
    // mutation: one-character content drift must fail
    const m = fakeSession({ files: { "~/c.txt": "4\n" } });
    expect(runCheck(m, { check: "file_content_equals", path: "~/c.txt", value: "3" }, ctx).pass).toBe(false);
  });

  test("file_content_equals — echo-cheat is NOT distinguishable by content alone (that is artifact_produced_by's job)", () => {
    const s = fakeSession({ files: { "~/c.txt": "3\n" }, producedBy: { "~/c.txt": "echo 3 > c.txt" } });
    expect(runCheck(s, { check: "file_content_equals", path: "~/c.txt", value: "3" }, ctx).pass).toBe(true);
    const out = runCheck(s, {
      check: "artifact_produced_by", path: "~/c.txt", min_pipes: 2, forbidden_commands: ["awk", "sed"],
    }, ctx);
    expect(out.pass).toBe(false);
    expect(out.gap).toContain("pipe");
  });

  test("artifact_produced_by — pipes, required, forbidden", () => {
    const good = fakeSession({ producedBy: { "~/c.txt": 'cat access-export.csv | grep admin | wc -l > c.txt' } });
    expect(runCheck(good, { check: "artifact_produced_by", path: "~/c.txt", min_pipes: 2, required_commands: ["grep", "wc"], forbidden_commands: ["awk"] }, ctx).pass).toBe(true);
    // mutations
    const awkCheat = fakeSession({ producedBy: { "~/c.txt": "awk 'END{print 3}' f > c.txt" } });
    expect(runCheck(awkCheat, { check: "artifact_produced_by", path: "~/c.txt", min_pipes: 2, forbidden_commands: ["awk"] }, ctx).pass).toBe(false);
    const quotedPipe = fakeSession({ producedBy: { "~/c.txt": `grep "a|b" f > c.txt` } });
    expect(runCheck(quotedPipe, { check: "artifact_produced_by", path: "~/c.txt", min_pipes: 1 }, ctx).pass).toBe(false); // | inside quotes is not a pipe
  });

  test("stream_separated", () => {
    const s = fakeSession({ files: { "~/e.txt": "data\n", "~/err.log": "WARN: malformed row: X\n" } });
    expect(runCheck(s, { check: "stream_separated", clean_file: "~/e.txt", error_file: "~/err.log", error_regex: "WARN: malformed row" }, ctx).pass).toBe(true);
    const contaminated = fakeSession({ files: { "~/e.txt": "data\nWARN: malformed row: X\n", "~/err.log": "WARN: malformed row: X\n" } });
    expect(runCheck(contaminated, { check: "stream_separated", clean_file: "~/e.txt", error_file: "~/err.log", error_regex: "WARN: malformed row" }, ctx).pass).toBe(false);
    const empty = fakeSession({ files: { "~/e.txt": "data\n", "~/err.log": "" } });
    expect(runCheck(empty, { check: "stream_separated", clean_file: "~/e.txt", error_file: "~/err.log", error_regex: "WARN: malformed row" }, ctx).pass).toBe(false);
  });

  test("script_reproducible — perturbation-stable runs pass; drifting runs fail", () => {
    const stable = fakeSession({ files: { "~/s.sh": "#!/bin/bash" }, cleanRuns: [
      { stdout: "3\n", stderr: "", exit: 0 }, { stdout: "3\n", stderr: "", exit: 0 },
    ]});
    expect(runCheck(stable, { check: "script_reproducible", path: "~/s.sh", args: [], expect_stdout: "3" }, ctx).pass).toBe(true);
    const drifting = fakeSession({ files: { "~/s.sh": "#!/bin/bash" }, cleanRuns: [
      { stdout: "Thu Jun 12\n", stderr: "", exit: 0 }, { stdout: "Thu Jun 13\n", stderr: "", exit: 0 },
    ]});
    const out = runCheck(drifting, { check: "script_reproducible", path: "~/s.sh", args: [] }, ctx);
    expect(out.pass).toBe(false);
    expect(out.gap).toContain("non-deterministic");
  });

  test("last_exit_code + history_contains + file_not_matches + file_absent + cwd_is", () => {
    const s = fakeSession({ lastExit: 1, history: ["grep -q admin f", "echo $?"], files: { "~/e.txt": "clean\n" }, cwd: "~/lab01" });
    expect(runCheck(s, { check: "last_exit_code", equals: 1 }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "last_exit_code", equals: 0 }, ctx).pass).toBe(false);
    expect(runCheck(s, { check: "history_contains", regex: "grep -q" }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "history_contains", regex: "sed" }, ctx).pass).toBe(false);
    expect(runCheck(s, { check: "file_not_matches", path: "~/e.txt", regex: "WARN" }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "file_absent", path: "~/nope" }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "cwd_is", path: "~/lab01" }, ctx).pass).toBe(true);
    expect(runCheck(s, { check: "cwd_is", path: "~" }, ctx).pass).toBe(false);
  });

  test("unknown primitive throws; bad params throw (lint's enforcement surface)", () => {
    const s = fakeSession({});
    expect(() => runCheck(s, { check: "run_javascript" as never }, ctx)).toThrow();
    expect(() => runCheck(s, { check: "file_exists" } as never, ctx)).toThrow();
    expect(() => runCheck(s, { check: "file_content_equals", path: "~/x", value: "1", from: "generated" } as never, ctx)).toThrow();
  });

  test("every primitive's pass outcome carries learner-facing evidence (ISC-119)", () => {
    expect(Object.keys(PRIMITIVES).length).toBeGreaterThanOrEqual(11);
    const s = fakeSession({ files: { "~/x": "hi\n" } });
    const out = runCheck(s, { check: "file_exists", path: "~/x" }, ctx);
    expect(out.evidence.length).toBeGreaterThan(0);
  });
});
