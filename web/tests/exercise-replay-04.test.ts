/**
 * Module-04 golden/anti-transcript replay gate (root ISA ISC-73) — the PowerShell-engine
 * counterpart of exercise-replay.test.ts (that harness covers shell-engine modules and
 * deliberately skips engine: powershell specs; this one drives the pwsh session contract).
 *
 * Replay semantics mirror the Lab Player exactly:
 *  - {"input": ...} lines are typed into the terminal (exec + feedStdin continuation,
 *    the `>> ` pending path);
 *  - {"edit": {path, content}} lines are the simulated-editor affordance (`notepad <file>`
 *    opens it in the UI) — replayed through the session's writeFileAs with the same
 *    provenance string the EditorPanel records;
 *  - after every step ALL action tasks are re-verified and passes LATCH, exactly like
 *    LabPlayer's taskRecords (a later step may legitimately change producedBy provenance —
 *    e.g. t7's script re-run rewrites t6's bundle — without un-completing the earlier task).
 *
 * Golden must latch every action task; each anti must NEVER latch its targeted task and
 * must name a gap at end-state (advisor finding: no verifier ships without being executed
 * against a known answer AND a near-miss).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { createPowerShellEngine } from "../src/engines/powershell";
import type { ExecResult, PowerShellSession, WindowsSeed } from "../src/engines/powershell/types";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULES = join(ROOT, "modules");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parseYaml(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

/** Same loader rule as the m04 fidelity suite + sync-content: gpresult report file
 *  resolved with its single trailing newline stripped. */
function loadSeed(profile: string): WindowsSeed {
  const seedDef = manifest.seeds[profile];
  const storePath = join(FIXTURES, seedDef.object_store);
  const raw = JSON.parse(readFileSync(storePath, "utf8"));
  return {
    ...raw,
    gpresultReport: readFileSync(join(dirname(storePath), raw.gpresultReportFile), "utf8").replace(/\n$/, ""),
  };
}

function newSession(spec: ExerciseSpec): PowerShellSession {
  return createPowerShellEngine().create({
    seed: loadSeed(spec.seed.profile),
    epoch: manifest.meta.epoch,
    cols: 80,
    user: "labuser",
    home: spec.seed.home,
  });
}

type TranscriptEntry =
  | { kind: "input"; input: string }
  | { kind: "edit"; path: string; content: string };

function loadTranscript(path: string): { header: { anti_for?: string; reason?: string } | null; entries: TranscriptEntry[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  const entries: TranscriptEntry[] = [];
  for (const l of lines) {
    if (l.input !== undefined) entries.push({ kind: "input", input: l.input });
    else if (l.edit !== undefined) entries.push({ kind: "edit", path: l.edit.path, content: l.edit.content });
  }
  return { header, entries };
}

/** Type one transcript input (continuation lines ride the engine's `>> ` pending path). */
function replayInput(session: PowerShellSession, input: string): void {
  const [first, ...rest] = input.split("\n");
  let r: ExecResult = session.exec(first);
  for (const line of rest) {
    if (r.state !== "pending") break;
    r = session.feedStdin(line + "\n");
  }
  if (r.state === "pending") session.eof();
}

function taskOutcome(
  spec: ExerciseSpec,
  taskId: string,
  session: PowerShellSession,
  expectations: Record<string, string>,
): { pass: boolean; gaps: string[] } {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  const gaps: string[] = [];
  let pass = true;
  task.verify.forEach((chk, i) => {
    const ctx: VerifyContext = { expectations, expectationKey: `${taskId}:${i}` };
    const out = runCheck(session, chk as AnyCheckParams, ctx);
    if (!out.pass) {
      pass = false;
      gaps.push(out.gap);
    }
  });
  return { pass, gaps };
}

/** Replay a transcript with Lab-Player-style latching; returns the latched task-id set. */
function replayLatched(
  spec: ExerciseSpec,
  session: PowerShellSession,
  entries: TranscriptEntry[],
  expectations: Record<string, string>,
): Set<string> {
  const latched = new Set<string>();
  const actionIds = spec.tasks.filter((t) => t.type === "action").map((t) => t.id);
  const sweep = () => {
    for (const id of actionIds) {
      if (latched.has(id)) continue;
      if (taskOutcome(spec, id, session, expectations).pass) latched.add(id);
    }
  };
  for (const entry of entries) {
    if (entry.kind === "edit") {
      // The simulated-editor write — identical provenance to the UI's notepad affordance.
      session.writeFileAs(entry.path, entry.content, `notepad ${entry.path}`);
    } else {
      replayInput(session, entry.input);
    }
    sweep();
  }
  return latched;
}

const DIR = "04-windows-fundamentals";
const exDir = join(MODULES, DIR, "exercises");
const spec = ExerciseSpecSchema.parse(parseYaml(readFileSync(join(exDir, "exercise.yaml"), "utf8")));
const expectationsPath = join(exDir, "transcripts/expectations.json");
const expectations: Record<string, string> = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(expectationsPath, "utf8")) as Record<string, string>).filter(
    ([k]) => !k.startsWith("_"),
  ),
);

describe("module 04 exercise replay (powershell engine)", () => {
  test("spec sanity: engine is powershell and transcripts exist", () => {
    expect(spec.engine).toBe("powershell");
    expect(existsSync(join(exDir, "transcripts/golden.jsonl"))).toBe(true);
    expect(readdirSync(join(exDir, "transcripts")).filter((f) => f.startsWith("anti-")).length).toBeGreaterThanOrEqual(2);
  });

  test("golden transcript satisfies (latches) every action task", () => {
    const session = newSession(spec);
    const { header, entries } = loadTranscript(join(exDir, "transcripts/golden.jsonl"));
    expect(header).toBeNull();
    const latched = replayLatched(spec, session, entries, expectations);
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const r = taskOutcome(spec, task.id, session, expectations);
      expect(`${task.id}: ${latched.has(task.id) ? "pass" : r.gaps.join(" | ")}`).toBe(`${task.id}: pass`);
    }
  });

  test("generated expectations match the engine state golden produces (ISC-60 regeneration)", () => {
    const session = newSession(spec);
    const { entries } = loadTranscript(join(exDir, "transcripts/golden.jsonl"));
    replayLatched(spec, session, entries, expectations);
    expect(session.readFile("bundle.json")).toBe(expectations["t6:0"]);
    expect(session.readFile("bundle.csv")).toBe(expectations["t6:2"]);
    expect(session.readFile("bundle.json")).toBe(expectations["t7:11"]);
  });

  for (const anti of readdirSync(join(exDir, "transcripts")).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} never satisfies its targeted task and names a gap`, () => {
      const { header, entries } = loadTranscript(join(exDir, "transcripts", anti));
      expect(header?.anti_for).toBeTruthy();
      const session = newSession(spec);
      const latched = replayLatched(spec, session, entries, expectations);
      expect(latched.has(header!.anti_for!)).toBe(false);
      const final = taskOutcome(spec, header!.anti_for!, session, expectations);
      expect(final.pass).toBe(false);
      expect(final.gaps.join("")).not.toBe("");
    });
  }
});
