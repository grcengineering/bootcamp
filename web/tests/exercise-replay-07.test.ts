/**
 * Module-07 transcript replay gate (root ISA ISC-73 — mixed-engine variant of
 * tests/exercise-replay.test.ts, which covers shell-only specs and skips engine: mixed).
 *
 * The lab-07 surface is two-pane (DESIGN-INPUTS §2 row 07): the shell engine drives the
 * terminal and a CsvSqlConsoleHost drives real SQLite (sql.js) against a table rebuilt
 * from the SAME evidence.csv the learner's terminal run produced. Transcript lines carry
 * an optional `"pane": "sql"` marker; the default pane is the terminal.
 *
 *   - replaying golden.jsonl must satisfy EVERY action task's verifiers
 *   - each anti-*.jsonl must FAIL its targeted task (and name a gap)
 *   - the from:generated expectations must equal what the replay actually produced
 *     (anti-drift assertion — root ISA ISC-60)
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { createShellEngine } from "../src/engines/shell";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";
import type { ShellSession } from "../src/engines/shell/types";
import { SqlEngineAdapter } from "../src/engines/sql";
import { CsvSqlConsoleHost, csvToSeedSql, SEED_SQL_NAME } from "../src/components/lab/sessions/sql-lab";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/07-data-and-cloud-control-plane");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));
const WASM = readFileSync(join(ROOT, "web/node_modules/sql.js/dist/sql-wasm.wasm")).buffer as ArrayBuffer;

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const EVIDENCE_CSV = "/home/analyst/lab07/fixtures/evidence.csv";

function loadSeedSpec(profile: string) {
  const seedDef = manifest.seeds[profile];
  const homeDir = join(FIXTURES, seedDef.home);
  const binDir = join(FIXTURES, seedDef.path_bin);
  const files: { path: string; content?: string; dir?: boolean }[] = [];
  const { readdirSync: rd, statSync, readFileSync: rf } = require("node:fs");
  const { relative } = require("node:path");
  const walk = (dir: string) => {
    for (const name of rd(dir)) {
      const full = join(dir, name);
      const rel = "~/" + relative(homeDir, full);
      if (statSync(full).isDirectory()) { files.push({ path: rel, dir: true }); walk(full); }
      else if (name !== ".gitkeep") files.push({ path: rel, content: rf(full, "utf8") });
    }
  };
  walk(homeDir);
  const tools: Record<string, string> = {};
  for (const name of rd(binDir)) if (name !== ".gitkeep") tools[name] = rf(join(binDir, name), "utf8");
  return { files, tools };
}

interface Surfaces {
  shell: ShellSession;
  sql: CsvSqlConsoleHost;
  adapter: SqlEngineAdapter;
}

function newSurfaces(): Surfaces {
  const shell = createShellEngine().create({
    variant: "bash-linux",
    seed: loadSeedSpec(spec.seed.profile),
    epoch: manifest.meta.epoch,
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: spec.seed.home,
  });
  const sql = new CsvSqlConsoleHost({ table: "evidence", csvProvider: () => shell.readFile(EVIDENCE_CSV) });
  const adapter = new SqlEngineAdapter({ wasmBinary: WASM });
  return { shell, sql, adapter };
}

/** Feed one terminal transcript input (may contain heredoc continuation lines). */
function replayShellInput(session: ShellSession, input: string) {
  const [first, ...rest] = input.split("\n");
  let r = session.exec(first);
  for (const line of rest) {
    if (r.state !== "pending") break;
    r = session.feedStdin(line + "\n");
  }
  if (r.state === "pending") r = session.eof();
  return r;
}

type Line = { input: string; pane?: "sql" };

function loadTranscript(path: string): { header: { anti_for?: string; reason?: string } | null; lines: Line[] } {
  const rows = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = rows[0]?.anti_for ? rows[0] : null;
  return { header, lines: rows.filter((l) => l.input !== undefined) };
}

async function replay(surfaces: Surfaces, lines: Line[]) {
  for (const line of lines) {
    if (line.pane === "sql") {
      surfaces.sql.write(surfaces.sql.mainFile, line.input);
      await surfaces.sql.run(surfaces.adapter);
    } else {
      replayShellInput(surfaces.shell, line.input);
    }
  }
}

function loadExpectations(): Record<string, string> {
  const expectations: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    JSON.parse(readFileSync(join(MODULE_DIR, "exercises/transcripts/expectations.json"), "utf8")) as Record<string, string>,
  )) {
    if (!k.startsWith("_")) expectations[k] = v;
  }
  return expectations;
}

/** Per-index verify outcomes for one task against the CURRENT engine state (H1 discrimination). */
function outcomesFor(surfaces: Surfaces, taskId: string): VerifyOutcome[] {
  const expectations = loadExpectations();
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) =>
    // Same probe split LabPlayer.verifyTasks uses: the terminal session is the probe,
    // the SQL host's last real-engine result rides VerifyContext.engineResult.
    runCheck(surfaces.shell, chk as never, {
      expectations,
      expectationKey: `${taskId}:${i}`,
      engineResult: surfaces.sql.lastResult(),
    } as VerifyContext),
  );
}

function verifyAll(surfaces: Surfaces) {
  const results: Record<string, { pass: boolean; gaps: string[] }> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    const outs = outcomesFor(surfaces, task.id);
    const gaps = outs.filter((o) => !o.pass).map((o) => o.gap);
    results[task.id] = { pass: gaps.length === 0, gaps };
  }
  return results;
}

const tDir = join(MODULE_DIR, "exercises/transcripts");

