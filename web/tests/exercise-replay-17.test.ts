/**
 * Module-17 transcript replay gate (root ISA ISC-73 — the `sql` engine-class counterpart of
 * tests/exercise-replay-07.test.ts, which drives the mixed terminal+SQL surface).
 *
 * The lab-17 surface is a single real SQLite console (sql.js / WASM SQLite) seeded with the three
 * stores from exercises/assets/stores-seed.sql — the SAME eight acme.example users as a relational
 * `users` table, a `users_doc` table of JSON documents, and a `users_kv` key-value table. Each
 * transcript line is one SQL statement the learner runs; the engine returns a real result set.
 *
 *   - replaying golden.jsonl must satisfy EVERY action task's verifiers
 *   - each anti-*.jsonl must FAIL its targeted task at its named fails_check (H1 discrimination)
 *   - the from:generated expectations must equal what the golden replay actually produced
 *     (anti-drift assertion — root ISA ISC-60)
 *
 * Honesty cross-check: the seed rows are committed under exercises/assets/, and the result sets
 * are sql.js's own output over those rows (renderResults in src/engines/sql/index.ts). The engine's
 * result set IS the oracle; there is no authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";
import { SqlEngineAdapter } from "../src/engines/sql";
import { ConsoleHost } from "../src/components/lab/sessions/console-host";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/17-databases-relational-and-nosql");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const ASSETS = join(MODULE_DIR, "exercises/assets");
const WASM = readFileSync(join(ROOT, "web/node_modules/sql.js/dist/sql-wasm.wasm")).buffer as ArrayBuffer;

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

const SEED_SQL = readFileSync(join(ASSETS, "stores-seed.sql"), "utf8");

interface Surfaces {
  host: ConsoleHost;
  adapter: SqlEngineAdapter;
}

/** A fresh console host (with the three-store seed as a run asset) + a fresh SQLite adapter. */
function newSurfaces(): Surfaces {
  const host = new ConsoleHost({
    files: { "query.sql": "", "stores-seed.sql": SEED_SQL },
    mainFile: "query.sql",
    assets: ["stores-seed.sql"],
  });
  const adapter = new SqlEngineAdapter({ wasmBinary: WASM });
  return { host, adapter };
}

type Line = { input: string };

function loadTranscript(path: string): { header: { anti_for?: string; fails_check?: number; reason?: string } | null; lines: Line[] } {
  const rows = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = rows[0]?.anti_for ? rows[0] : null;
  return { header, lines: rows.filter((l) => l.input !== undefined) };
}

/** Run each statement through the real engine; the `.sql` seed asset runs first on every run. */
async function replay(surfaces: Surfaces, lines: Line[]): Promise<void> {
  for (const line of lines) {
    surfaces.host.write(surfaces.host.mainFile, line.input);
    await surfaces.host.run(surfaces.adapter, line.input);
  }
}

function loadExpectations(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>,
  )) {
    if (!k.startsWith("_")) out[k] = v;
  }
  return out;
}

/** Per-index verify outcomes for one task against the CURRENT engine state (H1 discrimination). */
function outcomesFor(surfaces: Surfaces, taskId: string): VerifyOutcome[] {
  const expectations = loadExpectations();
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) =>
    // The console host's probe session backs history_contains; the last real-engine result rides
    // VerifyContext.engineResult — the SAME split LabPlayer.verifyTasks uses for the sql surface.
    runCheck(surfaces.host.probeSession(), chk as AnyCheckParams, {
      expectations,
      expectationKey: `${taskId}:${i}`,
      engineResult: surfaces.host.lastResult(),
    } as VerifyContext),
  );
}

/** verifyAll semantics (module-07 independent scoring): every action task scored against final state. */
function verifyAll(surfaces: Surfaces): Record<string, { pass: boolean; gaps: string[] }> {
  const results: Record<string, { pass: boolean; gaps: string[] }> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    const outs = outcomesFor(surfaces, task.id);
    const gaps = outs.filter((o) => !o.pass).map((o) => o.gap);
    results[task.id] = { pass: gaps.length === 0, gaps };
  }
  return results;
}

describe("module-17 sql-engine replay (golden passes, anti fails its target)", () => {
  test("spec is the sql engine class this harness exists for", () => {
    expect(spec.engine).toBe("sql");
    expect(existsSync(join(TRANSCRIPTS, "golden.jsonl"))).toBe(true);
  });

  test("golden transcript satisfies every action task", async () => {
    const surfaces = newSurfaces();
    // Each task reads ctx.engineResult = the LAST run, so verify per-statement as we go (the player
    // checks after every run); a task passes when its own statement's result set matched.
    const { lines } = loadTranscript(join(TRANSCRIPTS, "golden.jsonl"));
    const recorded = new Set<string>();
    const action = spec.tasks.filter((t) => t.type === "action");
    for (let i = 0; i < lines.length; i++) {
      surfaces.host.write(surfaces.host.mainFile, lines[i].input);
      await surfaces.host.run(surfaces.adapter, lines[i].input);
      const task = action[i];
      if (!task) continue;
      const outs = outcomesFor(surfaces, task.id);
      if (outs.every((o) => o.pass)) recorded.add(task.id);
    }
    for (const task of action) {
      expect(`${task.id}: ${recorded.has(task.id) ? "pass" : "not recorded"}`).toBe(`${task.id}: pass`);
    }
  });

  test("generated expectations equal what the golden replay actually produced (ISC-60)", async () => {
    const surfaces = newSurfaces();
    const { lines } = loadTranscript(join(TRANSCRIPTS, "golden.jsonl"));
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const norm = (s: string) => s.replace(/\n$/, "");
    const action = spec.tasks.filter((t) => t.type === "action");
    for (let i = 0; i < lines.length; i++) {
      surfaces.host.write(surfaces.host.mainFile, lines[i].input);
      await surfaces.host.run(surfaces.adapter, lines[i].input);
      const task = action[i];
      if (!task) continue;
      // each action task's verify[0] is engine_result_equals from:generated — its key is `${id}:0`.
      expect(norm(surfaces.host.lastResult()?.stdout ?? "")).toBe(norm(exp[`${task.id}:0`]));
    }
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, async () => {
      const { header, lines } = loadTranscript(join(TRANSCRIPTS, anti));
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
