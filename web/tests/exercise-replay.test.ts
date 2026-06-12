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
import { runCheck, type VerifyContext } from "../src/verifiers/registry";
import type { ShellSession } from "../src/engines/shell/types";

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

function verifyAll(spec: ExerciseSpec, session: ShellSession) {
  const expectationsPath = join(MODULES, spec.module, "exercises/transcripts/expectations.json");
  const expectations = existsSync(expectationsPath) ? JSON.parse(readFileSync(expectationsPath, "utf8")) : {};
  const results: Record<string, { pass: boolean; gaps: string[] }> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    const gaps: string[] = [];
    let pass = true;
    task.verify.forEach((chk, i) => {
      const ctx: VerifyContext = { expectations, expectationKey: `${task.id}:${i}` };
      const out = runCheck(session, chk as never, ctx);
      if (!out.pass) { pass = false; gaps.push(out.gap); }
    });
    results[task.id] = { pass, gaps };
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
      test(`${dir}: ${anti} fails its targeted task`, () => {
        const { header, inputs } = loadTranscript(join(tDir, anti));
        expect(header?.anti_for).toBeTruthy();
        const session = newSession(spec);
        for (const input of inputs) replayInput(session, input);
        const results = verifyAll(spec, session);
        const target = results[header!.anti_for!];
        expect(target).toBeDefined();
        expect(target.pass).toBe(false);
        expect(target.gaps.join("")).not.toBe("");
      });
    }
  }

  test("at least one module has transcripts (suite is not vacuous)", () => {
    expect(moduleDirs.length).toBeGreaterThan(0);
  });
});
