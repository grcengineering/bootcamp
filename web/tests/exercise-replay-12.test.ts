/**
 * Module-12 golden/anti replay gate (root ISA ISC-73; web ISA ISC-84/137) — the
 * builder-engine equivalent of tests/exercise-replay.test.ts, which covers the
 * shell-engine modules and deliberately skips `engine: builder` specs. Pattern
 * follows tests/exercise-replay-08.test.ts.
 *
 * The exercise's surface is the Lab Player's BuilderHost (workspace + the ported
 * validate-oscal.ts, byte-accepted against real `bun` runs in
 * tests/fixtures/builder-captures.json m12). Transcript inputs are the UI's own
 * affordances, one JSONL line each:
 *
 *   edit <path>\n<full new contents>   write-through textarea edit (BuilderSurface editBuffer)
 *   copy <src> -> <dst>                copy one workspace file's bytes into another (tab copy-paste)
 *   run-validator                      the "Run validator" button — the pipeline's validate step
 *   capture-output <path>              copy the last validator run's stdout into a file
 *                                      (the output panel is selectable text; §6 keeps the record)
 *
 * Verification mirrors LabPlayer.verifyTasks exactly: after every input, tasks are
 * checked IN ORDER; completed tasks stay completed (monotone); the sweep stops at the
 * first incomplete task and at the first reflection. Golden must complete every action
 * task; each anti must leave its targeted task incomplete with a named gap.
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
const EX = join(ROOT, "modules/12-oscal-compliance-as-code/exercises");
const TDIR = join(EX, "transcripts");
const SEED_HOME = join(ROOT, ".ci/fixtures/seeds/m12/home");
const LAB_FIXTURES = join(ROOT, "modules/12-oscal-compliance-as-code/labs/fixtures");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(EX, "exercise.yaml"), "utf8")),
);

const expectations: Record<string, string> = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(TDIR, "expectations.json"), "utf8")) as Record<string, string>,
  ).filter(([k]) => !k.startsWith("_")),
);

/** Real `bun validate-oscal.ts` runs — the ground truth the ported validator is held to. */
const captures = JSON.parse(
  readFileSync(join(ROOT, "web/tests/fixtures/builder-captures.json"), "utf8"),
) as { m12: { cases: Array<{ id: string; run: { stdout: string; exit: number } }> } };
const capturedRun = (id: string) => {
  const c = captures.m12.cases.find((x) => x.id === id);
  if (!c) throw new Error(`builder-captures.json m12 missing case ${id}`);
  return c.run;
};

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
const norm = (s: string) => s.replace(/\n$/, "");

describe("module 12 exercise replay (builder engine — golden passes, anti fails its target)", () => {
  test("spec drives the builder surface this suite replays", () => {
    expect(spec.engine).toBe("builder");
    expect(spec.builder?.surface).toBe("workspace");
    expect(spec.builder?.validator).toBe("oscal");
    expect(spec.builder?.validator_args).toEqual([
      "lab12/catalog-under-validation.json",
      "lab12/acme-profile.json",
      "lab12/acme-component.json",
    ]);
  });

  test("seed ↔ labs/setup.sh contract: the five staged fixtures are byte-identical", () => {
    // `bash labs/setup.sh ./lab12` copies exactly these committed fixtures; the exercise
    // seeds the same bytes (plus its working files) so sim and real machine agree.
    for (const name of [
      "acme-catalog.json",
      "acme-profile.json",
      "acme-component.json",
      "acme-catalog-broken.json",
      "validate-oscal.ts",
    ]) {
      const seeded = readFileSync(join(SEED_HOME, "lab12", name), "utf8");
      const committed = readFileSync(join(LAB_FIXTURES, name), "utf8");
      expect(`${name}:${seeded}`).toBe(`${name}:${committed}`);
    }
    // The validate step's catalog slot starts as the good catalog, byte-equal.
    expect(readFileSync(join(SEED_HOME, "lab12/catalog-under-validation.json"), "utf8")).toBe(
      readFileSync(join(LAB_FIXTURES, "acme-catalog.json"), "utf8"),
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
    for (const [key, path] of [
      ["t4:2", "lab12/oscal-validation-pass.txt"],
      ["t5:0", "lab12/oscal-broken-record.txt"],
      ["t5:5", "lab12/catalog-under-validation.json"],
      ["t6:0", "lab12/oscal-dangling-record.txt"],
      ["t6:2", "lab12/acme-profile.json"],
    ] as const) {
      const got = host.workspace.read(path);
      expect(got).not.toBeNull();
      expect(`${key}:${norm(got!)}`).toBe(`${key}:${norm(expectations[key]!)}`);
    }
    // …and the restored documents are the committed lab fixtures, byte-for-byte.
    expect(expectations["t5:5"]).toBe(readFileSync(join(LAB_FIXTURES, "acme-catalog.json"), "utf8"));
    expect(expectations["t6:2"]).toBe(readFileSync(join(LAB_FIXTURES, "acme-profile.json"), "utf8"));
  });

  test("golden's captured verdicts are byte-equal to REAL `bun validate-oscal.ts` runs", () => {
    // The fidelity seam (manifest m12 entries, wasm-engine/byte-exact): the records the
    // exercise keeps must be the same bytes a real machine produces for the same inputs.
    expect(expectations["t4:2"]).toBe(capturedRun("valid-PASS").stdout);
    expect(expectations["t5:0"]).toBe(capturedRun("broken-catalog-FAIL").stdout);
    expect(expectations["t6:0"]).toBe(capturedRun("dangling-profile-FAIL").stdout);
    expect(capturedRun("valid-PASS").exit).toBe(0);
    expect(capturedRun("broken-catalog-FAIL").exit).toBe(1);
    expect(capturedRun("dangling-profile-FAIL").exit).toBe(1);
  });

  test("golden ends green: the restored set validates with exit 0", () => {
    const { host } = replay(loadTranscript(join(TDIR, "golden.jsonl")).inputs);
    expect(host.lastValidatorRun()?.exit).toBe(0);
    const pass = host.workspace.read("lab12/oscal-validation-pass.txt") ?? "";
    const broken = host.workspace.read("lab12/oscal-broken-record.txt") ?? "";
    const dangling = host.workspace.read("lab12/oscal-dangling-record.txt") ?? "";
    expect(pass).toContain('  ac-2 -> policy "ac-2-account-management"  [link resolves]');
    expect(pass).toContain("PASS: required fields present, profile references resolve, control is implemented and policy-linked");
    expect(broken).toContain('FAIL: catalog control missing required "id"');
    // Real single-line consumer diagnostic (module §5.4 prose wraps it; the validator does not).
    expect(broken).toContain(
      "  -> a control with no id cannot be referenced by a profile or a policy link; this would break any importer (an auditor's tool, a FedRAMP pipeline) downstream.",
    );
    expect(dangling).toContain("FAIL: profile references control id(s) the catalog does not define: ac-9");
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