describe("module-07 mixed-engine replay (golden passes, anti fails its target)", () => {
  test("spec is the mixed engine class this harness exists for", () => {
    expect(spec.engine).toBe("mixed");
    expect(existsSync(join(tDir, "golden.jsonl"))).toBe(true);
  });

  test("golden transcript satisfies every action task", async () => {
    const surfaces = newSurfaces();
    const { lines } = loadTranscript(join(tDir, "golden.jsonl"));
    await replay(surfaces, lines);
    const results = verifyAll(surfaces);
    for (const [taskId, r] of Object.entries(results)) {
      expect(`${taskId}: ${r.pass ? "pass" : r.gaps.join(" | ")}`).toBe(`${taskId}: pass`);
    }
  });

  test("generated expectations equal what the golden replay actually produced (ISC-60)", async () => {
    const surfaces = newSurfaces();
    const { lines } = loadTranscript(join(tDir, "golden.jsonl"));
    await replay(surfaces, lines);
    const exp = JSON.parse(readFileSync(join(tDir, "expectations.json"), "utf8")) as Record<string, string>;
    const norm = (s: string) => s.replace(/\n$/, "");
    expect(norm(surfaces.shell.readFile("/home/analyst/lab07/encryption-verdict.json") ?? "")).toBe(norm(exp["t2:0"]));
    expect(norm(surfaces.shell.readFile("/home/analyst/lab07/access-violations.json") ?? "")).toBe(norm(exp["t4:3"]));
    expect(norm(surfaces.sql.lastResult()?.stdout ?? "")).toBe(norm(exp["t5:0"]));
  });

  for (const anti of readdirSync(tDir).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, async () => {
      const { header, lines } = loadTranscript(join(tDir, anti));
      expect(header?.anti_for).toBeTruthy();
      const surfaces = newSurfaces();
      await replay(surfaces, lines);
      const results = verifyAll(surfaces);
      const target = results[header!.anti_for!];
      expect(target).toBeDefined();
      expect(target.pass).toBe(false);
      expect(target.gaps.join("")).not.toBe("");
      assertAntiDiscriminates({
        anti,
        header,
        tasks: spec.tasks.map((t) => ({ id: t.id, type: t.type, verifyLength: t.verify?.length ?? 0 })),
        targetOutcomes: outcomesFor(surfaces, header!.anti_for!),
        targetCompleted: target.pass,
        priorActionMode: "independent",
      });
    });
  }
});

describe("sql-lab host (the mixed surface's SQL pane contract)", () => {
  test("csvToSeedSql renders the lab CSV as an idempotent rebuild", () => {
    const sql = csvToSeedSql("evidence", "control,status\nencryption,PASS\naccess,FAIL\n");
    expect(sql).toBe(
      "DROP TABLE IF EXISTS evidence;\n" +
        "CREATE TABLE evidence (control TEXT, status TEXT);\n" +
        "INSERT INTO evidence VALUES ('encryption','PASS'),('access','FAIL');",
    );
  });

  test("csvToSeedSql escapes quotes, skips ragged rows, handles header-only CSVs", () => {
    expect(csvToSeedSql("t", "a,b\nx'x,y\n")).toContain("('x''x','y')");
    expect(csvToSeedSql("t", "a,b\nlonely\nx,y\n")).toContain("VALUES ('x','y');");
    expect(csvToSeedSql("t", "a,b\n")).toBe("DROP TABLE IF EXISTS t;\nCREATE TABLE t (a TEXT, b TEXT);");
  });

  test("csvToSeedSql refuses what cannot honestly become a table", () => {
    expect(csvToSeedSql("evidence", null)).toBeNull(); // not collected yet
    expect(csvToSeedSql("evidence", "   \n")).toBeNull(); // blank
    expect(csvToSeedSql("evidence", "control,bad header\nx,y\n")).toBeNull(); // malformed header
    expect(csvToSeedSql("drop table", "a\nx\n")).toBeNull(); // bad table identifier
  });

  test("host injects the rebuild script per run, live from the provider; main buffer never doubles", () => {
    let csv: string | null = null;
    const host = new CsvSqlConsoleHost({ table: "evidence", csvProvider: () => csv });
    host.write(host.mainFile, "SELECT 1;");
    expect(host.runFiles()[SEED_SQL_NAME]).toBeUndefined(); // nothing collected → nothing injected
    expect(host.runFiles()[host.mainFile]).toBeUndefined(); // buffer is the input, not a setup file
    csv = "control,status\nencryption,PASS\n";
    expect(host.runFiles()[SEED_SQL_NAME]).toContain("CREATE TABLE evidence");
    csv = "control,status\nencryption,FAIL\n";
    expect(host.runFiles()[SEED_SQL_NAME]).toContain("('encryption','FAIL')"); // re-derived every run
  });

  test("querying before collecting gets the real engine's missing-table truth", async () => {
    const host = new CsvSqlConsoleHost({ table: "evidence", csvProvider: () => null });
    const adapter = new SqlEngineAdapter({ wasmBinary: WASM });
    host.write(host.mainFile, "SELECT COUNT(*) FROM evidence;");
    const r = await host.run(adapter);
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("no such table: evidence");
  });

  test("base files/assets pass through to runs alongside the injected seed", async () => {
    const host = new CsvSqlConsoleHost(
      { mainFile: "metric.sql", table: "evidence", csvProvider: () => "control,status\na,PASS\n" },
      { files: { "extra.sql": "CREATE TABLE extra (n INT);" }, assets: ["extra.sql"] },
    );
    expect(host.mainFile).toBe("metric.sql");
    const files = host.runFiles();
    expect(files["extra.sql"]).toContain("extra");
    expect(files[SEED_SQL_NAME]).toContain("evidence");
    const adapter = new SqlEngineAdapter({ wasmBinary: WASM });
    host.write("metric.sql", "SELECT control FROM evidence;");
    const r = await host.run(adapter);
    expect(r.stdout).toBe("control\na\n");
  });
});
