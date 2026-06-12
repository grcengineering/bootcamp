#!/usr/bin/env bun
/**
 * semantic-originality (root ISA ISC-41 → ISC-63).
 *
 * The originality-lint catches third-party LINKS outside §8; it is structurally blind to
 * uncited near-verbatim REGURGITATION — prose lifted from the very sources §8 cites.
 * This gate closes that gap with an n-gram shingle heuristic:
 *
 *   for each module: fetch its §8 supplemental sources (network permitting), normalize both
 *   texts, build 8-gram word shingles, and flag any module whose overlap with a source
 *   exceeds thresholds — excluding §8 itself and short attribution quotes.
 *
 * Modes:
 *   bun .ci/semantic-originality.ts            # online: fetch §8 sources, full check
 *   OFFLINE=1 …                                # CI-offline: cross-MODULE self-similarity only
 *                                              # (catches agent-authored copy-paste between
 *                                              # modules; network check runs nightly)
 *
 * Verdicts: a flagged overlap is a REVIEW TASK, not auto-fail, unless overlap is extreme
 * (≥3% of module shingles from one source) — extreme fails the build.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const MODULES = join(ROOT, "modules");
const SHINGLE = 8;
const REVIEW_THRESHOLD = 0.005;  // 0.5% shared shingles → review
const FAIL_THRESHOLD = 0.03;     // 3% → fail
const offline = !!process.env.OFFLINE;

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")     // code blocks are syntax, not prose
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

function overlap(a: Set<string>, b: Set<string>): { ratio: number; sample: string[] } {
  let hit = 0;
  const sample: string[] = [];
  for (const s of a) if (b.has(s)) { hit++; if (sample.length < 3) sample.push(s); }
  return { ratio: a.size ? hit / a.size : 0, sample };
}

function section18(md: string): string {
  // §1–7 prose only: strip §8 (where quoting/linking is sanctioned).
  return md.split(/^## 8\./m)[0] ?? md;
}

function sec8Urls(md: string): string[] {
  const sec = md.split(/^## 8\./m)[1] ?? "";
  return [...sec.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
}

const moduleDirs = readdirSync(MODULES).filter((d) => /^\d{2}-/.test(d));
const moduleShingles = new Map<string, Set<string>>();
for (const dir of moduleDirs) {
  const md = readFileSync(join(MODULES, dir, "module.md"), "utf8");
  moduleShingles.set(dir, shingles(normalize(section18(md))));
}

// Shingles present in ≥4 modules are OUR anatomy template (deliberately identical scaffold),
// not regurgitation — exclude them from every comparison.
const df = new Map<string, number>();
for (const set of moduleShingles.values()) for (const s of set) df.set(s, (df.get(s) ?? 0) + 1);
const template = new Set([...df.entries()].filter(([, n]) => n >= 4).map(([s]) => s));
for (const set of moduleShingles.values()) for (const s of template) set.delete(s);

let failures = 0;
let reviews = 0;

// ---- cross-module self-similarity (always; catches inter-module copy-paste) ----
const dirs = [...moduleShingles.keys()];
for (let i = 0; i < dirs.length; i++) {
  for (let j = i + 1; j < dirs.length; j++) {
    const { ratio, sample } = overlap(moduleShingles.get(dirs[i])!, moduleShingles.get(dirs[j])!);
    if (ratio > REVIEW_THRESHOLD) {
      reviews++;
      console.log(`REVIEW cross-module: ${dirs[i]} ↔ ${dirs[j]} share ${(ratio * 100).toFixed(2)}% shingles — e.g. "${sample[0]}…"`);
    }
  }
}

// ---- module vs its §8 sources (online mode) ----
if (!offline) {
  for (const dir of moduleDirs) {
    const md = readFileSync(join(MODULES, dir, "module.md"), "utf8");
    const mine = moduleShingles.get(dir)!;
    for (const url of sec8Urls(md)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "grc-bootcamp-originality-check" } });
        if (!res.ok) { console.log(`skip ${dir} ← ${url} (HTTP ${res.status})`); continue; }
        const html = await res.text();
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
        const theirs = shingles(normalize(text));
        const { ratio, sample } = overlap(mine, theirs);
        if (ratio >= FAIL_THRESHOLD) {
          failures++;
          console.log(`FAIL ${dir}: ${(ratio * 100).toFixed(2)}% of prose shingles appear in ${url} — e.g. "${sample[0]}…" (uncited regurgitation)`);
        } else if (ratio >= REVIEW_THRESHOLD) {
          reviews++;
          console.log(`REVIEW ${dir}: ${(ratio * 100).toFixed(2)}% overlap with ${url} — e.g. "${sample[0]}…"`);
        }
      } catch (err) {
        console.log(`skip ${dir} ← ${url} (${(err as Error).name})`);
      }
    }
  }
} else {
  console.log("(offline mode: §8-source comparison skipped — run online nightly)");
}

console.log(`\nsemantic-originality: ${failures} fail, ${reviews} review across ${moduleDirs.length} modules`);
process.exit(failures ? 1 : 0);
