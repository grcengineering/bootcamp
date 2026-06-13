/**
 * Golden/anti-transcript replay gate for the module-16 networking exercise (root ISA ISC-73) —
 * the `visual` (PEEL/Diff) counterpart of tests/exercise-replay.test.ts (which covers the shell
 * engines and skips other classes). Follows the exercise-replay-13.test.ts sticky pattern.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "layer"?: <"L2"|"L3"|…>, "read"?: <value> }
 * which maps 1:1 onto what VisualSurface lets a learner do: switch panel, select a byte-range
 * region (revealing the oracle's real decode + unlocking any layer it gates), assign an OSI
 * label, and read off a field value.
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input, tasks
 * are evaluated in spec order with sticky completion records, stopping at the first unrecorded
 * failure. The probe surfaces are the SAME the player builds — ctx.parseTree (active panel's
 * dissector parse tree) + ctx.visual (the just-performed select/label/read).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: the panels are built from the committed REAL packet fixtures via the same
 * lib/visual-seed normalizer sync-content uses, and the dissector's values are fidelity-checked
 * against tshark in pkt-fidelity.test.ts. The parse tree over real bytes IS the oracle.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost } from "../src/components/lab/sessions/visual-host";
import { buildVisualOptions, type FixtureSet, type PacketFixture } from "../src/lib/visual-seed";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/16-it-networking-fundamentals");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const ASSETS = join(ROOT, ".ci/fixtures/assets/net");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

/** The committed real-packet fixture set (same source sync-content + visual-seed read). */
function loadFixtureSet(): FixtureSet {
  const set: FixtureSet = {};
  for (const name of readdirSync(ASSETS)) {
    if (name.endsWith(".json")) set[name] = JSON.parse(readFileSync(join(ASSETS, name), "utf8")) as PacketFixture;
  }
  return set;
}

function newHost(): VisualHost {
  if (!spec.visual) throw new Error("lab-16 must declare a visual: block");
  const set = loadFixtureSet();
  const fromFile = spec.visual.artifact.from.replace(/^assets\/net\//, "");
  const primary = set[fromFile];
  if (!primary) throw new Error(`visual.artifact.from not found: ${spec.visual.artifact.from}`);
  return new VisualHost(buildVisualOptions(spec.visual.mode, spec.visual.oracle, primary, set));
}

interface VisualAction {
  panel?: string;
  select?: string;
  layer?: string;
  read?: string;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: VisualHost, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.layer !== undefined) host.setLayer(input.layer);
  if (input.read !== undefined) host.setValue(input.read);
}

/** The VerifyContext the player builds for the visual surface. */
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
  const p = join(TRANSCRIPTS, "expectations.json");
  const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
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

function loadTranscript(path: string): { header: { anti_for?: string; fails_check?: number; reason?: string } | null; inputs: VisualAction[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input as VisualAction) };
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

describe("module 16 exercise replay (visual PEEL/Diff engine)", () => {
  test("the exercise uses the visual engine over the real diff-the-trace fixture", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("pkt");
    expect(spec.visual?.mode).toBe("diff-the-trace");
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay walked the real encapsulation stack (gating earned each layer)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    // after reading the broken capture's port, the LAST action is on the broken panel
    const tree = host.parseTree()!;
    expect(tree.region("tcp.dst_port")!.value).toBe("80"); // broken leg = port 80
  });

  test("expectations.json documentation keys equal what the dissector decodes (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    const clean = host.panel("pair-a-port-exposure-clean")!.tree;
    expect(exp["_clean_ethertype"]).toBe(clean.region("eth.ethertype")!.value);
    expect(exp["_clean_protocol"]).toBe(clean.region("ipv4.protocol")!.value);
    expect(exp["_clean_dst_port"]).toBe(clean.region("tcp.dst_port")!.value);
    expect(exp["_clean_tls_contenttype"]).toBe(clean.region("tls.content_type")!.value);
    const broken = host.panel("pair-a-port-exposure-broken")!.tree;
    expect(exp["_broken_dst_port"]).toBe(broken.region("tcp.dst_port")!.value);
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
