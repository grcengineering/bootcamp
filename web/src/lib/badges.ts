/**
 * Points + badges — derived DETERMINISTICALLY from completion state (web ISA ISC-139).
 *
 * Badge definitions are data in the curriculum repo (badges.yaml → src/content/badges.json
 * via sync-content.ts); this module maps each definition's `rule` id to a pure predicate.
 * There is no second source of truth: nothing is "awarded" and stored — everything here
 * is recomputable from LearnerState at any time.
 *
 * Pure module (no DOM, no storage) — exercised directly by tests/badges.test.ts.
 */
import type { LearnerState } from "./labstate";

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  rule: string;
}

export interface PointsConfig {
  per_exercise: number;
  clean_bonus: number;
}

export interface BadgeData {
  points: PointsConfig;
  badges: BadgeDef[];
}

/** Minimal spec surface the derivation needs (from synced lab bundles). */
export interface SpecInfo {
  id: string; // exercise id, e.g. "lab-01"
  module: string; // module id, e.g. "01-terminal-and-command-line-basics"
}

export interface DerivedBadges {
  earned: BadgeDef[];
  locked: BadgeDef[];
  points: number;
  completedCount: number;
  cleanCount: number;
}

export const DEFAULT_POINTS: PointsConfig = { per_exercise: 10, clean_bonus: 5 };

/** Tier 1 span per the curriculum: Part I Mindset (00) + Foundations (01–06). */
function isTierOneModule(moduleId: string): boolean {
  const n = Number.parseInt(moduleId.slice(0, 2), 10);
  return Number.isInteger(n) && n >= 0 && n <= 6;
}

function isCompleted(state: LearnerState, spec: SpecInfo): boolean {
  return spec.id in state.completions;
}

type Rule = (state: LearnerState, allSpecs: SpecInfo[]) => boolean;

/** Closed rule vocabulary — badge yaml `rule` ids resolve here (unknown rules never earn). */
export const RULES: Record<string, Rule> = {
  "first-exercise": (state) => Object.keys(state.completions).length >= 1,

  "tier-1-complete": (state, allSpecs) => {
    const tierOne = allSpecs.filter((s) => isTierOneModule(s.module));
    return tierOne.length > 0 && tierOne.every((s) => isCompleted(state, s));
  },

  "clean-run": (state) => Object.values(state.completions).some((c) => c.clean),

  "evidence-keeper": (state) => state.evidenceChain.length >= 5,

  "full-loop": (state, allSpecs) =>
    allSpecs.length >= 16 && allSpecs.every((s) => isCompleted(state, s)),
};

export function deriveBadges(
  state: LearnerState,
  allSpecs: SpecInfo[],
  defs: BadgeDef[],
  points: PointsConfig = DEFAULT_POINTS,
): DerivedBadges {
  const completions = Object.values(state.completions);
  const completedCount = completions.length;
  const cleanCount = completions.filter((c) => c.clean).length;

  const earned: BadgeDef[] = [];
  const locked: BadgeDef[] = [];
  for (const def of defs) {
    const rule = RULES[def.rule];
    (rule && rule(state, allSpecs) ? earned : locked).push(def);
  }

  return {
    earned,
    locked,
    points: completedCount * points.per_exercise + cleanCount * points.clean_bonus,
    completedCount,
    cleanCount,
  };
}
