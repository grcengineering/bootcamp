/**
 * Golden/anti-transcript replay gate for the module-21 containers-and-virtualization exercise
 * (root ISA ISC-73) — the OCI-image `visual` (PEEL/MAP/Diff) counterpart of exercise-replay-16.test.ts
 * and exercise-replay-24.test.ts.
 *
 * Wave-4 Bug #4: this exercise is MIXED — its PEEL/Diff tasks (t1-t4, t6) read the two real OCI
 * images, and t5 is a MAP task (`mapping_correct`). The cited findings→controls + VM/container MAP key
 * USED to be hand-built in the fixture and threaded through `buildOciVisualOptions`; it now lives in
 * the exercise.yaml `visual.map` block (spec-authored data). So this test builds the host EXACTLY as
 * the browser does — `new VisualHost(bundle.visual)` from the SYNCED lab bundle (which carries the
 * spec-authored map) — and drives the surface through the SAME per-task mode-inference path the Lab
 * Player runs (`currentVisualTarget` / `visualTaskTarget` select PEEL for t1-t4,t6 and MAP for t5).
 * The MAP is no longer hand-built here; the test reads it from the bundle the surface renders.
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
 * ctx.visual (the just-performed select/read), and ctx.map (the placement board over the spec map).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: panels are built from the committed REAL OCI blobs via the SAME lib/oci-seed
 * normalizer the build step uses (so the synced bundle is byte-identical), and the content-addressable
 * digest chain is recomputed in oci-fidelity.test.ts. The OCI reader's parse tree over the real image
 * IS the oracle; the MAP zone key is the cited authoritative matrix (now spec-authored, not invented).
 */
