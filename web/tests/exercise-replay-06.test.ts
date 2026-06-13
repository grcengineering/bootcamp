/**
 * Module-06 golden/anti-transcript replay gate (root ISA ISC-73) — the api-engine
 * counterpart of tests/exercise-replay.test.ts, which covers only the shell-engine
 * specs. The module-06 exercise rides the shell engine created WITH `apiLab` options
 * (curl wired to the in-engine acme.example router) and wrapped in ApiLabSession so
 * the `api_pull_complete` verifier sees the observed exchange log — exactly the
 * surface LabPlayer.tsx builds for `engine: api`.
 *
 *   - replaying golden.jsonl must satisfy EVERY action task's verifiers
 *   - replaying each anti-*.jsonl must FAIL its targeted task (and name a gap)
 *   - the committed expectations.json must equal what the replayed engine state
 *     actually holds (from: generated honesty — root ISA ISC-60)
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { createShellEngine } from "../src/engines/shell";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";
import type { SeedSpec, ShellSession } from "../src/engines/shell/types";
import { ApiLabSession } from "../src/components/lab/sessions/api-exchange";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/06-api-fundamentals");
const EXERCISES = join(MODULE_DIR, "exercises");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(EXERCISES, "exercise.yaml"), "utf8")),
);

/** Seed exactly as scripts/sync-content.ts bundles it: profile home + spec file refs + named tools. */
function loadSeed(): SeedSpec {
  const seedDef = manifest.seeds[spec.seed.profile];
  const homeDir = join(FIXTURES, seedDef.home);
  const files: SeedSpec["files"] = [];
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
  for (const ref of spec.seed.files) {
    files.push({ path: ref.path, content: readFileSync(join(EXERCISES, ref.from), "utf8") });
  }
  const tools: Record<string, string> = {};
  for (const name of spec.seed.path_tools) {
    tools[name] = readFileSync(join(FIXTURES, seedDef.path_bin, name), "utf8");
  }
  return { files, tools };
}

function newSession(): { shell: ShellSession; api: ApiLabSession } {
  const shell = createShellEngine().create({
    variant: "bash-linux", // LabPlayer VARIANTS: the module-06 lab box is the Linux container + curl
    seed: loadSeed(),
    epoch: manifest.meta.epoch,
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: spec.seed.home,
    apiLab: {},
  });
  return { shell, api: new ApiLabSession(shell) };
}

/** Feed one transcript input through the wrapped session (heredoc continuations included). */
function replayInput(api: ApiLabSession, shell: ShellSession, input: string) {
  const [first, ...rest] = input.split("\n");
  let r = api.exec(first!) as ReturnType<ShellSession["exec"]>;
  for (const line of rest) {
    if (r.state !== "pending") break;
    r = shell.feedStdin(line + "\n");
  }
  if (r.state === "pending") r = shell.eof();
  return r;
}

function loadTranscript(path: string): { header: { anti_for?: string; reason?: string } | null; inputs: string[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input) };
}

const expectationsPath = join(EXERCISES, "transcripts/expectations.json");
const expectations: Record<string, string> = existsSync(expectationsPath)
  ? JSON.parse(readFileSync(expectationsPath, "utf8"))
  : {};

function verifyAll(api: ApiLabSession) {
  const results: Record<string, { pass: boolean; gaps: string[] }> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    const gaps: string[] = [];
    let pass = true;
    task.verify.forEach((chk, i) => {
      const ctx: VerifyContext = {
        expectations,
        expectationKey: `${task.id}:${i}`,
        apiExchanges: api.probes(),
      };
      const out = runCheck(api, chk as AnyCheckParams, ctx);
      if (!out.pass) { pass = false; gaps.push(out.gap); }
    });
    results[task.id] = { pass, gaps };
  }
  return results;
}

describe("module 06 exercise replay (api engine: shell + acme router + exchange log)", () => {
  test("golden transcript satisfies every action task", () => {
    const { shell, api } = newSession();
    const { inputs } = loadTranscript(join(EXERCISES, "transcripts/golden.jsonl"));
    for (const input of inputs) replayInput(api, shell, input);
    const results = verifyAll(api);
    for (const [taskId, r] of Object.entries(results)) {
      expect(`${taskId}: ${r.pass ? "pass" : r.gaps.join(" | ")}`).toBe(`${taskId}: pass`);
    }
  });

  test("expectations.json equals the replayed engine state (from: generated honesty)", () => {
    const { shell, api } = newSession();
    const { inputs } = loadTranscript(join(EXERCISES, "transcripts/golden.jsonl"));
    for (const input of inputs) replayInput(api, shell, input);
    const norm = (s: string) => s.replace(/\n$/, "");
    for (const task of spec.tasks) {
      task.verify.forEach((chk, i) => {
        const c = chk as { check: string; path?: string; from?: string };
        if (c.from !== "generated" || c.check !== "file_content_equals" || !c.path) return;
        const key = `${task.id}:${i}`;
        const got = shell.readFile(c.path);
        expect(got).not.toBeNull();
        expect(`${key}=${norm(got!)}`).toBe(`${key}=${norm(expectations[key] ?? "<missing>")}`);
      });
    }
  });

  const tDir = join(EXERCISES, "transcripts");
  for (const anti of readdirSync(tDir).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task`, () => {
      const { header, inputs } = loadTranscript(join(tDir, anti));
      expect(header?.anti_for).toBeTruthy();
      const { shell, api } = newSession();
      for (const input of inputs) replayInput(api, shell, input);
      const results = verifyAll(api);
      const target = results[header!.anti_for!];
      expect(target).toBeDefined();
      expect(target!.pass).toBe(false);
      expect(target!.gaps.join("")).not.toBe("");
    });
  }

  test("the mock vendor's page bodies are the committed lab fixture bytes (byte canon)", async () => {
    const { USERS_PAGE_1, USERS_PAGE_2 } = await import("../src/engines/api/acme");
    expect(USERS_PAGE_1).toBe(readFileSync(join(MODULE_DIR, "labs/fixtures/users-page-1.json"), "utf8"));
    expect(USERS_PAGE_2).toBe(readFileSync(join(MODULE_DIR, "labs/fixtures/users-page-2.json"), "utf8"));
  });
});
