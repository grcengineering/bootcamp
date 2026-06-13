/**
 * Golden/anti-transcript replay gate for the module-25 logging-telemetry-observability exercise
 * (root ISA ISC-73) — the syslog `visual` (PEEL / Diff + pipeline TRACE + field→control MAP)
 * counterpart of exercise-replay-22/24.test.ts.
 *
 * Wave-4 Bug #4: the born-vs-queried pipeline TRACE deck and the field→control MAP are no longer
 * hand-built here. They are authored as DATA in modules/25-logging-telemetry-observability/
 * exercises/exercise.yaml (`visual.traces[]` + `visual.map`); the same sync-content build the
 * browser uses serializes them into the lab bundle. This test therefore builds the host EXACTLY as
 * the Lab Player builds it — `new VisualHost(bundle.visual)` from the synced
 * `src/content/labs/25-logging-telemetry-observability.json` — and drives the TRACE/MAP tasks
 * through the SAME mode-inference + active-deck path the Lab Player runs (visualTaskTarget /
 * inheritedTraceDeck → host.setActiveDeck → host.traceProbeFor(deck); host.place → host.mapProbe).
 * The pipeline deck + the cited map key are NOT hand-fed into the verify context; the committed
 * ordering / cited authoritative key is the oracle (cross-checked below), never the verify path.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   PEEL  : { "panel": <panelId>, "select": <regionNodeId>, "read"?: <value> }
 *   TRACE : { "order": [<cardIdx>, …] }            // pipeline (active deck = the t7 task's deck)
 *   MAP   : { "place": <itemId>, "zone": <zone> }  // field→control / audit-vs-application
 * which maps 1:1 onto the visual surface: switch panel, select a named region (revealing the
 * parser's real decode), read a field value, order the pipeline cards, place a card on its zone.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces
 * are the SAME the player builds: ctx.parseTree (active panel's syslog parse tree), ctx.visual
 * (the just-performed select/read), ctx.trace (the ACTIVE TRACE deck's verdict, via
 * host.traceProbeFor — sequence_matches reads it), ctx.map (host.mapProbe — mapping_correct reads it).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: the panels are built by parsing the committed REAL RFC 5424 §6.5 lines through
 * the SAME `syslog` parser the browser surface uses, fidelity-checked against the RFC's own worked
 * values in syslog-fidelity.test.ts (PRIVAL 34 → Facility 4 / Severity 2 Critical; the broken twin's
 * PRIVAL 39 → Severity 7 Debug). The PRI bit-unpack over the real characters IS the oracle; the
 * pipeline deck's `canonical` IS the committed stage order (cross-checked against the authored cards),
 * and the map's cited key IS the authoritative zone — there is no authored answer key anywhere.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { visualTaskTarget, inheritedTraceDeck } from "../src/components/lab/sessions/visual-task-mode";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const WEB = join(ROOT, "web");
const MODULE_DIR = join(ROOT, "modules/25-logging-telemetry-observability");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

/**
 * The synced lab bundle — exactly what the browser hands LabPlayer (spec + the resolved visual
 * options). The pipeline deck the module authors in `visual.traces[]` and the MAP block in
 * `visual.map` are merged onto these options by sync-content; we build the host from them so the
 * test sees byte-identical panels + deck + map.
 */
interface LabBundle {
  spec: ExerciseSpec;
  visual: VisualHostOptions;
}
const bundle: LabBundle = JSON.parse(
  readFileSync(join(WEB, "src/content/labs/25-logging-telemetry-observability.json"), "utf8"),
) as LabBundle;

/** Build the module-25 VisualHost the SAME way LabPlayer does: `new VisualHost(bundle.visual)`. */
function newHost(): VisualHost {
  return new VisualHost(bundle.visual);
}

interface VisualAction {
  panel?: string;
  select?: string;
  read?: string;
  /** TRACE: the assembled card order, as indices into the pipeline seed deck (active deck). */
  order?: number[];
  /** MAP: place a field/line card onto its control/classification zone. */
  place?: string;
  zone?: string;
}

