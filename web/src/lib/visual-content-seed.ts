/**
 * Visual-content seed (Wave-4) — turns the committed real header/crypto/identity/logging/cloud
 * fixtures (.ci/fixtures/assets/{web,crypto,identity,logging,cloud}/*) + a spec's visual mode into
 * VisualHost panels for modules 18, 20, 22, 23, 24, 25. It is the build-time counterpart of each
 * module's replay-test `newHost`: it serializes a small `ApiPanelSource` per panel (the REAL header
 * string / JWT token / cert DER hex / DNS hex / syslog line / SAML XML / transform card set) so the
 * browser re-runs the SAME parser (hdr / jwt / x509 / dns / syslog / saml / xform) over identical
 * real bytes. The parser over the real artifact IS the oracle; this only SELECTS which real artifact
 * each panel parses and supplies the orderable trace deck / cited map key. It never authors bytes.
 *
 * Pure + DOM-free; shared by scripts/sync-content.ts so the browser and the replay tests see
 * byte-identical panels/decks. The trace/map decks are protocol-true: the canonical accepted
 * sequence is each sim's `canonical*` deck, the map key is the cited authoritative matrix.
 */
import type { VisualHostOptions, VisualMode, VisualTraceSeed } from "../components/lab/sessions/visual-host";
import type { ApiPanelSource } from "../engines/visual/api-oracle";
import type { TransformName } from "../engines/visual/xform";
import { canonicalHandshake } from "../engines/visual/tls13-sim";
import { canonicalDelegation, type DnsDelegationData } from "../engines/visual/dnsres-sim";

// ---------------------------------------------------------------------------
// Fixture shapes (the committed JSON the builders read; the bytes are the truth).
// ---------------------------------------------------------------------------

interface WebDiffLeg {
  label: string;
  header?: string;
  age?: string;
  token_ref?: string;
}
interface WebDiffPair {
  id: string;
  oracle: "forwarded" | "set-cookie" | "cache-control" | "jwt";
  clean: WebDiffLeg;
  broken: WebDiffLeg;
}
export interface WebFixture {
  id: string;
  tokens: Record<string, string>;
  pairs: WebDiffPair[];
}

interface CertLeg {
  label: string;
  der_hex: string;
}
interface CertPair {
  id: string;
  clean: CertLeg;
  broken: CertLeg;
}
export interface CryptoChainFixture {
  certs: Array<{ role: string; cn: string; der_hex: string }>;
}
export interface CryptoDiffFixture {
  pairs: CertPair[];
}
export interface JwtFixture {
  tokens: Record<string, { jwt: string }>;
}

interface SyslogLine {
  id: string;
  raw: string;
}
interface SyslogDiffPair {
  clean: { label: string; line_ref: string };
  broken: { label: string; raw: string };
}
export interface SyslogFixture {
  id: string;
  lines: SyslogLine[];
  diff_pairs: SyslogDiffPair[];
}

interface MatrixItem {
  id: string;
  label: string;
  keyZone?: string;
  keyRef?: string;
  keyZones?: string[];
  keyByModel?: Record<string, string>;
}
export interface MatrixFixture {
  id: string;
  map: {
    zones: string[];
    slider?: { options: string[]; initial?: string };
    items: MatrixItem[];
  };
}

export interface DnsFixture {
  id: string;
  hex: string;
}

/** External real artifacts that some modules need beyond their primary fixture. */
export interface ContentExtras {
  /** crypto/jwt-tokens.json (modules 22, 23). */
  jwt?: JwtFixture;
  /** crypto/google-cert-chain.json (modules 22, 24). */
  certChain?: CryptoChainFixture;
  /** identity SAML clean + expired assertion XML (module 23). */
  samlClean?: string;
  samlExpired?: string;
  /** net DNS query + response hex fixtures (module 24). */
  dnsQuery?: DnsFixture;
  dnsResponse?: DnsFixture;
  /** net DNS delegation chain (module 24's dnsres-sim treasure-hunt deck). */
  dnsDelegation?: DnsDelegationData;
  /** crypto cert-diff-the-trace pairs (module 24's broken wrong-host twin for the t11 Diff). */
  cryptoDiff?: CryptoDiffFixture;
}

