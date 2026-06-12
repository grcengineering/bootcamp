/**
 * SQL engine adapter — sql.js (real SQLite compiled to WASM) (web ISA ISC-69).
 *
 * Engine class: real-engine-wasm. Result rows come straight from SQLite; the only
 * adapter-owned text is the list-mode rendering (header + `|`-separated rows — the same
 * shape `sqlite3` prints with `.headers on` / `.mode list`), declared here as rendering,
 * not simulation.
 *
 * WASM sourcing (ISC-73, same-origin): the caller injects either raw bytes (bun tests read
 * node_modules/sql.js/dist/sql-wasm.wasm) or an app-local URL (`/engines/sql-wasm.wasm`,
 * copied by scripts/fetch-engines.ts). No CDN path exists.
 */
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic, QueryExecResult } from "sql.js";
import { type EngineAdapter, type EngineRunResult, errorMessage } from "../adapters";

export interface SqlAdapterOptions {
  /** Raw wasm bytes (test path) — wins over `wasmUrl` when both are provided. */
  wasmBinary?: ArrayBuffer;
  /** Same-origin URL the emscripten loader fetches (browser path). */
  wasmUrl?: string;
  /** Schema + seed rows executed once at load() (e.g. the module-07 evidence table). */
  seedSql?: string;
}

export const SQL_WASM_DEFAULT_URL = "/engines/sql-wasm.wasm";

/** sqlite3 list-mode rendering of a real result set (declared rendering, not simulation). */
export function renderResults(results: QueryExecResult[]): string {
  const parts: string[] = [];
  for (const r of results) {
    const lines = [r.columns.join("|")];
    for (const row of r.values) lines.push(row.map(renderCell).join("|"));
    parts.push(lines.join("\n"));
  }
  return parts.length ? parts.join("\n\n") + "\n" : "";
}

function renderCell(v: unknown): string {
  if (v === null) return "";
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  return String(v);
}

/** emscripten locateFile hook → the same-origin wasm URL (default /engines/sql-wasm.wasm). */
export function wasmLocator(opts: SqlAdapterOptions): () => string {
  return () => opts.wasmUrl ?? SQL_WASM_DEFAULT_URL;
}

export class SqlEngineAdapter implements EngineAdapter {
  readonly id = "sql";
  private opts: SqlAdapterOptions;
  private sql: SqlJsStatic | null = null;
  private db: Database | null = null;

  constructor(opts: SqlAdapterOptions = {}) {
    this.opts = opts;
  }

  async load(): Promise<void> {
    if (this.db) return;
    this.sql = await initSqlJs(
      this.opts.wasmBinary ? { wasmBinary: this.opts.wasmBinary } : { locateFile: wasmLocator(this.opts) },
    );
    this.db = new this.sql.Database();
    if (this.opts.seedSql) this.db.run(this.opts.seedSql);
  }

  /**
   * Execute SQL. `files` entries ending in `.sql` run first (exercise setup assets);
   * `input` is the learner's statement(s). Errors mirror sqlite3: message on stderr, exit 1.
   */
  async run(input: string, files?: Record<string, string>): Promise<EngineRunResult> {
    await this.load();
    const db = this.db!;
    try {
      for (const [name, content] of Object.entries(files ?? {})) {
        if (name.endsWith(".sql")) db.run(content);
      }
      const results = db.exec(input);
      return {
        stdout: renderResults(results),
        stderr: "",
        exit: 0,
        artifacts: { results },
      };
    } catch (e) {
      return { stdout: "", stderr: `Error: ${errorMessage(e)}\n`, exit: 1 };
    }
  }

  /** Reset to a fresh database (+ seed) — the exercise "reset to seed" affordance. */
  async reset(): Promise<void> {
    if (!this.sql) {
      await this.load();
      return;
    }
    this.db?.close();
    this.db = new this.sql.Database();
    if (this.opts.seedSql) this.db.run(this.opts.seedSql);
  }
}
