/**
 * Browser-side Python engine handle — talks to the Pyodide Web Worker (worker.ts).
 *
 * COVERAGE EXCLUSION (web ISA ISC-105 carve-out): browser loader glue — `Worker` and
 * `import.meta.url` worker resolution don't exist under `bun test`. The adapter core
 * (index.ts) is fully covered; this file is verified live in the Interceptor browser phase.
 *
 * Implements the same EngineAdapter contract so the Lab Player can't tell worker-backed
 * from direct execution.
 */
import type { EngineAdapter, EngineRunResult } from "../adapters";
import type { PyWorkerRequest, PyWorkerResponse } from "./worker";

export class PythonWorkerAdapter implements EngineAdapter {
  readonly id = "python";
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: EngineRunResult) => void>();

  async load(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<PyWorkerResponse>) => {
      const { id, ...result } = ev.data;
      this.pending.get(id)?.(result);
      this.pending.delete(id);
    };
  }

  async run(input: string, files?: Record<string, string>): Promise<EngineRunResult> {
    await this.load();
    const id = this.nextId++;
    return new Promise<EngineRunResult>((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ id, input, files } satisfies PyWorkerRequest);
    });
  }

  /** One-heavy-engine-at-a-time teardown (web ISA ISC-135). */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
