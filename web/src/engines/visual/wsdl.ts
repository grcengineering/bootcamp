/**
 * WSDL 1.1 + WS-SecurityPolicy contract oracle (engine id: `wsdl`) — the SOAP oracle.
 *
 * Pure, DOM-free TypeScript. Parses a REAL WSDL 1.1 document (with an embedded WS-SecurityPolicy)
 * over the shared "list users + MFA" model into the SHARED parse tree (the same `ParseTreeProbe`
 * the other oracles produce). The learner PEELs to the SOAP control truth-field node: the
 * `sp:SignedParts` policy assertion proving the message Body MUST be signed (the integrity
 * control SOAP invites), alongside the `portType`/`operation` (ListUsers) intent.
 *
 * It ALSO exposes the WS-Security UsernameToken PasswordDigest transform —
 * `Base64(SHA-1(nonce_bytes + created_bytes + password_bytes))` — as a real, re-runnable oracle
 * (the design's "recompute the digest" task). The transform is the oracle: the fixture's digest is
 * the transform's output over the committed (cited) inputs, never an authored string.
 *
 * Honesty doctrine: the parser/transform IS the oracle. XML elements are read by a small,
 * deterministic, offset-preserving tag walker (no XML node is invented); the digest is computed
 * by a vendored, tested SHA-1 + the platform base64 over the real bytes.
 *
 * Cited: WSDL 1.1 (w3.org/TR/wsdl); WS-SecurityPolicy + OASIS WSS UsernameTokenProfile 1.0
 * (the nonce/created example values); RFC 3174 (SHA-1); RFC 4648 (base64).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

// ----------------------------------------------------------------------------
// SHA-1 (RFC 3174) — pure TS, tested against FIPS/RFC vectors in pbwire/wsdl fidelity suites.
// Vendored (never roll crypto for production secrets; this is a teaching transform over
// public, cited example bytes — the oracle that proves "recompute, don't trust the envelope").
// ----------------------------------------------------------------------------

function rotl(n: number, s: number): number {
  return ((n << s) | (n >>> (32 - s))) >>> 0;
}

/** SHA-1 of a byte array → 20-byte digest. RFC 3174. */
export function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length * 8;
  // pad
  const withOne = new Uint8Array(((bytes.length + 8) >> 6) * 64 + 64);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  // 64-bit big-endian length in the last 8 bytes
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, ml >>> 0, false);
  dv.setUint32(withOne.length - 8, Math.floor(ml / 2 ** 32), false);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withOne.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => odv.setUint32(i * 4, h, false));
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  const TBL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += TBL[b0 >> 2];
    out += TBL[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? TBL[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? TBL[b2 & 0x3f] : "=";
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const TBL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (TBL.indexOf(clean[i]) << 18) | (TBL.indexOf(clean[i + 1]) << 12) | (TBL.indexOf(clean[i + 2] ?? "A") << 6) | TBL.indexOf(clean[i + 3] ?? "A");
    out.push((n >> 16) & 0xff);
    if (clean[i + 2] && b64[i + 2] !== "=") out.push((n >> 8) & 0xff);
    if (clean[i + 3] && b64[i + 3] !== "=") out.push(n & 0xff);
  }
  return new Uint8Array(out);
}

const utf8 = new TextEncoder();

/**
 * The WS-Security UsernameToken PasswordDigest transform — the oracle for the "recompute the
 * digest" task. `PasswordDigest = Base64(SHA-1(nonce_bytes + created_utf8 + password_utf8))`,
 * where nonce is the base64-decoded Nonce. OASIS WSS UsernameTokenProfile 1.0 §3.1.
 */
export function wsSecurityPasswordDigest(nonceB64: string, created: string, password: string): string {
  const nonce = base64ToBytes(nonceB64);
  const createdB = utf8.encode(created);
  const pwB = utf8.encode(password);
  const concat = new Uint8Array(nonce.length + createdB.length + pwB.length);
  concat.set(nonce, 0);
  concat.set(createdB, nonce.length);
  concat.set(pwB, nonce.length + createdB.length);
  return bytesToBase64(sha1(concat));
}

