/**
 * Golden/anti-transcript replay gate for the module-20 cloud-shared-responsibility exercise
 * (root ISA ISC-73) — the MAP-mode `visual` counterpart of exercise-replay-16.test.ts.
 *
 * Module 20 is a conceptual MAP module: there are no wire bytes to peel. The committed cited
 * shared-responsibility matrix (.ci/fixtures/assets/cloud/responsibility-matrix.json — authored
 * from the AWS Shared Responsibility Model + CSA CAIQ + NIST 800-53) IS the oracle. `mapping_correct`
 * reads each control card's placement against the matrix's keyByModel/keyZone, and the IaaS/PaaS/SaaS
 * slider re-derives placement so a card visibly migrates across the you/provider boundary.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "slider": <IaaS|PaaS|SaaS> }                — move the service-model slider
 *   { "place":  <itemId>, "zone": <zone> }        — place a single-zone card onto a zone
 *   { "toggle": <itemId>, "zone": <zone> }        — toggle a THROUGHOUT card's membership in a zone
 * which maps 1:1 onto what the MAP surface lets a learner do (setMapSlider / place / toggleZone).
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input, tasks are
 * evaluated in spec order with sticky completion records, stopping at the first unrecorded failure.
 * The probe surface is the SAME the player builds — ctx.map (the MapProbe re-derived at the current
 * slider position).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: the placements are scored against the cited matrix's keyByModel/keyZone —
 * the closed authoritative answer key, never an authored per-render value. The expectations.json
 * documentation keys are asserted to equal what the matrix assigns at each slider position.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/20-cloud-shared-responsibility");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const FIXTURE = join(ROOT, ".ci/fixtures/assets/cloud/responsibility-matrix.json");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

interface MatrixItem {
  id: string;
  board: string;
  label: string;
  keyZone?: string;
  keyRef?: string;
  keyZones?: string[];
  keyByModel?: Record<string, string>;
}
interface MatrixFixture {
  id: string;
  map: {
    zones: string[];
    slider: { options: string[]; initial?: string };
    items: MatrixItem[];
  };
}

function loadFixture(): MatrixFixture {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as MatrixFixture;
}

/** Build the MAP host directly from the cited matrix (the conceptual-module loader). */
function newHost(): VisualHost {
  if (!spec.visual) throw new Error("lab-20 must declare a visual: block");
  const fx = loadFixture();
  const opts: VisualHostOptions = {
    mode: "map",
    oracle: spec.visual.oracle,
    panels: [],
    map: {
      zones: fx.map.zones,
      slider: fx.map.slider,
      items: fx.map.items.map((it) => ({
        id: it.id,
        label: it.label,
        keyZone: it.keyZone ?? it.keyZones?.[0] ?? "",
        keyRef: it.keyRef,
        ...(it.keyZones ? { keyZones: it.keyZones } : {}),
        ...(it.keyByModel ? { keyByModel: it.keyByModel } : {}),
      })),
    },
  };
  return new VisualHost(opts);
}

interface MapAction {
  slider?: string;
  place?: string;
  toggle?: string;
  zone?: string;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: VisualHost, input: MapAction): void {
  if (input.slider !== undefined) host.setMapSlider(input.slider);
  if (input.place !== undefined && input.zone !== undefined) host.place(input.place, input.zone);
  if (input.toggle !== undefined && input.zone !== undefined) host.toggleZone(input.toggle, input.zone);
}

/** The VerifyContext the player builds for the MAP visual surface. */
function ctxFor(host: VisualHost, taskId: string, i: number): VerifyContext {
  return {
    expectations: loadExpectations(),
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace: host.traceProbe(),
    map: host.mapProbe(),
  };
}

function loadExpectations(): Record<string, string> {
  const raw = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

interface ReplayState {
  recorded: Set<string>;
  gaps: Record<string, string>;
}

/** LabPlayer.verifyTasks semantics: ordered, sticky, first-failure stops the sweep. */
function verifySweep(host: VisualHost, state: ReplayState): void {
  for (const task of spec.tasks) {
    if (state.recorded.has(task.id)) continue;
    if (task.type === "reflection") break; // reflections gate by saving, not by checks
    let failed: string | null = null;
    for (let i = 0; i < task.verify.length; i++) {
      const out = runCheck(host.probeSession(), task.verify[i] as AnyCheckParams, ctxFor(host, task.id, i));
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

function loadTranscript(path: string): { header: { anti_for?: string; fails_check?: number; reason?: string } | null; inputs: MapAction[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input as MapAction) };
}

function replay(path: string): { header: { anti_for?: string; fails_check?: number } | null; state: ReplayState; host: VisualHost } {
  const host = newHost();
  const { header, inputs } = loadTranscript(path);
  const state: ReplayState = { recorded: new Set(), gaps: {} };
  for (const input of inputs) {
    replayInput(host, input);
    verifySweep(host, state);
  }
  return { header, state, host };
}

/** Per-index outcomes for one task against the CURRENT host state (H1 discrimination). */
function outcomesFor(host: VisualHost, taskId: string): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) => {
    try {
      return runCheck(host.probeSession(), chk as AnyCheckParams, ctxFor(host, taskId, i));
    } catch (e) {
      return { pass: false, evidence: "", gap: String(e) };
    }
  });
}

describe("module 20 exercise replay (cloud shared-responsibility MAP engine)", () => {
  test("the exercise uses the visual MAP engine over the cited responsibility matrix (csa oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("csa");
    expect(spec.visual?.mode).toBe("map");
    expect(spec.visual?.artifact.kind).toBe("responsibility-matrix");
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay ends on SaaS with the boundary migrated (encryption-at-rest → provider)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    expect(host.mapSlider()).toBe("SaaS");
    // at SaaS the cited matrix re-derives encryption-at-rest to the provider (you inherit via CUEC)
    expect(host.keyZoneFor("encryption-at-rest")).toBe("provider");
    // customer data is the invariant: yours at every model
    expect(host.keyZoneFor("customer-data")).toBe("you");
    const probe = host.mapProbe()!;
    const correct = probe.items.filter((it) => it.placedZone === it.keyZone);
    expect(correct.length).toBe(probe.items.length); // all 12 cards in their authoritative zone
  });

  test("expectations.json documentation keys equal what the cited matrix assigns (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const h = newHost();
    h.setMapSlider("IaaS");
    expect(exp["_physical_iaas"]).toBe(h.keyZoneFor("physical-facility"));
    expect(exp["_customer_data_iaas"]).toBe(h.keyZoneFor("customer-data"));
    expect(exp["_encryption_at_rest_iaas"]).toBe(h.keyZoneFor("encryption-at-rest"));
    expect(exp["_application_code_iaas"]).toBe(h.keyZoneFor("application-code"));
    h.setMapSlider("SaaS");
    expect(exp["_physical_saas"]).toBe(h.keyZoneFor("physical-facility"));
    expect(exp["_customer_data_saas"]).toBe(h.keyZoneFor("customer-data"));
    expect(exp["_encryption_at_rest_saas"]).toBe(h.keyZoneFor("encryption-at-rest"));
    expect(exp["_application_code_saas"]).toBe(h.keyZoneFor("application-code"));
    // plane-board cards are slider-independent (static keyZone)
    expect(exp["_iam_policy_change_plane"]).toBe(h.keyZoneFor("iam-policy-change"));
    expect(exp["_object_read_write_plane"]).toBe(h.keyZoneFor("object-read-write"));
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, state, host } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
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
