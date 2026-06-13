/**
 * Golden/anti-transcript replay gate for the module-23 identity/authn/authz exercise
 * (root ISA ISC-73) — the identity-protocols `visual` (PEEL / TRACE / Diff) counterpart of
 * exercise-replay-16.test.ts and exercise-replay-22.test.ts.
 *
 * Wave-4 Bug #4: the OAuth 2.0 / OIDC authorization-code dance TRACE deck is no longer hand-built
 * here. It is authored as DATA in modules/23-identity-authn-authz-protocols/exercises/exercise.yaml
 * (`visual.traces[]`); the same sync-content build the browser uses serializes it into the lab
 * bundle. This test therefore builds the host EXACTLY as the Lab Player builds it —
 * `new VisualHost(bundle.visual)` from the synced
 * `src/content/labs/23-identity-authn-authz-protocols.json` — and drives the OAuth deck through the
 * SAME mode-inference + active-deck path the Lab Player runs (visualTaskTarget / inheritedTraceDeck →
 * host.setActiveDeck → host.traceProbeFor(deck)). The deck is NOT hand-run through a state machine
 * fed into the verify context; the engines (canonicalDance / runDance) appear ONLY as an oracle
 * CROSS-CHECK (the authored deck must equal the committed sim's order), never as the verify path.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   PEEL  : { "panel": <panelId>, "select": <regionNodeId>, "layer"?: <label>, "read"?: <value>, "decode"?: <liveDecode> }
 *   TRACE : { "order": [<seedCardIndex>...] }   (the assembled OAuth dance card order; the active
 *           deck is the current TRACE task's deck — t4 assembles oauth-authz-code)
 * which maps 1:1 onto the visual surface: switch panel, select a node (revealing the oracle's real
 * decode), read a field value, produce a LIVE decode (base64url) that may independently disagree with
 * the oracle, and (OAuth dance) assemble the card order the RFC 6749 §4.1 / OIDC state machine runs.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces are
 * the SAME the player builds: ctx.parseTree (active panel's parse tree, from the jwt / saml oracle),
 * ctx.visual (the just-performed select/read/decode), and ctx.trace (the ACTIVE TRACE deck's real
 * state-machine verdict, via host.traceProbeFor — sequence_matches reads it).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: every panel is built from the committed REAL identity fixtures
 * (.ci/fixtures/assets/crypto/jwt-tokens.json + .ci/fixtures/assets/identity/saml-assertion*.xml)
 * and the dance from the committed oauth-oidc-sim, via the SAME oracle code the browser runs,
 * fidelity-checked in identity-protocol.test.ts + crypto-fidelity.test.ts. The parser / state-machine
 * over the real bytes IS the oracle; there is no authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { visualTaskTarget, inheritedTraceDeck } from "../src/components/lab/sessions/visual-task-mode";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { canonicalDance, runDance, type OAuthMessage } from "../src/engines/visual/oauth-oidc-sim";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const WEB = join(ROOT, "web");
const MODULE_DIR = join(ROOT, "modules/23-identity-authn-authz-protocols");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

/**
 * The synced lab bundle — exactly what the browser hands LabPlayer (spec + the resolved visual
 * options). The OAuth dance deck the module authors in `visual.traces[]` is merged onto these options
 * by sync-content; we build the host from them so the test sees byte-identical panels + deck.
 */
interface LabBundle {
  spec: ExerciseSpec;
  visual: VisualHostOptions;
}
const bundle: LabBundle = JSON.parse(
  readFileSync(join(WEB, "src/content/labs/23-identity-authn-authz-protocols.json"), "utf8"),
) as LabBundle;

/** Build the module-23 VisualHost the SAME way LabPlayer does: `new VisualHost(bundle.visual)`. */
function newHost(): VisualHost {
  return new VisualHost(bundle.visual);
}

