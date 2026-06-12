/**
 * Learner state: progress, exercise completion, hint reveals, evidence-pack hash chain,
 * cross-module artifacts, profile (web ISA ISC-92/93/119/125/129/131/138).
 *
 * ALL state is browser-local (localStorage for small state, IndexedDB for VFS snapshots —
 * see persist.ts). Nothing here ever performs a network call (ISC-99/142).
 *
 * The evidence pack is a hash-chained, append-only record of exercise completions —
 * honestly described: it is TAMPER-EVIDENT (any edit breaks the chain), not tamper-PROOF
 * (the learner owns the browser; this is their evidence about their own learning).
 */

export interface TaskRecord {
  taskId: string;
  completedAt: string;        // sim-agnostic wall ISO (display only)
  revealsUsed: number;        // hint rungs of kind `reveal` consumed (ISC-125)
  evidence: string;           // what the checker accepted (ISC-119)
}

export interface ExerciseCompletion {
  exerciseId: string;
  module: string;
  completedAt: string;
  clean: boolean;             // no reveals used on any action task
  tasks: TaskRecord[];
}

export interface EvidenceEntry {
  seq: number;
  ts: string;
  kind: "exercise-completed" | "artifact-saved" | "sync-export" | "sync-import";
  subject: string;            // exerciseId / artifact path / transport
  payloadHash: string;        // SHA-256 hex of the canonical payload JSON
  prevHash: string;           // hex of previous entry's hash ("GENESIS" for seq 0)
  hash: string;               // SHA-256 hex over canonical entry content
}

export interface LearnerProfile { displayName?: string }

export interface LearnerState {
  version: 2;
  profile: LearnerProfile;
  /** module id → reading progress (wave-1 store remains authoritative; mirrored on export). */
  moduleProgress: Record<string, string>;
  completions: Record<string, ExerciseCompletion>;
  reveals: Record<string, string[]>;      // exerciseId → taskIds with reveals
  artifacts: Record<string, { content: string; savedAt: string; module: string }>;
  evidenceChain: EvidenceEntry[];
  updatedAt: string;
}

export const STORAGE_KEY = "grcb.learner.v2";

export function emptyState(): LearnerState {
  return {
    version: 2, profile: {}, moduleProgress: {}, completions: {}, reveals: {},
    artifacts: {}, evidenceChain: [], updatedAt: new Date(0).toISOString(),
  };
}

export function loadState(storage: Pick<Storage, "getItem"> = globalThis.localStorage): LearnerState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as LearnerState;
    return parsed.version === 2 ? parsed : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: LearnerState, storage: Pick<Storage, "setItem"> = globalThis.localStorage): void {
  state.updatedAt = new Date().toISOString();
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- evidence chain ----

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function appendEvidence(
  state: LearnerState,
  kind: EvidenceEntry["kind"],
  subject: string,
  payload: unknown,
): Promise<EvidenceEntry> {
  const chain = state.evidenceChain;
  const prevHash = chain.length ? chain[chain.length - 1].hash : "GENESIS";
  const seq = chain.length;
  const ts = new Date().toISOString();
  const payloadHash = await sha256Hex(JSON.stringify(payload));
  const hash = await sha256Hex([seq, ts, kind, subject, payloadHash, prevHash].join("|"));
  const entry: EvidenceEntry = { seq, ts, kind, subject, payloadHash, prevHash, hash };
  chain.push(entry);
  return entry;
}

/** Walk the chain; returns the first broken seq or null if intact. */
export async function verifyChain(chain: EvidenceEntry[]): Promise<number | null> {
  let prev = "GENESIS";
  for (const e of chain) {
    const expect = await sha256Hex([e.seq, e.ts, e.kind, e.subject, e.payloadHash, e.prevHash].join("|"));
    if (e.prevHash !== prev || e.hash !== expect) return e.seq;
    prev = e.hash;
  }
  return null;
}

// ---- merge (sync import; web ISA ISC-145) ----

export interface MergeSummary {
  completionsTaken: { local: number; imported: number };
  artifactsTaken: { local: number; imported: number };
  chainExtended: boolean;
}

/** Per-item newest-wins; never destructive (caller backs up local first). */
export function mergeStates(local: LearnerState, imported: LearnerState): { merged: LearnerState; summary: MergeSummary } {
  const merged = structuredClone(local);
  const summary: MergeSummary = {
    completionsTaken: { local: 0, imported: 0 },
    artifactsTaken: { local: 0, imported: 0 },
    chainExtended: false,
  };
  for (const [id, imp] of Object.entries(imported.completions)) {
    const loc = merged.completions[id];
    if (!loc || imp.completedAt > loc.completedAt) { merged.completions[id] = imp; summary.completionsTaken.imported++; }
    else summary.completionsTaken.local++;
  }
  for (const [path, imp] of Object.entries(imported.artifacts)) {
    const loc = merged.artifacts[path];
    if (!loc || imp.savedAt > loc.savedAt) { merged.artifacts[path] = imp; summary.artifactsTaken.imported++; }
    else summary.artifactsTaken.local++;
  }
  for (const [m, p] of Object.entries(imported.moduleProgress)) {
    if (!merged.moduleProgress[m]) merged.moduleProgress[m] = p;
  }
  merged.profile = { ...imported.profile, ...merged.profile };
  for (const [ex, ids] of Object.entries(imported.reveals)) {
    merged.reveals[ex] = [...new Set([...(merged.reveals[ex] ?? []), ...ids])];
  }
  // The longer intact chain wins; the other's tail is preserved implicitly via its completions.
  if (imported.evidenceChain.length > merged.evidenceChain.length) {
    merged.evidenceChain = imported.evidenceChain;
    summary.chainExtended = true;
  }
  return { merged, summary };
}
