/**
 * Shared anti-transcript discrimination gate (web ISA — cross-family audit finding H1).
 *
 * The wave-1 fail-open lesson, recurring: it is not enough for an anti-transcript to leave
 * its targeted task FAILED with a non-empty gap. An anti can fail the gate for the WRONG
 * reason — a syntax error in an earlier step, an answer-key mismatch, a typo — while the
 * specific cheat it names goes completely uncaught. A verifier that "passes" because the
 * learner's transcript happened to be broken elsewhere proves nothing about the cheat.
 *
 * The fix pins each anti to the EXACT verifier index it must trip. Every anti-*.jsonl header
 * carries `"fails_check": <int>` — the index into the targeted task's `verify[]` array that
 * encodes the cheat (e.g. artifact_produced_by for echo/awk fabrication, stream_separated for
 * contamination, script_reproducible for date-contaminated evidence, validator_passes for a
 * forged gate verdict, the semantic-discriminating check for honest-label near-misses).
 *
 * `assertAntiDiscriminates` enforces, for every anti:
 *   1. the header declares `fails_check` (a real index into the target's verify[]);
 *   2. that specific check returned pass:false on the post-replay state (the named cheat
 *      is what failed — not collateral damage);
 *   3. the target task as a whole is not recorded/completed (it still fails overall);
 *   4. the anti is a near-miss that reaches the targeted seam, never a syntax bomb. The
 *      precise form of this guard depends on the harness's verification semantics:
 *        - "sticky"      (Lab-Player sequential completion: builder/powershell/git suites)
 *                        → every ACTION task ordered BEFORE the target must be completed,
 *                          exactly as the real player would have latched them.
 *        - "independent" (shell `verifyAll`: each task scored against final state, and antis
 *                        are deliberately scoped to only reach the targeted cheat) → the
 *                        near-miss is surgical: at least one NON-targeted check of the target
 *                        task passes, proving the transcript reached and partially satisfied
 *                        the targeted task rather than failing as a no-op or upstream bomb.
 *
 * Callers supply the per-index outcomes they already compute (each engine wires its own
 * VerifyContext) plus the completion set, keeping this helper engine-agnostic.
 */
import { expect } from "bun:test";
import type { VerifyOutcome } from "../src/verifiers/registry";

export interface AntiHeader {
  anti_for?: string;
  fails_check?: number;
  /**
   * Documented complete-omission cheat: the cheat removes the entire control the target
   * exercises, so EVERY check of the target task legitimately fails (e.g. committing straight
   * to main removes the whole branch→merge change-management control). Suppresses the
   * "independent" surgical-near-miss guard with an auditable reason — never a silent escape.
   */
  full_cheat?: boolean;
  reason?: string;
}

export interface AntiTask {
  id: string;
  type: "action" | "reflection";
  verifyLength: number;
}

export interface AntiDiscriminateArgs {
  /** The anti file name (for assertion messages). */
  anti: string;
  /** Parsed header line ({"anti_for","fails_check",...}). */
  header: AntiHeader | null;
  /** Spec tasks in order, projected to {id,type,verify-length}. */
  tasks: AntiTask[];
  /** Per-index outcomes for the TARGET task against the post-replay state. */
  targetOutcomes: VerifyOutcome[];
  /** Was the target task recorded/completed overall? (Must be false.) */
  targetCompleted: boolean;
  /**
   * Verification semantics of the calling harness (see header comment for the two forms).
   * "sticky" suites pass `isCompleted`; "independent" suites only need `targetOutcomes`.
   */
  priorActionMode: "sticky" | "independent";
  /** Sticky harnesses: was each ACTION task (by id) ordered before the target completed? */
  isCompleted?: (taskId: string) => boolean;
}

/**
 * The single discrimination assertion shared by every replay suite. Throws (via bun:test
 * expect) with a precise message on any violation.
 */
