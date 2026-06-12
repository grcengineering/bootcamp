/**
 * SQL engine acceptance (web ISA ISC-69): real SQLite (sql.js) runs the module-07 taught
 * queries against the seeded evidence table and returns correct result sets.
 * Seed data = modules/07-data-and-cloud-control-plane/labs/setup.sh evidence.csv rows;
 * expected numbers = the §5.3 worked example (access 50.0 / encryption 33.3).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { renderResults, SqlEngineAdapter, wasmLocator, SQL_WASM_DEFAULT_URL } from "../src/engines/sql";

const WEB = join(dirname(new URL(import.meta.url).pathname), "..");
const WASM_PATH = join(WEB, "node_modules/sql.js/dist/sql-wasm.wasm");
const wasmBinary = () => readFileSync(WASM_PATH).buffer as ArrayBuffer;

/** module-07 evidence table (labs/setup.sh fixture rows). */
const SEED = `
CREATE TABLE evidence (control TEXT, status TEXT);
INSERT INTO evidence VALUES
  ('encryption','PASS'),('encryption','FAIL'),('encryption','PASS'),
  ('access','PASS'),('access','FAIL');
`;

describe("module-07 taught queries (real SQLite)", () => {
  const adapter = new SqlEngineAdapter({ wasmBinary: wasmBinary(), seedSql: SEED });

  test("§4.5 failure count: SELECT COUNT(*) … WHERE", async () => {
    const r = await adapter.run(
      "SELECT COUNT(*) AS failing FROM evidence WHERE control = 'encryption' AND status = 'FAIL';",
    );
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("failing\n1\n");
    expect(r.artifacts?.results).toEqual([{ columns: ["failing"], values: [[1]] }]);
  });

  test("§5.3 fail-rate by control: GROUP BY + CASE WHEN", async () => {
    const r = await adapter.run(`
      SELECT control,
             SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END)              AS failing,
             COUNT(*)                                                      AS total,
             ROUND(100.0 * SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) / COUNT(*), 1) AS fail_pct
      FROM evidence
      GROUP BY control;`);
    expect(r.exit).toBe(0);
    const results = r.artifacts?.results as Array<{ columns: string[]; values: unknown[][] }>;
    expect(results[0].columns).toEqual(["control", "failing", "total", "fail_pct"]);
    expect(results[0].values).toEqual([
      ["access", 1, 2, 50],
      ["encryption", 1, 3, 33.3],
    ]);
    expect(r.stdout).toBe("control|failing|total|fail_pct\naccess|1|2|50\nencryption|1|3|33.3\n");
  });

  test("SQL errors mirror sqlite3: message on stderr, exit 1", async () => {
    const r = await adapter.run("SELECT nope FROM missing_table;");
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("no such table: missing_table");
    expect(r.stdout).toBe("");
  });

  test("statements with no result set return empty stdout, exit 0", async () => {
    const r = await adapter.run("CREATE TABLE scratch (x INT);");
    expect(r).toMatchObject({ stdout: "", stderr: "", exit: 0 });
  });

  test("*.sql files run as setup before the input", async () => {
    const r = await adapter.run("SELECT n FROM extra ORDER BY n;", {
      "setup.sql": "CREATE TABLE extra (n INT); INSERT INTO extra VALUES (2),(1);",
      "readme.txt": "not sql — ignored",
    });
    expect(r.stdout).toBe("n\n1\n2\n");
  });

  test("reset() returns the database to its seed", async () => {
    await adapter.run("INSERT INTO evidence VALUES ('encryption','FAIL');");
    await adapter.reset();
    const r = await adapter.run("SELECT COUNT(*) AS c FROM evidence;");
    expect(r.stdout).toBe("c\n5\n");
  });

  test("reset() before load() initializes lazily", async () => {
    const fresh = new SqlEngineAdapter({ wasmBinary: wasmBinary(), seedSql: SEED });
    await fresh.reset();
    const r = await fresh.run("SELECT COUNT(*) AS c FROM evidence;");
    expect(r.stdout).toBe("c\n5\n");
  });

  test("load() is idempotent (no reseed double-run)", async () => {
    const fresh = new SqlEngineAdapter({ wasmBinary: wasmBinary(), seedSql: SEED });
    await fresh.load();
    await fresh.load();
    const r = await fresh.run("SELECT COUNT(*) AS c FROM evidence;");
    expect(r.stdout).toBe("c\n5\n");
  });

  test("locateFile path (browser branch) resolves the wasm by URL", async () => {
    // under bun the emscripten loader reads a filesystem path — exercises the same branch
    // the browser uses with /engines/sql-wasm.wasm
    const viaUrl = new SqlEngineAdapter({ wasmUrl: WASM_PATH, seedSql: SEED });
    const r = await viaUrl.run("SELECT 1 AS one;");
    expect(r.stdout).toBe("one\n1\n");
    // the locator hook itself: explicit URL wins; absent → the self-hosted default
    expect(wasmLocator({ wasmUrl: WASM_PATH })()).toBe(WASM_PATH);
    expect(wasmLocator({})()).toBe(SQL_WASM_DEFAULT_URL);
    expect(SQL_WASM_DEFAULT_URL).toBe("/engines/sql-wasm.wasm");
  });

  test("renderResults handles NULL and blob cells", () => {
    expect(
      renderResults([{ columns: ["a", "b"], values: [[null, new Uint8Array([0xde, 0xad])]] }]),
    ).toBe("a|b\n|dead\n");
    expect(renderResults([])).toBe("");
  });
});