/**
 * One learner surface action (the grammar in the file header). A PEEL action drives the host's
 * panel/select/read (the PeelSurface affordances). A TRACE action assembles the ACTIVE deck — the
 * deck the current TRACE task selects — via host.appendTraceCard, the exact host method the rendered
 * TraceSurface's pool-click handler calls. A MAP action calls host.place, the exact method the
 * MapSurface's drop handler calls. The active deck is set by the verify sweep (ctxFor points the
 * host at the TRACE task's deck before reading its probe), so an `order` action lands on the deck
 * the surface is currently rendering.
 */
function replayInput(host: VisualHost, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.read !== undefined) host.setValue(input.read);
  if (input.order !== undefined) {
    host.resetTrace();
    for (const idx of input.order) host.appendTraceCard(idx);
  }
  if (input.place !== undefined && input.zone !== undefined) host.place(input.place, input.zone);
}

/**
 * The VerifyContext the player builds for the syslog visual surface. For a TRACE task we point the
 * host at the task's deck (its own `canonical_ref`, or — for a deckless break-round — the nearest
 * preceding deck) and read THAT deck's real verdict, exactly as LabPlayer.verifyTasks does. MAP and
 * PEEL read the active panel's probe directly.
 */
function ctxFor(host: VisualHost, taskId: string, i: number): VerifyContext {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  const tgt = visualTaskTarget(task);
  let trace = host.traceProbe();
  if (tgt.mode === "trace") {
    const deck = tgt.deck ?? inheritedTraceDeck(spec.tasks, taskId);
    if (deck) {
      host.setActiveDeck(deck);
      trace = host.traceProbeFor(deck);
    }
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

describe("module 25 exercise replay (syslog visual PEEL/TRACE/MAP engine)", () => {
  test("the exercise uses the visual engine over the real RFC 5424 syslog fixture (syslog oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("syslog");
    expect(spec.visual?.mode).toBe("diff-the-trace");
  });

  test("the pipeline TRACE deck + the field→control MAP are AUTHORED in exercise.yaml and synced into the bundle (Bug #4)", () => {
    // the spec carries the pipeline deck as DATA — not a per-oracle builder, not the hand-built host.
    const specDeck = spec.visual?.traces?.find((d) => d.name === "log-pipeline");
    expect(specDeck).toBeDefined();
    expect(specDeck!.engine).toBe("pipeline"); // a generic stage-ordering deck, not an RFC sim
    expect(specDeck!.participants).toEqual(["event", "collector", "source", "store", "query", "alert", "operator"]);
    expect(specDeck!.cards.map((c) => c.type)).toEqual(["source", "collector", "store", "query", "alert"]);
    // the MAP block is authored in the spec too (5 cited-key items across the 5 zones).
    expect(spec.visual?.map?.zones).toEqual(["ac7-ia5", "au3", "au11", "audit", "application"]);
    expect(spec.visual?.map?.items.map((i) => `${i.id}->${i.keyZone}`)).toEqual([
      "pri-severity->ac7-ia5",
      "audit-content->au3",
      "retention-horizon->au11",
      "auth-failure-line->audit",
      "do-nuts-line->application",
    ]);
    // and the SAME deck + map reach the browser via the synced bundle the host is built from.
    const bundleDeck = bundle.visual.traces?.find((d) => d.name === "log-pipeline");
    expect(bundleDeck).toBeDefined();
    expect(bundleDeck!.cards.length).toBe(5);
    expect(bundle.visual.map?.items.length).toBe(5);
    // the builder no longer hand-wires the single-deck `trace:` shorthand — the YAML is the source.
    expect(bundle.visual.trace).toBeUndefined();
  });

  test("the authored pipeline canonical IS the committed stage order (the ordering is the oracle, not an answer key)", () => {
    // `canonical` is the born-vs-queried stage order serialized as data; assert it EQUALS the deck's
    // own seeded cards in order — the committed ordering is ground truth, never an authored verdict.
    const deck = bundle.visual.traces!.find((d) => d.name === "log-pipeline")!;
    const cardsOrder = deck.cards.map((c) => ({ from: c.from, to: c.to, type: c.type }));
    expect(deck.canonical["log-pipeline"]).toEqual(cardsOrder);
    // and the host runs the ordering as its real consequence: the canonical order reaches end-state…
    const host = newHost();
    host.setActiveDeck("log-pipeline");
    for (let i = 0; i < 5; i++) host.appendTraceCard(i);
    expect(host.traceProbeFor("log-pipeline")!.reachedEndState).toBe(true);
    // …and a wrong order does not (the sim's verdict, not a stored "correct").
    const host2 = newHost();
    host2.setActiveDeck("log-pipeline");
    for (const i of [1, 0, 2, 3, 4]) host2.appendTraceCard(i);
    expect(host2.traceProbeFor("log-pipeline")!.reachedEndState).toBe(false);
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay completed t7 (TRACE) + t8 (MAP) through the rendered-surface path", () => {
    // t7 (sequence_matches → TRACE) resolves to the authored log-pipeline deck via the SAME inference
    // the Lab Player uses; t8 (mapping_correct → MAP) reads the cited authoritative key.
    const { state, host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    expect(state.recorded.has("t7")).toBe(true);
    expect(state.recorded.has("t8")).toBe(true);
    expect(visualTaskTarget(spec.tasks.find((t) => t.id === "t7")!).deck).toBe("log-pipeline");
    expect(visualTaskTarget(spec.tasks.find((t) => t.id === "t8")!).mode).toBe("map");
    // the active deck's real verdict the verifier read: the five stages reached the pipeline end-state.
    const probe = host.traceProbeFor("log-pipeline")!;
    expect(probe.reachedEndState).toBe(true);
    expect(probe.orderedMessages.length).toBe(5);
    // and every map card landed in its cited authoritative zone.
    const map = host.mapProbe()!;
    expect(map.items.every((it) => it.placedZone === it.keyZone)).toBe(true);
  });

  test("the golden replay read the downgraded Severity off the REAL broken PRI byte (the oracle, not an answer key)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    // after the last action the active panel is the broken twin; its Severity is the parser's
    // arithmetic over the real PRI byte <39> = 4*8+7 → Severity 7 (Debug), the discriminating field.
    const tree = host.parseTree()!;
    expect(tree.region("pri.severity")!.value).toBe("7 = Debug (PRIVAL 39 & 7)");
    expect(tree.region("pri.facility")!.value).toContain("4 = security/authorization"); // same Facility
  });

  test("expectations.json documentation keys equal what the parser decodes (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    const clean = host.panel("ex1-clean")!.tree;
    expect(exp["_clean_hostname"]).toBe(clean.region("hostname")!.value);
    expect(exp["_clean_procid_nilvalue"]).toBe(clean.region("procid")!.value);
    expect(exp["_clean_pri_facility"]).toBe(clean.region("pri.facility")!.value);
    expect(exp["_clean_pri_severity"]).toBe(clean.region("pri.severity")!.value);
    const structured = host.panel("ex3-structured")!.tree;
    expect(exp["_structured_sd_id"]).toBe(structured.region("sd0.id")!.value);
    expect(exp["_structured_sd_eventid"]).toBe(structured.region("sd0.param2")!.value);
    const application = host.panel("ex2-application")!.tree;
    expect(exp["_application_pri_facility"]).toBe(application.region("pri.facility")!.value);
    const broken = host.panel("pair-auth-severity-broken")!.tree;
    expect(exp["_broken_pri_facility"]).toBe(broken.region("pri.facility")!.value);
    expect(exp["_broken_pri_severity"]).toBe(broken.region("pri.severity")!.value);
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
