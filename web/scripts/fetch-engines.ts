#!/usr/bin/env bun
/**
 * fetch-engines.ts — stage self-hosted engine assets into public/engines/ (web ISA ISC-73).
 *
 * Runs as part of `bun run sync` (before astro dev/build). Copies WASM/dist artifacts from
 * node_modules (pinned versions — see src/engines/budgets.ts) and the precompiled OPA
 * policy from the curriculum repo into public/engines/, so EVERY engine asset is served
 * same-origin: zero CDN, zero runtime third-party fetches.
 *
 * Also writes public/engines/provenance.json (ISC-128): pinned versions + byte sizes per
 * asset, so the deployed site carries its own engine provenance record.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ENGINE_BUDGETS } from "../src/engines/budgets";

const WEB = join(import.meta.dir, "..");
const REPO = join(WEB, "..");
const OUT = join(WEB, "public", "engines");

/** destination (relative to public/engines/) → source (absolute). */
const COPIES: Record<string, string> = {
  "sql-wasm.wasm": join(WEB, "node_modules/sql.js/dist/sql-wasm.wasm"),
  "cedar/cedar_wasm_bg.wasm": join(WEB, "node_modules/@cedar-policy/cedar-wasm/web/cedar_wasm_bg.wasm"),
  "opa/policy.wasm": join(REPO, "modules/09-policy-as-code/exercises/assets/policy.wasm"),
  "jq/jq.js": join(WEB, "node_modules/jq-wasm/dist/build/jq.js"),
  "pyodide/pyodide.mjs": join(WEB, "node_modules/pyodide/pyodide.mjs"),
  "pyodide/pyodide.asm.mjs": join(WEB, "node_modules/pyodide/pyodide.asm.mjs"),
  "pyodide/pyodide.asm.wasm": join(WEB, "node_modules/pyodide/pyodide.asm.wasm"),
  "pyodide/python_stdlib.zip": join(WEB, "node_modules/pyodide/python_stdlib.zip"),
  "pyodide/pyodide-lock.json": join(WEB, "node_modules/pyodide/pyodide-lock.json"),
};

let copied = 0;
const sizes: Record<string, number> = {};
for (const [dest, src] of Object.entries(COPIES)) {
  if (!existsSync(src)) {
    console.error(`fetch-engines: MISSING source ${src} (run bun install / opa build)`);
    process.exit(1);
  }
  const target = join(OUT, dest);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(src, target);
  sizes[dest] = statSync(target).size;
  copied++;
}

// budget gate at sync time too (the bun test asserts the same — fail fast here)
for (const [engine, budget] of Object.entries(ENGINE_BUDGETS)) {
  const total = budget.assets.reduce((a, f) => a + (sizes[f] ?? 0), 0);
  if (total > budget.budgetBytes) {
    console.error(`fetch-engines: ${engine} assets ${total} B exceed budget ${budget.budgetBytes} B (ISC-134)`);
    process.exit(1);
  }
}

const provenance = {
  generated_by: "scripts/fetch-engines.ts",
  same_origin_contract: "all engine assets served from /engines/ — no CDN, no runtime third-party fetch (web ISA ISC-73)",
  engines: Object.fromEntries(
    Object.entries(ENGINE_BUDGETS).map(([id, b]) => [
      id,
      {
        version: b.version,
        budget_bytes: b.budgetBytes,
        assets: Object.fromEntries(b.assets.map((f) => [f, sizes[f]])),
        ...(b.bundledNote ? { bundled_note: b.bundledNote } : {}),
      },
    ]),
  ),
  opa_policy_provenance: "modules/09-policy-as-code/exercises/assets/policy.wasm.provenance.json",
};
writeFileSync(join(OUT, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

console.log(`fetch-engines: staged ${copied} assets into public/engines/ (+provenance.json)`);
