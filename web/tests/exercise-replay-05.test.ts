/**
 * Module-05 transcript replay gate (root ISA ISC-73) — the engine: git counterpart of
 * tests/exercise-replay.test.ts (which deliberately skips non-shell engines).
 *
 * Replays the module-05 exercise transcripts through the SAME composed surface the Lab
 * Player builds for `engine: git` (shell engine + GitEngineAdapter via GitTerminalSession):
 *   - golden.jsonl must satisfy EVERY action task's verifiers (with repo_state_matches
 *     fed by the session's cached real-isomorphic-git state probe)
 *   - every anti-*.jsonl must FAIL its targeted task and name a gap
 *   - the committed `from: generated` expectation must equal the replayed engine state
 *     (the ISC-60 regeneration assertion — literals can't drift from the seed's truth)
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { createShellEngine } from "../src/engines/shell";
import type { SeedSpec } from "../src/engines/shell/types";
import { GitEngineAdapter } from "../src/engines/git";
import { GitTerminalSession } from "../src/components/lab/sessions/git-session";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/05-programming-and-git");
const T_DIR = join(MODULE_DIR, "exercises/transcripts");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

function loadSeedSpec(profile: string): SeedSpec {
  const seedDef = manifest.seeds[profile];
  const homeDir = join(FIXTURES, seedDef.home);
  const files: SeedSpec["files"] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = "~/" + relative(homeDir, full);
      if (statSync(full).isDirectory()) { files.push({ path: rel, dir: true }); walk(full); }
      else if (name !== ".gitkeep") files.push({ path: rel, content: readFileSync(full, "utf8") });
    }
  };
  walk(homeDir);
  return { files, tools: {} }; // m05 seeds no PATH tools (the lab script lives in ~/lab05/labs)
}

function newSession(): GitTerminalSession {
  const shell = createShellEngine().create({
    variant: "bash-linux",
    seed: loadSeedSpec(spec.seed.profile),
    epoch: manifest.meta.epoch,
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: spec.seed.home,
  });
  // Same composition + worktree dir the Lab Player's engine:git dispatch builds.
  const adapter = new GitEngineAdapter({ dir: `${spec.seed.home}/lab05` });
  return new GitTerminalSession(shell, adapter, { epoch: manifest.meta.epoch });
}

/** Feed one transcript input (may contain heredoc continuation lines); git lines are async. */
async function replayInput(session: GitTerminalSession, input: string) {
  const [first, ...rest] = input.split("\n");
  let r = await session.exec(first);
  for (const line of rest) {
    if (r.state !== "pending") break;
    r = await session.feedStdin(line + "\n");
  }
  if (r.state === "pending") r = await session.eof();
  return r;
}

function loadTranscript(path: string): { header: { anti_for?: string; reason?: string } | null; inputs: string[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input) };
}

const expectations: Record<string, string> = JSON.parse(
  readFileSync(join(T_DIR, "expectations.json"), "utf8"),
);

function verifyAll(session: GitTerminalSession) {
  const results: Record<string, { pass: boolean; gaps: string[] }> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    const gaps: string[] = [];
    let pass = true;
    task.verify.forEach((chk, i) => {
      const ctx: VerifyContext = {
        expectations,
        expectationKey: `${task.id}:${i}`,
        repoState: session.repoState(),
      };
      const out = runCheck(session, chk as AnyCheckParams, ctx);
      if (!out.pass) { pass = false; gaps.push(out.gap); }
    });
    results[task.id] = { pass, gaps };
  }
  return results;
}

describe("module-05 exercise replay (engine: git — golden passes, antis fail their targets)", () => {
  test("golden transcript satisfies every action task", async () => {
    const session = newSession();
    const { inputs } = loadTranscript(join(T_DIR, "golden.jsonl"));
    for (const input of inputs) await replayInput(session, input);
    const results = verifyAll(session);
    for (const [taskId, r] of Object.entries(results)) {
      expect(`${taskId}: ${r.pass ? "pass" : r.gaps.join(" | ")}`).toBe(`${taskId}: pass`);
    }
    // Repo-state ground truth beyond per-task gates: the full change-managed history.
    const state = session.repoState();
    expect(state?.branch).toBe("main");
    expect(state?.branches.sort()).toEqual(["handle-malformed", "main"]);
    expect(state?.commits.map((c) => c.subject)).toEqual([
      "Record malformed evidence files as errors instead of crashing",
      "Add encryption-control validator with tests",
      "Start with an empty validator on main",
    ]);
  });

  test("from: generated expectation equals the replayed engine state (ISC-60 regeneration)", async () => {
    const session = newSession();
    const { inputs } = loadTranscript(join(T_DIR, "golden.jsonl"));
    for (const input of inputs) await replayInput(session, input);
    const got = session.readFile("/home/analyst/lab05/evidence/lt-05.json");
    expect(got?.replace(/\n$/, "")).toBe(expectations["t1:2"]);
    // and the engine state matches the docker capture m05-cat-lt05 byte-for-byte
    const capture = JSON.parse(readFileSync(join(FIXTURES, "captured/m05-cat-lt05.json"), "utf8"));
    expect(got).toBe(capture.stdout);
  });

  const antis = readdirSync(T_DIR).filter((f) => f.startsWith("anti-"));
  test("at least the cheat and a near-miss anti-transcripts exist", () => {
    expect(antis.length).toBeGreaterThanOrEqual(2);
  });

  for (const anti of antis) {
    test(`${anti} fails its targeted task`, async () => {
      const { header, inputs } = loadTranscript(join(T_DIR, anti));
      expect(header?.anti_for).toBeTruthy();
      const session = newSession();
      for (const input of inputs) await replayInput(session, input);
      const results = verifyAll(session);
      const target = results[header!.anti_for!];
      expect(target).toBeDefined();
      expect(target!.pass).toBe(false);
      expect(target!.gaps.join("")).not.toBe("");
    });
  }
});
