/**
 * x509-parser (engine id: `x509`) — the applied-crypto/PKI and how-the-internet-works oracle.
 *
 * Pure, DOM-free, SYNCHRONOUS TypeScript: walks the REAL DER bytes of an X.509 certificate
 * (RFC 5280) into a nested parse tree — validity window, subject + SAN dNSNames, issuer,
 * BasicConstraints, KeyUsage, serial, signature algorithm — and exposes the issuer↔subject
 * chain predicate the PEEL/TRACE surface uses to link leaf → intermediate → root. The parse
 * tree IS the oracle: every field the surface shows is decoded from the real bytes, never
 * authored.
 *
 * Honesty doctrine: the parser is fidelity-checked against `openssl x509 -text` of the same
 * cert (web/tests/crypto-fidelity.test.ts) over the REAL www.google.com chain captured
 * 2026-06-13. The chain verdict mirrors `openssl verify`'s real return codes
 * (0 ok / 10 expired / 18 self-signed / 62 hostname-mismatch). There is no answer key.
 *
 * Scope (honest bound): this is a FIELD-READING parser + a name/validity/SAN predicate, NOT a
 * signature-validating PKI library. It does not verify RSA/ECDSA signatures (that needs the CA
 * public key + a bignum library); the chain predicate it computes is the issuer-name ==
 * subject-name link the curriculum teaches, plus validity-window and hostname checks — exactly
 * the verdicts openssl's return codes name. Signature math is out of scope and documented as such.
 *
 * Spec/RFC: RFC 5280 (X.509 v3), ITU-T X.690 (DER), RFC 6125 (hostname matching).
 */
import type { ParseTreeProbe, ParseRegion } from "./pkt";

// ----------------------------------------------------------------------------
// DER (ITU-T X.690) TLV reader — minimal, total over well-formed cert bytes
// ----------------------------------------------------------------------------

/** Universal-class DER tags this parser reads. */
const enum Tag {
  INTEGER = 0x02,
  BIT_STRING = 0x03,
  OCTET_STRING = 0x04,
  OID = 0x06,
  UTF8String = 0x0c,
  SEQUENCE = 0x10,
  SET = 0x11,
  PrintableString = 0x13,
  IA5String = 0x16,
  UTCTime = 0x17,
  GeneralizedTime = 0x18,
}

export interface DerNode {
  tag: number;
  /** 0 universal, 1 application, 2 context, 3 private. */
  cls: number;
  constructed: boolean;
  /** content start (after the TLV header). */
  start: number;
  /** content end (exclusive). */
  end: number;
  /** absolute offset of the tag byte. */
  tlvStart: number;
}

/**
 * Read one DER TLV (ITU-T X.690 §8.1) at `pos`. Supports the high-tag-number form (§8.1.2.4,
 * tag ≥ 31) and long-form length (§8.1.3.5). Throws on a truncated/invalid length. Exported so
 * the DER primitive is unit-testable independently of a full cert. The X.509 certs the
 * curriculum captures use only low-tag form; high-tag is here for spec-correct totality.
 */
export function readTLV(b: Uint8Array, pos: number): DerNode {
  if (pos >= b.length) throw new Error(`DER read past end at ${pos}`);
  const tag0 = b[pos];
  const cls = tag0 >> 6;
  const constructed = (tag0 & 0x20) !== 0;
  let tag = tag0 & 0x1f;
  let p = pos + 1;
  if (tag === 0x1f) {
    // high-tag-number form (rare in certs)
    tag = 0;
    do {
      tag = (tag << 7) | (b[p] & 0x7f);
    } while (b[p++] & 0x80);
  }
  let len = b[p];
  let lenBytes = 1;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | b[p + 1 + i];
    lenBytes = 1 + n;
  }
  const hdr = p + lenBytes - pos;
  const start = pos + hdr;
  const end = start + len;
  if (end > b.length) throw new Error(`DER length overruns buffer (${end} > ${b.length})`);
  return { tag, cls, constructed, start, end, tlvStart: pos };
}

