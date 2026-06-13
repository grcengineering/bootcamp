/**
 * Golden/anti-transcript replay gate (root ISA ISC-73; advisor finding: no verifier may ship
 * without being executed against a known answer AND a near-miss).
 *
 * For every module exercise spec with transcripts:
 *   - replaying golden.jsonl through the engine must satisfy EVERY action task's verifiers
 *   - replaying each anti-*.jsonl must FAIL its targeted task (and name a gap)
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { createShellEngine } from "../src/engines/shell";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import type { ShellSession } from "../src/engines/shell/types";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULES = join(ROOT, "modules");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

function loadSeedSpec(profile: string) {
  const seedDef = manifest.seeds[profile];
  const homeDir = join(FIXTURES, seedDef.home);
  const binDir = join(FIXTURES, seedDef.path_bin);
  const files: { path: string; content?: string; dir?: boolean }[] = [];
  const { readdirSync: rd, statSync, readFileSync: rf } = require("node:fs");
  const { relative } = require("node:path");
  const walk = (dir: string) => {
    for (const name of rd(dir)) {
      const full = join(dir, name);
      const rel = "~/" + relative(homeDir, full);
      if (statSync(full).isDirectory()) { files.push({ path: rel, dir: true }); walk(full); }
      else if (name !== ".gitkeep") files.push({ path: rel, content: rf(full, "utf8") });
    }
  };
  walk(homeDir);
  const tools: Record<string, string> = {};
  for (const name of rd(binDir)) tools[name] = rf(join(binDir, name), "utf8");
  return { files, tools };
}

function newSession(spec: ExerciseSpec): ShellSession {
  const engine = createShellEngine();
  return engine.create({
    variant: spec.engine === "shell-macos" ? "zsh-macos" : "bash-linux",
    seed: loadSeedSpec(spec.seed.profile),
    epoch: manifest.meta.epoch,
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: spec.seed.home,
  });
}

/** Feed one transcript input (may contain heredoc continuation lines). */
function replayInput(session: ShellSession, input: string) {
  const [first, ...rest] = input.split("\n");
  let r = session.exec(first);
  for (const line of rest) {
    if (r.state !== "pending") break;
    r = session.feedStdin(line + "\n");
  }
  if (r.state === "pending") r = session.eof();
  return r;
}

function loadTranscript(path: string): { header: { anti_for?: string; reason?: string } | null; inputs: string[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input) };
}

/** Per-index verify outcomes for one action task against the current session state. */
function outcomesFor(spec: ExerciseSpec, taskId: string, session: ShellSession, expectations: Record<string, string>): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) =>
    runCheck(session, chk as never, { expectations, expectationKey: `${taskId}:${i}` } as VerifyContext),
  );
}

function loadExpectations(spec: ExerciseSpec): Record<string, string> {
  const expectationsPath = join(MODULES, spec.module, "exercises/transcripts/expectations.json");
  return existsSync(expectationsPath) ? JSON.parse(readFileSync(expectationsPath, "utf8")) : {};
}

function verifyAll(spec: ExerciseSpec, session: ShellSession) {
  const expectations = loadExpectations(spec);
  const results: Record<string, { pass: boolean; gaps: string[] }> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    const outs = outcomesFor(spec, task.id, session, expectations);
    const gaps = outs.filter((o) => !o.pass).map((o) => o.gap);
    results[task.id] = { pass: gaps.length === 0, gaps };
  }
  return results;
}

const moduleDirs = readdirSync(MODULES).filter((d) =>
  existsSync(join(MODULES, d, "exercises/transcripts/golden.jsonl")),
);

describe("exercise transcript replay (golden passes, anti fails its target)", () => {
  for (const dir of moduleDirs) {
    const spec = ExerciseSpecSchema.parse(
      parse(readFileSync(join(MODULES, dir, "exercises/exercise.yaml"), "utf8")),
    );
    if (!["shell-linux", "shell-macos"].includes(spec.engine)) continue; // other engines: own suites
    if (spec.seed.profile === "m02") continue; // booted admin-lab session — replayed by exercise-replay-02.test.ts

    test(`${dir}: golden transcript satisfies every action task`, () => {
      const session = newSession(spec);
      const { inputs } = loadTranscript(join(MODULES, dir, "exercises/transcripts/golden.jsonl"));
      for (const input of inputs) replayInput(session, input);
      const results = verifyAll(spec, session);
      for (const [taskId, r] of Object.entries(results)) {
        expect(`${taskId}: ${r.pass ? "pass" : r.gaps.join(" | ")}`).toBe(`${taskId}: pass`);
      }
    });

    const tDir = join(MODULES, dir, "exercises/transcripts");
    for (const anti of readdirSync(tDir).filter((f) => f.startsWith("anti-"))) {
      test(`${dir}: ${anti} fails its targeted task at the named check`, () => {
        const { header, inputs } = loadTranscript(join(tDir, anti));
        expect(header?.anti_for).toBeTruthy();
        const session = newSession(spec);
        for (const input of inputs) replayInput(session, input);
        const results = verifyAll(spec, session);
        const target = results[header!.anti_for!];
        expect(target).toBeDefined();
        expect(target.pass).toBe(false);
        expect(target.gaps.join("")).not.toBe("");
        // H1 discrimination: the named cheat (verify[fails_check]) is what failed, and every
        // action task before the target is intact (near-miss, not an upstream syntax bomb).
        const expectations = loadExpectations(spec);
        assertAntiDiscriminates({
          anti,
          header,
          tasks: spec.tasks.map((t) => ({ id: t.id, type: t.type, verifyLength: t.verify?.length ?? 0 })),
          targetOutcomes: outcomesFor(spec, header!.anti_for!, session, expectations),
          targetCompleted: target.pass,
          priorActionMode: "independent",
        });
      });
    }
  }

  test("at least one module has transcripts (suite is not vacuous)", () => {
    expect(moduleDirs.length).toBeGreaterThan(0);
  });
});
