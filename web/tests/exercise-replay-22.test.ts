/**
 * Golden/anti-transcript replay gate for the module-22 applied-cryptography/PKI exercise
 * (root ISA ISC-73) — the crypto/PKI `visual` (PEEL / Diff / TLS build-and-break) counterpart of
 * exercise-replay-16.test.ts and exercise-replay-24.test.ts.
 *
 * Wave-4 Bug #4: the TLS 1.3 handshake TRACE deck is no longer hand-built here. It is authored as
 * DATA in modules/22-applied-cryptography-pki/exercises/exercise.yaml (`visual.traces[]`); the same
 * sync-content build the browser uses serializes it into the lab bundle. This test therefore builds
 * the host EXACTLY as the Lab Player builds it — `new VisualHost(bundle.visual)` from the synced
 * `src/content/labs/22-applied-cryptography-pki.json` — and drives the TLS deck through the SAME
 * mode-inference + active-deck path the Lab Player runs (visualTaskTarget / inheritedTraceDeck →
 * host.setActiveDeck → host.traceProbeFor(deck)). The decks are NOT hand-run through a state machine
 * fed into the verify context; the engines (canonicalHandshake / runHandshake) appear ONLY as an
 * oracle CROSS-CHECK (the authored deck must equal the committed sim's order), never as the verify
 * path.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   PEEL  : { "panel": <panelId>, "select": <regionNodeId>, "layer"?: <class>, "read"?: <value>, "decode"?: <liveDecode> }
 *   TRACE : { "order": [<seedCardIndex>...] }   (the assembled handshake card order; the active
 *           deck is the current TRACE task's deck — t8 assembles tls13-full-handshake, t9 inherits it)
 * which maps 1:1 onto the visual surface: switch panel, select a node (revealing the oracle's real
 * decode + unlocking any layer it gates), assign a class label, read a field value, produce a LIVE
 * decode, and (TLS build-and-break) assemble the handshake card order the RFC 8446 state machine runs.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces are
 * the SAME the player builds: ctx.parseTree (active panel's parse tree), ctx.visual (the just-
 * performed select/label/read/decode), and ctx.trace (the ACTIVE TRACE deck's real state-machine
 * verdict, via host.traceProbeFor — sequence_matches / sim_alert_is read it).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: every panel + deck is the committed REAL crypto fixture / committed sim via
 * the SAME oracle code the browser runs, fidelity-checked against openssl / shasum / RFC 8446 in
 * crypto-fidelity.test.ts + tls13-protocol.test.ts. The parser / transform / state-machine over the
 * real bytes IS the oracle; there is no authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { visualTaskTarget, inheritedTraceDeck } from "../src/components/lab/sessions/visual-task-mode";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { runHandshake, canonicalHandshake, type TlsMessage, type TlsMessageType, type TlsParticipant } from "../src/engines/visual/tls13-sim";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const WEB = join(ROOT, "web");
const MODULE_DIR = join(ROOT, "modules/22-applied-cryptography-pki");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

/**
 * The synced lab bundle — exactly what the browser hands LabPlayer (spec + the resolved visual
 * options). The TLS deck the module authors in `visual.traces[]` is merged onto these options by
 * sync-content; we build the host from them so the test sees byte-identical panels + decks.
 */
interface LabBundle {
  spec: ExerciseSpec;
  visual: VisualHostOptions;
}
const bundle: LabBundle = JSON.parse(
  readFileSync(join(WEB, "src/content/labs/22-applied-cryptography-pki.json"), "utf8"),
) as LabBundle;

/** Build the module-22 VisualHost the SAME way LabPlayer does: `new VisualHost(bundle.visual)`. */
function newHost(): VisualHost {
  return new VisualHost(bundle.visual);
}

interface VisualAction {
  panel?: string;
  select?: string;
  layer?: string;
  read?: string;
  decode?: string;
  /** TLS build-and-break: the assembled card order, as seed-card indices into the active deck. */
  order?: number[];
}

/**
 * One learner surface action. A PEEL action drives the host's panel/select/label/read/decode (the
 * PeelSurface affordances). A TRACE action assembles the ACTIVE deck — the deck the current TRACE
 * task selects — via host.appendTraceCard + host.setTraceRouting, the exact host methods the
 * rendered TraceSurface's pool-click + routing-select handlers call. The active deck is set by the
 * verify sweep (LabPlayer points the host at each TRACE task's deck before reading its probe), so an
 * `order` action lands on whatever deck the surface is currently rendering.
 */
function replayInput(host: VisualHost, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.layer !== undefined) host.setLayer(input.layer);
  if (input.read !== undefined) host.setValue(input.read);
  if (input.decode !== undefined) host.setDecode(input.decode);
  if (input.order !== undefined) {
    host.resetTrace();
    for (const idx of input.order) {
      host.appendTraceCard(idx);
      // assign_routing leg: route each card from/to its seeded canonical participants (the surface's
      // routing selects); the sim checks routing on every move when the deck declares assign_routing.
      const card = host.traceCards()[idx];
      if (card) host.setTraceRouting(idx, card.from, card.to);
    }
  }
}

