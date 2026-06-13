/**
 * SQL pane host for the module-07 mixed surface (web ISA ISC-69; DESIGN-INPUTS §2 row 07).
 *
 * The mixed exercise's SQL console queries a table built from the SAME bytes the learner's
 * terminal produced: `csvToSeedSql` turns the lab's `fixtures/evidence.csv` (written by the
 * learner running `bash labs/setup.sh` in the shell engine's VFS) into an idempotent
 * rebuild script, and `CsvSqlConsoleHost` injects it into every engine run via a live
 * provider — one source of truth, no second copy of the data anywhere.
 *
 * Honesty contract: until the learner has actually collected the evidence (the CSV does
 * not exist yet), NO seed SQL is injected — the real engine answers `no such table:
 * evidence`, exactly the truth: you cannot query evidence you have not collected.
 *
 * DOM-free; unit-tested under `bun test` (tests/exercise-replay-07.test.ts + sql-lab tests).
 */
import { ConsoleHost, type ConsoleHostOptions } from "./console-host";

/** Conservative SQL identifier gate for table/column names sourced from a CSV header. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Render a simple headered CSV (the lab's `control,status` shape: no quoting, no embedded
 * commas — the only CSV dialect module 07's fixtures use) as an idempotent SQLite rebuild:
 * DROP + CREATE + INSERT. Returns null when the CSV cannot honestly become a table
 * (missing/blank input, malformed header). Ragged data rows are skipped — they have no
 * unambiguous column assignment.
 */
export function csvToSeedSql(table: string, csv: string | null): string | null {
  if (!IDENT.test(table)) return null;
  if (csv === null) return null;
  const lines = csv.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const cols = lines[0].split(",").map((c) => c.trim());
  if (cols.length === 0 || !cols.every((c) => IDENT.test(c))) return null;
  const rows = lines
    .slice(1)
    .map((l) => l.split(","))
    .filter((vs) => vs.length === cols.length)
    .map((vs) => `(${vs.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")})`);
  const stmts = [
    `DROP TABLE IF EXISTS ${table};`,
    `CREATE TABLE ${table} (${cols.map((c) => `${c} TEXT`).join(", ")});`,
  ];
  if (rows.length > 0) stmts.push(`INSERT INTO ${table} VALUES ${rows.join(",")};`);
  return stmts.join("\n");
}

export interface CsvSqlHostOptions {
  /** The editable query buffer's name (default `query.sql` — also the run input). */
  mainFile?: string;
  /** Table the CSV becomes (e.g. `evidence`). */
  table: string;
  /**
   * Live source of the CSV bytes — typically `() => shell.readFile("~/lab07/fixtures/evidence.csv")`.
   * Returning null (not collected yet) injects nothing: the real engine reports the missing table.
   */
  csvProvider: () => string | null;
}

/** Name of the injected per-run rebuild script (must end `.sql` so the adapter runs it first). */
export const SEED_SQL_NAME = "evidence-seed.sql";

/**
 * ConsoleHost whose engine runs see a `.sql` rebuild of the linked CSV's table, regenerated
 * from the provider on EVERY run so terminal-side changes (re-running setup, restoring lab
 * files) are always reflected. Everything else — run history, last result, probe surface,
 * snapshots — is the stock console-host behavior the verifier registry already drives.
 */
export class CsvSqlConsoleHost extends ConsoleHost {
  private readonly table: string;
  private readonly csvProvider: () => string | null;

  constructor(opts: CsvSqlHostOptions, base?: Partial<ConsoleHostOptions>) {
    const mainFile = opts.mainFile ?? "query.sql";
    super({ files: { ...(base?.files ?? {}), [mainFile]: base?.files?.[mainFile] ?? "" }, mainFile, assets: base?.assets ?? [] });
    this.table = opts.table;
    this.csvProvider = opts.csvProvider;
  }

  override runFiles(): Record<string, string> {
    const out = super.runFiles();
    // The main buffer is the run INPUT (db.exec). The adapter also pre-runs every `.sql`
    // file it is handed — dropping the buffer here keeps the learner's statements from
    // executing twice (a SELECT would be harmless; an INSERT would not be honest).
    delete out[this.mainFile];
    const seed = csvToSeedSql(this.table, this.csvProvider());
    if (seed !== null) {
      // Injected FIRST so the learner's own assets run against the rebuilt table.
      return { [SEED_SQL_NAME]: seed, ...out };
    }
    return out;
  }
}