/** Children of a constructed node. */
function der_children(b: Uint8Array, node: DerNode): DerNode[] {
  const out: DerNode[] = [];
  let p = node.start;
  while (p < node.end) {
    const c = readTLV(b, p);
    out.push(c);
    p = c.end;
  }
  return out;
}

const textOf = (b: Uint8Array, n: DerNode) => new TextDecoder().decode(b.slice(n.start, n.end));

/** Dotted OID string from an OID node's content. */
function oidString(b: Uint8Array, n: DerNode): string {
  const v = b.slice(n.start, n.end);
  if (v.length === 0) return "";
  const out = [Math.floor(v[0] / 40), v[0] % 40];
  let acc = 0;
  for (let i = 1; i < v.length; i++) {
    acc = (acc << 7) | (v[i] & 0x7f);
    if (!(v[i] & 0x80)) {
      out.push(acc);
      acc = 0;
    }
  }
  return out.join(".");
}

// ----------------------------------------------------------------------------
// X.509 field extraction
// ----------------------------------------------------------------------------

const OID = {
  CN: "2.5.4.3",
  O: "2.5.4.10",
  OU: "2.5.4.11",
  C: "2.5.4.6",
  SAN: "2.5.29.17",
  BASIC_CONSTRAINTS: "2.5.29.19",
  KEY_USAGE: "2.5.29.15",
  EXT_KEY_USAGE: "2.5.29.37",
} as const;

/** RFC 5280 §4.2.1.3 KeyUsage bit names, MSB first. */
const KEY_USAGE_BITS = [
  "Digital Signature",
  "Non Repudiation",
  "Key Encipherment",
  "Data Encipherment",
  "Key Agreement",
  "Certificate Sign",
  "CRL Sign",
  "Encipher Only",
  "Decipher Only",
];

export interface DistinguishedName {
  cn?: string;
  o?: string;
  ou?: string;
  c?: string;
  /** Canonical "C=US, O=…, OU=…, CN=…" rendering for display + the chain predicate. */
  text: string;
}

export interface X509Fields {
  serialHex: string;
  /** ISO-8601 UTC. */
  notBefore: string;
  notAfter: string;
  subject: DistinguishedName;
  issuer: DistinguishedName;
  /** SAN dNSName entries (RFC 5280 §4.2.1.6). */
  sanDns: string[];
  /** BasicConstraints CA flag (RFC 5280 §4.2.1.9); null if the extension is absent. */
  basicConstraintsCa: boolean | null;
  /** KeyUsage names (RFC 5280 §4.2.1.3). */
  keyUsage: string[];
  /** Signature algorithm OID (informational). */
  signatureAlgorithmOid: string;
}

/** Parse a Name (SEQ of RDN of ATV) into a DistinguishedName. */
function parseName(b: Uint8Array, name: DerNode): DistinguishedName {
  const parts: Array<[string, string]> = [];
  for (const rdn of der_children(b, name)) {
    for (const atv of der_children(b, rdn)) {
      const kids = der_children(b, atv);
      const oid = oidString(b, kids[0]);
      const value = textOf(b, kids[1]);
      if (oid === OID.CN) parts.push(["CN", value]);
      else if (oid === OID.O) parts.push(["O", value]);
      else if (oid === OID.OU) parts.push(["OU", value]);
      else if (oid === OID.C) parts.push(["C", value]);
    }
  }
  const find = (k: string) => parts.find((p) => p[0] === k)?.[1];
  // Canonical order C, O, OU, CN (matches openssl's `-subject`/`-issuer` ordering for these certs).
  const ordered = ["C", "O", "OU", "CN"].flatMap((k) => {
    const v = find(k);
    return v !== undefined ? [`${k}=${v}`] : [];
  });
  return { cn: find("CN"), o: find("O"), ou: find("OU"), c: find("C"), text: ordered.join(", ") };
}