/**
 * The VerifyContext the player builds for the crypto visual surface. For a TRACE task we point the
 * host at the task's deck (its own, or — for a deckless break-round like t9 — the nearest preceding
 * deck) and read THAT deck's real state-machine verdict, exactly as LabPlayer.verifyTasks does.
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

describe("module 22 exercise replay (applied-crypto/PKI visual engine)", () => {
  test("the exercise uses the visual engine over the real cert diff-the-trace fixture (x509 oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("x509");
    expect(spec.visual?.mode).toBe("diff-the-trace");
  });

  test("the TLS 1.3 handshake deck is AUTHORED in exercise.yaml and synced into the lab bundle (Bug #4)", () => {
    // the spec carries the deck as DATA — not a per-oracle builder, not the hand-built test host.
    const specDeck = spec.visual?.traces?.find((d) => d.name === "tls13-full-handshake");
    expect(specDeck).toBeDefined();
    expect(specDeck!.engine).toBe("tls13");
    expect(specDeck!.participants).toEqual(["client", "server"]);
    expect(specDeck!.assign_routing).toBe(true);
    expect(specDeck!.alert?.name).toBe("unexpected_message");
    // and the SAME deck reaches the browser via the synced bundle the host is built from.
    const bundleDeck = bundle.visual.traces?.find((d) => d.name === "tls13-full-handshake");
    expect(bundleDeck).toBeDefined();
    expect(bundleDeck!.cards.length).toBe(8); // 7 canonical cards + the illegal ApplicationData break card
    expect(bundleDeck!.cards[7].type).toBe("ApplicationData");
  });

  test("the authored deck equals the committed sim — the tls13-sim is the oracle, not the YAML", () => {
    // The deck's `canonical` is the state machine's accepted order serialized as data; assert it
    // EQUALS canonicalHandshake() so the engine, not the authored YAML, remains ground truth. In the
    // synced bundle (the host-seed shape) `canonical` is keyed by deck name; in the raw spec it is a
    // flat array — cross-check both forms against the committed sim.
    const deck = bundle.visual.traces!.find((d) => d.name === "tls13-full-handshake")!;
    const canon = canonicalHandshake();
    const want = canon.map((m) => ({ from: m.from, to: m.to, type: m.type }));
    expect(deck.canonical["tls13-full-handshake"]).toEqual(want);
    const specDeck = spec.visual!.traces!.find((d) => d.name === "tls13-full-handshake")!;
    expect(specDeck.canonical.map((c) => ({ from: c.from, to: c.to, type: c.type }))).toEqual(want);
    // the seeded cards (sans the break card) are the canonical cards, in canonical order.
    expect(deck.cards.slice(0, 7).map((c) => ({ from: c.from, to: c.to, type: c.type }))).toEqual(want);
    // and the engine raises the real RFC 8446 §6.2 code on the early-data break (cross-check only).
    const broken: TlsMessage[] = [
      { from: "client" as TlsParticipant, to: "server" as TlsParticipant, type: "ClientHello" as TlsMessageType },
      { from: "server" as TlsParticipant, to: "client" as TlsParticipant, type: "ServerHello" as TlsMessageType },
      { from: "client" as TlsParticipant, to: "server" as TlsParticipant, type: "ApplicationData" as TlsMessageType },
    ];
    expect(runHandshake(broken).alert!.code).toBe(10);
    expect(runHandshake(canonicalHandshake()).probe.reachedEndState).toBe(true);
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay completed t8/t9 by driving the AUTHORED deck through the active-deck path", () => {
    // t8 assembles tls13-full-handshake to ESTABLISHED; t9 inherits the deck and injects early data.
    const { state, host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    expect(state.recorded.has("t8")).toBe(true);
    expect(state.recorded.has("t9")).toBe(true);
    // both TRACE tasks resolve to the authored deck through the SAME inference the Lab Player uses.
    expect(visualTaskTarget(spec.tasks.find((t) => t.id === "t8")!).deck).toBe("tls13-full-handshake");
    expect(inheritedTraceDeck(spec.tasks, "t9")).toBe("tls13-full-handshake");
    // the active deck's real verdict is the one the verifier read (post-replay it holds t9's break).
    const probe = host.traceProbeFor("tls13-full-handshake")!;
    expect(probe.lastAlert).toEqual({ name: "unexpected_message" });
  });

  test("the golden replay read the in-transit truth off the REAL google leaf (notAfter + SAN + CA:FALSE)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const leaf = host.panel("cert-leaf")!.tree;
    expect(leaf.region("cert.validity.notAfter")!.value).toBe("2026-08-17T08:39:10Z");
    expect(leaf.region("cert.san")!.value).toBe("DNS:www.google.com");
    expect(leaf.region("cert.basicConstraints")!.value).toBe("CA:FALSE");
    expect(leaf.region("cert.issuer")!.value).toContain("WR2");
  });

  test("expectations.json documentation keys equal what the oracles decode (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    expect(exp["_leaf_notafter"]).toBe(host.panel("cert-leaf")!.tree.region("cert.validity.notAfter")!.value);
    expect(exp["_leaf_san"]).toBe(host.panel("cert-leaf")!.tree.region("cert.san")!.value);
    expect(exp["_leaf_basicconstraints"]).toBe(host.panel("cert-leaf")!.tree.region("cert.basicConstraints")!.value);
    expect(exp["_expired_notafter"]).toBe(host.panel("cert-expired-broken")!.tree.region("cert.validity.notAfter")!.value);
    expect(exp["_wronghost_san"]).toBe(host.panel("cert-wrong-host-broken")!.tree.region("cert.san")!.value);
    expect(exp["_sha256_empty"]).toBe(host.panel("scramble")!.tree.region("sha256-empty")!.value);
    expect(exp["_sha256_hello"]).toBe(host.panel("scramble")!.tree.region("sha256-hello")!.value);
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
