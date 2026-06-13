/**
 * Module-11 golden/anti replay gate (root ISA ISC-73; web ISA ISC-83/137) — the
 * builder-engine equivalent of tests/exercise-replay.test.ts, which covers the
 * shell-engine modules and deliberately skips `engine: builder` specs.
 *
 * The exercise's surface is the Lab Player's BuilderHost (workspace + the ported
 * validate-coverage.ts validator, byte-accepted against real `bun` runs in
 * tests/fixtures/builder-captures.json m11). Transcript inputs are the UI's own
 * affordances, one JSONL line each:
 *
 *   edit <path>\n<full new contents>   write-through textarea edit (BuilderSurface editBuffer)
 *   run-validator                      the "Run validator" button — the lab's
 *                                      `bun validate-coverage.ts work/coverage-map.csv …` step
 *   capture-output <path>              copy the last run's complete output — stdout then
 *                                      stderr, exactly as the output panel displays them —
 *                                      into a file (the §6 `> file 2>&1` capture step; for
 *                                      this validator the single stdout summary line precedes
 *                                      every stderr line in the real interleaved order too)
 *
 * Verification mirrors LabPlayer.verifyTasks exactly: after every input, tasks are
 * checked IN ORDER; completed tasks stay completed (monotone); the sweep stops at the
 * first incomplete task and at the first reflection. Golden must complete every action
 * task; each anti must leave its targeted task incomplete with a named gap.
 *
 * Fixture honesty cross-checks: the seeded work/ files are canon-locked to the module's
 * committed lab assets (what `bash setup.sh ./work` stages), the untouched-seed verdict
 * byte-matches the captured real `bun` run (seed-two-defects-FAIL), and the golden's
 * earned fail→pass pair byte-matches the captured FAIL and PASS runs — including the
 * learner-kept capture files.
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
const EX = join(ROOT, "modules/11-threat-informed-grc/exercises");
const TDIR = join(EX, "transcripts");
const SEED_HOME = join(ROOT, ".ci/fixtures/seeds/m11/home");
const LABS = join(ROOT, "modules/11-threat-informed-grc/labs");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(EX, "exercise.yaml"), "utf8")),
);

const expectations: Record<string, string> = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(TDIR, "expectations.json"), "utf8")) as Record<string, string>,
  ).filter(([k]) => !k.startsWith("_")),
);

const builderCaptures = JSON.parse(
  readFileSync(join(dirname(new URL(import.meta.url).pathname), "fixtures/builder-captures.json"), "utf8"),
) as {
  m11: {
    seed: Record<string, string>;
    cases: Array<{ id: string; argv: string[]; run: { stdout: string; stderr: string; exit: number } }>;
  };
};
const m11Case = (id: string) => builderCaptures.m11.cases.find((c) => c.id === id)!;

/** Same projection the app uses: seed home tree → workspace path → content map. */
function seedFileMap(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name !== ".gitkeep") out[relative(SEED_HOME, full)] = readFileSync(full, "utf8");
    }
  };
  walk(SEED_HOME);
  return out;
}

function newHost(): BuilderHost {
  return new BuilderHost(spec.builder!, seedFileMap());
}

function applyOp(host: BuilderHost, input: string): void {
  if (input === "run-validator") {
    host.runValidator();
    return;
  }
  if (input.startsWith("capture-output ")) {
    const path = input.slice("capture-output ".length).trim();
    const run = host.lastValidatorRun();
    host.workspace.write(path, (run?.stdout ?? "") + (run?.stderr ?? ""));
    return;
  }
  if (input.startsWith("edit ")) {
    const nl = input.indexOf("\n");
    const path = (nl === -1 ? input.slice(5) : input.slice(5, nl)).trim();
    const content = nl === -1 ? "" : input.slice(nl + 1);
    host.workspace.write(path, content);
    return;
  }
  throw new Error(`unknown transcript op: ${input.split("\n")[0]}`);
}

function ctxFor(host: BuilderHost, taskId: string, checkIndex: number): VerifyContext {
  return {
    expectations,
    expectationKey: `${taskId}:${checkIndex}`,
    validatorRun: host.lastValidatorRun(),
    mappingScore: host.lastMappingScore(),
  };
}

/** One verification sweep with LabPlayer.verifyTasks semantics (in order, monotone). */
function sweep(host: BuilderHost, completed: Set<string>): void {
  const session = host.probeSession();
  for (const task of spec.tasks) {
    if (completed.has(task.id)) continue;
    if (task.type === "reflection") break; // reflections gate by saving, not by state
    let pass = true;
    for (let i = 0; i < task.verify.length; i++) {
      let out;
      try {
        out = runCheck(session, task.verify[i] as AnyCheckParams, ctxFor(host, task.id, i));
      } catch {
        pass = false;
        break;
      }
      if (!out.pass) {
        pass = false;
        break;
      }
    }
    if (!pass) break; // strictly sequential, exactly like the app
    completed.add(task.id);
  }
}

/** Gaps for one task against the CURRENT state (anti assertions name the gap). */
function gapsFor(host: BuilderHost, taskId: string): string[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  const session = host.probeSession();
  const gaps: string[] = [];
  task.verify.forEach((chk, i) => {
    try {
      const out = runCheck(session, chk as AnyCheckParams, ctxFor(host, taskId, i));
      if (!out.pass) gaps.push(out.gap);
    } catch (e) {
      gaps.push(String(e));
    }
  });
  return gaps;
}