/** RFC 5280 UTCTime (YYMMDDHHMMSSZ) / GeneralizedTime (YYYYMMDDHHMMSSZ) → ISO-8601 UTC. */
function parseTime(raw: string, isGeneralized: boolean): string {
  // Both end in 'Z'. UTCTime YY: per RFC 5280, YY < 50 → 20YY, else 19YY.
  let yyyy: string, rest: string;
  if (isGeneralized) {
    yyyy = raw.slice(0, 4);
    rest = raw.slice(4);
  } else {
    const yy = parseInt(raw.slice(0, 2), 10);
    yyyy = String(yy < 50 ? 2000 + yy : 1900 + yy);
    rest = raw.slice(2);
  }
  const mo = rest.slice(0, 2),
    da = rest.slice(2, 4),
    ho = rest.slice(4, 6),
    mi = rest.slice(6, 8),
    se = rest.slice(8, 10);
  return `${yyyy}-${mo}-${da}T${ho}:${mi}:${se}Z`;
}

/** Decode the BasicConstraints extension content to its CA flag (default false per RFC 5280). */
function parseBasicConstraints(b: Uint8Array, octet: DerNode): boolean {
  const seq = readTLV(b, octet.start);
  const kids = der_children(b, seq);
  // BasicConstraints ::= SEQ { cA BOOLEAN DEFAULT FALSE, pathLen INTEGER OPTIONAL }
  const caNode = kids.find((k) => k.tag === 0x01 && k.cls === 0);
  if (!caNode) return false;
  return b[caNode.start] !== 0x00;
}

/** Decode the KeyUsage BIT STRING to its set bit names (RFC 5280 §4.2.1.3). */
function parseKeyUsage(b: Uint8Array, octet: DerNode): string[] {
  const bitStr = readTLV(b, octet.start); // BIT STRING
  const content = b.slice(bitStr.start, bitStr.end);
  if (content.length < 2) return [];
  const bits = content.slice(1); // first byte = unused-bit count
  const names: string[] = [];
  for (let i = 0; i < KEY_USAGE_BITS.length; i++) {
    const byteIdx = i >> 3;
    const bit = 7 - (i & 7);
    if (byteIdx < bits.length && (bits[byteIdx] >> bit) & 1) names.push(KEY_USAGE_BITS[i]);
  }
  return names;
}

/** Decode SAN to its dNSName ([2] IA5String) entries (RFC 5280 §4.2.1.6). */
function parseSan(b: Uint8Array, octet: DerNode): string[] {
  const seq = readTLV(b, octet.start); // GeneralNames SEQ
  const out: string[] = [];
  for (const gn of der_children(b, seq)) {
    if (gn.cls === 2 && gn.tag === 2) out.push(textOf(b, gn)); // dNSName [2]
  }
  return out;
}

/**
 * Parse a certificate's DER bytes into its load-bearing fields (RFC 5280). Throws only on bytes
 * that aren't a Certificate SEQUENCE at all — a forensic parser surfaces what it found, but an
 * input that isn't DER is a hard error (no field to invent).
 */
