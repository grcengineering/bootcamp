/**
 * Golden/anti-transcript replay gate for the module-24 how-the-internet-works exercise
 * (root ISA ISC-73) — the request-lifecycle `visual` (PEEL + dual-TRACE + Diff) counterpart of
 * exercise-replay-16.test.ts and exercise-replay-22.test.ts.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   PEEL  : { "panel": <panelId>, "select": <regionNodeId>, "layer"?: <layer>, "read"?: <value> }
 *   TRACE : { "trace": "delegation" | "tls13", "order": [<cardIndex>...] }
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a node
 * (revealing the oracle's real decode), read off a field value, and (DNS delegation / TLS handshake)
 * assemble the message order the real state machine runs. The lifecycle has TWO orderable
 * sequences — the DNS delegation treasure-hunt (dnsres-sim) and the TLS 1.3 handshake (tls13-sim) —
 * so a `trace` action names which deck it is assembling; the test runs that deck's REAL state
 * machine and feeds its TraceProbe into the VerifyContext.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces are
 * the SAME the player builds: ctx.parseTree (active panel's parse tree, from the dns / x509 oracle),
 * ctx.visual (the just-performed select/read), and ctx.trace (the active deck's real state-machine
 * verdict — sequence_matches / sim_alert_is read it).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: every panel is built from the committed REAL fixtures (the canonical RFC 1035
 * query, the live-captured response, the real www.google.com leaf + the badssl twin) via the SAME
 * oracle code the browser runs, and each oracle is fidelity-checked against dig / openssl / the RFC
 * state machines in dns-protocol.test.ts, crypto-fidelity.test.ts, dnsres-protocol.test.ts, and
 * tls13-protocol.test.ts. The parser / state-machine over the real bytes IS the oracle; there is no
 * authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome, type TraceProbe } from "../src/verifiers/registry";
import { parseDnsHex } from "../src/engines/visual/dns";
import { buildCertProbe, hexToBytes } from "../src/engines/visual/x509";
import { canonicalDelegation, runDelegation, type DnsDelegationData, type DnsResMessage } from "../src/engines/visual/dnsres-sim";
import { canonicalHandshake, runHandshake, type TlsMessage } from "../src/engines/visual/tls13-sim";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/24-how-the-internet-works");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const NET = join(ROOT, ".ci/fixtures/assets/net");
const CRYPTO = join(ROOT, ".ci/fixtures/assets/crypto");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const dnsQuery = JSON.parse(readFileSync(join(NET, "dns-query-example-com.json"), "utf8"));
const dnsResponse = JSON.parse(readFileSync(join(NET, "dns-response-example-com.json"), "utf8"));
const delegationFx = JSON.parse(readFileSync(join(NET, "dns-delegation.json"), "utf8"));
const certChain = JSON.parse(readFileSync(join(CRYPTO, "google-cert-chain.json"), "utf8"));
const certDiff = JSON.parse(readFileSync(join(CRYPTO, "cert-diff-the-trace.json"), "utf8"));

const DELEGATION: DnsDelegationData = delegationFx.delegation;

/**
 * Build the module-24 VisualHost: one panel per real lifecycle artifact, each parsed by its own
 * oracle (dns / x509). The DNS delegation + TLS 1.3 handshake decks are run as REAL state machines
 * by the test's trace harness (the host's single-trace seed can't hold two protocols, so the test
 * supplies the active deck's TraceProbe per action). The declared spec oracle/mode (dns /
 * diff-the-trace) keys the lifecycle's first stage and the cert-diff spine; the multi-oracle panel
 * set is exactly how the applied-crypto and api-paradigms modules compose several oracles in one host.
 */
function newHost(): VisualHost {
  const leafDer = hexToBytes(certChain.certs[0].der_hex);
  const wrongHost = certDiff.pairs.find((p: { id: string }) => p.id === "cert-wrong-host");

  const panels: VisualHostOptions["panels"] = [
    // The DNS lifecycle's first stage — the PEELable real query + response (dns / RFC 1035 parser).
    { id: "dns-query", label: "DNS · query example.com A", tree: parseDnsHex(dnsQuery.hex) },
    { id: "dns-response", label: "DNS · response (2 A records)", tree: parseDnsHex(dnsResponse.hex) },
    // The identity stage — the REAL www.google.com leaf (x509) + the broken twin (Diff-the-Trace).
    { id: "cert-leaf", label: "Cert · www.google.com leaf", tree: buildCertProbe(leafDer) },
    { id: "cert-wrong-host-broken", label: "Cert · wrong.host.badssl.com (broken)", tree: buildCertProbe(hexToBytes(wrongHost.broken.der_hex)) },
  ];

  return new VisualHost({ mode: "diff-the-trace", oracle: "dns", panels });
}

/** The two real state machines' canonical decks (the orderable cards a TRACE action indexes into). */
const DELEGATION_DECK: DnsResMessage[] = canonicalDelegation(DELEGATION);
// The TLS deck is the 7 canonical RFC 8446 cards + one illegal early ApplicationData break card.
const TLS_DECK: TlsMessage[] = [
  ...canonicalHandshake(),
  { from: "client", to: "server", type: "ApplicationData" },
];

