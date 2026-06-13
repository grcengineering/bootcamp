/**
 * Module-08 golden/anti replay gate (root ISA ISC-73; web ISA ISC-81/137) — the
 * builder-engine equivalent of tests/exercise-replay.test.ts, which covers the
 * shell-engine modules and deliberately skips `engine: builder` specs.
 *
 * The exercise's surface is the Lab Player's BuilderHost (workspace + the ported
 * gate.sh validator, byte-accepted against real bash runs in
 * tests/fixtures/builder-captures.json m08). Transcript inputs are the UI's own
 * affordances, one JSONL line each:
 *
 *   edit <path>\n<full new contents>   write-through textarea edit (BuilderSurface editBuffer)
 *   copy <src> -> <dst>                copy one workspace file's bytes into another (tab copy-paste)
 *   run-validator                      the "Run validator" button — the pipeline's gate step
 *   capture-output <path>              copy the last validator run's stdout into a file
 *                                      (the output panel is selectable text; §6 keeps the record)
 *
 * Verification mirrors LabPlayer.verifyTasks exactly: after every input, tasks are
 * checked IN ORDER; completed tasks stay completed (monotone); the sweep stops at the
 * first incomplete task and at the first reflection. Golden must complete every action
 * task; each anti must leave its targeted task incomplete with a named gap.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { BuilderHost } from "../src/components/lab/sessions/builder-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const EX = join(ROOT, "modules/08-iac-and-scanning-in-ci/exercises");
const TDIR = join(EX, "transcripts");
const SEED_HOME = join(ROOT, ".ci/fixtures/seeds/m08/home");
const LAB_FIXTURES = join(ROOT, "modules/08-iac-and-scanning-in-ci/labs/fixtures");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(EX, "exercise.yaml"), "utf8")),
);

const expectations: Record<string, string> = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(TDIR, "expectations.json"), "utf8")) as Record<string, string>,
  ).filter(([k]) => !k.startsWith("_")),
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
  if (input.startsWith("capture-output ")) {
    const path = input.slice("capture-output ".length).trim();
    host.workspace.write(path, host.lastValidatorRun()?.stdout ?? "");
    return;
  }
  if (input.startsWith("copy ")) {
    const m = input.match(/^copy (\S+) -> (\S+)$/);
    if (!m) throw new Error(`malformed copy op: ${input}`);
    const content = host.workspace.read(m[1]);
    if (content === null) throw new Error(`copy source missing: ${m[1]}`);
    host.workspace.write(m[2], content);
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

describe("module 08 exercise replay (builder engine — golden passes, anti fails its target)", () => {
  test("spec drives the builder surface this suite replays", () => {
    expect(spec.engine).toBe("builder");
    expect(spec.builder?.surface).toBe("workspace");
    expect(spec.builder?.validator).toBe("gate");
  });

  test("seed ↔ labs/setup.sh contract: the six staged fixtures are byte-identical", () => {
    // `bash labs/setup.sh ./lab08` copies exactly these committed fixtures; the exercise
    // seeds the same bytes (plus its working files) so sim and real machine agree.
    for (const name of [
      "checkov-noncompliant.json",
      "checkov-compliant.json",
      "control-map.csv",
      "main-noncompliant.tf",
      "main-compliant.tf",
      "gate.sh",
    ]) {
      const seeded = readFileSync(join(SEED_HOME, "lab08", name), "utf8");
      const committed = readFileSync(join(LAB_FIXTURES, name), "utf8");
      expect(`${name}:${seeded}`).toBe(`${name}:${committed}`);
    }
    // The scan under the gate starts as the non-compliant scanner result, byte-equal.
    expect(readFileSync(join(SEED_HOME, "lab08/scan-under-gate.json"), "utf8")).toBe(
      readFileSync(join(LAB_FIXTURES, "checkov-noncompliant.json"), "utf8"),
    );
  });

  test("golden transcript satisfies every action task", () => {
    const { completed } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    for (const id of actionTasks) {
      expect(`${id}: ${completed.has(id) ? "pass" : "incomplete"}`).toBe(`${id}: pass`);
    }
  });

  test("expectations.json regenerates from the golden replay (root ISA ISC-60)", () => {
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    const norm = (s: string) => s.replace(/\n$/, "");
    const got = host.workspace.read("lab08/scan-under-gate.json");
    expect(got).not.toBeNull();
    expect(norm(got!)).toBe(norm(expectations["t5:1"]!));
    // …and the generated value is the committed compliant scanner result, byte-for-byte.
    expect(expectations["t5:1"]).toBe(readFileSync(join(LAB_FIXTURES, "checkov-compliant.json"), "utf8"));
  });

  test("golden's gate runs are the real port's verdicts (FAIL then PASS)", () => {
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    expect(host.lastValidatorRun()?.exit).toBe(0);
    const block = host.workspace.read("lab08/gate-block-record.txt") ?? "";
    const evidence = host.workspace.read("lab08/evidence-storage-controls.txt") ?? "";
    expect(block).toContain("GATE_DECISION: FAIL  (build blocked — 2 control(s) violated at/above HIGH)");
    expect(block).toContain("FAILED  CKV_AWS_19  [HIGH]  -> SC-28 (Protection of Information at Rest)  : BLOCK");
    expect(evidence).toContain("GATE_DECISION: PASS  (no violations at/above HIGH — build proceeds, evidence emitted)");
    expect(evidence).toContain("failed_checks_evaluated: 0");
  });

  for (const anti of readdirSync(TDIR).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task`, () => {
      const { header, inputs } = loadTranscript(join(TDIR, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = header!.anti_for!;
      expect(actionTasks).toContain(target);
      const { host, completed } = replay(inputs);
      // Precision guard: the anti must fail AT its target, not upstream — every action
      // task ordered before the target completes, so a typo in the anti's earlier steps
      // can't fake a pass of this test while never exercising the targeted cheat seam.
      for (const id of actionTasks.slice(0, actionTasks.indexOf(target))) {
        expect(`${anti} ${id}: ${completed.has(id) ? "pass" : "incomplete"}`).toBe(`${anti} ${id}: pass`);
      }
      expect(completed.has(target)).toBe(false);
      const gaps = gapsFor(host, target);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.join("")).not.toBe("");
    });
  }

  test("at least two anti-transcripts exist (the cheat and a near-miss)", () => {
    expect(readdirSync(TDIR).filter((f) => f.startsWith("anti-")).length).toBeGreaterThanOrEqual(2);
  });
});
