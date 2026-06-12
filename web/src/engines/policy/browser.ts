/**
 * Browser-only loader glue for the policy engines (web ISA ISC-73: same-origin assets).
 *
 * COVERAGE EXCLUSION (web ISA ISC-105 carve-out): this file is browser loader glue —
 * it touches `fetch` against app-local URLs and the cedar `/web` wasm-bindgen init,
 * neither of which exists under `bun test`. The adapter cores it feeds (cedar.ts, opa.ts)
 * are fully covered; this file is verified live in the Interceptor browser phase.
 */
import init from "@cedar-policy/cedar-wasm/web";
import * as cedarWeb from "@cedar-policy/cedar-wasm/web";
import type { CedarApi } from "./cedar";
import { OPA_POLICY_DEFAULT_URL } from "./opa";

export const CEDAR_WASM_URL = "/engines/cedar/cedar_wasm_bg.wasm";

/** Initializes the cedar web build against the self-hosted wasm asset. */
export async function browserCedarLoader(url: string = CEDAR_WASM_URL): Promise<CedarApi> {
  await init({ module_or_path: url });
  return cedarWeb as unknown as CedarApi;
}

/** Fetches the precompiled OPA policy bundle from the same-origin asset path. */
export async function browserOpaPolicyBytes(url: string = OPA_POLICY_DEFAULT_URL): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return res.arrayBuffer();
}
