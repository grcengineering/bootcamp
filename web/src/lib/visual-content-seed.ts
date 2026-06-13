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
import type { VisualHostOptions, VisualMode } from "../components/lab/sessions/visual-host";
import type { ApiPanelSource } from "../engines/visual/api-oracle";
import type { TransformName } from "../engines/visual/xform";
import { canonicalHandshake } from "../engines/visual/tls13-sim";
import { canonicalDance } from "../engines/visual/oauth-oidc-sim";

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

  // TLS 1.3 full handshake: the canonical RFC 8446 cards + one illegal ApplicationData break card.
  const canon = canonicalHandshake();
  const breakCard = { from: "client", to: "server", type: "ApplicationData" };
  const cards = [...canon.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })), breakCard];
  const canonical = { "tls13-full-handshake": canon.map((m) => ({ from: m.from, to: m.to, type: m.type })) };

  return {
    mode,
    oracle,
    panels,
    trace: { canonical, cards, participants: ["client", "server"], alert: { name: "unexpected_message", code: 10 }, assign_routing: true },
  };
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

  const canon = canonicalDance();
  const cards = canon.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields }));
  const canonical = { "oauth-authz-code": canon.map((m) => ({ from: m.from, to: m.to, type: m.type })) };

  return {
    mode,
    oracle,
    panels,
    trace: { canonical, cards, participants: ["user-agent", "client", "authz-server", "resource-server"], alert: { name: "invalid_request" }, assign_routing: true },
  };
}

// ---------------------------------------------------------------------------
// Module 24 — how-the-internet-works (dns / x509; Diff-the-Trace).
// ---------------------------------------------------------------------------

export function buildInternetVisualOptions(mode: VisualMode, oracle: string, extras: ContentExtras): VisualHostOptions {
  if (!extras.dnsQuery || !extras.dnsResponse) throw new Error("module 24 needs the DNS query + response fixtures");
  if (!extras.certChain) throw new Error("module 24 needs the google-cert-chain fixture");
  const leafDer = extras.certChain.certs[0].der_hex;

  const panels: VisualHostOptions["panels"] = [
    { id: "dns-query", label: "DNS · query example.com A", source: { oracle: "dns", hex: extras.dnsQuery.hex } },
    { id: "dns-response", label: "DNS · response (2 A records)", source: { oracle: "dns", hex: extras.dnsResponse.hex } },
    { id: "cert-leaf", label: "Cert · www.google.com leaf", source: { oracle: "x509", derHex: leafDer } },
  ];
  return { mode, oracle, panels };
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

  const stages = [
    { from: "event", to: "collector", type: "source" },
    { from: "source", to: "store", type: "collector" },
    { from: "collector", to: "query", type: "store" },
    { from: "store", to: "alert", type: "query" },
    { from: "query", to: "operator", type: "alert" },
  ];
  const canonical = { "log-pipeline": stages.map((s) => ({ from: s.from, to: s.to, type: s.type })) };

  const mapItems = [
    { id: "pri-severity", label: "PRI Severity (auth alerting)", keyZone: "ac7-ia5", keyRef: "NIST 800-53 AC-7 / IA-5" },
    { id: "audit-content", label: "Actor / time / outcome (audit content)", keyZone: "au3", keyRef: "NIST 800-53 AU-3; SOC 2 CC7.2" },
    { id: "retention-horizon", label: "Store retention horizon", keyZone: "au11", keyRef: "NIST 800-53 AU-11" },
    { id: "auth-failure-line", label: "su auth-failure line", keyZone: "audit", keyRef: "§4.7 audit record (who/what/when/outcome)" },
    { id: "do-nuts-line", label: "do-nuts line", keyZone: "application", keyRef: "§4.7 application log (debugging noise)" },
  ];

  return {
    mode,
    oracle,
    panels,
    trace: { canonical, cards: stages, participants: ["event", "collector", "source", "store", "query", "alert", "operator"] },
    map: { zones: ["ac7-ia5", "au3", "au11", "audit", "application"], items: mapItems },
  };
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
