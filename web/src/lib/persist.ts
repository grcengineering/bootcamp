/**
 * localStorage persistence with a size budget (web ISA ISC-124).
 *
 * Snapshots (VFS + transcript) can get big; localStorage quotas are real (~5MB) and a
 * thrown QuotaExceededError mid-save must never corrupt progress. So every write goes
 * through `persist()`: values over the budget are refused BEFORE touching storage, quota
 * throws are caught, and the caller gets a typed outcome to warn the learner with —
 * progress degrades to in-memory, it never silently disappears.
 *
 * Pure module: no DOM imports; storage is injectable for `bun test`.
 */

export const DEFAULT_MAX_BYTES = 1_000_000; // ~1MB per key — well under per-origin quota

export type PersistFailure = "too-large" | "quota" | "unavailable";
export type PersistOutcome = { ok: true; bytes: number } | { ok: false; reason: PersistFailure; bytes: number };

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** UTF-8 byte size — what storage quotas actually meter (string length undercounts). */
export function byteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function persist(
  key: string,
  value: string,
  opts: { maxBytes?: number; storage?: StorageLike | null } = {},
): PersistOutcome {
  const bytes = byteSize(value);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const storage = opts.storage !== undefined ? opts.storage : defaultStorage();
  if (!storage) return { ok: false, reason: "unavailable", bytes };
  if (bytes > maxBytes) return { ok: false, reason: "too-large", bytes };
  try {
    storage.setItem(key, value);
    return { ok: true, bytes };
  } catch {
    return { ok: false, reason: "quota", bytes };
  }
}

export function loadPersisted(key: string, storage: StorageLike | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function removePersisted(key: string, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* removal failing is harmless */
  }
}
