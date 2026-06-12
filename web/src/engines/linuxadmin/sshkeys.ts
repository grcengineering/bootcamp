/**
 * Module-02 key machinery: structured-entropy ed25519 key material, REAL SHA-256
 * fingerprints over the generated public-key blob, the REAL drunken-bishop randomart
 * algorithm (unit-tested against the committed scenario key's captured art), and the
 * ssh-keygen taught surface (fixture: m02-ssh-keygen).
 *
 * Honesty: the key bytes are pseudo-random (no real curve math — nothing here is a usable
 * credential, by design), but every DERIVED artifact is computed the way OpenSSH computes
 * it: fingerprint = base64(SHA-256(pubkey blob)), randomart = drunken bishop over that
 * digest, private-file size = the real openssh-key-v1 framing (399 bytes for the default
 * comment — matching the capture's `ls -l` post).
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import { PendingStdinSignal } from "../shell/interpreter";
import { canDialogue } from "./state";
import { boundary } from "./users";

// ---------------------------------------------------------------------------
// bytes + base64 + SHA-256 (byte-level; shell/hashes.ts is string-oriented)
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function b64encode(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? (b === undefined ? "=" : "=") : B64[c & 63]!;
  }
  return out;
}

export function b64decode(s: string): number[] {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => B64.indexOf(clean[i + k] ?? "A"));
    out.push(((n[0]! << 2) | (n[1]! >> 4)) & 0xff);
    if (i + 2 < clean.length) out.push(((n[1]! << 4) | (n[2]! >> 2)) & 0xff);
    if (i + 3 < clean.length) out.push(((n[2]! << 6) | n[3]!) & 0xff);
  }
  return out;
}

/* SHA-256 over raw bytes (FIPS 180-4). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256Bytes(input: number[]): number[] {
  const rr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;
  const msg = [...input, 0x80];
  while (msg.length % 64 !== 56) msg.push(0);
  const bitLen = input.length * 8;
  for (let i = 7; i >= 0; i--) msg.push(Math.floor(bitLen / 2 ** (8 * i)) & 0xff);
  let [h0, h1, h2, h3, h4, h5, h6, h7] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = ((msg[off + 4 * i]! << 24) | (msg[off + 4 * i + 1]! << 16) | (msg[off + 4 * i + 2]! << 8) | msg[off + 4 * i + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15]!, 7) ^ rr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rr(w[i - 2]!, 17) ^ rr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out: number[] = [];
  for (const hh of [h0, h1, h2, h3, h4, h5, h6, h7]) out.push((hh >> 24) & 0xff, (hh >> 16) & 0xff, (hh >> 8) & 0xff, hh & 0xff);
  return out;
}

// ---------------------------------------------------------------------------
// key material
// ---------------------------------------------------------------------------

function nextEntropyByte(m: Machine): number {
  m.entropy = (m.entropy * 1103515245 + 12345) >>> 0;
  return (m.entropy >> 16) & 0xff;
}

const u32 = (n: number) => [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const strBytes = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0xff);
const lenStr = (s: string) => [...u32(s.length), ...strBytes(s)];
const lenBytes = (b: number[]) => [...u32(b.length), ...b];

export interface GeneratedKey {
  pubLine: string;       // "ssh-ed25519 AAAA… comment"
  privFile: string;      // full PEM-framed openssh-key-v1 file
  fingerprint: string;   // "SHA256:…"(43 base64 chars, unpadded)
  digest: number[];      // raw SHA-256 of the pub blob (drunken-bishop input)
}

/** Fingerprint + digest for an existing public-key line (real math over real file bytes). */
export function fingerprintOfPubLine(pubLine: string): { fingerprint: string; digest: number[] } | null {
  const parts = pubLine.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] !== "ssh-ed25519") return null;
  const digest = sha256Bytes(b64decode(parts[1]!));
  return { fingerprint: "SHA256:" + b64encode(digest).replace(/=+$/, ""), digest };
}

export function generateKey(m: Machine, comment: string): GeneratedKey {
  const pub = Array.from({ length: 32 }, () => nextEntropyByte(m));
  const seed = Array.from({ length: 32 }, () => nextEntropyByte(m));
  const pubBlob = [...lenStr("ssh-ed25519"), ...lenBytes(pub)];
  const digest = sha256Bytes(pubBlob);
  const fingerprint = "SHA256:" + b64encode(digest).replace(/=+$/, "");
  const pubLine = `ssh-ed25519 ${b64encode(pubBlob)} ${comment}`;

  // openssh-key-v1 framing (real layout — yields the real 399-byte file for the default
  // comment, 411 for the seeded "grcops@web-01 admin", matching the captures' ls -l)
  const checkint = u32((nextEntropyByte(m) << 24) | (nextEntropyByte(m) << 16) | (nextEntropyByte(m) << 8) | nextEntropyByte(m));
  let priv = [...checkint, ...checkint, ...lenStr("ssh-ed25519"), ...lenBytes(pub), ...lenBytes([...seed, ...pub]), ...lenStr(comment)];
  let pad = 1;
  while (priv.length % 8 !== 0) priv.push(pad++);
  const blob = [
    ...strBytes("openssh-key-v1\0"),
    ...lenStr("none"), ...lenStr("none"), ...u32(0),
    ...u32(1), ...lenBytes(pubBlob), ...lenBytes(priv),
  ];
  const b64 = b64encode(blob);
  const wrapped = b64.replace(/(.{70})/g, "$1\n").replace(/\n$/, "");
  const privFile = `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrapped}\n-----END OPENSSH PRIVATE KEY-----\n`;
  return { pubLine, privFile, fingerprint, digest };
}