/** Run the active TRACE deck's REAL state machine over the learner's assembled order → a TraceProbe. */
function traceProbeFor(deck: "delegation" | "tls13", order: number[]): TraceProbe {
  if (deck === "delegation") {
    const ordered = order.map((i) => DELEGATION_DECK[i]).filter(Boolean);
    return runDelegation(DELEGATION, ordered).probe;
  }
  const ordered = order.map((i) => TLS_DECK[i]).filter(Boolean);
  return runHandshake(ordered).probe;
}

interface VisualAction {
  panel?: string;
  select?: string;
  layer?: string;
  read?: string;
  trace?: "delegation" | "tls13";
  order?: number[];
}

interface ReplayState {
  recorded: Set<string>;
  gaps: Record<string, string>;
  /** The active deck's real state-machine verdict (set by the last TRACE action). */
  trace: TraceProbe | null;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: VisualHost, state: ReplayState, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.layer !== undefined) host.setLayer(input.layer);
  if (input.read !== undefined) host.setValue(input.read);
  if (input.trace !== undefined && input.order !== undefined) {
    state.trace = traceProbeFor(input.trace, input.order);
  }
}

function loadExpectations(): Record<string, string> {
  const raw = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

/** The VerifyContext the player builds for the lifecycle visual surface. */
function ctxFor(host: VisualHost, state: ReplayState, taskId: string, i: number): VerifyContext {
  return {
    expectations: loadExpectations(),
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace: state.trace,
    map: host.mapProbe(),
  };
}

/** LabPlayer.verifyTasks semantics: ordered, sticky, first-failure stops the sweep. */
function verifySweep(host: VisualHost, state: ReplayState): void {
  for (const task of spec.tasks) {
    if (state.recorded.has(task.id)) continue;
    if (task.type === "reflection") break; // reflections gate by saving, not by checks
    let failed: string | null = null;
    for (let i = 0; i < task.verify.length; i++) {
      const out = runCheck(host.probeSession(), task.verify[i] as AnyCheckParams, ctxFor(host, state, task.id, i));
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
  const state: ReplayState = { recorded: new Set(), gaps: {}, trace: null };
  for (const input of inputs) {
    replayInput(host, state, input);
    verifySweep(host, state);
  }
  return { header, state, host };
}

/** Per-index outcomes for one task against the CURRENT host+trace state (H1 discrimination). */
function outcomesFor(host: VisualHost, state: ReplayState, taskId: string): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) => {
    try {
      return runCheck(host.probeSession(), chk as AnyCheckParams, ctxFor(host, state, taskId, i));
    } catch (e) {
      return { pass: false, evidence: "", gap: String(e) };
    }
  });
}

describe("module 24 exercise replay (how-the-internet-works visual engine)", () => {
  test("the exercise uses the visual engine over the real DNS lifecycle (dns oracle, diff-the-trace)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("dns");
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

  test("the golden replay read the lifecycle off the REAL artifacts (DNS bytes + delegation + TLS + cert)", () => {
    const host = newHost();
    const query = host.panel("dns-query")!.tree;
    expect(query.region("dns.qname")!.value).toBe("example.com");
    expect(query.region("dns.qtype")!.value).toContain("A");
    const response = host.panel("dns-response")!.tree;
    expect(response.region("dns.ancount")!.value).toBe("2");
    expect(response.region("dns.answer.0.rdata")!.value).toBe("104.20.23.154");
    expect(response.region("dns.flags")!.value).toContain("AD 0"); // honest: NOT DNSSEC-validated
    const leaf = host.panel("cert-leaf")!.tree;
    expect(leaf.region("cert.san")!.value).toBe("DNS:www.google.com");
    // both real state machines reach / refuse honestly
    expect(runDelegation(DELEGATION, canonicalDelegation(DELEGATION)).probe.reachedEndState).toBe(true);
    expect(runHandshake(canonicalHandshake()).probe.reachedEndState).toBe(true);
    const early: TlsMessage[] = [TLS_DECK[0], TLS_DECK[1], TLS_DECK[7]];
    expect(runHandshake(early).alert!.code).toBe(10);
  });

  test("expectations.json documentation keys equal what the oracles decode (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    const query = host.panel("dns-query")!.tree;
    const response = host.panel("dns-response")!.tree;
    expect(exp["_query_qdcount"]).toBe(query.region("dns.qdcount")!.value);
    expect(exp["_query_qname"]).toBe(query.region("dns.qname")!.value);
    expect(exp["_response_ancount"]).toBe(response.region("dns.ancount")!.value);
    expect(exp["_response_answer0_rdata"]).toBe(response.region("dns.answer.0.rdata")!.value);
    expect(response.region("dns.answer.1.rdata")!.value).toBe(exp["_response_answer1_rdata"]);
    expect(response.region("dns.flags")!.value).toContain(exp["_response_flags_ad"]);
    expect(host.panel("cert-leaf")!.tree.region("cert.san")!.value).toBe(exp["_leaf_san"]);
    expect(host.panel("cert-wrong-host-broken")!.tree.region("cert.san")!.value).toBe(exp["_wronghost_san"]);
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
        targetOutcomes: outcomesFor(host, state, header!.anti_for!),
        targetCompleted: state.recorded.has(header!.anti_for!),
        priorActionMode: "sticky",
        isCompleted: (id) => state.recorded.has(id),
      });
    });
  }
});
