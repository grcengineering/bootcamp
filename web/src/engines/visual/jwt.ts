/**
 * jwt-7519 (engine id: `jwt`) — the identity / web-app / api-paradigms (and module-06) oracle.
 *
 * Pure, DOM-free, SYNCHRONOUS TypeScript: splits a REAL three-segment JWT
 * (header.payload.signature) on the dots, base64url-decodes the header and payload, and
 * JSON-parses each. The decode IS the oracle — header/payload are plaintext to anyone with no
 * key, which is the whole pedagogical point (encoding != encryption). It reads the reserved
 * claims (exp/iat/iss/aud/sub) and FLAGS the alg:none unprotected-token attack. HS256 signature
 * verification delegates to crypto-transform (HMAC-SHA-256) — the same real transform the rest
 * of the curriculum uses.
 *
 * Honesty: the parse tree over the real base64url bytes is the oracle, fidelity-checked in
 * web/tests/crypto-fidelity.test.ts against python/node base64url decode of the committed token.
 * The alg:none twin is a real tampered instance, not a mock.
 *
 * Spec/RFC: RFC 7519 (JWT), RFC 7515 (JWS), RFC 4648 §5 (base64url), RFC 8725 (JWT BCP, alg:none).
 */
import type { ParseTreeProbe, ParseRegion } from "./pkt";
import { fromBase64, bytesToUtf8, utf8Bytes, hmacSha256, toBase64 } from "./xform";

/** The reserved JWT claims the parser surfaces (RFC 7519 §4.1). */
export interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
  [k: string]: unknown;
}

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [k: string]: unknown;
}

export interface DecodedJwt {
  /** The raw three segments (signature is the raw base64url string; "" for alg:none). */
  segments: { headerB64: string; payloadB64: string; signatureB64: string };
  header: JwtHeader;
  payload: JwtClaims;
  /** True when the header's `alg` is "none" — the RFC 8725 §2.1 unprotected-token attack. */
  algNone: boolean;
  /** The decoded header JSON text (what the PEEL surface shows). */
  headerJson: string;
  /** The decoded payload JSON text. */
  payloadJson: string;
}

/**
 * Decode a JWT into its header + payload (RFC 7519). Throws only on a structurally invalid token
 * (not three dot-separated segments, or a segment that isn't valid base64url JSON) — a forensic
 * tool that can't parse a segment says so rather than inventing structure.
 */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error(`a JWT has three dot-separated segments, got ${parts.length}`);
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = parseSegmentJson(headerB64, "header") as JwtHeader;
  const payload = parseSegmentJson(payloadB64, "payload") as JwtClaims;
  const headerJson = JSON.stringify(header);
  const payloadJson = JSON.stringify(payload);
  const algNone = typeof header.alg === "string" && header.alg.toLowerCase() === "none";
  return { segments: { headerB64, payloadB64, signatureB64 }, header, payload, algNone, headerJson, payloadJson };
}

function parseSegmentJson(seg: string, which: string): Record<string, unknown> {
  let text: string;
  try {
    text = bytesToUtf8(fromBase64(seg));
  } catch (e) {
    throw new Error(`JWT ${which} is not valid base64url: ${(e as Error).message}`);
  }
  try {
    const obj = JSON.parse(text) as unknown;
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      throw new Error(`JWT ${which} did not decode to a JSON object`);
    return obj as Record<string, unknown>;
  } catch (e) {
    throw new Error(`JWT ${which} is not valid JSON: ${(e as Error).message}`);
  }
}

/**
 * Verify an HS256 JWT signature by RECOMPUTING the HMAC-SHA-256 over
 * `base64url(header).base64url(payload)` with the given secret and comparing (constant in spirit;
 * the lab is teaching, not hardening) to the token's signature segment. Returns true on a match.
 * Honest because it runs the real transform — alg:none always fails verification (no signature).
 */
