/**
 * Golden/anti-transcript replay gate for the module-13 CCM exercise (root ISA ISC-73) —
 * the builder-ccm counterpart of tests/exercise-replay.test.ts (which covers the shell
 * engines and deliberately skips other engine classes), following the
 * exercise-replay-00.test.ts pattern.
 *
 * Transcript grammar (one JSON object per line, `input` = the learner's surface action,
 * mapping 1:1 onto what BuilderSurface's CcmPanel lets a learner do):
 *   "ccm-tick <n>"   — press the scheduled-run control (1 = Run next scheduled check,
 *                      7 = Advance a week, 30 = Advance 30 days)
 *   "inject-drift"   — press Inject drift (the spec's builder.ccm.drift_bucket)
 *   "remediate"      — press Remediate (same bucket)
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input,
 * tasks are evaluated in spec order with sticky completion records, stopping at the first
 * unrecorded failure. This ordering is load-bearing here: t3 (drift caught) can only be
 * judged after t2 (the green month) is recorded, and t5 (remediation back to green) only
 * after t4's red week — exactly as in the real player.
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, with a named gap
 *
 * Honesty cross-checks: every verdict in this exercise comes from the ported ccm-check
 * library, which is byte-accepted against REAL bash runs of the module's own generated
 * ccm-check.sh (web/tests/fixtures/builder-captures.json m13) and against the pinned
 * Ubuntu container captures .ci/fixtures/captured/m13-*.json (the pure-awk fallback
 * branch — no bun on that box). This suite re-asserts the seam end-to-end:
 *   - the m13 seed's library + state fixtures are canon-locked to builder-captures m13
 *   - the scheduler's ledger rows and alert bytes on the §5 timeline byte-match both the
 *     bash-run captures and the docker captures' evidence-store posts
 *   - the ported evaluator byte-matches each docker evaluate_control capture
 *   - the expectations.json documentation keys equal what the golden replay produced
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { BuilderHost } from "../src/components/lab/sessions/builder-host";
import { evaluateControl } from "../src/engines/builders/ccm-check";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/13-continuous-controls-monitoring");
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
  if (!spec.builder?.ccm) throw new Error("lab-13 must declare a builder.ccm block");
  return new BuilderHost(spec.builder, { ...seedFiles });
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: BuilderHost, input: string): void {
  const bucket = spec.builder!.ccm!.drift_bucket;
  const tick = input.match(/^ccm-tick (\d+)$/);
  if (tick) {
    host.ccmTick(Number(tick[1]));
    return;
  }
  if (input === "inject-drift") {
    host.ccm!.injectDrift(bucket);
    return;
  }
  if (input === "remediate") {
    host.ccm!.remediate(bucket);
    return;
  }
  throw new Error(`unknown ccm transcript input: ${input}`);
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

function replay(path: string): { header: { anti_for?: string; fails_check?: number } | null; state: ReplayResult; host: BuilderHost } {
  const host = newHost();
  const { header, inputs } = loadTranscript(path);
  const state: ReplayResult = { recorded: new Set(), gaps: {} };
  for (const input of inputs) {
    replayInput(host, input);
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
        expectations: {},
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

describe("module 13 exercise replay (builder ccm engine)", () => {
  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("golden replay's loop state is the §5 story: green month, red week, recovery", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const tile = host.ccm!.dashboardTile();
    expect(tile.current).toBe("PASS"); // remediated — green now…
    expect(tile.redRuns).toBe(8); // …but the red week stays in the window (append-only)
    expect(tile.openAlerts.length).toBe(8); // one alert per drifted run, none green
    const ledger = host.ccm!.ledger();
    expect(ledger.length).toBe(40); // 1 + 30 + 1 + 7 + 1 scheduled runs, one row each
    expect(ledger.filter((e) => e.rc !== 0).length).toBe(8);
  });

  test("expectations.json documentation keys equal what the golden replay produced (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const ledger = host.ccm!.fs.read("ccm-lab/evidence/ledger.log") ?? "";
    const rows = ledger.split("\n").filter((l) => l.length > 0);
    expect(`${rows[0].split(" ").slice(0, 2).join(" ")} ${rows[0].match(/rc=\d/)![0]}`).toBe(exp["_golden_t1_run_line"]);
    expect(exp["_golden_first_ledger_row"]).toBe(rows[0]);
    const alert = host.ccm!.fs.read("ccm-lab/evidence/alert-run-20260620090000.txt") ?? "";
    expect(alert.replace(/\n$/, "")).toBe(exp["_golden_drift_alert"]);
    expect(rows[31]).toContain("2026-06-20T09:00:00Z run-20260620090000 rc=1"); // _golden_t3_run_line's run
    expect(rows[39]).toContain("2026-06-28T09:00:00Z run-20260628090000 rc=0"); // _golden_t5_run_line's run
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

describe("module 13 fixture honesty cross-checks", () => {
  const builderCaptures = JSON.parse(
    readFileSync(join(dirname(new URL(import.meta.url).pathname), "fixtures/builder-captures.json"), "utf8"),
  );
  const m13 = builderCaptures.m13 as {
    library: string;
    fixtures: Record<string, string>;
    seq: { evidence: Record<string, string> };
  };

  test("seeded ccm-check.sh is canon-locked to the library labs/setup.sh really generates", () => {
    expect(seedFiles["ccm-lab/ccm-check.sh"]).toBe(m13.library);
  });

  test("seeded state fixtures are canon-locked to the committed lab fixtures (builder-captures m13)", () => {
    for (const name of Object.keys(m13.fixtures)) {
      expect(seedFiles[`labs/fixtures/${name}`]).toBe(m13.fixtures[name]);
    }
  });

  test("scheduler on the §5 timeline byte-matches the REAL bash runs (ledger + alert)", () => {
    // Compliant tick at 2026-05-20, drift injected, drifted tick at 2026-05-21 — the exact
    // two-run sequence builder-captures m13.seq and the docker capture m13-emit-sequence ran.
    const host = newHost();
    host.ccmTick(1);
    host.ccm!.injectDrift(spec.builder!.ccm!.drift_bucket);
    host.ccmTick(1);
    expect(host.ccm!.fs.read("ccm-lab/evidence/ledger.log")).toBe(m13.seq.evidence["ledger.log"]);
    expect(host.ccm!.fs.read("ccm-lab/evidence/alert-run-20260521090000.txt")).toBe(
      m13.seq.evidence["alert-run-20260521090000.txt"],
    );
    // Evidence records: every field byte-equal except source_state — the scheduler snapshots
    // the LIVE state document (current-state.json), the bash run read the named fixture.
    // That difference is declared, not drift.
    for (const rec of ["run-20260520090000.evidence", "run-20260521090000.evidence"]) {
      const got = host.ccm!.fs.read(`ccm-lab/evidence/${rec}`) ?? "";
      const want = m13.seq.evidence[rec];
      const strip = (s: string) => s.split("\n").filter((l) => !l.startsWith("source_state=")).join("\n");
      expect(strip(got)).toBe(strip(want));
      expect(got).toContain("source_state=current-state.json");
    }
  });

  test("ported evaluator byte-matches the docker captures (the library's pure-awk fallback branch)", () => {
    const cases: Array<[string, string]> = [
      ["m13-evaluate-compliant", "state-compliant.json"],
      ["m13-evaluate-drifted", "state-drifted.json"],
      ["m13-evaluate-drifted-pretty", "state-drifted-pretty.json"],
      ["m13-evaluate-empty", "state-empty.json"],
    ];
    for (const [id, fixture] of cases) {
      const captured = JSON.parse(readFileSync(join(FIXTURES, "captured", `${id}.json`), "utf8"));
      const run = evaluateControl(seedFiles[`labs/fixtures/${fixture}`]);
      expect(`${id}:${run.stdout}`).toBe(`${id}:${captured.stdout}`);
      expect(`${id}:${run.stderr}`).toBe(`${id}:${captured.stderr}`);
      expect(`${id}:${run.exit}`).toBe(`${id}:${captured.exit}`);
      expect(captured.post?.[0]?.stdout).toBe(`${run.exit}\n`); // echo $? canon
    }
  });

  test("docker emit-sequence evidence store matches the bash-run canon (two parsers, one contract)", () => {
    const captured = JSON.parse(readFileSync(join(FIXTURES, "captured", "m13-emit-sequence.json"), "utf8"));
    const post = Object.fromEntries(
      (captured.post as Array<{ cmd: string; stdout: string }>).map((p) => [p.cmd, p.stdout]),
    );
    expect(post["cat ccm-lab/evidence/ledger.log"]).toBe(m13.seq.evidence["ledger.log"]);
    expect(post["cat ccm-lab/evidence/alert-run-20260521090000.txt"]).toBe(
      m13.seq.evidence["alert-run-20260521090000.txt"],
    );
    expect(post["cat ccm-lab/evidence/run-20260520090000.evidence"]).toBe(
      m13.seq.evidence["run-20260520090000.evidence"],
    );
  });
});
