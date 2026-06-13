/**
 * Module-15 golden/anti replay gate (root ISA ISC-73; web ISA ISC-87/137) — the
 * capstone-surface equivalent of tests/exercise-replay.test.ts, which covers the
 * shell-engine modules and deliberately skips `engine: builder` specs.
 *
 * The exercise's surface is the Lab Player's BuilderHost capstone assembler (the
 * starter repo seeded byte-identically to `bash labs/setup.sh` output via
 * capstone-seed.ts, drift-guarded against builder-captures.json m15.seed) plus the
 * ported validate-capstone.sh (byte-accepted against real bash runs in
 * builder-captures.json m15.cases). Transcript inputs are the UI's own affordances,
 * one JSONL line each:
 *
 *   edit-manifest\n<full new contents>   the capstone-manifest.yaml textarea (editManifest)
 *   validate                             the "Validate capstone" button (validateCapstoneRepo)
 *
 * Verification mirrors LabPlayer.verifyTasks exactly: after every input, tasks are
 * checked IN ORDER; completed tasks stay completed (monotone); the sweep stops at the
 * first incomplete task and at the first reflection. Golden must complete every action
 * task; each anti must leave its targeted task incomplete with a named gap.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { BuilderHost } from "../src/components/lab/sessions/builder-host";
import { capstoneSeedFiles } from "../src/engines/builders";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const EX = join(ROOT, "modules/15-capstone-ship-one-control/exercises");
const TDIR = join(EX, "transcripts");
const SEED_HOME = join(ROOT, ".ci/fixtures/seeds/m15/home");
const LAB_FIXTURES = join(ROOT, "modules/15-capstone-ship-one-control/labs/fixtures");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(EX, "exercise.yaml"), "utf8")),
);

const captures = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures/builder-captures.json"), "utf8"),
) as {
  m15: {
    seed: Record<string, string>;
    cases: Array<{ id: string; argv: string[]; run: { stdout: string; stderr: string; exit: number } }>;
  };
};

const expectations: Record<string, string> = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(TDIR, "expectations.json"), "utf8")) as Record<string, string>,
  ).filter(([k]) => !k.startsWith("_")),
);

/** Same projection the app uses (seedToFileMap): seed home tree → workspace content map. */
function seedFileMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(SEED_HOME).sort()) {
    out[name] = readFileSync(join(SEED_HOME, name), "utf8");
  }
  return out;
}

function newHost(): BuilderHost {
  return new BuilderHost(spec.builder!, seedFileMap());
}