export function verifyHs256(token: string, secret: string): boolean {
  const { segments, algNone } = decodeJwt(token);
  if (algNone) return false; // an unsigned token never verifies under HS256
  const signingInput = `${segments.headerB64}.${segments.payloadB64}`;
  const expected = toBase64(hmacSha256(utf8Bytes(secret), utf8Bytes(signingInput)), true);
  return timingSafeEqual(expected, segments.signatureB64);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Is a JWT expired relative to a reference epoch (seconds)? Reads the real `exp` claim
 * (RFC 7519 §4.1.4). Returns null when there's no `exp` (the claim is absent, not expired).
 */
export function isExpired(token: string, nowSeconds: number): boolean | null {
  const { payload } = decodeJwt(token);
  if (typeof payload.exp !== "number") return null;
  return payload.exp < nowSeconds;
}

/**
 * Build a ParseTreeProbe over a JWT — the PEEL surface's three segment regions plus the decoded
 * header/payload claim regions. Region ids:
 *   jwt.header / jwt.payload / jwt.signature — the three base64url segments
 *   jwt.header.alg / jwt.payload.exp / jwt.payload.iss / … — the decoded claim values
 * `value` is always the oracle's real decode (the alg:none header decodes to {"alg":"none",…}).
 */
export function buildJwtProbe(token: string): ParseTreeProbe {
  const d = decodeJwt(token);
  const segLens = [d.segments.headerB64.length, d.segments.payloadB64.length, d.segments.signatureB64.length];
  // byte offsets in the raw token (segments + the two dots) — gives the PEEL surface honest spans
  const headerStart = 0;
  const headerEnd = segLens[0];
  const payloadStart = headerEnd + 1; // skip "."
  const payloadEnd = payloadStart + segLens[1];
  const sigStart = payloadEnd + 1;
  const sigEnd = sigStart + segLens[2];

  const headerChildren = claimRegions("jwt.header", d.header, headerStart, headerEnd);
  const payloadChildren = claimRegions("jwt.payload", d.payload, payloadStart, payloadEnd);

  const root: ParseRegion = {
    id: "jwt",
    start: 0,
    end: sigEnd,
    label: "JWT",
    layer: "token",
    value: d.algNone ? "alg:none (UNPROTECTED — RFC 8725 §2.1)" : `${String(d.header.alg ?? "?")} signed`,
    rfc: "RFC 7519",
    children: [
      {
        id: "jwt.header",
        start: headerStart,
        end: headerEnd,
        label: "Header (base64url)",
        layer: "segment",
        value: d.headerJson,
        rfc: "RFC 7515 §4",
        gates: "jwt.payload",
        children: headerChildren,
      },
      {
        id: "jwt.payload",
        start: payloadStart,
        end: payloadEnd,
        label: "Payload (base64url claims)",
        layer: "segment",
        value: d.payloadJson,
        rfc: "RFC 7519 §4.1",
        children: payloadChildren,
      },
      {
        id: "jwt.signature",
        start: sigStart,
        end: sigEnd,
        label: "Signature",
        layer: "segment",
        value: d.segments.signatureB64 === "" ? "(empty — no signature)" : d.segments.signatureB64,
        rfc: "RFC 7515 §5",
        children: [],
      },
    ],
  };
  return buildProbe(root, sigEnd);
}

/** One decoded claim per region, value = the oracle's real decode (alg, exp, iss, …). */
function claimRegions(prefix: string, obj: Record<string, unknown>, start: number, end: number): ParseRegion[] {
  return Object.entries(obj).map(([k, v], i) => ({
    id: `${prefix}.${k}`,
    // claim regions share the segment's span (they're decoded FROM it, not byte-addressable)
    start: start + i,
    end: end,
    label: k,
    layer: "claim",
    value: typeof v === "string" ? v : JSON.stringify(v),
    rfc: "RFC 7519 §4.1",
    children: [],
  }));
}

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  // claim regions share spans with their segment; map by id is authoritative, by-range keeps
  // the first (segment-level) region for an ambiguous range.
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
