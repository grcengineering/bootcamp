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

// ---------------------------------------------------------------------------
// Wave-2 engine-dispatch primitives (engine_result_equals, validator_passes,
// mapping_score_at_least, api_pull_complete, policy_decision_is,
// repo_state_matches) — pass case + one-token mutation rejection each.
// ---------------------------------------------------------------------------
describe("engine-dispatch primitives — pass case + mutation rejection", () => {
  const s = fakeSession({});

  test("engine_result_equals — stdout literal, generated, exit gate; mutations fail", () => {
    const passCtx: VerifyContext = { ...ctx, engineResult: { stdout: "3\n", stderr: "", exit: 0 } };
    expect(runCheck(s, { check: "engine_result_equals", value: "3" }, passCtx).pass).toBe(true);
    expect(runCheck(s, { check: "engine_result_equals", from: "generated" }, passCtx).pass).toBe(true);
    expect(runCheck(s, { check: "engine_result_equals", value: "3", exit: 0 }, passCtx).pass).toBe(true);
    // mutations: content drift, exit drift, wrong stream, no run yet
    expect(runCheck(s, { check: "engine_result_equals", value: "4" }, passCtx).pass).toBe(false);
    const exit1: VerifyContext = { ...ctx, engineResult: { stdout: "3\n", stderr: "", exit: 1 } };
    expect(runCheck(s, { check: "engine_result_equals", value: "3", exit: 0 }, exit1).pass).toBe(false);
    expect(runCheck(s, { check: "engine_result_equals", stream: "stderr", value: "3" }, passCtx).pass).toBe(false);
    const noRun = runCheck(s, { check: "engine_result_equals", value: "3" }, ctx);
    expect(noRun.pass).toBe(false);
    expect(noRun.gap).toContain("run");
  });

  test("validator_passes — exit + stdout_matches; mutations fail", () => {
    const good: VerifyContext = { ...ctx, validatorRun: { stdout: "PASS: all green\n", stderr: "", exit: 0 } };
    expect(runCheck(s, { check: "validator_passes" }, good).pass).toBe(true);
    expect(runCheck(s, { check: "validator_passes", stdout_matches: "^PASS" }, good).pass).toBe(true);
    // the fail-then-pass arc: a failing validator can be the EXPECTED state of a task
    const failing: VerifyContext = { ...ctx, validatorRun: { stdout: "", stderr: "FAIL: drift\n", exit: 1 } };
    expect(runCheck(s, { check: "validator_passes", exit: 1 }, failing).pass).toBe(true);
    // mutations
    expect(runCheck(s, { check: "validator_passes" }, failing).pass).toBe(false);
    expect(runCheck(s, { check: "validator_passes", stdout_matches: "^FAIL" }, good).pass).toBe(false);
    expect(runCheck(s, { check: "validator_passes" }, ctx).pass).toBe(false);
  });

  test("mapping_score_at_least — floor by count and fraction; mutations fail", () => {
    const score: VerifyContext = { ...ctx, mappingScore: { correct: 7, total: 8 } };
    expect(runCheck(s, { check: "mapping_score_at_least", min_correct: 7 }, score).pass).toBe(true);
    expect(runCheck(s, { check: "mapping_score_at_least", min_fraction: 0.8 }, score).pass).toBe(true);
    // mutations: one row short, fraction short, never scored, paramless rejected
    expect(runCheck(s, { check: "mapping_score_at_least", min_correct: 8 }, score).pass).toBe(false);
    expect(runCheck(s, { check: "mapping_score_at_least", min_fraction: 0.9 }, score).pass).toBe(false);
    expect(runCheck(s, { check: "mapping_score_at_least", min_correct: 1 }, ctx).pass).toBe(false);
    expect(() => runCheck(s, { check: "mapping_score_at_least" } as never, ctx)).toThrow();
  });

  test("api_pull_complete — full cursor walk passes; gaps and known failures fail", () => {
    const full: VerifyContext = {
      ...ctx,
      apiExchanges: [
        { method: "GET", path: "/api/v2/users", cursor: null, status: 200 },
        { method: "GET", path: "/api/v2/users", cursor: "eyJwYWdlIjoyfQ==", status: 200 },
      ],
    };
    const params = { check: "api_pull_complete", collection: "/api/v2/users", cursors: ["", "eyJwYWdlIjoyfQ=="] } as const;
    expect(runCheck(s, { ...params }, full).pass).toBe(true);
    // mutation: second page never pulled
    const partial: VerifyContext = { ...ctx, apiExchanges: [full.apiExchanges![0]] };
    const out = runCheck(s, { ...params }, partial);
    expect(out.pass).toBe(false);
    expect(out.gap).toContain("next_cursor");
    // mutation: last attempt on a page is a KNOWN failure (401) — fails
    const denied: VerifyContext = {
      ...ctx,
      apiExchanges: [
        full.apiExchanges![0],
        { method: "GET", path: "/api/v2/users", cursor: "eyJwYWdlIjoyfQ==", status: 401 },
      ],
    };
    expect(runCheck(s, { ...params }, denied).pass).toBe(false);
    // unknown status (no -i) is not punished — request-side ground truth carries it
    const unknown: VerifyContext = {
      ...ctx,
      apiExchanges: [
        { method: "GET", path: "/api/v2/users", cursor: null, status: null },
        { method: "GET", path: "/api/v2/users", cursor: "eyJwYWdlIjoyfQ==", status: null },
      ],
    };
    expect(runCheck(s, { ...params }, unknown).pass).toBe(true);
    // mutation: nothing pulled at all
    expect(runCheck(s, { ...params }, ctx).pass).toBe(false);
    // mutation: POSTs don't count as a pull
    const posts: VerifyContext = { ...ctx, apiExchanges: [{ method: "POST", path: "/api/v2/users", cursor: null, status: 200 }] };
    expect(runCheck(s, { ...params }, posts).pass).toBe(false);
  });

  test("policy_decision_is — decision + determining policy; mutations fail", () => {
    const evaluated: VerifyContext = {
      ...ctx,
      engineResult: {
        stdout: "ALLOW\nDENY\n", stderr: "", exit: 0,
        artifacts: { decisions: [
          { decision: "allow", reason: ["policy0"] },
          { decision: "deny", reason: [] },
        ]},
      },
    };
    expect(runCheck(s, { check: "policy_decision_is", index: 0, decision: "allow" }, evaluated).pass).toBe(true);
    expect(runCheck(s, { check: "policy_decision_is", index: 1, decision: "deny" }, evaluated).pass).toBe(true);
    expect(runCheck(s, { check: "policy_decision_is", index: 0, decision: "allow", reason_includes: "policy0" }, evaluated).pass).toBe(true);
    // mutations: flipped decision, wrong determining policy, out-of-range index, no run
    expect(runCheck(s, { check: "policy_decision_is", index: 1, decision: "allow" }, evaluated).pass).toBe(false);
    expect(runCheck(s, { check: "policy_decision_is", index: 0, decision: "allow", reason_includes: "policy9" }, evaluated).pass).toBe(false);
    expect(runCheck(s, { check: "policy_decision_is", index: 5, decision: "allow" }, evaluated).pass).toBe(false);
    expect(runCheck(s, { check: "policy_decision_is", index: 0, decision: "allow" }, ctx).pass).toBe(false);
  });

  test("repo_state_matches — branch/branches/HEAD/commit-count; mutations fail", () => {
    const state: VerifyContext = {
      ...ctx,
      repoState: {
        branch: "main",
        branches: ["handle-malformed", "main"],
        headSha: "abc123",
        commits: [
          { oid: "abc123", subject: "Record malformed evidence files as errors instead of crashing", parents: 1 },
          { oid: "def456", subject: "Start with an empty validator on main", parents: 0 },
        ],
      },
    };
    expect(runCheck(s, {
      check: "repo_state_matches", branch: "main", branches_include: ["handle-malformed"],
      head_subject_matches: "malformed", min_commits: 2,
    }, state).pass).toBe(true);
    // mutations
    expect(runCheck(s, { check: "repo_state_matches", branch: "handle-malformed" }, state).pass).toBe(false);
    expect(runCheck(s, { check: "repo_state_matches", branches_include: ["release"] }, state).pass).toBe(false);
    expect(runCheck(s, { check: "repo_state_matches", head_subject_matches: "empty validator" }, state).pass).toBe(false);
    expect(runCheck(s, { check: "repo_state_matches", min_commits: 3 }, state).pass).toBe(false);
    expect(runCheck(s, { check: "repo_state_matches", branch: "main" }, ctx).pass).toBe(false);
  });
});
