/**
 * Engine payload budgets + same-origin honesty (web ISA ISC-73/128/134).
 *
 *  - Every declared engine asset exists under public/engines/ (staged by
 *    scripts/fetch-engines.ts) and the actual on-disk total stays within budget.
 *  - provenance.json records pinned versions + sizes (ISC-128).
 *  - ZERO third-party runtime URLs anywhere in the engine adapters, loaders, worker glue,
 *    budget table, or the fetch script (grep-grade check, includes comments on purpose).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { ENGINE_BUDGETS } from "../src/engines/budgets";

const WEB = join(dirname(new URL(import.meta.url).pathname), "..");
const ENGINES_PUB = join(WEB, "public", "engines");

describe("payload budgets vs actual public/engines sizes (ISC-134)", () => {
  for (const [engine, budget] of Object.entries(ENGINE_BUDGETS)) {
    test(`${engine}: assets exist and fit ${budget.budgetBytes} B`, () => {
      let total = 0;
      for (const asset of budget.assets) {
        const path = join(ENGINES_PUB, asset);
        expect(existsSync(path)).toBe(true);
        const size = statSync(path).size;
        expect(size).toBeGreaterThan(0);
        total += size;
      }
      expect(total).toBeLessThanOrEqual(budget.budgetBytes);
      if (budget.assets.length === 0) {
        // bundle-only engines must say so explicitly — no silent unaccounted payloads
        expect(budget.bundledNote).toBeDefined();
      }
      expect(budget.version.length).toBeGreaterThan(0); // pin recorded (ISC-128)
    });
  }

  test("provenance.json records every engine's pin + measured sizes", () => {
    const prov = JSON.parse(readFileSync(join(ENGINES_PUB, "provenance.json"), "utf8"));
    for (const [engine, budget] of Object.entries(ENGINE_BUDGETS)) {
      expect(prov.engines[engine].version).toBe(budget.version);
      for (const asset of budget.assets) {
        expect(prov.engines[engine].assets[asset]).toBe(statSync(join(ENGINES_PUB, asset)).size);
      }
    }
  });

  test("every staged asset is claimed by some engine budget (no orphan payloads)", () => {
    const claimed = new Set(Object.values(ENGINE_BUDGETS).flatMap((b) => b.assets));
    const walk = (dir: string, rel = ""): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        return statSync(full).isDirectory() ? walk(full, r) : [r];
      });
    const staged = walk(ENGINES_PUB).filter((f) => f !== "provenance.json");
    for (const f of staged) expect(claimed.has(f)).toBe(true);
  });
});

describe("same-origin honesty (ISC-73 / ISC-99)", () => {
  const OWNED = [
    "src/engines/adapters.ts",
    "src/engines/budgets.ts",
    "scripts/fetch-engines.ts",
    ...["sql", "policy", "git", "jq", "python"].flatMap((d) =>
      readdirSync(join(WEB, "src/engines", d)).map((f) => `src/engines/${d}/${f}`),
    ),
  ];

  test("zero third-party URLs in engine code (comments included)", () => {
    for (const file of OWNED) {
      const text = readFileSync(join(WEB, file), "utf8");
      expect({ file, hit: /https?:\/\//.test(text) }).toEqual({ file, hit: false });
    }
  });

  test("all hardcoded asset URLs are app-local /engines/ paths", () => {
    for (const file of OWNED) {
      const text = readFileSync(join(WEB, file), "utf8");
      for (const m of text.matchAll(/"(\/[^"]*)"/g)) {
        if (m[1].startsWith("/engines/")) continue;
        if (m[1] === "/" || m[1] === "/lab") continue; // pyodide FS paths, path math
        // anything else absolute-URL-shaped must be a filesystem path, not a fetch target
        expect(m[1].startsWith("/home/") || m[1].startsWith("/lab/")).toBe(true);
      }
    }
  });
});
