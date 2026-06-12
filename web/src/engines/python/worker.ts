/**
 * Pyodide Web-Worker bootstrap (web ISA ISC-67: heavy engines run off the main thread).
 *
 * COVERAGE EXCLUSION (web ISA ISC-105 carve-out): worker loader glue — Worker globals and
 * the self-hosted dist import don't exist under `bun test`. The adapter core it wraps
 * (index.ts) is fully covered with the real interpreter; this file is verified live in the
 * Interceptor browser phase.
 *
 * Loads the SELF-HOSTED Pyodide dist (/engines/pyodide/ — same-origin, ISC-73) and serves
 * PythonEngineAdapter.run() requests over a tiny message protocol.
 */
import { PythonEngineAdapter, PYODIDE_INDEX_URL, type PyodideLike } from "./index";

export interface PyWorkerRequest {
  id: number;
  input: string;
  files?: Record<string, string>;
}
export interface PyWorkerResponse {
  id: number;
  stdout: string;
  stderr: string;
  exit: number;
  artifacts?: Record<string, unknown>;
}

const adapter = new PythonEngineAdapter(async () => {
  // dynamic import of the self-hosted dist; @vite-ignore keeps it a runtime same-origin URL
  const mod = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`);
  return (await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL })) as PyodideLike;
});

self.onmessage = async (ev: MessageEvent<PyWorkerRequest>) => {
  const { id, input, files } = ev.data;
  try {
    const result = await adapter.run(input, files);
    self.postMessage({ id, ...result } satisfies PyWorkerResponse);
  } catch (e) {
    self.postMessage({ id, stdout: "", stderr: String(e), exit: 70 } satisfies PyWorkerResponse);
  }
};
