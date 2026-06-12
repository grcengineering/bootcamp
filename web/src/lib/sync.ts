/**
 * Encrypted cross-device sync (web ISA ISC-140..146; owner directive 2026-06-12).
 *
 * No backend exists (GitHub Pages), so sync is learner-carried ciphertext:
 *   state → JSON → AES-256-GCM (WebCrypto), key from passphrase via PBKDF2-SHA-256
 *   (600,000 iterations — OWASP 2023+ guidance), fresh random salt(16B) + IV(12B) per export.
 *
 * Envelope is versioned and self-describing; GCM rejects any ciphertext tamper.
 * The passphrase is never persisted (ISC-142); plaintext never leaves the browser.
 * Transports move the SAME armored envelope: file download/upload, copy-paste blob,
 * or the learner's own private GitHub Gist (their PAT, stored locally, never in the payload).
 */
import { type LearnerState, mergeStates, type MergeSummary } from "./labstate";

export const PBKDF2_ITERATIONS = 600_000;
const ARMOR_PREFIX = "GRCB-SYNC-v1.";

export interface SyncEnvelope {
  v: 1;
  kdf: { algo: "PBKDF2-SHA-256"; iterations: number; salt: string }; // salt base64
  iv: string;          // base64, 12 bytes
  ct: string;          // base64 ciphertext (AES-256-GCM, includes auth tag)
  created: string;     // ISO
}

const te = new TextEncoder();
const td = new TextDecoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function exportEncrypted(state: LearnerState, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error("passphrase must be at least 8 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = te.encode(JSON.stringify(state));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext);
  const envelope: SyncEnvelope = {
    v: 1,
    kdf: { algo: "PBKDF2-SHA-256", iterations: PBKDF2_ITERATIONS, salt: b64(salt) },
    iv: b64(iv),
    ct: b64(ct),
    created: new Date().toISOString(),
  };
  return ARMOR_PREFIX + btoa(JSON.stringify(envelope));
}

export class SyncDecryptError extends Error {}

export async function importEncrypted(armored: string, passphrase: string): Promise<LearnerState> {
  const trimmed = armored.trim();
  if (!trimmed.startsWith(ARMOR_PREFIX)) throw new SyncDecryptError("this isn't a GRC Bootcamp sync blob (bad header)");
  let envelope: SyncEnvelope;
  try {
    envelope = JSON.parse(atob(trimmed.slice(ARMOR_PREFIX.length)));
  } catch {
    throw new SyncDecryptError("the sync blob is corrupted (couldn't read the envelope)");
  }
  if (envelope.v !== 1 || envelope.kdf?.algo !== "PBKDF2-SHA-256")
    throw new SyncDecryptError(`unsupported sync envelope version`);
  const key = await deriveKey(passphrase, unb64(envelope.kdf.salt), envelope.kdf.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(envelope.iv) as BufferSource }, key, unb64(envelope.ct) as BufferSource,
    );
  } catch {
    throw new SyncDecryptError("wrong passphrase — or the blob was modified (integrity check failed)");
  }
  const state = JSON.parse(td.decode(plaintext)) as LearnerState;
  if (state.version !== 2) throw new SyncDecryptError("sync payload has an unknown state version");
  return state;
}

/** Import + merge with pre-import backup (ISC-145). Returns the backup for undo. */
export async function importAndMerge(
  local: LearnerState,
  armored: string,
  passphrase: string,
): Promise<{ merged: LearnerState; summary: MergeSummary; backup: LearnerState }> {
  const imported = await importEncrypted(armored, passphrase);
  const backup = structuredClone(local);
  const { merged, summary } = mergeStates(local, imported);
  return { merged, summary, backup };
}

// ---- optional transport B: the learner's own private GitHub Gist (ISC-144) ----

export interface GistTransportConfig { token: string; gistId?: string }
const GIST_FILE = "grc-bootcamp-sync.txt";

export async function pushToGist(cfg: GistTransportConfig, armored: string): Promise<{ gistId: string }> {
  const body = JSON.stringify({
    description: "GRC Engineering Bootcamp encrypted progress (AES-256-GCM — useless without your passphrase)",
    public: false,
    files: { [GIST_FILE]: { content: armored } },
  });
  const res = await fetch(cfg.gistId ? `https://api.github.com/gists/${cfg.gistId}` : "https://api.github.com/gists", {
    method: cfg.gistId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" },
    body,
  });
  if (!res.ok) throw new Error(`gist push failed: HTTP ${res.status}`);
  const json = (await res.json()) as { id: string };
  return { gistId: json.id };
}

export async function pullFromGist(cfg: GistTransportConfig): Promise<string> {
  if (!cfg.gistId) throw new Error("no gist configured yet — push once first");
  const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`gist pull failed: HTTP ${res.status}`);
  const json = (await res.json()) as { files: Record<string, { content: string }> };
  const file = json.files[GIST_FILE];
  if (!file) throw new Error("the configured gist has no sync file");
  return file.content;
}
