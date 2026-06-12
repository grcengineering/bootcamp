/**
 * Per-engine payload budgets (web ISA ISC-134; RedTeam finding 12).
 *
 * Each heavy engine declares the same-origin assets it ships under public/engines/
 * (placed by scripts/fetch-engines.ts) and a byte ceiling. tests/engines-budgets.test.ts
 * asserts every asset exists and the actual on-disk total stays under budget — bumping a
 * budget is a reviewed diff, not a silent regression.
 *
 * Sizes are RAW bytes on disk (what the static host stores); GitHub Pages serves
 * compressed, so wire cost is lower — budgets gate the worst case.
 *
 * Engines with `assets: []` ship only as bundled lazy JS chunks (no public/ payload);
 * `bundledNote` records the expectation for the build-size review (ISC-106).
 */

export interface EngineBudget {
  /** Paths relative to web/public/engines/. */
  assets: string[];
  /** Ceiling for the summed raw size of `assets` (bytes). */
  budgetBytes: number;
  /** Pinned upstream version the assets come from (ISC-128 provenance). */
  version: string;
  bundledNote?: string;
}

export const ENGINE_BUDGETS: Record<string, EngineBudget> = {
  // sql.js 1.14.1 — real SQLite wasm (actual 659,730 B)
  sql: { assets: ["sql-wasm.wasm"], budgetBytes: 700_000, version: "sql.js@1.14.1" },

  // @cedar-policy/cedar-wasm 4.11.1 web build (actual 4,262,925 B) — the live
  // policy-authoring flagship carries the full Cedar parser+authorizer (ISC-71 decision)
  cedar: { assets: ["cedar/cedar_wasm_bg.wasm"], budgetBytes: 4_500_000, version: "@cedar-policy/cedar-wasm@4.11.1" },

  // precompiled module-09 reference policy (actual 133,975 B); the opa-wasm JS runtime
  // (~92 KB) rides the lazy bundle chunk
  opa: {
    assets: ["opa/policy.wasm"],
    budgetBytes: 200_000,
    version: "opa@1.17.1 (compiler) / @open-policy-agent/opa-wasm@1.10.0 (runtime)",
    bundledNote: "opa-wasm runtime JS ships in the lazy policy chunk",
  },

  // jq-wasm 1.1.0-jq-1.8.1 — real jq, wasm base64-embedded in one JS artifact
  // (actual 1,357,799 B; same artifact rides the lazy bundle chunk that executes it)
  jq: { assets: ["jq/jq.js"], budgetBytes: 1_500_000, version: "jq-wasm@1.1.0-jq-1.8.1 (jq 1.8.1)" },

  // Pyodide 314.0.0 core (CPython 3.14): actual total 13,545,395 B — by far the heaviest
  // engine; loaded ONLY in a worker after explicit exercise interaction with a visible
  // prefetch bar (ISC-135), desktop recommendation declared in-UI (ISC-96)
  python: {
    assets: [
      "pyodide/pyodide.mjs",
      "pyodide/pyodide.asm.mjs",
      "pyodide/pyodide.asm.wasm",
      "pyodide/python_stdlib.zip",
      "pyodide/pyodide-lock.json",
    ],
    budgetBytes: 14_000_000,
    version: "pyodide@314.0.0",
  },

  // isomorphic-git 1.38.4 — pure JS, rides the lazy git chunk; no public/ asset
  git: {
    assets: [],
    budgetBytes: 0,
    version: "isomorphic-git@1.38.4",
    bundledNote: "isomorphic-git + porcelain renderer ship in the lazy git chunk (~hundreds of KB, gated by ISC-106 build-size diff)",
  },
};
