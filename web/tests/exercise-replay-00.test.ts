/**
 * Golden/anti-transcript replay gate for BUILDER-engine exercises (root ISA ISC-73) —
 * the builder-surface counterpart of tests/exercise-replay.test.ts (which covers the
 * shell engines and deliberately skips other engine classes).
 *
 * Transcript grammar (one JSON object per line, `input` = the learner's surface action,
 * mapping 1:1 onto what BuilderSurface lets a learner do):
 *   "edit <workspace-path>\n<content>"  — type into the editor: the buffer REPLACES the
 *                                         file's content (textarea semantics)
 *   "run-validator"                     — press the Run validator button
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input,
 * tasks are evaluated in spec order with sticky completion records, stopping at the first
 * unrecorded failure. This matters for module 00's t1, whose pass condition (the validator
 * REJECTING the untouched template) is true only before the document is written — exactly
 * as in the real player, where verification runs after every surface change.
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, with a named gap
 *
 * Cross-checks (fixture honesty): the m00 seed documents are canon-locked to the module's
 * own lab assets via web/tests/fixtures/builder-captures.json (real bash runs), and the
 * BuilderHost's validator verdict on the untouched template byte-matches the REAL docker
 * capture .ci/fixtures/captured/m00-evaluate-template.json.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { BuilderHost } from "../src/components/lab/sessions/builder-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/00-what-grc-engineering-is");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const FIXTURES = join(ROOT, ".ci/fixtures");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

/** Seed files exactly as sync-content.ts emits them (walk home tree, strip `~/`). */
function loadSeedFiles(profile: string): Record<string, string> {
  const homeDir = join(FIXTURES, manifest.seeds[profile].home);
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name !== ".gitkeep") out[relative(homeDir, full)] = readFileSync(full, "utf8");
    }
  };
  walk(homeDir);
  return out;
}

const seedFiles = loadSeedFiles(spec.seed.profile);

function newHost(): BuilderHost {
  if (!spec.builder) throw new Error("lab-00 must declare a builder block");
  return new BuilderHost(spec.builder, { ...seedFiles });
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: BuilderHost, input: string): void {
  if (input === "run-validator") {
    host.runValidator();
    return;
  }
  if (input.startsWith("edit ")) {
    const nl = input.indexOf("\n");
    const path = input.slice(5, nl === -1 ? undefined : nl).trim();
    const content = nl === -1 ? "" : input.slice(nl + 1);
    host.workspace.write(path, content);
    return;
  }
  throw new Error(`unknown builder transcript input: ${input.split("\n")[0]}`);
}

interface ReplayResult {
  recorded: Set<string>;
  /** Last observed gap text per task id (named gap, never the answer). */
  gaps: Record<string, string>;
}

/** LabPlayer.verifyTasks semantics: ordered, sticky, first-failure stops the sweep. */
function verifySweep(host: BuilderHost, state: ReplayResult): void {
  const session = host.probeSession();
  for (const task of spec.tasks) {
    if (state.recorded.has(task.id)) continue;
    if (task.type === "reflection") break; // reflections gate by saving, not by checks
    let failed: string | null = null;
    for (let i = 0; i < task.verify.length; i++) {
      const ctx: VerifyContext = {
        expectations: {},
        expectationKey: `${task.id}:${i}`,
        validatorRun: host.lastValidatorRun(),
        mappingScore: host.lastMappingScore(),
      };
      const out = runCheck(session, task.verify[i] as AnyCheckParams, ctx);
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

function loadTranscript(path: string): { header: { anti_for?: string; reason?: string } | null; inputs: string[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input) };
}

function replay(path: string): { header: { anti_for?: string } | null; state: ReplayResult } {
  const host = newHost();
  const { header, inputs } = loadTranscript(path);
  const state: ReplayResult = { recorded: new Set(), gaps: {} };
  for (const input of inputs) {
    replayInput(host, input);
    verifySweep(host, state);
  }
  return { header, state };
}

describe("module 00 exercise replay (builder engine)", () => {
  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task`, () => {
      const { header, state } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
      // The player surfaced a named gap for the target (it was reached and rejected).
      expect(state.gaps[header!.anti_for!] ?? "").not.toBe("");
    });
  }
});

describe("module 00 fixture honesty cross-checks", () => {
  const builderCaptures = JSON.parse(
    readFileSync(join(dirname(new URL(import.meta.url).pathname), "fixtures/builder-captures.json"), "utf8"),
  );

  test("seeded exemplar is canon-locked to labs/setup.sh output (builder-captures m00)", () => {
    expect(seedFiles["lab00/legacy-vs-engineered-laptop-encryption.md"]).toBe(
      builderCaptures.m00.seed["legacy-vs-engineered-laptop-encryption.md"],
    );
  });

  test("seeded counterexample is canon-locked to labs/happy-path.sh's rejected document", () => {
    expect(seedFiles["lab00/non-conforming.md"]).toBe(builderCaptures.m00.nonConforming);
  });

  test("validator verdict on the untouched template byte-matches the REAL docker capture", () => {
    const captured = JSON.parse(
      readFileSync(join(FIXTURES, "captured/m00-evaluate-template.json"), "utf8"),
    );
    const host = newHost();
    const run = host.runValidator();
    expect(run.stdout).toBe(captured.stdout);
    expect(run.stderr).toBe(captured.stderr);
    expect(run.exit).toBe(captured.exit);
  });

  test("validator verdict on the exemplar byte-matches the REAL docker capture (accepts, exit 0)", () => {
    const captured = JSON.parse(
      readFileSync(join(FIXTURES, "captured/m00-evaluate-exemplar.json"), "utf8"),
    );
    if (!spec.builder) throw new Error("unreachable");
    const host = new BuilderHost(
      { ...spec.builder, validator_args: ["lab00/legacy-vs-engineered-laptop-encryption.md"] },
      { ...seedFiles },
    );
    const run = host.runValidator();
    expect(run.stdout).toBe(captured.stdout);
    expect(run.exit).toBe(captured.exit);
  });
});