function applyOp(host: BuilderHost, input: string): void {
  if (input === "validate") {
    host.validateCapstoneRepo();
    return;
  }
  if (input.startsWith("edit-manifest")) {
    const nl = input.indexOf("\n");
    host.capstone!.editManifest(nl === -1 ? "" : input.slice(nl + 1));
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

describe("module 15 exercise replay (capstone surface — golden passes, anti fails its target)", () => {
  test("spec drives the capstone surface this suite replays", () => {
    expect(spec.engine).toBe("builder");
    expect(spec.builder?.surface).toBe("capstone");
    expect(spec.builder?.validator).toBe("capstone");
    expect(spec.claim_thread).toBe("laptop-encryption");
  });

  test("seed ↔ labs/setup.sh contract: starter repo byte-identical to the real lab dir", () => {
    // capstone-seed.ts is the assembler's seed; every file must match both the committed
    // fixture source-of-truth and the captured real `bash labs/setup.sh` run (m15.seed).
    const seeded = capstoneSeedFiles();
    expect(seeded["capstone-manifest.yaml"]).toBe(
      readFileSync(join(LAB_FIXTURES, "capstone-manifest.yaml"), "utf8"),
    );
    for (const [path, content] of Object.entries(seeded)) {
      expect(`${path}:${captures.m15.seed[path]}`).toBe(`${path}:${content}`);
    }
  });

  test("exercise seed home carries the committed negative fixture, byte-identical", () => {
    const fromSeed = readFileSync(join(SEED_HOME, "capstone-manifest-incomplete.yaml"), "utf8");
    expect(fromSeed).toBe(readFileSync(join(LAB_FIXTURES, "capstone-manifest-incomplete.yaml"), "utf8"));
    expect(fromSeed).toBe(captures.m15.seed["capstone-manifest-incomplete.yaml"]!);
  });

  test("golden transcript satisfies every action task", () => {
    const { completed } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    for (const id of actionTasks) {
      expect(`${id}: ${completed.has(id) ? "pass" : "incomplete"}`).toBe(`${id}: pass`);
    }
  });

  test("golden's final verdict is byte-identical to the real validator's complete-PASS capture", () => {
    // The ISC-60-equivalent for this surface: replaying golden regenerates the validator's
    // ground-truth bytes (stage mappings end exactly where setup.sh wrote them, so the
    // transcript must equal the real `bash` run's — control: line never appears in output).
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    const real = captures.m15.cases.find((c) => c.id === "complete-PASS")!.run;
    expect(host.lastValidatorRun()?.stdout).toBe(real.stdout);
    expect(host.lastValidatorRun()?.exit).toBe(real.exit);
  });

  test("the coverage proof is reproducible: re-validating after golden changes nothing", () => {
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    const a = host.validateCapstoneRepo();
    const b = host.validateCapstoneRepo();
    expect(a.stdout).toBe(b.stdout);
    expect(a.exit).toBe(0);
    expect(b.exit).toBe(0);
  });

  test("golden walks both MISSING variants before the close (t3 omission, t4 broken claim)", () => {
    // Replay stops after each validate and inspects the verdict the learner saw.
    const host = newHost();
    const verdicts: Array<{ exit: number; stdout: string }> = [];
    for (const input of loadTranscript(join(TDIR, "golden.jsonl")).inputs) {
      applyOp(host, input);
      if (input === "validate") {
        const r = host.lastValidatorRun()!;
        verdicts.push({ exit: r.exit, stdout: r.stdout });
      }
    }
    expect(verdicts.length).toBe(5);
    expect(verdicts[0]!.exit).toBe(0); // t2: re-founded manifest still fully covered
    expect(verdicts[1]!.exit).toBe(1); // t3: the incomplete-fixture shape
    expect(verdicts[1]!.stdout).toContain("  MONITOR     MISSING (no artifact mapped)");
    expect(verdicts[1]!.stdout).toContain("  before/after MISSING (no before_after pointer or file not found)");
    expect(verdicts[2]!.exit).toBe(1); // t4: claimed-but-absent artifact
    expect(verdicts[2]!.stdout).toContain("  MONITOR     MISSING (artifact not found: .github/workflows/monitor.yml)");
    expect(verdicts[2]!.stdout).toContain("  before/after ok -> before-after.md");
    expect(verdicts[3]!.exit).toBe(0); // t5: closed with the artifact that exists
    expect(verdicts[4]!.stdout).toBe(verdicts[3]!.stdout); // t5: identical second run
  });

  test("t3's induced state reproduces the committed incomplete fixture's verdict bytes", () => {
    // The validator over the learner's t3 manifest must print the SAME gap lines the real
    // bash run prints over capstone-manifest-incomplete.yaml (only the manifest differs in
    // its comment header and control line, neither of which reaches the output).
    const host = newHost();
    const inputs = loadTranscript(join(TDIR, "golden.jsonl")).inputs;
    for (const input of inputs.slice(0, 4)) applyOp(host, input); // …through t3's validate
    const real = captures.m15.cases.find((c) => c.id === "incomplete-FAIL")!.run;
    expect(host.lastValidatorRun()?.stdout).toBe(real.stdout);
    expect(host.lastValidatorRun()?.exit).toBe(real.exit);
  });

  for (const anti of readdirSync(TDIR).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task`, () => {
      const { header, inputs } = loadTranscript(join(TDIR, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = header!.anti_for!;
      expect(actionTasks).toContain(target);
      const { host, completed } = replay(inputs);
      expect(completed.has(target)).toBe(false);
      const gaps = gapsFor(host, target);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.join("")).not.toBe("");
    });
  }

  test("the gate-gaming anti is the cheat the validator alone cannot catch", () => {
    // MONITOR: README.md resolves (exit 0 — coverage theater), but the task contract pins
    // the artifact that discharges MONITOR; the spec, not the gate, names the dishonesty.
    const { host, completed } = replay(loadTranscript(join(TDIR, "anti-gate-gaming.jsonl")).inputs);
    expect(host.lastValidatorRun()?.exit).toBe(0);
    expect(host.lastValidatorRun()?.stdout).toContain("  MONITOR     ok  -> README.md");
    expect(completed.has("t5")).toBe(false);
  });

  test("at least two anti-transcripts exist (the cheat and a near-miss)", () => {
    expect(readdirSync(TDIR).filter((f) => f.startsWith("anti-")).length).toBeGreaterThanOrEqual(2);
  });
});