// ---------------------------------------------------------------------------
// Module 18 — web-application-architecture (hdr / jwt; Diff-the-Trace).
// ---------------------------------------------------------------------------

function webLegSource(oracle: WebDiffPair["oracle"], leg: WebDiffLeg, tokens: Record<string, string>): ApiPanelSource {
  switch (oracle) {
    case "forwarded":
      return { oracle: "forwarded", header: leg.header! };
    case "set-cookie":
      return { oracle: "set-cookie", header: leg.header! };
    case "cache-control":
      return { oracle: "cache-control", header: leg.header!, age: leg.age };
    case "jwt":
      return { oracle: "jwt", token: tokens[leg.token_ref!] };
  }
}

export function buildWebVisualOptions(mode: VisualMode, oracle: string, fx: WebFixture): VisualHostOptions {
  if (mode !== "diff-the-trace") throw new Error(`buildWebVisualOptions: unsupported mode '${mode}'`);
  const panels: VisualHostOptions["panels"] = [];
  for (const pair of fx.pairs) {
    panels.push({ id: `${pair.id}-clean`, label: `${pair.id} · clean: ${pair.clean.label}`, source: webLegSource(pair.oracle, pair.clean, fx.tokens) });
    panels.push({ id: `${pair.id}-broken`, label: `${pair.id} · broken: ${pair.broken.label}`, source: webLegSource(pair.oracle, pair.broken, fx.tokens) });
  }
  return { mode, oracle, panels };
}

// ---------------------------------------------------------------------------
// Module 22 — applied-cryptography-pki (xform / jwt / x509 + TLS 1.3 handshake trace).
// ---------------------------------------------------------------------------

const M22_TRANSFORM_CARDS: Array<{ id: string; input: string; transform: TransformName }> = [
  { id: "sha256-hello", input: "hello", transform: "sha256" },
  { id: "base64-hello", input: "hello", transform: "base64" },
  { id: "sha256-empty", input: "", transform: "sha256" },
];

export function buildCryptoVisualOptions(
  mode: VisualMode,
  oracle: string,
  diff: CryptoDiffFixture,
  extras: ContentExtras,
): VisualHostOptions {
  if (!extras.certChain) throw new Error("module 22 needs the google-cert-chain fixture");
  if (!extras.jwt) throw new Error("module 22 needs the jwt-tokens fixture");
  const leafDer = extras.certChain.certs[0].der_hex;
  const expired = diff.pairs.find((p) => p.id === "cert-expired");
  const wrongHost = diff.pairs.find((p) => p.id === "cert-wrong-host");
  if (!expired || !wrongHost) throw new Error("module 22 cert diff fixture missing expired/wrong-host pairs");

  const panels: VisualHostOptions["panels"] = [
    { id: "scramble", label: "Sort · hash / encrypt / encode", source: { oracle: "xform", cards: M22_TRANSFORM_CARDS } },
    { id: "jwt", label: "JWT · header.payload.signature", source: { oracle: "jwt", token: extras.jwt.tokens.valid_hs256.jwt } },
    { id: "cert-leaf", label: "Cert · www.google.com leaf", source: { oracle: "x509", derHex: leafDer } },
    { id: "cert-expired-broken", label: "Cert · expired.badssl.com (broken)", source: { oracle: "x509", derHex: expired.broken.der_hex } },
    { id: "cert-wrong-host-broken", label: "Cert · wrong.host.badssl.com (broken)", source: { oracle: "x509", derHex: wrongHost.broken.der_hex } },
  ];

  // The RFC 8446 TLS 1.3 handshake deck is authored as DATA in module 22's exercise.yaml
  // (`visual.traces[]`, Wave-4 Bug #4) — sync-content merges it onto these host options — so this
  // builder no longer hand-wires the `trace:` shorthand. The state machine (tls13-sim) is still the
  // oracle: the replay test cross-checks the YAML deck's `canonical`/`cards` against
  // `canonicalHandshake()`. Single source = the YAML, not this per-oracle builder.
  return { mode, oracle, panels };
}

