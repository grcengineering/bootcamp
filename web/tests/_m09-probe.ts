// Ad-hoc adversarial probe for module 09 — NOT a committed test. Deleted after review.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { parse } from "yaml";
import { createShellEngine } from "../src/engines/shell";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type VerifyContext } from "../src/verifiers/registry";
import type { ShellSession } from "../src/engines/shell/types";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULES = join(ROOT, "modules");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));
const DIR = "09-policy-as-code";

function loadSeedSpec(profile: string) {
  const seedDef = manifest.seeds[profile];
  const homeDir = join(FIXTURES, seedDef.home);
  const binDir = join(FIXTURES, seedDef.path_bin);
  const files: { path: string; content?: string; dir?: boolean }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = "~/" + relative(homeDir, full);
      if (statSync(full).isDirectory()) { files.push({ path: rel, dir: true }); walk(full); }
      else if (name !== ".gitkeep") files.push({ path: rel, content: readFileSync(full, "utf8") });
    }
  };
  walk(homeDir);
  const tools: Record<string, string> = {};
  for (const name of readdirSync(binDir)) tools[name] = readFileSync(join(binDir, name), "utf8");
  return { files, tools };
}

function newSession(spec: ExerciseSpec): ShellSession {
  const engine = createShellEngine();
  return engine.create({
    variant: spec.engine === "shell-macos" ? "zsh-macos" : "bash-linux",
    seed: loadSeedSpec(spec.seed.profile),
    epoch: manifest.meta.epoch, cols: 80, user: "analyst", host: "workstation", home: spec.seed.home,
  });
}

function replayInput(session: ShellSession, input: string) {
  const [first, ...rest] = input.split("\n");
  let r = session.exec(first);
  for (const line of rest) { if (r.state !== "pending") break; r = session.feedStdin(line + "\n"); }
  if (r.state === "pending") r = session.eof();
  return r;
}

function loadTranscript(path: string) {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input) };
}

const spec = ExerciseSpecSchema.parse(parse(readFileSync(join(MODULES, DIR, "exercises/exercise.yaml"), "utf8")));
const expectationsPath = join(MODULES, DIR, "exercises/transcripts/expectations.json");
const expectations = existsSync(expectationsPath) ? JSON.parse(readFileSync(expectationsPath, "utf8")) : {};

function verifyDetailed(session: ShellSession) {
  const out: Record<string, { check: string; pass: boolean; gap: string }[]> = {};
  for (const task of spec.tasks) {
    if (task.type !== "action") continue;
    out[task.id] = task.verify.map((chk: any, i: number) => {
      const ctx: VerifyContext = { expectations, expectationKey: `${task.id}:${i}` };
      const r = runCheck(session, chk as never, ctx);
      return { check: chk.check, pass: r.pass, gap: r.gap };
    });
  }
  return out;
}

const tDir = join(MODULES, DIR, "exercises/transcripts");
const file = process.argv[2] ?? "golden.jsonl";
const { header, inputs } = loadTranscript(join(tDir, file));
const session = newSession(spec);
for (const input of inputs) replayInput(session, input);
const detailed = verifyDetailed(session);
console.log(`=== ${file} ${header ? `(anti_for=${header.anti_for})` : "(golden)"} ===`);
for (const [task, checks] of Object.entries(detailed)) {
  const allPass = checks.every((c) => c.pass);
  console.log(`${task}: ${allPass ? "PASS" : "FAIL"}`);
  for (const c of checks) if (!c.pass) console.log(`    ✗ ${c.check}: ${c.gap}`);
}
