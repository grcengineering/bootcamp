/**
 * Module 00 — `evaluate_analysis` ported from modules/00-what-grc-engineering-is/labs/happy-path.sh
 * (web ISA ISC-80/137). The bash original greps a one-page legacy-vs-engineered analysis for
 * the five named legacy problems (case-insensitive), the seven loop stages (case-sensitive),
 * and an explicit reality->policy inversion statement; prints one two-space-indented line per
 * missing element to stdout and returns 0 (conforms) / 1 (does not).
 *
 * Byte-accepted against builder-captures.json m00 (real bash run of the repo's own function).
 */
import type { ValidatorRun } from "./types";
import { Io } from "./types";

/** The five named legacy problems the analysis MUST address (§4.3) — happy-path.sh PROBLEMS. */
export const LEGACY_PROBLEMS = [
  "manual toil",
  "transactional",
  "whack-a-mole",
  "closed-framework",
  "commoditized",
] as const;

/** The seven irreducible loop stages the engineered arrow MUST map (§4.6) — happy-path.sh STAGES. */
export const ANALYSIS_STAGES = [
  "UNDERSTAND",
  "LOCATE",
  "QUERY",
  "EVALUATE",
  "EVIDENCE",
  "MONITOR",
  "OWN",
] as const;

/**
 * `grep -qi -- "$pattern" file` for a literal pattern (none of LEGACY_PROBLEMS contains
 * regex metacharacters): case-insensitive substring anywhere in the document.
 */
function grepQI(content: string, literal: string): boolean {
  return content.toLowerCase().includes(literal.toLowerCase());
}

/** `grep -q -- "$pattern" file` for a literal pattern: case-sensitive substring. */
function grepQ(content: string, literal: string): boolean {
  return content.includes(literal);
}

/**
 * `grep -qiE 'reality[[:space:]]*->[[:space:]]*policy|reality.*drive.*policy'` — grep is
 * line-based, so `.` never crosses a newline; [[:space:]] within a line is [ \t\v\f\r].
 */
const INVERSION_RE = /reality[ \t\v\f\r]*->[ \t\v\f\r]*policy|reality.*drive.*policy/i;
function hasInversion(content: string): boolean {
  return content.split("\n").some((line) => INVERSION_RE.test(line));
}

/** Structured view of the same evaluation, for the guided builder UI (per-element status). */
export interface AnalysisReport {
  problems: { name: string; present: boolean }[];
  stages: { name: string; present: boolean }[];
  inversion: boolean;
  conforms: boolean;
}

export function analyzeDocument(content: string): AnalysisReport {
  const problems = LEGACY_PROBLEMS.map((p) => ({ name: p, present: grepQI(content, p) }));
  const stages = ANALYSIS_STAGES.map((s) => ({ name: s, present: grepQ(content, s) }));
  const inversion = hasInversion(content);
  const conforms = problems.every((p) => p.present) && stages.every((s) => s.present) && inversion;
  return { problems, stages, inversion, conforms };
}

/**
 * evaluate_analysis FILE -> exit 0 if the document conforms, 1 otherwise, with the
 * original's exact stdout lines in the original's order (problems, stages, inversion).
 */
export function evaluateAnalysis(content: string): ValidatorRun {
  const io = new Io();
  let missing = 0;
  for (const p of LEGACY_PROBLEMS) {
    if (!grepQI(content, p)) {
      io.log(`  missing legacy problem: ${p}`);
      missing = 1;
    }
  }
  for (const s of ANALYSIS_STAGES) {
    if (!grepQ(content, s)) {
      io.log(`  missing loop stage: ${s}`);
      missing = 1;
    }
  }
  if (!hasInversion(content)) {
    io.log("  missing reality->policy inversion statement");
    missing = 1;
  }
  return io.result(missing);
}
