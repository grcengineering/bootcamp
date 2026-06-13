#!/usr/bin/env bun
/**
 * exercise-lint (root ISA ISC-46/47/48/50/51/52/70/74/79).
 *
 * Gates every modules/* exercise spec against:
 *  1. the shared Zod schema (shape, hint ladders, reflection rules)
 *  2. the closed verifier registry (every check exists; params validate) — the spec↔registry seam
 *  3. the code-in-data ban (expr/js/script/eval keys anywhere)
 *  4. completability — reveal-hint commands ⊆ the module's fidelity-manifest command surface
 *  5. objective coverage — tasks cover every §1 learning objective
 *  6. originality — no third-party URLs in specs
 *  7. transcripts — golden + ≥1 anti-transcript + expectations.json present when referenced
 *  8. ownership — owner/volatility/review_due present (schema) for rot tracking
 *
 * Exit 0 = all specs pass. Any failure prints "  missing/invalid: …" lines per module.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { ExerciseSpecSchema, findBannedKeys } from "../web/src/lib/exercise-spec";
import { PRIMITIVES } from "../web/src/verifiers/registry";
import { loadManifest } from "./fixtures/load-manifest";

const ROOT = join(import.meta.dir, "..");
const MODULES = join(ROOT, "modules");
// manifest.yaml PLUS every manifest.d/*.yaml fragment (Wave-4 fan-out) — completability checks a
// task's reveal commands against the merged surface, so a fragment's entries count.
const manifest = loadManifest(join(ROOT, ".ci/fixtures"));

// Builtins + operators always available in the sim (engine surface, not per-module).
const ALWAYS = new Set([
  "cd", "pwd", "echo", "printf", "export", "history", "clear", "exit", "true", "false", "test",
  "[", "man", "chmod", "touch", "mkdir", "cat", "ls", "bash", "nano", "type", "command",
]);

function manifestCommands(moduleNum: string): Set<string> {
  const out = new Set(ALWAYS);
  for (const e of manifest.entries ?? []) {
    if (e.module !== moduleNum) continue;
    for (const line of [e.cmd, e.tty_equiv, ...(e.pre ?? []), ...((e.post ?? []) as { cmd?: string }[]).map((p: any) => (typeof p === "string" ? p : p.cmd))]) {
      if (!line) continue;
      for (const seg of String(line).split("|")) {
        const w = seg.trim().split(/\s+/)[0];
        if (w && /^[a-zA-Z0-9_./-]+$/.test(w)) out.add(w.replace(/^.*\//, ""));
      }
    }
  }
  const seedDef = manifest.seeds ?? {};
  for (const s of Object.values(seedDef) as { path_bin?: string }[]) {
    if (s.path_bin) {
      const binDir = join(ROOT, ".ci/fixtures", s.path_bin);
      if (existsSync(binDir)) for (const t of readdirSync(binDir)) out.add(t);
    }
  }
  return out;
}

function objectiveCount(moduleDir: string): number {
  const md = readFileSync(join(MODULES, moduleDir, "module.md"), "utf8");
  const sec = md.split(/^## 1\..*$/m)[1]?.split(/^## 2\./m)[0] ?? "";
  const nums = [...sec.matchAll(/^\s*(\d+)\.\s+/gm)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

let failures = 0;
let checked = 0;
const moduleDirs = readdirSync(MODULES).filter((d) => /^\d{2}-/.test(d));

for (const dir of moduleDirs) {
  const specPath = join(MODULES, dir, "exercises/exercise.yaml");
  if (!existsSync(specPath)) continue; // presence across 16/16 is ISC-45's sweep, reported below
  checked++;
  const problems: string[] = [];
  let spec: ReturnType<typeof ExerciseSpecSchema.parse> | null = null;

  const raw = parse(readFileSync(specPath, "utf8"));

  // 3. code-in-data ban (before schema so smuggling is named precisely)
  for (const hit of findBannedKeys(raw)) problems.push(`banned executable key: ${hit}`);

  // 1. schema
  const parsed = ExerciseSpecSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`schema: ${issue.path.join(".")} — ${issue.message}`);
  } else {
    spec = parsed.data;
  }

  if (spec) {
    const moduleNum = dir.slice(0, 2);

    // 2. spec↔registry seam
    spec.tasks.forEach((t) =>
      t.verify.forEach((chk, i) => {
        const prim = (PRIMITIVES as Record<string, { params: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } } }>)[chk.check];
        if (!prim) { problems.push(`task ${t.id} check[${i}]: unknown primitive '${chk.check}'`); return; }
        const r = prim.params.safeParse(chk);
        if (!r.success) problems.push(`task ${t.id} check[${i}] (${chk.check}): ${r.error?.issues[0]?.message}`);
      }),
    );

    // 4. completability — reveal commands within manifest surface
    const allowed = manifestCommands(moduleNum);
    if (["shell-linux", "shell-macos", "mixed"].includes(spec.engine)) {
      for (const t of spec.tasks) {
        for (const h of t.hints) {
          if (!("reveal" in h)) continue;
          for (const seg of h.reveal.split(/\||&&|;/)) {
            const w = seg.trim().split(/\s+/)[0]?.replace(/^\.\//, "").replace(/^.*\//, "");
            if (w && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(w) && !allowed.has(w))
              problems.push(`task ${t.id} reveal uses '${w}' — not in module ${moduleNum}'s fidelity manifest (ISC-74)`);
          }
        }
      }
    }

    // 5. objective coverage
    const objCount = objectiveCount(dir);
    const covered = new Set(spec.tasks.flatMap((t) => t.objective));
    for (let o = 1; o <= objCount; o++)
      if (!covered.has(o)) problems.push(`objective ${o} has no covering task (ISC-48)`);

    // 6. originality
    if (/https?:\/\//.test(JSON.stringify(raw))) problems.push("third-party URL in spec (ISC-51)");

    // 7. transcripts + expectations
    const tDir = join(MODULES, dir, "exercises/transcripts");
    if (!existsSync(join(tDir, "golden.jsonl"))) problems.push("missing transcripts/golden.jsonl (ISC-73)");
    const antis = existsSync(tDir) ? readdirSync(tDir).filter((f) => f.startsWith("anti-")) : [];
    if (antis.length === 0) problems.push("missing transcripts/anti-*.jsonl (ISC-73)");
    const needsGenerated = spec.tasks.some((t) => t.verify.some((c) => (c as { from?: string }).from === "generated"));
    if (needsGenerated && !existsSync(join(tDir, "expectations.json")))
      problems.push("spec uses from:generated but transcripts/expectations.json is missing (ISC-60)");

    // 7b. anti-transcript discrimination header (web ISA — cross-family audit finding H1):
    // every anti-*.jsonl MUST carry {"anti_for":"tN","fails_check":<int>}, where fails_check
    // is a valid index into task tN's verify[] (the check that encodes the cheat). This pins
    // the anti to the exact verifier it must trip so it can never fail for the wrong reason.
    for (const anti of antis) {
      let header: { anti_for?: unknown; fails_check?: unknown } | null = null;
      try {
        header = JSON.parse(readFileSync(join(tDir, anti), "utf8").split("\n")[0] ?? "{}");
      } catch {
        problems.push(`${anti}: first line is not valid JSON (ISC-73)`);
        continue;
      }
      const tgt = header?.anti_for;
      if (typeof tgt !== "string") {
        problems.push(`${anti}: header missing "anti_for" (ISC-73)`);
        continue;
      }
      const task = spec.tasks.find((t) => t.id === tgt);
      if (!task) {
        problems.push(`${anti}: anti_for="${tgt}" names no task (ISC-73)`);
        continue;
      }
      if (task.type !== "action")
        problems.push(`${anti}: anti_for="${tgt}" is a ${task.type} task — antis target action tasks (ISC-73)`);
      const fc = header?.fails_check;
      if (typeof fc !== "number" || !Number.isInteger(fc))
        problems.push(`${anti}: header missing integer "fails_check" (H1 discrimination)`);
      else if (fc < 0 || fc >= task.verify.length)
        problems.push(`${anti}: fails_check=${fc} out of range for ${tgt}.verify[0,${task.verify.length}) (H1)`);
    }
  }

  if (problems.length) {
    failures++;
    console.log(`FAIL ${dir}`);
    for (const p of problems) console.log(`  ${p}`);
  } else {
    console.log(`ok   ${dir}`);
  }
}

console.log(`\nexercise-lint: ${checked - failures}/${checked} specs pass (${moduleDirs.length - checked} modules have no spec yet)`);
process.exit(failures ? 1 : 0);