// ---------------------------------------------------------------------------
// Module 23 — identity-authn-authz-protocols (jwt / saml + OAuth2/OIDC dance trace).
// ---------------------------------------------------------------------------

export function buildIdentityVisualOptions(mode: VisualMode, oracle: string, extras: ContentExtras): VisualHostOptions {
  if (!extras.jwt) throw new Error("module 23 needs the jwt-tokens fixture");
  if (!extras.samlClean || !extras.samlExpired) throw new Error("module 23 needs the SAML assertions");

  const panels: VisualHostOptions["panels"] = [
    { id: "jwt-valid", label: "JWT · header.payload.signature", source: { oracle: "jwt", token: extras.jwt.tokens.valid_hs256.jwt } },
    { id: "jwt-algnone", label: "JWT · alg:none twin (broken)", source: { oracle: "jwt", token: extras.jwt.tokens.algnone_twin.jwt } },
    { id: "saml-clean", label: "SAML · assertion (clean)", source: { oracle: "saml", xml: extras.samlClean } },
    { id: "saml-expired", label: "SAML · assertion (expired twin, broken)", source: { oracle: "saml", xml: extras.samlExpired } },
  ];

  // The RFC 6749 §4.1 authorization-code + OIDC dance deck is authored as DATA in module 23's
  // exercise.yaml (`visual.traces[]`, Wave-4 Bug #4) — sync-content merges it onto these host options
  // — so this builder no longer hand-wires the `trace:` shorthand. The state machine (oauth-oidc-sim)
  // is still the oracle: the replay test cross-checks the YAML deck's `canonical`/`cards` against
  // `canonicalDance()`. Single source = the YAML, not this per-oracle builder.
  return { mode, oracle, panels };
}

// ---------------------------------------------------------------------------
// Module 24 — how-the-internet-works (dns / x509; Diff-the-Trace).
// ---------------------------------------------------------------------------

export function buildInternetVisualOptions(mode: VisualMode, oracle: string, extras: ContentExtras): VisualHostOptions {
  if (!extras.dnsQuery || !extras.dnsResponse) throw new Error("module 24 needs the DNS query + response fixtures");
  if (!extras.certChain) throw new Error("module 24 needs the google-cert-chain fixture");
  if (!extras.dnsDelegation) throw new Error("module 24 needs the DNS delegation fixture");
  const leafDer = extras.certChain.certs[0].der_hex;
  const cryptoDiff = extras.cryptoDiff;

  // The PEEL/Diff spine: the real DNS query + response (RFC 1035 parser) + the real leaf cert, and
  // (when the cert-diff fixture is supplied) the broken wrong-host twin for the t11 Diff click.
  const panels: VisualHostOptions["panels"] = [
    { id: "dns-query", label: "DNS · query example.com A", source: { oracle: "dns", hex: extras.dnsQuery.hex } },
    { id: "dns-response", label: "DNS · response (2 A records)", source: { oracle: "dns", hex: extras.dnsResponse.hex } },
    { id: "cert-leaf", label: "Cert · www.google.com leaf", source: { oracle: "x509", derHex: leafDer } },
  ];
  const wrongHost = cryptoDiff?.pairs.find((p) => p.id === "cert-wrong-host");
  if (wrongHost) {
    panels.push({ id: "cert-wrong-host-broken", label: "Cert · wrong.host.badssl.com (broken)", source: { oracle: "x509", derHex: wrongHost.broken.der_hex } });
  }

  // The two REAL state-machine decks the mixed exercise carries ALONGSIDE the peel spine (Bug #4):
  //  - the DNS delegation treasure-hunt (dnsres-sim) — deck name `example.com` (its canonical_ref);
  //  - the RFC 8446 TLS 1.3 handshake (tls13-sim) — deck name `tls13-full-handshake`, + the illegal
  //    early ApplicationData break card the t9 round injects to read unexpected_message(10).
  // The canonical sequences come from the committed sims (canonicalDelegation / canonicalHandshake)
  // — the state machine IS the oracle, serialized as data; no authored answer key.
  const delegationCanon = canonicalDelegation(extras.dnsDelegation);
  const delegationDeck: VisualTraceSeed = {
    name: extras.dnsDelegation.qname, // "example.com" — the t7 canonical_ref
    canonical: { [extras.dnsDelegation.qname]: delegationCanon.map((m) => ({ from: m.from, to: m.to, type: m.type })) },
    cards: delegationCanon.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })),
    participants: ["stub", "recursive", "root", "tld", "authoritative"],
    alert: { name: "referral" },
    assign_routing: true,
  };

  const tlsCanon = canonicalHandshake();
  const tlsBreakCard = { from: "client", to: "server", type: "ApplicationData" };
  const tlsDeck: VisualTraceSeed = {
    name: "tls13-full-handshake",
    canonical: { "tls13-full-handshake": tlsCanon.map((m) => ({ from: m.from, to: m.to, type: m.type })) },
    cards: [...tlsCanon.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })), tlsBreakCard],
    participants: ["client", "server"],
    alert: { name: "unexpected_message", code: 10 },
    assign_routing: true,
  };

  return { mode, oracle, panels, traces: [delegationDeck, tlsDeck] };
}

