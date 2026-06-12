/**
 * Badge/points derivation tests (web ISA ISC-139) — the derivation is a pure function of
 * LearnerState + spec list + badge definitions; these tests pin every rule's semantics.
 */
import { describe, expect, test } from "bun:test";
import { deriveBadges, DEFAULT_POINTS, type BadgeDef, type SpecInfo } from "../src/lib/badges";
import { emptyState, type EvidenceEntry, type ExerciseCompletion, type LearnerState } from "../src/lib/labstate";

const DEFS: BadgeDef[] = [
  { id: "first-exercise", name: "First Evidence", description: "", rule: "first-exercise" },
  { id: "tier-1-complete", name: "Foundations Laid", description: "", rule: "tier-1-complete" },
  { id: "clean-run", name: "Clean Run", description: "", rule: "clean-run" },
  { id: "evidence-keeper", name: "Evidence Keeper", description: "", rule: "evidence-keeper" },
  { id: "full-loop", name: "The Full Loop", description: "", rule: "full-loop" },
];

const MODULE_IDS = [
  "00-the-grc-engineering-mindset", "01-terminal-and-command-line-basics", "02-linux-fundamentals",
  "03-macos-fundamentals", "04-windows-fundamentals", "05-python-fundamentals", "06-apis-and-integrations",
  "07-data-fundamentals", "08-infrastructure-as-code", "09-policy-as-code", "10-frameworks-as-data",
  "11-threat-informed-defense", "12-oscal", "13-continuous-controls-monitoring", "14-build-vs-buy",
  "15-capstone",
];
const ALL_SPECS: SpecInfo[] = MODULE_IDS.map((m, i) => ({ id: `lab-${String(i).padStart(2, "0")}`, module: m }));

function completion(id: string, module: string, clean: boolean): ExerciseCompletion {
  return { exerciseId: id, module, completedAt: "2026-06-12T10:00:00Z", clean, tasks: [] };
}

function withCompletions(specs: SpecInfo[], clean = false): LearnerState {
  const s = emptyState();
  for (const spec of specs) s.completions[spec.id] = completion(spec.id, spec.module, clean);
  return s;
}

function fakeChain(n: number): EvidenceEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    seq: i, ts: "2026-06-12T10:00:00Z", kind: "exercise-completed" as const,
    subject: `lab-${i}`, payloadHash: "0", prevHash: i === 0 ? "GENESIS" : String(i - 1), hash: String(i),
  }));
}

const earnedIds = (state: LearnerState, specs = ALL_SPECS) =>
  deriveBadges(state, specs, DEFS).earned.map((b) => b.id);

describe("deriveBadges — rules", () => {
  test("empty state earns nothing and scores zero", () => {
    const d = deriveBadges(emptyState(), ALL_SPECS, DEFS);
    expect(d.earned).toEqual([]);
    expect(d.locked.length).toBe(DEFS.length);
    expect(d.points).toBe(0);
  });

  test("first-exercise after exactly one completion", () => {
    const state = withCompletions(ALL_SPECS.slice(1, 2));
    expect(earnedIds(state)).toContain("first-exercise");
    expect(earnedIds(state)).not.toContain("tier-1-complete");
    expect(earnedIds(state)).not.toContain("full-loop");
  });

  test("clean-run requires a clean completion, not just any completion", () => {
    expect(earnedIds(withCompletions(ALL_SPECS.slice(0, 3), false))).not.toContain("clean-run");
    expect(earnedIds(withCompletions(ALL_SPECS.slice(0, 1), true))).toContain("clean-run");
  });

  test("tier-1-complete needs ALL of modules 00–06 done — 07+ don't count", () => {
    const tierOne = ALL_SPECS.slice(0, 7);
    expect(earnedIds(withCompletions(tierOne))).toContain("tier-1-complete");
    expect(earnedIds(withCompletions(tierOne.slice(0, 6)))).not.toContain("tier-1-complete");
    // completing only later modules never earns it
    expect(earnedIds(withCompletions(ALL_SPECS.slice(7)))).not.toContain("tier-1-complete");
  });

  test("tier-1-complete never earns when no tier-1 specs exist (vacuous truth guarded)", () => {
    const lateOnly = ALL_SPECS.slice(7);
    expect(deriveBadges(withCompletions(lateOnly), lateOnly, DEFS).earned.map((b) => b.id))
      .not.toContain("tier-1-complete");
  });

  test("evidence-keeper at chain length 5, not 4", () => {
    const s4 = emptyState();
    s4.evidenceChain = fakeChain(4);
    expect(earnedIds(s4)).not.toContain("evidence-keeper");
    const s5 = emptyState();
    s5.evidenceChain = fakeChain(5);
    expect(earnedIds(s5)).toContain("evidence-keeper");
  });

  test("full-loop only when all 16 exercises are complete", () => {
    expect(earnedIds(withCompletions(ALL_SPECS))).toContain("full-loop");
    expect(earnedIds(withCompletions(ALL_SPECS.slice(0, 15)))).not.toContain("full-loop");
  });

  test("unknown rule ids never earn (closed vocabulary)", () => {
    const defs: BadgeDef[] = [{ id: "x", name: "X", description: "", rule: "no-such-rule" }];
    const d = deriveBadges(withCompletions(ALL_SPECS), ALL_SPECS, defs);
    expect(d.earned).toEqual([]);
    expect(d.locked.map((b) => b.id)).toEqual(["x"]);
  });
});

describe("deriveBadges — points", () => {
  test("10 per exercise + 5 clean bonus", () => {
    const state = withCompletions(ALL_SPECS.slice(0, 3), false);
    state.completions[ALL_SPECS[0].id] = completion(ALL_SPECS[0].id, ALL_SPECS[0].module, true);
    const d = deriveBadges(state, ALL_SPECS, DEFS, DEFAULT_POINTS);
    expect(d.completedCount).toBe(3);
    expect(d.cleanCount).toBe(1);
    expect(d.points).toBe(3 * 10 + 1 * 5);
  });

  test("points config is data — custom values flow through", () => {
    const d = deriveBadges(withCompletions(ALL_SPECS.slice(0, 2), true), ALL_SPECS, DEFS, {
      per_exercise: 7,
      clean_bonus: 3,
    });
    expect(d.points).toBe(2 * 7 + 2 * 3);
  });

  test("derivation is deterministic — same input, same output", () => {
    const state = withCompletions(ALL_SPECS.slice(0, 5), true);
    state.evidenceChain = fakeChain(6);
    const a = deriveBadges(state, ALL_SPECS, DEFS);
    const b = deriveBadges(state, ALL_SPECS, DEFS);
    expect(a).toEqual(b);
  });
});