interface VisualAction {
  panel?: string;
  select?: string;
  layer?: string;
  read?: string;
  decode?: string;
  /** OAuth dance: the assembled card order, as seed-card indices into the active deck. */
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
    // A TRACE action assembles the deck the current TRACE task renders. Module 23 has one deck
    // (oauth-authz-code), so point the host at it before assembling — exactly what the surface does
    // when it renders the TRACE task (host.setActiveDeck) and what the verify sweep re-asserts.
    const deck = inheritedTraceDeck(spec.tasks, firstTraceTaskId());
    if (deck) host.setActiveDeck(deck);
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

/** The id of the first TRACE task (t4) — the deck an `order` action assembles. */
function firstTraceTaskId(): string {
  return spec.tasks.find((t) => visualTaskTarget(t).mode === "trace")?.id ?? "";
}

/**
 * The VerifyContext the player builds for the identity visual surface. For a TRACE task we point the
 * host at the task's deck (its own, or — for a deckless break-round — the nearest preceding deck) and
 * read THAT deck's real state-machine verdict, exactly as LabPlayer.verifyTasks does.
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

describe("module 23 exercise replay (identity authn/authz visual engine)", () => {
  test("the exercise uses the visual engine over the real identity artifacts (jwt oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("jwt");
    expect(spec.visual?.mode).toBe("diff-the-trace");
  });

  test("the OAuth/OIDC dance deck is AUTHORED in exercise.yaml and synced into the lab bundle (Bug #4)", () => {
    // the spec carries the deck as DATA — not a per-oracle builder, not the hand-built test host.
    const specDeck = spec.visual?.traces?.find((d) => d.name === "oauth-authz-code");
    expect(specDeck).toBeDefined();
    expect(specDeck!.engine).toBe("oauth");
    expect(specDeck!.participants).toEqual(["user-agent", "client", "authz-server", "resource-server"]);
    expect(specDeck!.assign_routing).toBe(true);
    expect(specDeck!.alert?.name).toBe("invalid_request");
    // and the SAME deck reaches the browser via the synced bundle the host is built from.
    const bundleDeck = bundle.visual.traces?.find((d) => d.name === "oauth-authz-code");
    expect(bundleDeck).toBeDefined();
    expect(bundleDeck!.cards.length).toBe(6); // the 6 canonical authorization-code + OIDC dance cards
    // t4 names this deck via its canonical_ref, and the host holds NO legacy single-trace shorthand.
    expect(visualTaskTarget(spec.tasks.find((t) => t.id === "t4")!).deck).toBe("oauth-authz-code");
    expect((bundle.visual as { trace?: unknown }).trace).toBeUndefined();
  });

  test("the authored deck equals the committed sim — the oauth-oidc-sim is the oracle, not the YAML", () => {
    // The deck's `canonical` is the state machine's accepted order serialized as data; assert it
    // EQUALS canonicalDance() so the engine, not the authored YAML, remains ground truth. In the
    // synced bundle (the host-seed shape) `canonical` is keyed by deck name; in the raw spec it is a
    // flat array — cross-check both forms against the committed sim.
    const deck = bundle.visual.traces!.find((d) => d.name === "oauth-authz-code")!;
    const canon = canonicalDance();
    const want = canon.map((m) => ({ from: m.from, to: m.to, type: m.type }));
    expect(deck.canonical["oauth-authz-code"]).toEqual(want);
    const specDeck = spec.visual!.traces!.find((d) => d.name === "oauth-authz-code")!;
    expect(specDeck.canonical.map((c) => ({ from: c.from, to: c.to, type: c.type }))).toEqual(want);
    // the seeded cards are the canonical dance cards, in canonical order.
    expect(deck.cards.map((c) => ({ from: c.from, to: c.to, type: c.type }))).toEqual(want);
    // and the engine reaches resource access for the canonical dance, then refuses the early resource
    // call with the real invalid_request — RFC 6749 §4.1.2 (cross-check only, NOT the verify path).
    expect(runDance(canon).probe.reachedEndState).toBe(true);
    const broken: OAuthMessage[] = [
      canon[0], // authorization_request
      canon[1], // authorization_response (have the code)
      canon[4], // resource_request BEFORE the token exchange
    ];
    const run = runDance(broken);
    expect(run.probe.reachedEndState).toBe(false);
    expect(run.error?.error).toBe("invalid_request");
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay completed t4 by driving the AUTHORED deck through the active-deck path", () => {
    // t4 assembles oauth-authz-code to the resource-access end-state through the SAME inference the
    // Lab Player uses (visualTaskTarget → setActiveDeck → traceProbeFor), not a hand-run state machine.
    const { state, host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    expect(state.recorded.has("t4")).toBe(true);
    expect(visualTaskTarget(spec.tasks.find((t) => t.id === "t4")!).deck).toBe("oauth-authz-code");
    // the active deck's real verdict is the one the verifier read (post-replay it holds the full dance).
    const probe = host.traceProbeFor("oauth-authz-code")!;
    expect(probe.reachedEndState).toBe(true);
    expect(probe.lastAlert).toBeNull();
  });

  test("the golden replay read the real claims off the JWT and the SAML assertion", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const valid = host.panel("jwt-valid")!.tree;
    expect(valid.region("jwt.header")!.value).toBe("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
    expect(valid.region("jwt.payload.exp")!.value).toBe("1718203600");
    expect(valid.region("jwt.payload.iss")!.value).toBe("https://accounts.grcbootcamp.example");
    expect(host.panel("jwt-algnone")!.tree.region("jwt.header.alg")!.value).toBe("none");
    const clean = host.panel("saml-clean")!.tree;
    expect(clean.region("saml.authn.contextclassref")!.value).toContain("PasswordProtectedTransport");
    expect(clean.region("saml.conditions.notonorafter")!.value).toBe("2030-01-01T00:00:00Z");
    expect(host.panel("saml-expired")!.tree.region("saml.conditions.notonorafter")!.value).toBe("2024-01-02T00:00:00Z");
  });

  test("expectations.json documentation keys equal what the oracles decode (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    expect(exp["_jwt_payload_exp"]).toBe(host.panel("jwt-valid")!.tree.region("jwt.payload.exp")!.value);
    expect(exp["_jwt_payload_iss"]).toBe(host.panel("jwt-valid")!.tree.region("jwt.payload.iss")!.value);
    expect(exp["_saml_clean_notonorafter"]).toBe(host.panel("saml-clean")!.tree.region("saml.conditions.notonorafter")!.value);
    expect(exp["_saml_expired_notonorafter"]).toBe(host.panel("saml-expired")!.tree.region("saml.conditions.notonorafter")!.value);
    // the alg:none twin's header alg is the literal value the field_value_is check pins
    expect(host.panel("jwt-algnone")!.tree.region("jwt.header.alg")!.value).toBe("none");
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