// ---------------------------------------------------------------------------
// Module 25 — logging-telemetry-observability (syslog + pipeline trace + control map).
// ---------------------------------------------------------------------------

export function buildLoggingVisualOptions(mode: VisualMode, oracle: string, fx: SyslogFixture): VisualHostOptions {
  const byId = (id: string) => {
    const l = fx.lines.find((x) => x.id === id);
    if (!l) throw new Error(`syslog fixture missing line '${id}'`);
    return l.raw;
  };
  const pair = fx.diff_pairs[0];

  const panels: VisualHostOptions["panels"] = [
    { id: "ex1-clean", label: "Auth failure (PRIVAL 34 → Critical)", source: { oracle: "syslog", line: byId("ex1_auth_failure") } },
    { id: "ex3-structured", label: "Structured event (SD-ELEMENT)", source: { oracle: "syslog", line: byId("ex3_sd_one") } },
    { id: "ex2-application", label: "Application log (do-nuts)", source: { oracle: "syslog", line: byId("ex2_donuts") } },
    { id: "pair-auth-severity-clean", label: "auth-severity · clean (Critical)", source: { oracle: "syslog", line: byId(pair.clean.line_ref) } },
    { id: "pair-auth-severity-broken", label: "auth-severity · broken (Debug)", source: { oracle: "syslog", line: pair.broken.raw } },
  ];

  // The born-vs-queried pipeline TRACE deck (`log-pipeline`) and the field→control MAP block are
  // authored as DATA in module 25's exercise.yaml (`visual.traces[]` + `visual.map`, Wave-4 Bug #4)
  // — sync-content merges them onto these host options — so this builder no longer hand-wires the
  // `trace:`/`map:` seeds. Single source = the YAML, not this per-oracle builder; the syslog parser
  // over the real §6.5 lines remains the PEEL/Diff oracle, and the pipeline ordering is its own oracle.
  return { mode, oracle, panels };
}

// ---------------------------------------------------------------------------
// Module 20 — cloud-shared-responsibility (csa MAP; the cited matrix IS the oracle).
// ---------------------------------------------------------------------------

export function buildCloudVisualOptions(mode: VisualMode, oracle: string, fx: MatrixFixture): VisualHostOptions {
  if (mode !== "map") throw new Error(`buildCloudVisualOptions: unsupported mode '${mode}'`);
  return {
    mode,
    oracle,
    panels: [],
    map: {
      zones: fx.map.zones,
      ...(fx.map.slider ? { slider: fx.map.slider } : {}),
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
}