// ----------------------------------------------------------------------------
// WSDL / XML structural reader (offset-preserving, deterministic)
// ----------------------------------------------------------------------------

/** Locate the char span of the FIRST occurrence of an element open tag (`<name` or `<ns:name`). */
function locateTag(xml: string, localName: string, fromOffset = 0): ByteRange {
  // match <prefix:localName  OR  <localName  at a tag boundary
  const re = new RegExp(`<([A-Za-z_][\\w.-]*:)?${localName}(\\s|>|/)`, "g");
  re.lastIndex = fromOffset;
  const m = re.exec(xml);
  if (!m) return { start: 0, end: 0 };
  return { start: m.index, end: m.index + m[0].length - 1 };
}

/** Locate the char span of an element declared by a `name="value"` attribute (e.g. xsd:element). */
function locateAttrValue(xml: string, attrValue: string, fromOffset = 0): ByteRange {
  const needle = `name="${attrValue}"`;
  const idx = xml.indexOf(needle, fromOffset);
  if (idx < 0) return { start: 0, end: 0 };
  return { start: idx, end: idx + needle.length };
}

/**
 * Parse a real WSDL 1.1 + WS-SecurityPolicy document into a ParseTreeProbe. The structurally
 * significant nodes the design needs are surfaced as stable regions:
 *   - wsdl.portType.ListUsers  (the operation intent)
 *   - wsdl.binding.policy.SignedParts  (the integrity control truth-field)
 *   - wsdl.message / wsdl.types  (the User shape)
 * The whole document remains the root region (PEELable as raw XML).
 */
export function parseWsdl(xml: string): ParseTreeProbe {
  const root: ParseRegion = {
    id: "wsdl",
    start: 0,
    end: xml.length,
    label: "WSDL 1.1 definition",
    layer: "document",
    value: "SOAP service contract + WS-SecurityPolicy",
    rfc: "WSDL 1.1",
    children: [],
  };

  // portType + the ListUsers operation (intent lives in the body operation)
  const ptSpan = locateTag(xml, "portType");
  const opSpan = locateTag(xml, "operation", ptSpan.start);
  const portType: ParseRegion = {
    id: "wsdl.portType",
    start: ptSpan.start,
    end: ptSpan.end,
    label: "wsdl:portType",
    layer: "portType",
    value: "abstract operations",
    rfc: "WSDL 1.1 §2.4",
    children: [
      {
        id: "wsdl.portType.operation.ListUsers",
        start: opSpan.start,
        end: opSpan.end,
        label: "wsdl:operation ListUsers",
        layer: "operation",
        value: "the SOAP intent — the operation name carries the verb",
        rfc: "WSDL 1.1 §2.4",
        children: [],
      },
    ],
  };
  root.children.push(portType);

  // WS-SecurityPolicy: sp:SignedParts (the truth-field) under wsp:Policy in the binding
  const polSpan = locateTag(xml, "Policy");
  const signedPartsSpan = locateTag(xml, "SignedParts");
  const bodySpan = locateTag(xml, "Body", signedPartsSpan.start);
  const policy: ParseRegion = {
    id: "wsdl.binding.policy",
    start: polSpan.start,
    end: polSpan.end,
    label: "wsp:Policy",
    layer: "policy",
    value: "WS-SecurityPolicy assertions",
    rfc: "WS-SecurityPolicy 1.2",
    children: [
      {
        id: "wsdl.binding.policy.SignedParts",
        start: signedPartsSpan.start,
        end: signedPartsSpan.end,
        label: "sp:SignedParts",
        layer: "policy",
        // the load-bearing assertion: the message Body MUST be signed (integrity control)
        value: "the SOAP Body MUST be signed (sp:Body) — message-level integrity",
        rfc: "WS-SecurityPolicy 1.2 §4.1.1",
        children: signedPartsSpan.end
          ? [
              {
                id: "wsdl.binding.policy.SignedParts.Body",
                start: bodySpan.start,
                end: bodySpan.end,
                label: "sp:Body",
                layer: "policy",
                value: "the part required to be signed: the SOAP Body",
                rfc: "WS-SecurityPolicy 1.2",
                children: [],
              },
            ]
          : [],
      },
    ],
  };
  root.children.push(policy);

  // the User message shape (types/element) — surfaced so the truth maps across paradigms
  const typesSpan = locateTag(xml, "types");
  if (typesSpan.end) {
    const mfaSpan = locateAttrValue(xml, "mfaEnabled");
    root.children.push({
      id: "wsdl.types",
      start: typesSpan.start,
      end: typesSpan.end,
      label: "wsdl:types (User schema)",
      layer: "types",
      value: "the User element shape",
      rfc: "WSDL 1.1 §2.2 + XML Schema",
      children: mfaSpan.end
        ? [
            {
              id: "wsdl.types.mfaEnabled",
              start: mfaSpan.start,
              end: mfaSpan.end,
              label: "xsd:element mfaEnabled",
              layer: "field",
              value: "the MFA truth-field in the SOAP schema (xsd:boolean)",
              rfc: "XML Schema",
              children: [],
            },
          ]
        : [],
    });
  }

  return buildProbe(root, xml.length);
}

