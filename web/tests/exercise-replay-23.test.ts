/**
 * Golden/anti-transcript replay gate for the module-23 identity/authn/authz exercise
 * (root ISA ISC-73) — the identity-protocols `visual` (PEEL / TRACE / Diff) counterpart of
 * exercise-replay-16.test.ts and exercise-replay-22.test.ts.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "layer"?: <label>, "read"?: <value>,
 *     "decode"?: <liveDecode>, "order"?: [<cardIndex>...] }
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a node
 * (revealing the oracle's real decode), read off a field value, produce a LIVE decode
 * (base64url) that may independently disagree with the oracle, and (OAuth dance) assemble the
 * card order the RFC 6749 / OIDC state machine runs.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces
 * are the SAME the player builds: ctx.parseTree (active panel's parse tree, from the jwt / saml
 * oracle), ctx.visual (the just-performed select/label/read/decode), and ctx.trace (the
 * oauth-oidc dance order's verdict — sequence_matches reads it).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: every panel is built from the committed REAL identity fixtures
 * (.ci/fixtures/assets/crypto/jwt-tokens.json + .ci/fixtures/assets/identity/saml-assertion*.xml)
 * via the SAME oracle code the browser runs, fidelity-checked in identity-protocol.test.ts +
 * crypto-fidelity.test.ts. The parser / state-machine over the real bytes IS the oracle; there is
 * no authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome, type TraceProbe } from "../src/verifiers/registry";
import { buildJwtProbe } from "../src/engines/visual/jwt";
import { parseSamlAssertion } from "../src/engines/visual/saml";
import { canonicalDance, runDance, type OAuthMessage } from "../src/engines/visual/oauth-oidc-sim";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/23-identity-authn-authz-protocols");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const CRYPTO = join(ROOT, ".ci/fixtures/assets/crypto");
const IDENTITY = join(ROOT, ".ci/fixtures/assets/identity");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const jwtFx = JSON.parse(readFileSync(join(CRYPTO, "jwt-tokens.json"), "utf8"));
const samlClean = readFileSync(join(IDENTITY, "saml-assertion.xml"), "utf8");
const samlExpired = readFileSync(join(IDENTITY, "saml-assertion-expired.xml"), "utf8");

/**
 * Build the module-23 VisualHost: one panel per real identity artifact parsed by its own oracle
 * (the real JWT + its alg:none tamper twin via `jwt`; the OASIS SAML assertion + its expired twin
 * via `saml`), plus the RFC 6749 §4.1 authorization-code + OIDC dance as the host's orderable trace
 * cards. The declared spec oracle/mode (jwt/diff-the-trace) keys the signed-claim PEEL spine; the
 * multi-oracle panel set is exactly how module 22 composes several oracles in one host.
 */
function newHost(): VisualHost {
  const panels: VisualHostOptions["panels"] = [
    // The real three-segment HS256 JWT (jwt): the header/payload decode with no key.
    { id: "jwt-valid", label: "JWT · header.payload.signature", tree: buildJwtProbe(jwtFx.tokens.valid_hs256.jwt) },
    // The real alg:none / past-exp tamper twin (jwt): the broken-auth leg.
    { id: "jwt-algnone", label: "JWT · alg:none twin (broken)", tree: buildJwtProbe(jwtFx.tokens.algnone_twin.jwt) },
    // The OASIS SAML 2.0 example assertion (saml): AuthnContext + the open validity window.
    { id: "saml-clean", label: "SAML · assertion (clean)", tree: parseSamlAssertion(samlClean) },
    // The expired-Conditions tamper twin (saml): the staleness break.
    { id: "saml-expired", label: "SAML · assertion (expired twin, broken)", tree: parseSamlAssertion(samlExpired) },
  ];

  // The OAuth2 / OIDC valet-key dance: the 6 canonical RFC 6749 §4.1 cards as orderable trace
  // cards. The canonical accepted sequence is the dance in declared order; routing is assessed
  // (check_routing). A wrong order makes the sim raise the real invalid_request (RFC 6749 §4.1.2.1).
  const canon = canonicalDance();
  const cards = canon.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields }));
  const canonical: TraceProbe["canonical"] = { "oauth-authz-code": canon.map((m) => ({ from: m.from, to: m.to, type: m.type })) };

  return new VisualHost({
    mode: "diff-the-trace",
    oracle: "jwt",
    panels,
    trace: {
      canonical,
      cards,
      participants: ["user-agent", "client", "authz-server", "resource-server"],
      alert: { name: "invalid_request" },
      assign_routing: true,
    },
  });
}

interface VisualAction {
  panel?: string;
  select?: string;
  layer?: string;
  read?: string;
  decode?: string;
  /** OAuth dance: the assembled card order, as card indices into the seed deck. */
  order?: number[];
}

/** One learner surface action (the grammar in the file header). */
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
      // assign_routing leg: route each card from/to the canonical participant the seed declares.
      const card = host.traceCards()[idx];
      if (card) host.setTraceRouting(idx, card.from, card.to);
    }
  }
}

/** The VerifyContext the player builds for the identity visual surface. */
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

describe("module 23 exercise replay (identity authn/authz visual engine)", () => {
  test("the exercise uses the visual engine over the real identity artifacts (jwt oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("jwt");
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

  test("the oauth-oidc sim reaches resource access for the canonical dance, then refuses the early resource call", () => {
    // The canonical 6-card order reaches the DONE end-state; calling the resource before the token
    // exchange raises the real invalid_request (the valet key was never obtained) — RFC 6749 §4.1.2.
    const canon = canonicalDance();
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
