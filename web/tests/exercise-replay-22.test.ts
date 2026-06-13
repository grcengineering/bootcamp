/**
 * Golden/anti-transcript replay gate for the module-22 applied-cryptography/PKI exercise
 * (root ISA ISC-73) — the crypto/PKI `visual` (MAP/PEEL/build-and-break/Diff) counterpart of
 * exercise-replay-16.test.ts and exercise-replay-19.test.ts.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "layer"?: <class/layer>, "read"?: <value>,
 *     "decode"?: <liveDecode>, "order"?: [<cardId>...] }
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a node
 * (revealing the oracle's real decode + unlocking any layer it gates), assign a class/layer label,
 * read off a field value, produce a LIVE decode (base64/base64url/digest recompute) that may
 * independently disagree with the oracle, and (TLS build-and-break) assemble the handshake card
 * order the RFC 8446 state machine runs.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces
 * are the SAME the player builds: ctx.parseTree (active panel's parse tree, from the
 * xform/jwt/x509 oracle), ctx.visual (the just-performed select/label/read/decode), and ctx.trace
 * (the tls13-sim's real handshake verdict — sequence_matches / sim_alert_is read it).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: every panel is built from the committed REAL crypto fixtures
 * (.ci/fixtures/assets/crypto/*.json) via the SAME oracle code the browser runs, and each oracle is
 * fidelity-checked against openssl / shasum / RFC 8446 in crypto-fidelity.test.ts +
 * tls13-protocol.test.ts. The parser / transform / state-machine over the real bytes IS the oracle;
 * there is no authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome, type TraceProbe } from "../src/verifiers/registry";
import { buildCertProbe, hexToBytes } from "../src/engines/visual/x509";
import { buildJwtProbe } from "../src/engines/visual/jwt";
import { buildTransformProbe, type TransformName } from "../src/engines/visual/xform";
import { runHandshake, canonicalHandshake, type TlsMessage, type TlsMessageType, type TlsParticipant } from "../src/engines/visual/tls13-sim";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/22-applied-cryptography-pki");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const CRYPTO = join(ROOT, ".ci/fixtures/assets/crypto");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const chain = JSON.parse(readFileSync(join(CRYPTO, "google-cert-chain.json"), "utf8"));
const diff = JSON.parse(readFileSync(join(CRYPTO, "cert-diff-the-trace.json"), "utf8"));
const jwtFx = JSON.parse(readFileSync(join(CRYPTO, "jwt-tokens.json"), "utf8"));

/**
 * The "Sorting the Scramble" transform cards (xform) — the class is DERIVED by running the real
 * transform, never authored. SHA-256('hello') and SHA-256('') are HASH; base64('hello') is ENCODE.
 */
const TRANSFORM_CARDS: Array<{ id: string; input: string; transform: TransformName }> = [
  { id: "sha256-hello", input: "hello", transform: "sha256" },
  { id: "base64-hello", input: "hello", transform: "base64" },
  { id: "sha256-empty", input: "", transform: "sha256" },
];

/**
 * Build the module-22 VisualHost: one panel per real artifact, each parsed by its own oracle, plus
 * the TLS 1.3 handshake as the host's orderable trace cards (the tls13-sim is the consequence). The
 * declared spec oracle/mode (x509/diff-the-trace) keys the cert verdict spine; the multi-oracle
 * panel set is exactly how the api-paradigms module composes several contract oracles in one host.
 */
function newHost(): VisualHost {
  const leafDer = hexToBytes(chain.certs[0].der_hex);
  const expired = diff.pairs.find((p: { id: string }) => p.id === "cert-expired");
  const wrongHost = diff.pairs.find((p: { id: string }) => p.id === "cert-wrong-host");

  const panels: VisualHostOptions["panels"] = [
    // "Sorting the Scramble" MAP — the transform cards (xform): layer == the derived class.
    { id: "scramble", label: "Sort · hash / encrypt / encode", tree: buildTransformProbe(TRANSFORM_CARDS) },
    // The real JWT (jwt): the header decodes with no key (encoding != protection).
    { id: "jwt", label: "JWT · header.payload.signature", tree: buildJwtProbe(jwtFx.tokens.valid_hs256.jwt) },
    // Peeling the Padlock — the REAL www.google.com leaf (x509).
    { id: "cert-leaf", label: "Cert · www.google.com leaf", tree: buildCertProbe(leafDer) },
    // Diff-the-Trace — the real badssl misconfigurations (x509): one divergent field each.
    { id: "cert-expired-broken", label: "Cert · expired.badssl.com (broken)", tree: buildCertProbe(hexToBytes(expired.broken.der_hex)) },
    { id: "cert-wrong-host-broken", label: "Cert · wrong.host.badssl.com (broken)", tree: buildCertProbe(hexToBytes(wrongHost.broken.der_hex)) },
  ];

  // The TLS 1.3 handshake builder: the 7 canonical RFC 8446 cards + one illegal ApplicationData
  // break card. The canonical accepted sequence is the 7-message flow; routing is assessed
  // (check_routing). The sim raises the real unexpected_message(10) on any wrong order.
  const canon = canonicalHandshake();
  const breakCard = { from: "client", to: "server", type: "ApplicationData" };
  const cards = [...canon.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })), breakCard];
  const canonical: TraceProbe["canonical"] = { "tls13-full-handshake": canon.map((m) => ({ from: m.from, to: m.to, type: m.type })) };

  return new VisualHost({
    mode: "diff-the-trace",
    oracle: "x509",
    panels,
    trace: {
      canonical,
      cards,
      participants: ["client", "server"],
      alert: { name: "unexpected_message", code: 10 },
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
  /** TLS build-and-break: the assembled card order, as card indices into the seed deck. */
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

/** The VerifyContext the player builds for the crypto visual surface. */
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

describe("module 22 exercise replay (applied-crypto/PKI visual engine)", () => {
  test("the exercise uses the visual engine over the real cert diff-the-trace fixture (x509 oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("x509");
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

  test("the golden replay read the in-transit truth off the REAL google leaf (notAfter + SAN + CA:FALSE)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const leaf = host.panel("cert-leaf")!.tree;
    expect(leaf.region("cert.validity.notAfter")!.value).toBe("2026-08-17T08:39:10Z");
    expect(leaf.region("cert.san")!.value).toBe("DNS:www.google.com");
    expect(leaf.region("cert.basicConstraints")!.value).toBe("CA:FALSE");
    expect(leaf.region("cert.issuer")!.value).toContain("WR2");
  });

  test("the TLS 1.3 sim reaches the established state for the canonical order, then refuses the break", () => {
    // canonical order (cards 0..6) reaches ESTABLISHED; the illegal app-data card (7) is rejected.
    const ordered: TlsMessage[] = canonicalHandshake();
    expect(runHandshake(ordered).probe.reachedEndState).toBe(true);
    const broken: TlsMessage[] = [
      { from: "client" as TlsParticipant, to: "server" as TlsParticipant, type: "ClientHello" as TlsMessageType },
      { from: "server" as TlsParticipant, to: "client" as TlsParticipant, type: "ServerHello" as TlsMessageType },
      { from: "client" as TlsParticipant, to: "server" as TlsParticipant, type: "ApplicationData" as TlsMessageType },
    ];
    expect(runHandshake(broken).alert!.code).toBe(10);
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