/** Per-index verify outcomes for one task against the CURRENT state (H1 discrimination). */
function outcomesFor(host: BuilderHost, taskId: string): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  const session = host.probeSession();
  return task.verify.map((chk, i) => {
    try {
      return runCheck(session, chk as AnyCheckParams, ctxFor(host, taskId, i));
    } catch (e) {
      return { pass: false, evidence: "", gap: String(e) };
    }
  });
}

function loadTranscript(path: string): {
  header: { anti_for?: string; reason?: string } | null;
  inputs: string[];
} {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input) };
}

function replay(inputs: string[]): { host: BuilderHost; completed: Set<string> } {
  const host = newHost();
  const completed = new Set<string>();
  for (const input of inputs) {
    applyOp(host, input);
    sweep(host, completed);
  }
  return { host, completed };
}

const actionTasks = spec.tasks.filter((t) => t.type === "action").map((t) => t.id);

describe("module 11 exercise replay (builder engine — golden passes, anti fails its target)", () => {
  test("spec drives the builder surface this suite replays", () => {
    expect(spec.engine).toBe("builder");
    expect(spec.builder?.surface).toBe("workspace");
    expect(spec.builder?.validator).toBe("coverage");
  });

  test("seed ↔ labs setup.sh contract: the staged fixtures are byte-identical", () => {
    // `bash setup.sh ./work` copies exactly these committed assets; the exercise seeds
    // the same bytes (plus its working templates) so sim and real machine agree.
    for (const [seedRel, labRel] of [
      ["work/prioritized-threats.txt", "fixtures/prioritized-threats.txt"],
      ["work/controls-in-scope.txt", "fixtures/controls-in-scope.txt"],
      ["work/coverage-map.csv", "fixtures/coverage-map.csv"],
      ["work/validate-coverage.ts", "validate-coverage.ts"],
    ] as const) {
      const seeded = readFileSync(join(SEED_HOME, seedRel), "utf8");
      const committed = readFileSync(join(LABS, labRel), "utf8");
      expect(`${seedRel}:${seeded}`).toBe(`${seedRel}:${committed}`);
    }
  });

  test("untouched seed satisfies no action task (templates can't pre-pass checks)", () => {
    const host = newHost();
    const completed = new Set<string>();
    sweep(host, completed);
    expect([...completed]).toEqual([]);
  });

  test("untouched-seed verdict byte-matches the REAL `bun` capture (seed-two-defects-FAIL)", () => {
    const host = newHost();
    const run = host.runValidator();
    const captured = m11Case("seed-two-defects-FAIL").run;
    expect(run.stdout).toBe(captured.stdout);
    expect(run.stderr).toBe(captured.stderr);
    expect(run.exit).toBe(captured.exit);
  });

  test("golden transcript satisfies every action task", () => {
    const { completed } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    for (const id of actionTasks) {
      expect(`${id}: ${completed.has(id) ? "pass" : "incomplete"}`).toBe(`${id}: pass`);
    }
  });

  test("golden's earned fail→pass pair byte-matches the captured real runs", () => {
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    const fail = m11Case("seed-two-defects-FAIL").run;
    const pass = m11Case("resolved-PASS").run;

    // The kept capture files are the run's own bytes (stdout then stderr — the panel's
    // order, which for this validator is also the real 2>&1 interleaved order).
    expect(host.workspace.read("work/validation-before.txt")).toBe(fail.stdout + fail.stderr);
    expect(host.workspace.read("work/validation-after.txt")).toBe(pass.stdout + pass.stderr);

    // The final validator run IS the captured resolved-PASS verdict.
    expect(host.lastValidatorRun()).toEqual(pass);

    // …because the golden's final workspace state equals the capture script's resolved
    // inputs byte-for-byte (gap row → CTRL-BACKUP-RESTORE-05,detects; DLP killed).
    expect(host.workspace.read("work/coverage-map.csv")).toBe(
      builderCaptures.m11.seed["coverage-map-resolved.csv"],
    );
    expect(host.workspace.read("work/controls-in-scope.txt")).toBe(
      builderCaptures.m11.seed["controls-resolved.txt"],
    );
  });

  for (const anti of readdirSync(TDIR).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, inputs } = loadTranscript(join(TDIR, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = header!.anti_for!;
      expect(actionTasks).toContain(target);
      const { host, completed } = replay(inputs);
      expect(completed.has(target)).toBe(false);
      const gaps = gapsFor(host, target);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.join("")).not.toBe("");
      // H1 discrimination: the named cheat (verify[fails_check]) is what failed, and (sticky
      // Lab-Player semantics) every action task before the target latched — a near-miss that
      // reaches the targeted seam, not a syntax bomb that dies upstream.
      assertAntiDiscriminates({
        anti,
        header,
        tasks: spec.tasks.map((t) => ({ id: t.id, type: t.type, verifyLength: t.verify?.length ?? 0 })),
        targetOutcomes: outcomesFor(host, target),
        targetCompleted: completed.has(target),
        priorActionMode: "sticky",
        isCompleted: (id) => completed.has(id),
      });
    });
  }

  test("at least two anti-transcripts exist (the cheat and a near-miss)", () => {
    expect(readdirSync(TDIR).filter((f) => f.startsWith("anti-")).length).toBeGreaterThanOrEqual(2);
  });
});
