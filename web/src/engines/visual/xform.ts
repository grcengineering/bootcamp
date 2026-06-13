/**
 * crypto-transform (engine id: `xform`) — the applied-crypto / api-paradigms / identity oracle.
 *
 * Pure, DOM-free, SYNCHRONOUS TypeScript: runs the REAL hashing and encoding transforms over
 * the learner's own bytes. The transform IS the oracle — every digest/encoding the surface
 * shows is recomputed from the input, never read from a stored answer key. Nothing is
 * persisted: a transform takes bytes in and returns the computed result.
 *
 * Why self-contained sync implementations (not WebCrypto)? The PEEL/MAP surface and the closed
 * verifier registry consume a synchronous ParseTreeProbe whose region `value`s are computed at
 * parse time (mirroring pkt.ts). WebCrypto's digest is async; rolling a small, fidelity-checked
 * sync core keeps the oracle pure and synchronous. These are textbook FIPS 180-4 / RFC 1321
 * reference implementations — fidelity-checked against `shasum`/`md5`/node:crypto in
 * web/tests/crypto-fidelity.test.ts. The canonical empty-string anchor
 * SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 is asserted there.
 *
 * Spec/RFC: FIPS 180-4 (SHA-1, SHA-256), RFC 1321 (MD5), RFC 4648 (base64/base64url/hex).
 */
import type { ParseTreeProbe, ParseRegion } from "./pkt";

// ----------------------------------------------------------------------------
// byte helpers (UTF-8 in, no Buffer dependency — universal across bun + browser)
// ----------------------------------------------------------------------------

const UTF8 = new TextEncoder();

/** UTF-8 encode a string to bytes. */
export function utf8Bytes(s: string): Uint8Array {
  return UTF8.encode(s);
}