export function parseCertificate(der: Uint8Array): X509Fields {
  const cert = readTLV(der, 0);
  if (cert.tag !== Tag.SEQUENCE) throw new Error("not a Certificate (expected DER SEQUENCE)");
  const tbs = readTLV(der, cert.start);
  if (tbs.tag !== Tag.SEQUENCE) throw new Error("malformed TBSCertificate");
  const fields = der_children(der, tbs);
  // [0] version (context), INTEGER serial, SEQ sigAlg, SEQ issuer, SEQ validity, SEQ subject,
  // SEQ SPKI, [3] extensions. Version is optional; detect by class.
  let idx = 0;
  if (fields[idx].cls === 2 && fields[idx].tag === 0) idx++; // skip explicit version [0]
  const serialNode = fields[idx++];
  const sigAlgSeq = fields[idx++];
  const issuerNode = fields[idx++];
  const validityNode = fields[idx++];
  const subjectNode = fields[idx++];
  idx++; // SPKI (skip — we don't verify signatures)
  const extWrap = fields.find((f) => f.cls === 2 && f.tag === 3) ?? null;

  // serial: strip a single DER leading sign byte (0x00) to match openssl's rendering.
  const serialBytes = der.slice(serialNode.start, serialNode.end);
  const serialTrimmed = serialBytes.length > 1 && serialBytes[0] === 0x00 ? serialBytes.slice(1) : serialBytes;
  const serialHex = Array.from(serialTrimmed, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

  const validityKids = der_children(der, validityNode);
  const notBefore = parseTime(textOf(der, validityKids[0]), validityKids[0].tag === Tag.GeneralizedTime);
  const notAfter = parseTime(textOf(der, validityKids[1]), validityKids[1].tag === Tag.GeneralizedTime);

  let sanDns: string[] = [];
  let basicConstraintsCa: boolean | null = null;
  let keyUsage: string[] = [];
  if (extWrap) {
    const extSeq = der_children(der, extWrap)[0];
    for (const ext of der_children(der, extSeq)) {
      const kids = der_children(der, ext);
      const oid = oidString(der, kids[0]);
      const octet = kids[kids.length - 1]; // OCTET STRING wrapping the ext value
      if (oid === OID.SAN) sanDns = parseSan(der, octet);
      else if (oid === OID.BASIC_CONSTRAINTS) basicConstraintsCa = parseBasicConstraints(der, octet);
      else if (oid === OID.KEY_USAGE) keyUsage = parseKeyUsage(der, octet);
    }
  }

  return {
    serialHex,
    notBefore,
    notAfter,
    subject: parseName(der, subjectNode),
    issuer: parseName(der, issuerNode),
    sanDns,
    basicConstraintsCa,
    keyUsage,
    signatureAlgorithmOid: oidString(der, der_children(der, sigAlgSeq)[0]),
  };
}

// ----------------------------------------------------------------------------
// chain + validity + hostname predicates (the verdicts openssl's codes name)
// ----------------------------------------------------------------------------

/** openssl `X509_V_*` return codes the curriculum teaches. */
export const VERIFY_CODE = {
  OK: 0,
  CERT_HAS_EXPIRED: 10,
  DEPTH_ZERO_SELF_SIGNED_CERT: 18,
  UNABLE_TO_GET_ISSUER_CERT: 20,
  HOSTNAME_MISMATCH: 62,
} as const;

export const VERIFY_CODE_NAME: Record<number, string> = {
  0: "ok",
  10: "certificate has expired",
  18: "self signed certificate",
  20: "unable to get local issuer certificate",
  62: "hostname mismatch",
};

/** Is the cert within its validity window at `now`? RFC 5280 §4.1.2.5. */
export function isWithinValidity(fields: X509Fields, now: Date): boolean {
  const nb = new Date(fields.notBefore).getTime();
  const na = new Date(fields.notAfter).getTime();
  const t = now.getTime();
  return t >= nb && t <= na;
}

/** Does cert N's issuer-name equal cert N+1's subject-name? (the chain link the surface draws). */
export function issuerMatchesSubject(child: X509Fields, parent: X509Fields): boolean {
  return child.issuer.text === parent.subject.text && child.issuer.text !== "";
}

/** Is the cert self-signed (issuer == subject)? RFC 5280 — the depth-0 self-signed case. */
export function isSelfSigned(fields: X509Fields): boolean {
  return fields.issuer.text === fields.subject.text;
}

/**
 * RFC 6125 hostname match against the cert's SAN dNSNames, supporting a single leftmost
 * wildcard label (`*.example.com` matches `a.example.com` but not `example.com` or
 * `a.b.example.com`). Case-insensitive.
 */
export function hostMatchesSan(fields: X509Fields, host: string): boolean {
  const h = host.toLowerCase();
  return fields.sanDns.some((pattern) => matchHostPattern(pattern.toLowerCase(), h));
}

function matchHostPattern(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (!pattern.startsWith("*.")) return false;
  const suffix = pattern.slice(1); // ".example.com"
  if (!host.endsWith(suffix)) return false;
  const left = host.slice(0, host.length - suffix.length);
  // wildcard covers exactly ONE label — no dots in the matched portion, and it must be non-empty
  return left.length > 0 && !left.includes(".");
}

export interface ChainVerdict {
  code: number;
  meaning: string;
  /** Human note naming the divergent field (never an answer key — it's the computed reason). */
  reason: string;
}

/**
 * Compute the verdict openssl would return for a leaf, optionally with an ordered chain to a
 * trusted root and a hostname to match. Mirrors `openssl verify` precedence:
 *   expired (10) → self-signed at depth 0 with no chain (18) → missing issuer (20) →
 *   hostname mismatch (62) → ok (0).
 * The leaf is `chain[0]`; `chain[1..]` are intermediates/root in order. `trustedRootSubjects`
 * lists subject-name texts treated as trust anchors (e.g. the GTS Root R1 subject).
 */
export function verifyChain(
  chain: X509Fields[],
  opts: { now: Date; host?: string; trustedRootSubjects?: string[] } = { now: new Date() },
): ChainVerdict {
  const leaf = chain[0];
  const trusted = new Set(opts.trustedRootSubjects ?? []);

  // 1) validity (expiry) — checked leaf-first, the most common real failure.
  for (const c of chain) {
    if (!isWithinValidity(c, opts.now)) {
      const expired = new Date(c.notAfter).getTime() < opts.now.getTime();
      return {
        code: VERIFY_CODE.CERT_HAS_EXPIRED,
        meaning: VERIFY_CODE_NAME[VERIFY_CODE.CERT_HAS_EXPIRED],
        reason: expired
          ? `${c.subject.cn ?? c.subject.text} notAfter ${c.notAfter} is in the past`
          : `${c.subject.cn ?? c.subject.text} notBefore ${c.notBefore} is in the future`,
      };
    }
  }

  // 2) self-signed at depth 0 with no further chain (the self-signed.badssl case).
  if (chain.length === 1 && isSelfSigned(leaf) && !trusted.has(leaf.subject.text)) {
    return {
      code: VERIFY_CODE.DEPTH_ZERO_SELF_SIGNED_CERT,
      meaning: VERIFY_CODE_NAME[VERIFY_CODE.DEPTH_ZERO_SELF_SIGNED_CERT],
      reason: `issuer (${leaf.issuer.text}) equals subject — no CA above it`,
    };
  }

  // 3) each link must connect issuer→subject up to a trusted root.
  for (let i = 0; i < chain.length - 1; i++) {
    if (!issuerMatchesSubject(chain[i], chain[i + 1])) {
      return {
        code: VERIFY_CODE.UNABLE_TO_GET_ISSUER_CERT,
        meaning: VERIFY_CODE_NAME[VERIFY_CODE.UNABLE_TO_GET_ISSUER_CERT],
        reason: `${chain[i].subject.cn ?? chain[i].subject.text}'s issuer (${chain[i].issuer.text}) does not match the next cert's subject (${chain[i + 1].subject.text})`,
      };
    }
  }
  // top of chain must be a trusted root (or itself self-signed in the trusted set).
  const top = chain[chain.length - 1];
  if (trusted.size > 0 && !trusted.has(top.subject.text) && !trusted.has(top.issuer.text)) {
    return {
      code: VERIFY_CODE.UNABLE_TO_GET_ISSUER_CERT,
      meaning: VERIFY_CODE_NAME[VERIFY_CODE.UNABLE_TO_GET_ISSUER_CERT],
      reason: `the chain's top (${top.subject.text}) does not reach a trusted root`,
    };
  }

  // 4) hostname coverage (RFC 6125) — the wrong.host case (code 62).
  if (opts.host !== undefined && !hostMatchesSan(leaf, opts.host)) {
    return {
      code: VERIFY_CODE.HOSTNAME_MISMATCH,
      meaning: VERIFY_CODE_NAME[VERIFY_CODE.HOSTNAME_MISMATCH],
      reason: `SAN (${leaf.sanDns.join(", ") || "none"}) does not cover ${opts.host}`,
    };
  }

  return { code: VERIFY_CODE.OK, meaning: VERIFY_CODE_NAME[VERIFY_CODE.OK], reason: "all links connect, in window, host covered" };
}

// ----------------------------------------------------------------------------
// parse-tree probe (the PEEL surface + the closed verifier registry consume this)
// ----------------------------------------------------------------------------

/** Hex → bytes (DER fixtures are committed as contiguous hex). */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex (${clean.length})`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Build a ParseTreeProbe over a certificate's fields — the PEEL surface's selectable field
 * regions. Region ids: cert.subject, cert.issuer, cert.validity (+ .notBefore/.notAfter),
 * cert.san, cert.basicConstraints, cert.keyUsage, cert.serial. `value` is the oracle's decode.
 *
 * Byte spans are nominal (field index, not DER offset) — the teaching surface selects fields by
 * meaning, not raw DER offset; node_id is the authoritative target for region_labeled_correctly.
 */
export function buildCertProbe(der: Uint8Array): ParseTreeProbe {
  const f = parseCertificate(der);
  // per-build span allocator: each field gets a distinct, deterministic nominal range so two
  // builds of the same cert produce identical probes (no module-global drift).
  let span = 0;
  const field = (id: string, label: string, value: string, rfc: string): ParseRegion => {
    const start = span++;
    return { id, start, end: start + 1, label, layer: "field", value, rfc, children: [] };
  };
  const children: ParseRegion[] = [
    field("cert.subject", "Subject", f.subject.text, "RFC 5280 §4.1.2.6"),
    field("cert.issuer", "Issuer", f.issuer.text, "RFC 5280 §4.1.2.4"),
    {
      ...field("cert.validity", "Validity", `${f.notBefore} … ${f.notAfter}`, "RFC 5280 §4.1.2.5"),
      children: [
        field("cert.validity.notBefore", "Not Before", f.notBefore, "RFC 5280 §4.1.2.5"),
        field("cert.validity.notAfter", "Not After", f.notAfter, "RFC 5280 §4.1.2.5"),
      ],
    },
    field("cert.san", "Subject Alternative Name", f.sanDns.length ? f.sanDns.map((d) => `DNS:${d}`).join(", ") : "(none)", "RFC 5280 §4.2.1.6"),
    field(
      "cert.basicConstraints",
      "Basic Constraints",
      f.basicConstraintsCa === null ? "(absent)" : `CA:${f.basicConstraintsCa ? "TRUE" : "FALSE"}`,
      "RFC 5280 §4.2.1.9",
    ),
    field("cert.keyUsage", "Key Usage", f.keyUsage.length ? f.keyUsage.join(", ") : "(none)", "RFC 5280 §4.2.1.3"),
    field("cert.serial", "Serial Number", f.serialHex, "RFC 5280 §4.1.2.2"),
  ];
  const root: ParseRegion = {
    id: "cert",
    start: 0,
    end: der.length,
    label: `Certificate (${f.subject.cn ?? f.subject.text})`,
    layer: "cert",
    value: `${f.subject.cn ?? f.subject.text} ← issued by ${f.issuer.cn ?? f.issuer.text}`,
    rfc: "RFC 5280",
    children,
  };
  return buildProbe(root, der.length);
}

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map<string, ParseRegion>();
  for (const r of regions) {
    const key = `${r.start}:${r.end}`;
    if (!byRange.has(key)) byRange.set(key, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
