/**
 * Golden/anti-transcript replay gate for the module-21 containers-and-virtualization exercise
 * (root ISA ISC-73) — the OCI-image `visual` (PEEL/MAP/Diff) counterpart of exercise-replay-16.test.ts
 * and exercise-replay-19.test.ts.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "read"?: <value> }   // PEEL / Diff
 *   { "place": <mapItemId>, "zone": <zoneName> }                          // MAP placement
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a node
 * (revealing the OCI reader's real decode of the manifest/config/layer-tar), read off a field
 * value, and place a findings/VM-container card onto a control zone.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces are
 * the SAME the player builds: ctx.parseTree (active panel's parse tree, from the `oci` oracle),
 * ctx.visual (the just-performed select/read), and ctx.map (the placement board).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: panels are built from the committed REAL OCI blobs via the SAME lib/oci-seed
 * normalizer the build step uses, and the content-addressable digest chain is recomputed in
 * oci-fidelity.test.ts. The OCI reader's parse tree over the real image IS the oracle.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost } from "../src/components/lab/sessions/visual-host";
import {
  buildOciVisualOptions,
  type OciFixture,
  type OciImageBlobs,
  type OciMapSeed,
} from "../src/lib/oci-seed";
import type { OciManifest, OciImageConfig } from "../src/engines/visual/oci";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/21-containers-and-virtualization");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const CONTAINERS = join(ROOT, ".ci/fixtures/assets/containers");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

function loadFixture(): OciFixture {
  const fromFile = spec.visual!.artifact.from.replace(/^assets\/containers\//, "").replace(/^assets\//, "");
  return JSON.parse(readFileSync(join(CONTAINERS, fromFile), "utf8")) as OciFixture;
}

function loadBlobs(ref: { manifest_blob: string; config_blob: string; secret_layer_blob?: string }): OciImageBlobs {
  const manifest = JSON.parse(readFileSync(join(CONTAINERS, ref.manifest_blob), "utf8")) as OciManifest;
  const config = JSON.parse(readFileSync(join(CONTAINERS, ref.config_blob), "utf8")) as OciImageConfig;
  const blobs: OciImageBlobs = { manifest, config };
  if (ref.secret_layer_blob) {
    blobs.secretLayerGz = new Uint8Array(readFileSync(join(CONTAINERS, ref.secret_layer_blob)));
    blobs.secretLayerIndex = manifest.layers.length - 1; // the build's added layer is the topmost
  }
  return blobs;
}

/** The cited findings→controls + VM-vs-container MAP key (lives in the fixture, read by mapping_correct). */
function loadMapSeed(fx: OciFixture & { map?: OciMapSeed }): OciMapSeed | undefined {
  return fx.map;
}

function newHost(): VisualHost {
  if (!spec.visual) throw new Error("lab-21 must declare a visual: block");
  const fx = loadFixture() as OciFixture & { map?: OciMapSeed };
  const clean = loadBlobs(fx.images.clean);
  const misconfigured = loadBlobs(fx.images.misconfigured);
  return new VisualHost(buildOciVisualOptions(spec.visual.mode, spec.visual.oracle, clean, misconfigured, loadMapSeed(fx)));
}

interface VisualAction {
  panel?: string;
  select?: string;
  read?: string;
  place?: string;
  zone?: string;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: VisualHost, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.read !== undefined) host.setValue(input.read);
  if (input.place !== undefined && input.zone !== undefined) host.place(input.place, input.zone);
}

/** The VerifyContext the player builds for the OCI visual surface. */
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

describe("module 21 exercise replay (containers OCI-image visual engine)", () => {
  test("the exercise uses the visual engine over the two real OCI images (oci oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("oci");
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

  test("the golden replay read the baked secret off the REAL layer tar (the oracle, not an answer key)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const mis = host.panel("misconfigured")!.tree;
    // the secret region exists only because walkLayerTar+findBakedSecret found it in the real tar
    expect(mis.region("layer1.secret")!.value).toContain("/app-credentials.env");
    // the topmost layer descriptor's digest is the cited provenance
    expect(mis.region("layer1")!.value).toContain("sha256:48092d72");
  });

  test("expectations.json documentation keys equal what the OCI reader decodes (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    const mis = host.panel("misconfigured")!.tree;
    expect(exp["_misconfigured_user"]).toBe(mis.region("config.user")!.value);
    expect(exp["_misconfigured_exposed_ports"]).toBe(mis.region("config.exposed_ports")!.value);
    expect(mis.region("layer1")!.value).toContain(exp["_misconfigured_layer1_digest"]);
    expect(mis.region("layer1.secret")!.value).toContain(exp["_misconfigured_secret_file"]);
    const clean = host.panel("clean")!.tree;
    expect(exp["_clean_user"]).toBe(clean.region("config.user")!.value);
    expect(exp["_clean_exposed_ports"]).toBe(clean.region("config.exposed_ports")!.value);
  });

  test("the clean baseline genuinely differs from the misconfigured twin (the diff is real)", () => {
    const host = newHost();
    const clean = host.panel("clean")!.tree;
    const mis = host.panel("misconfigured")!.tree;
    expect(clean.region("config.exposed_ports")!.value).toBe("none");
    expect(mis.region("config.exposed_ports")!.value).toBe("22/tcp, 8080/tcp");
    expect(clean.region("layer1")).toBeNull(); // clean has a single layer; no layer1
    expect(mis.region("layer1.secret")).not.toBeNull(); // only the twin bakes the secret
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, state, host } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
      expect(state.gaps[header!.anti_for!] ?? "").not.toBe("");
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
