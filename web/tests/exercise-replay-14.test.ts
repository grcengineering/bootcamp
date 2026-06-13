/**
 * Module-14 golden/anti replay gate (root ISA ISC-73; web ISA ISC-86/137) — the
 * builder-engine equivalent of tests/exercise-replay.test.ts (which covers the
 * shell-engine modules and deliberately skips `engine: builder` specs), following
 * the exercise-replay-08 pattern.
 *
 * The exercise's surface is the Lab Player's BuilderHost (workspace + the ported
 * expected_loss.ts calculator — the original IS TypeScript, carried over verbatim and
 * byte-accepted against real `bun` runs in tests/fixtures/builder-captures.json m14).
 * Transcript inputs are the UI's own affordances, one JSONL line each:
 *
 *   edit <path>\n<full new contents>   write-through textarea edit (BuilderSurface editBuffer)
 *   run-validator                      the "Run validator" button — runs expected-loss
 *                                      against lab14/risk-input.json's CURRENT bytes
 *
 * Verification mirrors LabPlayer.verifyTasks exactly: after every input, tasks are
 * checked IN ORDER; completed tasks stay completed (monotone); the sweep stops at the
 * first incomplete task and at the first reflection. Golden must complete every action
 * task; each anti must leave its targeted task incomplete with a named gap.
 *
 * Fidelity cross-checks: the spec's pinned validator literals (t3 fixture run
 * mean=493516/tailValue=1133873; t4 $5M stress run mean=934417/tailValue=2240391) are
 * verified against BOTH the pinned real-run captures and a LIVE run of the REAL
 * committed modules/14 labs/expected_loss.ts on the golden's edited input bytes —
 * the port and the real tool must agree byte-for-byte (engine-real honesty, ISC-137).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { BuilderHost } from "../src/components/lab/sessions/builder-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const EX = join(ROOT, "modules/14-product-ownership-build-vs-buy/exercises");
const TDIR = join(EX, "transcripts");
const SEED_HOME = join(ROOT, ".ci/fixtures/seeds/m14/home");
const LABS = join(ROOT, "modules/14-product-ownership-build-vs-buy/labs");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(EX, "exercise.yaml"), "utf8")),
);

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
    expectations: {},
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

describe("module 14 exercise replay (builder engine — golden passes, anti fails its target)", () => {
  test("spec drives the builder surface this suite replays", () => {
    expect(spec.engine).toBe("builder");
    expect(spec.builder?.surface).toBe("workspace");
    expect(spec.builder?.validator).toBe("expected-loss");
    expect(spec.builder?.validator_args).toEqual(["lab14/risk-input.json"]);
  });

  test("seed ↔ labs contract: fixture + calculator source are byte-identical to the module's lab", () => {
    const seeded = seedFileMap();
    // The committed fixture and the setup.sh-generated fixture are byte-identical (lab canon).
    expect(seeded["lab14/risk-input.json"]).toBe(
      readFileSync(join(LABS, "fixtures/risk-input.json"), "utf8"),
    );
    // The "read its logic" copy is the real tool's exact source bytes.
    expect(seeded["lab14/expected_loss.ts"]).toBe(
      readFileSync(join(LABS, "expected_loss.ts"), "utf8"),
    );
    // The scoring-table skeleton is the happy-path.sh TSV header, byte-for-byte.
    expect(seeded["lab14/scoring-table.tsv"]).toBe("stage\tdeciding_question\tcall\n");
  });

  test("golden transcript satisfies every action task", () => {
    const { completed } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    for (const id of actionTasks) {
      expect(`${id}: ${completed.has(id) ? "pass" : "incomplete"}`).toBe(`${id}: pass`);
    }
  });

  test("the spec's pinned fixture-run literals are the REAL captured calculator bytes", () => {
    const captures = JSON.parse(
      readFileSync(join(dirname(new URL(import.meta.url).pathname), "fixtures/builder-captures.json"), "utf8"),
    );
    const fixtureCase = captures.m14.cases.find((c: { id: string }) => c.id === "fixture");
    expect(fixtureCase.run.exit).toBe(0);
    // The port's verdict on the seeded fixture byte-matches the real `bun` run.
    const host = newHost();
    const run = host.runValidator();
    expect(run.stdout).toBe(fixtureCase.run.stdout);
    expect(run.stderr).toBe(fixtureCase.run.stderr);
    expect(run.exit).toBe(fixtureCase.run.exit);
    // ...and the spec's t3 stdout_matches literal matches those real bytes (drift tripwire).
    const t3 = spec.tasks.find((t) => t.id === "t3")!;
    const literal = (t3.verify[0] as { stdout_matches?: string }).stdout_matches!;
    expect(new RegExp(literal, "m").test(fixtureCase.run.stdout)).toBe(true);
  });

  test("the t4 stress run ($5M magnitude max) byte-matches a LIVE run of the real tool", () => {
    // Replay golden far enough to capture the edited risk-input bytes the learner produces.
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    const edited = host.workspace.read("lab14/risk-input.json");
    expect(edited).not.toBeNull();
    expect(edited).toContain('"max": 5000000');

    // Real tool, real bun, same bytes (deterministic LCG — no holes needed).
    const work = mkdtempSync(join(tmpdir(), "grc-m14-replay-"));
    try {
      writeFileSync(join(work, "risk-input.json"), edited!);
      const p = Bun.spawnSync([process.execPath, join(LABS, "expected_loss.ts"), "risk-input.json"], {
        cwd: work,
        stdout: "pipe",
        stderr: "pipe",
      });
      const realStdout = new TextDecoder().decode(p.stdout);
      expect(p.exitCode).toBe(0);

      // Port (the host's LAST golden run was exactly this input) == real tool, byte-for-byte.
      expect(host.lastValidatorRun()?.exit).toBe(0);
      expect(host.lastValidatorRun()?.stdout).toBe(realStdout);

      // The spec's t4 stdout_matches literal matches the real bytes (drift tripwire).
      const t4 = spec.tasks.find((t) => t.id === "t4")!;
      const check = t4.verify.find((c) => c.check === "validator_passes") as { stdout_matches?: string };
      expect(new RegExp(check.stdout_matches!, "m").test(realStdout)).toBe(true);
      // Distribution sanity the module teaches: tail > mean (right skew), tail fattened vs fixture.
      const out = JSON.parse(realStdout) as { mean: number; tailValue: number };
      expect(out.tailValue).toBeGreaterThan(out.mean);
      expect(out.tailValue).toBeGreaterThan(1133873);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
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