import { describe, expect, test, beforeAll } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A real DOM (happy-dom) so the end-to-end MAP test drives the rendered surface like a browser.
beforeAll(() => {
  if (typeof document === "undefined") GlobalRegistrator.register();
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

import { parse } from "yaml";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VisualSurface from "../src/components/lab/VisualSurface";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { currentVisualTarget, visualTaskTarget, inheritedTraceDeck } from "../src/components/lab/sessions/visual-task-mode";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const WEB = join(ROOT, "web");
const MODULE_DIR = join(ROOT, "modules/21-containers-and-virtualization");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

/** The synced lab bundle — what the browser hands LabPlayer (spec + the resolved visual options). */
interface LabBundle {
  spec: ExerciseSpec;
  visual: VisualHostOptions;
}
const bundle: LabBundle = JSON.parse(
  readFileSync(join(WEB, "src/content/labs/21-containers-and-virtualization.json"), "utf8"),
) as LabBundle;

/**
 * Build the host EXACTLY as LabPlayer does: `new VisualHost(bundle.visual)`. The bundle carries the
 * two real OCI image panels (oci-seed normalized at build time) AND the spec-authored MAP key — so the
 * test and the browser see byte-identical panels and the SAME cited map (no fixture hand-building).
 */
function newHost(): VisualHost {
  return new VisualHost(bundle.visual);
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

function loadExpectations(): Record<string, string> {
  const raw = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

/**
 * The VerifyContext the player builds for the OCI visual surface, per task. The TRACE branch mirrors
 * LabPlayer's mixed-mode sweep (point the host at the task's deck) for symmetry with module 24 —
 * module 21 carries no TRACE deck, so it resolves to the (null) active deck and the MAP probe drives t5.
 */
function ctxFor(host: VisualHost, taskId: string, i: number): VerifyContext {
  const tgt = visualTaskTarget(spec.tasks.find((t) => t.id === taskId)!);
  let trace = host.traceProbe();
  if (tgt.mode === "trace") {
    const deck = tgt.deck ?? inheritedTraceDeck(spec.tasks, taskId);
    if (deck) { host.setActiveDeck(deck); trace = host.traceProbeFor(deck); }
  }
  return {
    expectations: loadExpectations(),
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace,
    map: host.mapProbe(),
  };
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

  test("the MAP key is spec-authored (Wave-4 Bug #4) and the synced bundle carries it (not the fixture)", () => {
    // The cited findings→controls + VM/container key now lives in the exercise.yaml visual.map block.
    expect(spec.visual?.map).toBeDefined();
    expect(spec.visual?.map?.zones).toEqual([
      "CM-6 (run as non-root)",
      "CM-7 (least functionality)",
      "IA-5 / SC-28 (secrets)",
      "own host kernel",
      "shared host kernel",
    ]);
    expect(spec.visual?.map?.items.map((it) => it.id)).toEqual([
      "finding-runs-as-root",
      "finding-exposed-ports",
      "finding-baked-secret",
      "vm-card",
      "container-card",
    ]);
    // the synced bundle carries the SAME spec-authored map (this is what the browser host is built from)
    expect(bundle.visual.map?.zones).toEqual(spec.visual?.map?.zones);
    expect(bundle.visual.map?.items.map((it) => it.id)).toEqual(spec.visual?.map?.items.map((it) => it.id));
  });

  test("t5 infers the MAP surface from its verify primitives (mapping_correct → MAP)", () => {
    const t5 = spec.tasks.find((t) => t.id === "t5")!;
    expect(visualTaskTarget(t5).mode).toBe("map");
    // the PEEL tasks infer PEEL (the proven canary path) — the surface follows the current task.
    for (const id of ["t1", "t2", "t3", "t4", "t6"]) {
      expect(visualTaskTarget(spec.tasks.find((t) => t.id === id)!).mode).toBe("peel");
    }
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

// ---------------------------------------------------------------------------------------------
// END-TO-END (Wave-4 Bug #4): t5 completes through the RENDERED MapSurface, driven by real DOM
// zone-clicks — NOT by calling the host directly. This proves the spec-authored map renders the MAP
// surface and the SAME verifier the Lab Player runs reads its verdict (mirrors module 24's layer 2).
// ---------------------------------------------------------------------------------------------

describe("module 21 mixed exercise: t5 (MAP) completes through the rendered surface", () => {
  /** Mount VisualSurface for the current task (its inferred target) into a real DOM root. */
  function mountSurface(
    host: VisualHost,
    completed: (id: string) => boolean,
  ): { container: HTMLElement; root: Root } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(VisualSurface, {
          host,
          spec,
          onChanged: () => {},
          activeTarget: currentVisualTarget(spec.tasks, completed, "peel"),
        }),
      );
    });
    return { container, root };
  }

  /** Run t5's verify list against the bundle-built host's MAP probe (LabPlayer's per-task sweep). */
  function t5Passes(host: VisualHost): boolean {
    const t5 = spec.tasks.find((t) => t.id === "t5")!;
    return t5.verify.every((chk, i) =>
      runCheck(host.probeSession(), chk as AnyCheckParams, ctxFor(host, "t5", i)).pass,
    );
  }

  test("the synced bundle carries the spec-authored MAP key alongside the two real OCI panels", () => {
    expect(bundle.visual.map?.items.length).toBe(5);
    expect(bundle.visual.panels.map((p) => p.id).sort()).toEqual(["clean", "misconfigured"]);
    expect(bundle.visual.traces ?? []).toEqual([]); // module 21 has no TRACE deck
  });

  test("with t1-t4 done, t5 (MAP) renders the MapSurface (its zones + items) — not PEEL", () => {
    const host = newHost();
    const done = new Set(["t1", "t2", "t3", "t4"]);
    const { container, root } = mountSurface(host, (id) => done.has(id));
    const html = container.innerHTML;
    expect(html).toContain('data-testid="visual-map"'); // MAP surface, not the PEEL tree
    expect(html).not.toContain('data-testid="visual-tree"');
    // every spec-authored zone + item is rendered as a real drop-target / card
    for (const it of bundle.visual.map!.items) {
      expect(container.querySelector(`[data-item-id="${it.id}"]`)).not.toBeNull();
    }
    for (const zone of bundle.visual.map!.zones) {
      expect(container.querySelector(`[data-zone="${zone}"]`)).not.toBeNull();
    }
    act(() => root.unmount());
  });

  test("driving each card onto its cited zone through the rendered surface completes t5", () => {
    const host = newHost();
    const done = new Set(["t1", "t2", "t3", "t4"]);
    const { container, root } = mountSurface(host, (id) => done.has(id));

    // BEFORE placing: t5 does not pass (nothing on the board yet).
    expect(t5Passes(host)).toBe(false);

    // DRIVE the surface like a learner: click each item card to select it, then click its cited zone.
    // The map key is the oracle — we read each item's keyZone off the SPEC-AUTHORED bundle, never an
    // answer literal in the test. (The surface's onClick calls host.place; we never call it directly.)
    for (const it of bundle.visual.map!.items) {
      const card = container.querySelector(`[data-item-id="${it.id}"]`) as HTMLElement | null;
      expect(card).not.toBeNull();
      act(() => card!.click()); // select the card
      const zone = container.querySelector(`[data-zone="${it.keyZone}"]`) as HTMLElement | null;
      expect(zone).not.toBeNull();
      act(() => zone!.click()); // assign it to its cited zone
    }

    // the surface drove the host; the MAP probe over the spec map now scores every item correct, so
    // t5's mapping_correct passes through the SAME verifier the Lab Player runs.
    const probe = host.mapProbe()!;
    expect(probe.items.every((row) => row.placedZone === row.keyZone)).toBe(true);
    expect(t5Passes(host)).toBe(true);
    act(() => root.unmount());
  });

  test("a single misplaced card keeps t5 failing (the cited key is the oracle, gap names the item)", () => {
    const host = newHost();
    const done = new Set(["t1", "t2", "t3", "t4"]);
    const { container, root } = mountSurface(host, (id) => done.has(id));

    // place every card correctly EXCEPT finding-baked-secret, which we drop in the wrong zone.
    for (const it of bundle.visual.map!.items) {
      const card = container.querySelector(`[data-item-id="${it.id}"]`) as HTMLElement;
      act(() => card.click());
      const wrongZone = it.id === "finding-baked-secret" ? "CM-6 (run as non-root)" : it.keyZone;
      const zone = container.querySelector(`[data-zone="${wrongZone}"]`) as HTMLElement;
      act(() => zone.click());
    }
    expect(t5Passes(host)).toBe(false);
    // the verifier's gap names the misplaced item, never the answer (honest partial-credit)
    const t5 = spec.tasks.find((t) => t.id === "t5")!;
    const out = runCheck(host.probeSession(), t5.verify[0] as AnyCheckParams, ctxFor(host, "t5", 0));
    expect(out.pass).toBe(false);
    expect(out.gap).toContain("finding-baked-secret");
    act(() => root.unmount());
  });
});