/** Lowercase hex of a byte array (RFC 4648 §8 base16, lowercased). */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Parse a hex string (any whitespace stripped) into bytes. Throws on malformed input. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex (${clean.length})`);
  if (clean.length > 0 && !/^[0-9a-fA-F]+$/.test(clean)) throw new Error("non-hex characters in input");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** RFC 4648 §4 base64 (with `=` padding) or §5 base64url (no padding) of bytes. */
export function toBase64(bytes: Uint8Array, url = false): string {
  const alpha = url ? B64URL_ALPHABET : B64_ALPHABET;
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alpha[b0 >> 2];
    out += alpha[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? alpha[((b1 & 0x0f) << 2) | (b2 >> 6)] : url ? "" : "=";
    out += i + 2 < bytes.length ? alpha[b2 & 0x3f] : url ? "" : "=";
  }
  return out;
}

/** RFC 4648 base64 / base64url decode to bytes. Tolerates missing base64url padding. Throws on a bad alphabet. */
export function fromBase64(s: string): Uint8Array {
  // Normalize base64url → base64 and re-pad.
  let str = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const rem = str.length % 4;
  if (rem === 1) throw new Error("invalid base64 length");
  if (rem) str += "=".repeat(4 - rem);
  const lut = new Map<string, number>();
  for (let i = 0; i < B64_ALPHABET.length; i++) lut.set(B64_ALPHABET[i], i);
  const out: number[] = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = str[i], c1 = str[i + 1], c2 = str[i + 2], c3 = str[i + 3];
    const n0 = lut.get(c0), n1 = lut.get(c1);
    if (n0 === undefined || n1 === undefined) throw new Error(`non-base64 character`);
    out.push((n0 << 2) | (n1 >> 4));
    if (c2 !== "=" && c2 !== undefined) {
      const n2 = lut.get(c2);
      if (n2 === undefined) throw new Error("non-base64 character");
      out.push(((n1 & 0x0f) << 4) | (n2 >> 2));
      if (c3 !== "=" && c3 !== undefined) {
        const n3 = lut.get(c3);
        if (n3 === undefined) throw new Error("non-base64 character");
        out.push(((n2 & 0x03) << 6) | n3);
      }
    }
  }
  return new Uint8Array(out);
}

/** UTF-8 decode bytes back to a string (for showing a decoded base64/hex payload). */
export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ----------------------------------------------------------------------------
// SHA-256 (FIPS 180-4) — pure sync reference implementation
// ----------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 digest of bytes (FIPS 180-4 §6.2). Returns 32 raw bytes. */
export function sha256(input: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const padded = padMessageBE(input);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++)
      w[i] = (padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) | (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return u32beToBytes(h);
}

// ----------------------------------------------------------------------------
// SHA-1 (FIPS 180-4) — pure sync reference implementation
// ----------------------------------------------------------------------------

const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** SHA-1 digest of bytes (FIPS 180-4 §6.1). Returns 20 raw bytes. */
export function sha1(input: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const padded = padMessageBE(input);
  const w = new Uint32Array(80);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++)
      w[i] = (padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) | (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3];
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rol(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
  }
  return u32beToBytes(h);
}

// ----------------------------------------------------------------------------
// MD5 (RFC 1321) — pure sync reference implementation (little-endian)
// ----------------------------------------------------------------------------

const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = new Uint32Array(Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)));

/** MD5 digest of bytes (RFC 1321). Returns 16 raw bytes. Provided for the "broken/legacy" sort card. */
export function md5(input: Uint8Array): Uint8Array {
  // little-endian length padding (MD5 differs from SHA's big-endian)
  const bitLen = input.length * 8;
  const padLen = ((input.length + 8) >> 6) * 64 + 64;
  const m = new Uint8Array(padLen);
  m.set(input);
  m[input.length] = 0x80;
  // 64-bit little-endian length
  for (let i = 0; i < 8; i++) m[padLen - 8 + i] = (bitLen / 2 ** (8 * i)) & 0xff;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++)
      M[i] = m[off + i * 4] | (m[off + i * 4 + 1] << 8) | (m[off + i * 4 + 2] << 16) | (m[off + i * 4 + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + MD5_K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rol(F, MD5_S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    const v = [a0, b0, c0, d0][i];
    out[i * 4] = v & 0xff; out[i * 4 + 1] = (v >>> 8) & 0xff; out[i * 4 + 2] = (v >>> 16) & 0xff; out[i * 4 + 3] = (v >>> 24) & 0xff;
  }
  return out;
}

// ----------------------------------------------------------------------------
// HMAC-SHA-256 (RFC 2104) — the JWT HS256 verification primitive
// ----------------------------------------------------------------------------

/** HMAC-SHA-256 of message bytes under a key (RFC 2104). Returns 32 raw bytes. */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = 64; // SHA-256 block size
  let k = key.length > block ? sha256(key) : key;
  const padded = new Uint8Array(block);
  padded.set(k);
  const ipad = new Uint8Array(block);
  const opad = new Uint8Array(block);
  for (let i = 0; i < block; i++) { ipad[i] = padded[i] ^ 0x36; opad[i] = padded[i] ^ 0x5c; }
  const inner = sha256(concat(ipad, message));
  return sha256(concat(opad, inner));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}

// big-endian SHA padding shared by SHA-1/SHA-256
function padMessageBE(input: Uint8Array): Uint8Array {
  const bitLen = input.length * 8;
  const padLen = ((input.length + 8) >> 6) * 64 + 64;
  const m = new Uint8Array(padLen);
  m.set(input);
  m[input.length] = 0x80;
  // 64-bit big-endian length (low 32 bits suffice for browser-scale inputs)
  m[padLen - 4] = (bitLen >>> 24) & 0xff;
  m[padLen - 3] = (bitLen >>> 16) & 0xff;
  m[padLen - 2] = (bitLen >>> 8) & 0xff;
  m[padLen - 1] = bitLen & 0xff;
  return m;
}

function u32beToBytes(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    out[i * 4] = (words[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 3] = words[i] & 0xff;
  }
  return out;
}

// ----------------------------------------------------------------------------
// the transform oracle — named, reversibility-tagged transforms over learner bytes
// ----------------------------------------------------------------------------

/**
 * A transform's reversibility class — the honest property that drives the MAP sort key.
 *  - "encode"  — reversible with NO key (base64, hex). Encoding hides nothing.
 *  - "hash"    — one-way (SHA-256/SHA-1/MD5). Never recovers the input.
 *  - "encrypt" — reversible only WITH a key (not implemented here; AES blobs carry their key).
 */
export type TransformClass = "encode" | "hash" | "encrypt";

export type TransformName = "sha256" | "sha1" | "md5" | "base64" | "base64url" | "hex";

const TRANSFORM_CLASS: Record<TransformName, TransformClass> = {
  sha256: "hash", sha1: "hash", md5: "hash",
  base64: "encode", base64url: "encode", hex: "encode",
};

const TRANSFORM_REF: Record<TransformName, string> = {
  sha256: "FIPS 180-4 (one-way)", sha1: "FIPS 180-4 (one-way)", md5: "RFC 1321 (one-way)",
  base64: "RFC 4648 §4 (reversible, no key)", base64url: "RFC 4648 §5 (reversible, no key)", hex: "RFC 4648 §8 (reversible, no key)",
};

export interface TransformResult {
  name: TransformName;
  /** The reversibility class — DERIVED from the algorithm, not authored. */
  klass: TransformClass;
  /** The computed output (hex for hashes, the encoded string for encodings). */
  output: string;
  /** Citation for the algorithm. */
  ref: string;
}

/**
 * Run a named transform over a UTF-8 string and return the computed result + its honest
 * reversibility class. The transform RECOMPUTES every call — no value is stored.
 */
export function transform(name: TransformName, inputUtf8: string): TransformResult {
  const bytes = utf8Bytes(inputUtf8);
  let output: string;
  switch (name) {
    case "sha256": output = toHex(sha256(bytes)); break;
    case "sha1": output = toHex(sha1(bytes)); break;
    case "md5": output = toHex(md5(bytes)); break;
    case "base64": output = toBase64(bytes, false); break;
    case "base64url": output = toBase64(bytes, true); break;
    case "hex": output = toHex(bytes); break;
  }
  return { name, klass: TRANSFORM_CLASS[name], output, ref: TRANSFORM_REF[name] };
}

/**
 * WS-Security PasswordDigest (api-paradigms): Base64(SHA-1(nonce_bytes ++ created ++ password)).
 * The transform IS the oracle — the api-paradigms leg recomputes this and compares to the
 * envelope's digest; a stale `Created` or tampered field yields a different digest. nonce is the
 * RAW bytes (base64-decoded from the envelope), created/password are UTF-8.
 */
export function wsSecurityDigest(nonceB64: string, created: string, password: string): string {
  const nonce = fromBase64(nonceB64);
  const material = concat(concat(nonce, utf8Bytes(created)), utf8Bytes(password));
  return toBase64(sha1(material), false);
}

/**
 * Build a ParseTreeProbe over a set of transform cards (the MAP "Sorting the Scramble" surface).
 * Each card is a region whose `value` is the computed transform output and whose `layer` is the
 * reversibility class — the verifier reads the class the real algorithm produced, not an answer key.
 */
export function buildTransformProbe(
  cards: Array<{ id: string; input: string; transform: TransformName }>,
): ParseTreeProbe {
  const children: ParseRegion[] = cards.map((c, i) => {
    const r = transform(c.transform, c.input);
    return {
      id: c.id,
      start: i,
      end: i + 1,
      label: `${c.transform}(${JSON.stringify(c.input)})`,
      layer: r.klass.toUpperCase(),
      value: r.output,
      rfc: r.ref,
      children: [],
    };
  });
  const root: ParseRegion = {
    id: "transforms",
    start: 0,
    end: cards.length,
    label: "Transform cards",
    layer: "root",
    value: `${cards.length} transform(s)`,
    children,
  };
  return buildProbe(root, cards.length);
}

// shared probe assembly (mirrors pkt.ts buildProbe — kept local so xform has no pkt dep cycle)
function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map(regions.map((r) => [`${r.start}:${r.end}`, r]));
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