/** Read the text content of the first `<...:local>text</...:local>` element. */
function elementText(xml: string, local: string): { text: string; span: ByteRange } {
  const re = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${local}[^>]*>([^<]*)</`);
  const m = re.exec(xml);
  if (!m) return { text: "", span: { start: 0, end: 0 } };
  const contentStart = m.index + m[0].indexOf(">") + 1;
  return { text: m[1], span: { start: contentStart, end: contentStart + m[1].length } };
}

/**
 * Parse a real SOAP envelope's WS-Security UsernameToken into a ParseTreeProbe whose nodes are
 * the integrity-control truth-fields: wsu:Created (freshness), wsse:Nonce (replay protection),
 * wsse:Password (the digest the envelope CLAIMS), plus a COMPUTED `recomputed-digest` node — the
 * transform's real output over (Nonce, Created, password). The diff surface clicks `wsu:Created`
 * (stale → replay) and asserts `decoded_artifact_matches` against the recomputed digest, which
 * disagrees with the envelope's stale-Created claim. The transform IS the oracle.
 *
 * `password` is the OASIS example password (supplied by the fixture, cited) — never read off the
 * wire (a real envelope never carries the cleartext password).
 */
export function parseSoapSecurity(xml: string, password: string): ParseTreeProbe {
  const created = elementText(xml, "Created");
  const nonce = elementText(xml, "Nonce");
  const pw = elementText(xml, "Password");
  const recomputed = nonce.text && created.text ? wsSecurityPasswordDigest(nonce.text, created.text, password) : "";
  const root: ParseRegion = {
    id: "soap",
    start: 0,
    end: xml.length,
    label: "SOAP Envelope (WS-Security UsernameToken)",
    layer: "document",
    value: "in-message credential — self-protecting end-to-end",
    rfc: "OASIS WSS UsernameTokenProfile 1.0",
    children: [
      { id: "soap.wsse.Nonce", start: nonce.span.start, end: nonce.span.end, label: "wsse:Nonce", layer: "field", value: nonce.text, rfc: "WSS UsernameTokenProfile 1.0 §3.1", children: [] },
      { id: "soap.wsu.Created", start: created.span.start, end: created.span.end, label: "wsu:Created", layer: "field", value: created.text, rfc: "WSS UsernameTokenProfile 1.0 §3.1", children: [] },
      { id: "soap.wsse.Password", start: pw.span.start, end: pw.span.end, label: "wsse:Password (PasswordDigest)", layer: "field", value: pw.text, rfc: "WSS UsernameTokenProfile 1.0 §3.1", children: [] },
      {
        id: "soap.recomputed-digest",
        start: 0,
        end: 0,
        label: "recomputed PasswordDigest",
        layer: "control",
        // the transform's real output: Base64(SHA-1(nonce + created + password))
        value: recomputed,
        rfc: "WSS UsernameTokenProfile 1.0 §3.1 (recomputed)",
        children: [],
      },
    ],
  };
  return buildProbe(root, xml.length);
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
    const k = `${r.start}:${r.end}`;
    if (!byRange.has(k)) byRange.set(k, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
