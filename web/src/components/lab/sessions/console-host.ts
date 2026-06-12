/**
 * Console host (web ISA ISC-67..72, ISC-135 — Lab Player side).
 *
 * The shared state model behind the editor/console surface for the real-WASM engines
 * (python, sql, policy, jq): an editable main buffer + read-only exercise assets, a
 * run history, and the last real engine result. The engine itself is injected (the
 * browser island lazy-loads the adapter; bun tests inject node-side adapters) — this
 * host never fabricates output.
 *
 * It also exposes a ProbeSession so the closed verifier registry drives console
 * exercises with the SAME primitives as terminals: `history_contains` sees run inputs,
 * `last_exit_code` sees the engine's exit, `file_*` see the editable files, and the
 * new `engine_result_equals` / `policy_decision_is` read the last result via ctx.
 *
 * DOM-free; unit-tested under `bun test`.
 */
import type { EngineAdapter, EngineRunResult } from "../../../engines/adapters";
import type { ProbeSession, EngineResultProbe } from "../../../verifiers/registry";

export interface ConsoleHostOptions {
  /** Seeded files (name → content), already flattened (sessions/types seedToFileMap). */
  files: Record<string, string>;
  /** The editable buffer's file name (default: first seeded file). */
  mainFile?: string;
  /** Files passed to every run (assets). Default: every seeded file except the main one. */
  assets?: string[];
}

export interface ConsoleSnapshot {
  v: 1;
  files: Record<string, string>;
  runs: string[];
}

export class ConsoleHost {
  readonly mainFile: string;
  private files: Record<string, string>;
  private readonly seedFiles: Record<string, string>;
  private readonly assets: string[];
  private runs: string[] = [];
  private last: EngineRunResult | null = null;

  constructor(opts: ConsoleHostOptions) {
    this.seedFiles = { ...opts.files };
    this.files = { ...opts.files };
    const names = Object.keys(opts.files);
    this.mainFile = opts.mainFile ?? names[0] ?? "main";
    if (this.files[this.mainFile] === undefined) this.files[this.mainFile] = "";
    this.assets = opts.assets ?? names.filter((n) => n !== this.mainFile);
  }

  read(name: string): string | null {
    return this.files[name] ?? null;
  }

  write(name: string, content: string): void {
    this.files[name] = content;
  }

  fileNames(): string[] {
    return Object.keys(this.files).sort();
  }

  /** Restore every file to its seed content (ISC-117 semantics; runs/result kept). */
  restoreSeedFiles(): void {
    this.files = { ...this.seedFiles, ...(this.seedFiles[this.mainFile] === undefined ? { [this.mainFile]: "" } : {}) };
  }

  /** The files handed to the engine on each run (assets + the current main buffer). */
  runFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of this.assets) if (this.files[a] !== undefined) out[a] = this.files[a]!;
    out[this.mainFile] = this.files[this.mainFile] ?? "";
    return out;
  }

  /**
   * Run the injected REAL engine against the current buffer. `input` defaults to the
   * main buffer's content (python/sql/policy source); terminals-in-a-box like jq pass
   * the typed invocation instead.
   */
  async run(engine: EngineAdapter, input?: string): Promise<EngineRunResult> {
    const source = input ?? this.files[this.mainFile] ?? "";
    this.runs.push(source);
    const result = await engine.run(source, this.runFiles());
    this.last = result;
    return result;
  }

  lastResult(): EngineResultProbe | null {
    return this.last;
  }

  runHistory(): string[] {
    return [...this.runs];
  }

  snapshot(): ConsoleSnapshot {
    return { v: 1, files: { ...this.files }, runs: [...this.runs] };
  }

  restore(snap: ConsoleSnapshot): void {
    this.files = { ...snap.files };
    this.runs = [...snap.runs];
    this.last = null; // results are real engine output only — never resurrected from storage
  }

  /** The registry-facing probe surface (one verifier path for every engine class). */
  probeSession(): ProbeSession {
    return {
      prompt: () => `${this.mainFile} `,
      history: () => this.runHistory(),
      lastExit: () => this.last?.exit ?? -1,
      exists: (p) => this.files[normalize(p)] !== undefined,
      readFile: (p) => this.files[normalize(p)] ?? null,
      listDir: () => this.fileNames(),
      producedBy: () => null, // console files are edited, not command-produced
      runScriptClean: () => ({ stdout: "", stderr: "console surfaces verify via engine_result_equals", exit: 64 }),
    };
  }
}

function normalize(p: string): string {
  return p.replace(/^~\//, "").replace(/^\//, "");
}
