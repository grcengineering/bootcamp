// Shared library for the curriculum-as-code CI gates and dashboard.
// Pure, side-effect-free logic lives here and is unit-tested to the coverage floor.
// The CLI wrappers (anatomy-lint.ts, originality-lint.ts, …) only do IO + process.exit.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const CI_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(CI_DIR, "..");
export const MODULES_DIR = join(REPO_ROOT, "modules");

export interface ModuleEntry {
  id: string;
  dir: string;
  moduleMd: string;
  metaYaml: string;
}

/** List module directories that contain a module.md, sorted by id. */
export function listModules(modulesDir: string = MODULES_DIR): ModuleEntry[] {
  if (!existsSync(modulesDir)) return [];
  return readdirSync(modulesDir)
    .filter((d) => {
      try {
        return statSync(join(modulesDir, d)).isDirectory();
      } catch {
        return false;
      }
    })
    .map((d) => ({
      id: d,
      dir: join(modulesDir, d),
      moduleMd: join(modulesDir, d, "module.md"),
      metaYaml: join(modulesDir, d, "meta.yaml"),
    }))
    .filter((m) => existsSync(m.moduleMd))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Minimal parser for our flat meta.yaml files: scalars, dates, inline arrays. No nesting. */
export function parseMetaYaml(text: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const raw of text.split("\n")) {
    const noComment = raw.replace(/\s+#.*$/, "");
    const line = noComment.trimEnd();
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rawVal = m[2].trim();
    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      out[key] = rawVal
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      out[key] = rawVal.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export interface Section {
  num: number;
  title: string;
}

/** Extract `## N. Title` section headings from a module.md. */
export function readSections(md: string): Section[] {
  const out: Section[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^##\s+(\d+)\.\s+(.+?)\s*$/);
    if (m) out.push({ num: Number(m[1]), title: m[2].trim() });
  }
  return out;
}

/** Character index where §8 Supplemental begins, or -1. */
export function supplementalStart(md: string): number {
  const m = md.match(/^##\s+8\.\s+Supplemental Learning Material\s*$/m);
  return m && m.index !== undefined ? m.index : -1;
}

export const URL_RE = /https?:\/\/[^\s)<>\]]+/g;

/** Extract URLs from text, trimming trailing punctuation. */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    urls.push(m[0].replace(/[.,)]+$/, ""));
  }
  return urls;
}

export const REQUIRED_SECTIONS: Record<number, string> = {
  1: "Learning Objectives",
  2: "Why this matters for GRC",
  3: "The Mental Model",
  4: "Concepts",
  5: "Worked Examples",
  6: "Guided Lab",
  7: "Assessment",
  8: "Supplemental Learning Material",
};

export const REQUIRED_META = [
  "module",
  "owner",
  "volatility",
  "last_reviewed",
  "review_due",
  "status",
  "objectives",
];

export interface AnatomyInput {
  md: string;
  meta: Record<string, string | string[]> | null;
  hasLabs: boolean;
  hasAssessment: boolean;
}

/** Pure anatomy check: returns a list of problems (empty = pass). */
export function lintAnatomy(input: AnatomyInput): string[] {
  const problems: string[] = [];
  const present = new Set(readSections(input.md).map((s) => s.num));
  for (const n of Object.keys(REQUIRED_SECTIONS).map(Number)) {
    if (!present.has(n)) problems.push(`missing §${n} (${REQUIRED_SECTIONS[n]})`);
  }
  if (input.meta === null) {
    problems.push("missing meta.yaml");
  } else {
    for (const k of REQUIRED_META) {
      const v = input.meta[k];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        problems.push(`meta.yaml missing '${k}'`);
      }
    }
    if (typeof input.meta.owner === "string" && /tbd/i.test(input.meta.owner)) {
      problems.push("meta.yaml owner is still TBD");
    }
  }
  if (!input.hasLabs) problems.push("missing labs/");
  if (!input.hasAssessment) problems.push("missing assessment/");
  return problems;
}

/** Pure originality check: third-party URLs may appear only under §8. */
export function lintOriginality(md: string): string[] {
  const problems: string[] = [];
  const idx = supplementalStart(md);
  if (idx < 0) {
    problems.push(
      "no '## 8. Supplemental Learning Material' section to quarantine third-party links"
    );
  }
  const body = idx >= 0 ? md.slice(0, idx) : md;
  for (const url of extractUrls(body)) {
    problems.push(`third-party URL outside §8: ${url}`);
  }
  return problems;
}

export const DEFAULT_BANNED_VERBS = [
  "understand",
  "know",
  "be familiar with",
  "learn about",
  "be aware of",
  "appreciate",
  "grasp",
];

/** Extract the §1 Learning Objectives block (between heading 1 and heading 2). */
export function objectivesBlock(md: string): string {
  const lines = md.split("\n");
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+1\.\s+Learning Objectives/.test(lines[i])) start = i;
    else if (start >= 0 && /^##\s+2\./.test(lines[i])) {
      end = i;
      break;
    }
  }
  return start >= 0 ? lines.slice(start, end).join("\n") : "";
}

/** Pure style check: §1 objectives must use measurable (Bloom) verbs. */
export function lintStyle(md: string, banned: string[] = DEFAULT_BANNED_VERBS): string[] {
  const problems: string[] = [];
  const block = objectivesBlock(md);
  if (!block) {
    problems.push("could not locate §1 Learning Objectives block");
    return problems;
  }
  const lower = block.toLowerCase();
  for (const b of banned) {
    if (b.includes(" ") && lower.includes(b)) {
      problems.push(`unmeasurable phrase in objectives: "${b}"`);
    }
  }
  const objLines = block.split("\n").filter((l) => /^\d+\.\s/.test(l.trim()));
  for (const l of objLines) {
    const bold = l.match(/\*\*(.+?)\*\*/);
    if (!bold) {
      problems.push(`objective has no bold lead verb: "${l.trim().slice(0, 50)}…"`);
      continue;
    }
    const verb = bold[1].toLowerCase().replace(/[^a-z ].*$/, "").trim();
    if (banned.includes(verb)) problems.push(`unmeasurable objective verb: "${verb}"`);
  }
  return problems;
}

export function countObjectives(md: string): number {
  return objectivesBlock(md)
    .split("\n")
    .filter((l) => /^\d+\.\s/.test(l.trim())).length;
}

export interface RotStatus {
  label: string;
  emoji: string;
}

/** Rot status from a review-due date relative to an as-of date (CCM on the curriculum). */
export function rotStatus(reviewDue: string | undefined, asOf: Date): RotStatus {
  if (!reviewDue) return { label: "unknown", emoji: "⚪" };
  const due = new Date(reviewDue).getTime();
  if (Number.isNaN(due)) return { label: "unknown", emoji: "⚪" };
  const days = Math.round((due - asOf.getTime()) / 86400000);
  if (days < 0) return { label: `overdue ${-days}d`, emoji: "🔴" };
  if (days <= 30) return { label: `due ${days}d`, emoji: "🟡" };
  return { label: `ok ${days}d`, emoji: "🟢" };
}

export function readBannedVerbs(path: string): string[] {
  if (!existsSync(path)) return DEFAULT_BANNED_VERBS;
  return readFileSync(path, "utf8")
    .split("\n")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !s.startsWith("#"));
}

export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
