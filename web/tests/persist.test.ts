/**
 * Size-guarded persistence tests (web ISA ISC-124): oversized values are refused before
 * touching storage, quota throws degrade to a typed outcome (never an exception), and
 * existing progress is never corrupted by a failed write.
 */
import { describe, expect, test } from "bun:test";
import { byteSize, DEFAULT_MAX_BYTES, loadPersisted, persist, removePersisted, type StorageLike } from "../src/lib/persist";

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function quotaStorage(): StorageLike & { map: Map<string, string> } {
  const s = memoryStorage();
  return {
    ...s,
    setItem: () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    },
  };
}

describe("byteSize", () => {
  test("meters UTF-8 bytes, not UTF-16 code units", () => {
    expect(byteSize("abc")).toBe(3);
    expect(byteSize("é")).toBe(2); // string length 1, 2 bytes
    expect(byteSize("→")).toBe(3);
  });
});

describe("persist — size guard", () => {
  test("round-trips a normal value", () => {
    const storage = memoryStorage();
    const out = persist("k", "hello", { storage });
    expect(out).toEqual({ ok: true, bytes: 5 });
    expect(loadPersisted("k", storage)).toBe("hello");
  });

  test("refuses values over the budget BEFORE touching storage", () => {
    const storage = memoryStorage();
    storage.map.set("k", "previous-progress");
    const out = persist("k", "x".repeat(100), { storage, maxBytes: 50 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("too-large");
    // the failed write never corrupted the existing value
    expect(loadPersisted("k", storage)).toBe("previous-progress");
  });

  test("exactly-at-budget passes; one byte over fails", () => {
    const storage = memoryStorage();
    expect(persist("k", "x".repeat(50), { storage, maxBytes: 50 }).ok).toBe(true);
    expect(persist("k", "x".repeat(51), { storage, maxBytes: 50 }).ok).toBe(false);
  });

  test("default budget is ~1MB", () => {
    expect(DEFAULT_MAX_BYTES).toBe(1_000_000);
    const storage = memoryStorage();
    const out = persist("k", "x".repeat(DEFAULT_MAX_BYTES + 1), { storage });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("too-large");
  });
});

describe("persist — quota and availability degradation", () => {
  test("a thrown QuotaExceededError becomes a typed outcome, not an exception", () => {
    const storage = quotaStorage();
    const out = persist("k", "small value", { storage });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("quota");
  });

  test("missing storage reports unavailable", () => {
    const out = persist("k", "v", { storage: null });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("unavailable");
  });

  test("loadPersisted and removePersisted never throw on a null storage", () => {
    expect(loadPersisted("k", null)).toBe(null);
    expect(() => removePersisted("k", null)).not.toThrow();
  });

  test("remove deletes the key", () => {
    const storage = memoryStorage();
    persist("k", "v", { storage });
    removePersisted("k", storage);
    expect(loadPersisted("k", storage)).toBe(null);
  });
});