// ---------------------------------------------------------------------------
// drunken bishop (the real OpenSSH randomart algorithm, sshkey.c)
// ---------------------------------------------------------------------------

const ART_CHARS = " .o+=*BOX@%&#/^";

export function drunkenBishop(digest: number[], header: string): string[] {
  const W = 17, H = 9;
  const field: number[] = new Array(W * H).fill(0);
  let x = Math.floor(W / 2), y = Math.floor(H / 2);
  for (const byte of digest) {
    let b = byte;
    for (let i = 0; i < 4; i++) {
      x += (b & 1) !== 0 ? 1 : -1;
      y += (b & 2) !== 0 ? 1 : -1;
      x = Math.max(0, Math.min(W - 1, x));
      y = Math.max(0, Math.min(H - 1, y));
      if (field[y * W + x]! < ART_CHARS.length - 3) field[y * W + x]!++;
      b >>= 2;
    }
  }
  const start = Math.floor(W / 2) + Math.floor(H / 2) * W;
  field[start] = ART_CHARS.length - 2;       // S
  field[y * W + x] = ART_CHARS.length - 1;   // E
  const charFor = (v: number) => (v === ART_CHARS.length - 2 ? "S" : v === ART_CHARS.length - 1 ? "E" : ART_CHARS[Math.min(v, ART_CHARS.length - 3)]!);
  const lines: string[] = [];
  const dashes = (n: number) => "-".repeat(n);
  const top = `[${header}]`;
  const leftTop = Math.floor((W - top.length) / 2);
  lines.push(`+${dashes(leftTop)}${top}${dashes(W - leftTop - top.length)}+`);
  for (let r = 0; r < H; r++) {
    let row = "";
    for (let c = 0; c < W; c++) row += charFor(field[r * W + c]!);
    lines.push(`|${row}|`);
  }
  const bottom = "[SHA256]";
  const leftBot = Math.floor((W - bottom.length) / 2);
  lines.push(`+${dashes(leftBot)}${bottom}${dashes(W - leftBot - bottom.length)}+`);
  return lines;
}

// ---------------------------------------------------------------------------
// ssh-keygen (fixture: m02-ssh-keygen; interactive prompts cited from the
// OpenSSH 9.6 binary the capture box runs — not capturable without a pty)
// ---------------------------------------------------------------------------

export function sshKeygenImpl(args: string[], io: IOCtx, m: Machine): number {
  let type: string | null = null;
  let file: string | null = null;
  let passphrase: string | null = null;
  let comment: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-t") type = args[++i] ?? null;
    else if (a === "-f") file = args[++i] ?? null;
    else if (a === "-N") passphrase = args[++i] ?? "";
    else if (a === "-C") comment = args[++i] ?? "";
    else if (a === "-q") continue;
    else return boundary("ssh-keygen", `option ${a}`, io);
  }
  if (type !== null && type !== "ed25519") return boundary("ssh-keygen", `key type '${type}'`, io);

  const defaultPath = `${m.home}/.ssh/id_ed25519`;
  // resume-idempotent: the banner was already emitted before the dialogue suspended
  if (!m.dialogueResume) io.out.write("Generating public/private ed25519 key pair.\n");

  if ((file === null || passphrase === null) && canDialogue(m, io)) {
    // interactive 3-prompt dialogue (file → passphrase → retype); wording per OpenSSH 9.6
    io.err.write(`Enter file in which to save the key (${defaultPath}): `);
    throw new PendingStdinSignal(false, 3, ["", "Enter passphrase (empty for no passphrase): ", "Enter same passphrase again: "]);
  }
  if (file === null || passphrase === null) {
    const lines = (io.stdin ?? "").split("\n");
    if (!m.dialogueResume) {
      io.err.write(`Enter file in which to save the key (${defaultPath}): Enter passphrase (empty for no passphrase): Enter same passphrase again: `);
    }
    if (file === null) file = (lines[0] ?? "").trim() === "" ? defaultPath : lines[0]!.trim();
    // passphrases accepted but not modeled (the generated material is non-cryptographic)
  }

  const abs = m.resolve(file);
  const dir = abs.slice(0, abs.lastIndexOf("/")) || "/";
  if (!m.vfs.isDir(dir)) return boundary("ssh-keygen", "missing target directory error path", io);
  if (m.vfs.exists(abs)) return boundary("ssh-keygen", "the overwrite prompt", io);

  const c = comment ?? `${m.user}@${m.host}`;
  const key = generateKey(m, c);
  m.vfs.writeFile(abs, key.privFile, { owner: m.user, now: m.now(), mode: 0o600 });
  m.vfs.writeFile(`${abs}.pub`, key.pubLine + "\n", { owner: m.user, now: m.now(), mode: 0o644 });
  m.recordWrite(abs);
  m.recordWrite(`${abs}.pub`);

  io.out.write(`Your identification has been saved in ${abs}\n`);
  io.out.write(`Your public key has been saved in ${abs}.pub\n`);
  io.out.write("The key fingerprint is:\n");
  io.out.write(`${key.fingerprint} ${c}\n`);
  io.out.write("The key's randomart image is:\n");
  io.out.write(drunkenBishop(key.digest, "ED25519 256").join("\n") + "\n");
  return 0;
}
