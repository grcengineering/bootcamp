/**
 * Golden/anti-transcript replay gate for module 10's BUILDER-engine exercise (root ISA
 * ISC-73) — follows tests/exercise-replay-00.test.ts (the builder-surface counterpart of
 * the shell-engine tests/exercise-replay.test.ts, which deliberately skips this engine).
 *
 * Transcript grammar (one JSON object per line, `input` = the learner's surface action,
 * mapping 1:1 onto what BuilderSurface/LabPlayer let a learner do):
 *   "edit <workspace-path>\n<content>"   — type into the editor: the buffer REPLACES the
 *                                          file's content (textarea semantics)
 *   "run-validator"                      — press the Run validator button
 *   "save-reflection <taskId>\n<content>"— save a reflection task's text (LabPlayer's
 *                                          saveReflection: records the task when content
 *                                          is non-empty; reflections are never check-gated)
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input,
 * tasks are evaluated in spec order with sticky completion records, stopping at the first
 * unrecorded failure; an unsaved reflection blocks the sweep (gates by saving). Module 10
 * interleaves reflections (t1/t3/t7) between action tasks exactly as §6 does, so the
 * save-reflection input is load-bearing for reaching t2/t4/t8.
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, with a named gap
 *
 * Cross-checks (fixture honesty): the m10 seed work/ files are canon-locked to the
 * module's own labs/setup.sh output via web/tests/fixtures/builder-captures.json m10
 * (real bash/bun runs), the BuilderHost's verdict on the untouched seed byte-matches the
 * REAL `bun validate-crosswalk.ts` capture (case seed-orphan-FAIL; the spec's one-arg
 * invocation resolves the same families file — proven by case default-families-path),
 * and the committed t5:2 expectation is regenerated from the golden replay (ISC-60).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { BuilderHost } from "../src/components/lab/sessions/builder-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/10-standards-spine");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const FIXTURES = join(ROOT, ".ci/fixtures");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

const expectations: Record<string, string> = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>,
  ).filter(([k]) => !k.startsWith("_")),
);

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
  if (!spec.builder) throw new Error("lab-10 must declare a builder block");
  return new BuilderHost(spec.builder, { ...seedFiles });
}

interface ReplayResult {
  recorded: Set<string>;
  /** Last observed gap text per task id (named gap, never the answer). */
  gaps: Record<string, string>;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: BuilderHost, input: string, state: ReplayResult): void {
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
  if (input.startsWith("save-reflection ")) {
    const nl = input.indexOf("\n");
    const taskId = input.slice("save-reflection ".length, nl === -1 ? undefined : nl).trim();
    const content = nl === -1 ? "" : input.slice(nl + 1).trim();
    const task = spec.tasks.find((t) => t.id === taskId);
    if (!task || task.type !== "reflection") throw new Error(`save-reflection targets a non-reflection task: ${taskId}`);
    if (content) state.recorded.add(taskId); // saveReflection: non-empty content records the task
    return;
  }
  throw new Error(`unknown builder transcript input: ${input.split("\n")[0]}`);
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
        expectations,
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

function replay(path: string): { header: { anti_for?: string; fails_check?: number } | null; state: ReplayResult; host: BuilderHost } {
  const host = newHost();
  const { header, inputs } = loadTranscript(path);
  const state: ReplayResult = { recorded: new Set(), gaps: {} };
  for (const input of inputs) {
    replayInput(host, input, state);
    verifySweep(host, state);
  }
  return { header, state, host };
}

/** Per-index verify outcomes for one task against the CURRENT state (H1 discrimination). */
function outcomesFor(host: BuilderHost, taskId: string): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  const session = host.probeSession();
  return task.verify.map((chk, i) => {
    try {
      const ctx: VerifyContext = {
        expectations,
        expectationKey: `${taskId}:${i}`,
        validatorRun: host.lastValidatorRun(),
        mappingScore: host.lastMappingScore(),
      };
      return runCheck(session, chk as AnyCheckParams, ctx);
    } catch (e) {
      return { pass: false, evidence: "", gap: String(e) };
    }
  });
}

describe("module 10 exercise replay (builder engine)", () => {
  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("golden replay regenerates the committed t5:2 expectation (ISC-60)", () => {
    const { host, state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    expect(state.recorded.has("t5")).toBe(true);
    // After the golden's final (honest-label) re-run, the engine's PASS stdout must equal
    // the committed expectation — the generated value is re-earned, never hand-trusted.
    const last = host.lastValidatorRun();
    expect(last?.exit).toBe(0);
    expect(last?.stdout.replace(/\n$/, "")).toBe(expectations["t5:2"]);
    // And the golden's captured validation-after.txt is exactly that value.
    expect((host.probeSession().readFile("~/validation-after.txt") ?? "").replace(/\n$/, "")).toBe(
      expectations["t5:2"],
    );
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, state, host } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
      // The player surfaced a named gap for the target (it was reached and rejected).
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

describe("module 10 fixture honesty cross-checks", () => {
  const builderCaptures = JSON.parse(
    readFileSync(join(dirname(new URL(import.meta.url).pathname), "fixtures/builder-captures.json"), "utf8"),
  );

  test("seed work/ files are canon-locked to labs/setup.sh output (builder-captures m10)", () => {
    expect(seedFiles["work/spine-families.txt"]).toBe(builderCaptures.m10.seed["spine-families.txt"]);
    expect(seedFiles["work/crosswalk.csv"]).toBe(builderCaptures.m10.seed["crosswalk.csv"]);
  });

  test("golden's validation-before.txt capture byte-matches the engine's failing verdict (2>&1 discipline)", () => {
    // The transcript hand-types the capture (mimicking a learner copying the panel); this
    // pins those bytes to the verdict the engine actually produced at that moment, so the
    // committed transcript can never drift from a real failing run (same honesty rule the
    // anti-hand-typed-verdict transcript enforces on learners).
    const host = newHost();
    const { inputs } = loadTranscript(join(TRANSCRIPTS, "golden.jsonl"));
    const state: ReplayResult = { recorded: new Set(), gaps: {} };
    for (const input of inputs) {
      replayInput(host, input, state);
      if (input.startsWith("edit validation-before.txt")) {
        const run = host.lastValidatorRun();
        expect(run?.exit).toBe(1);
        expect(host.probeSession().readFile("~/validation-before.txt")).toBe(`${run!.stdout}${run!.stderr}`);
        return;
      }
    }
    throw new Error("golden.jsonl never captured validation-before.txt");
  });

  test("validator verdict on the untouched seed byte-matches the REAL bun capture (orphan caught, exit 1)", () => {
    const captured = (builderCaptures.m10.cases as Array<{ id: string; run: { stdout: string; stderr: string; exit: number } }>)
      .find((c) => c.id === "seed-orphan-FAIL");
    expect(captured).toBeDefined();
    const host = newHost();
    const run = host.runValidator();
    expect(run.stdout).toBe(captured!.run.stdout);
    expect(run.stderr).toBe(captured!.run.stderr);
    expect(run.exit).toBe(captured!.run.exit);
  });
});