export function assertAntiDiscriminates(args: AntiDiscriminateArgs): void {
  const { anti, header, tasks, targetOutcomes, targetCompleted, priorActionMode, isCompleted } = args;

  expect(`${anti}: anti_for`).toBe(`${anti}: anti_for`); // anchor for readable failures
  expect(header?.anti_for).toBeTruthy();
  const targetId = header!.anti_for!;
  debugDumpOutcomes(anti, targetId, targetOutcomes);
  const target = tasks.find((t) => t.id === targetId);
  expect(`${anti}: target ${targetId} exists`).toBe(`${anti}: target ${targetId} exists`);
  expect(target).toBeDefined();
  if (process.env.ANTI_DISCRIMINATE_DEBUG) return; // discovery pass: only log, don't assert

  // (1) fails_check is declared and indexes a real check in the target's verify[].
  expect(`${anti}: fails_check declared`).toBe(`${anti}: fails_check declared`);
  expect(typeof header!.fails_check).toBe("number");
  const idx = header!.fails_check!;
  expect(
    `${anti}: fails_check=${idx} in [0,${target!.verifyLength})`,
  ).toBe(`${anti}: fails_check=${idx} in [0,${target!.verifyLength})`);
  expect(idx >= 0 && idx < target!.verifyLength).toBe(true);

  // (2) the named cheat is what failed: verify[fails_check] returned pass:false.
  const named = targetOutcomes[idx];
  expect(named).toBeDefined();
  expect(
    `${anti}: verify[${idx}] = ${named?.pass ? "PASS (cheat uncaught!)" : "fail"}`,
  ).toBe(`${anti}: verify[${idx}] = fail`);

  // (3) the target task overall still fails (it is never recorded/completed).
  expect(`${anti}: target ${targetId} completed=${targetCompleted}`).toBe(
    `${anti}: target ${targetId} completed=false`,
  );

  // (4) the anti is a near-miss, not a syntax bomb — guard form depends on harness semantics.
  if (priorActionMode === "sticky") {
    // Lab-Player sequential latching: every ACTION task before the target must be completed.
    if (!isCompleted) throw new Error(`${anti}: sticky mode requires isCompleted`);
    const targetPos = tasks.findIndex((t) => t.id === targetId);
    for (let i = 0; i < targetPos; i++) {
      const t = tasks[i];
      if (t.type !== "action") continue;
      expect(`${anti}: prior action ${t.id} intact=${isCompleted(t.id)}`).toBe(
        `${anti}: prior action ${t.id} intact=true`,
      );
    }
  } else if (!header!.full_cheat) {
    // Independent scoring (shell verifyAll / scoped antis): the near-miss must be surgical —
    // at least one NON-targeted check of the target task passes. This rejects a transcript that
    // never reached the targeted task (a no-op or upstream syntax bomb leaves EVERY check
    // failing). A documented complete-omission cheat (full_cheat:true) is the only exception —
    // it removes the whole control the target exercises, so every check legitimately fails.
    const otherPassed = targetOutcomes.some((o, i) => i !== idx && o.pass);
    expect(`${anti}: a non-targeted check of ${targetId} passed=${otherPassed}`).toBe(
      `${anti}: a non-targeted check of ${targetId} passed=true`,
    );
  }
}

/**
 * Discovery aid (set ANTI_DISCRIMINATE_DEBUG=1): logs the per-index pass/fail vector for the
 * target task so the correct `fails_check` index can be read off a single run. No-op otherwise.
 */
export function debugDumpOutcomes(anti: string, targetId: string, outcomes: VerifyOutcome[]): void {
  if (!process.env.ANTI_DISCRIMINATE_DEBUG) return;
  const vec = outcomes.map((o, i) => `${i}:${o.pass ? "P" : "F"}`).join(" ");
  // eslint-disable-next-line no-console
  console.log(`[ANTI] ${anti} target=${targetId} -> ${vec}`);
}
