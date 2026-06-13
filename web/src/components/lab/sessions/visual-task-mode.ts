/**
 * Per-task visual surface-mode inference (Wave-4 Bug #4).
 *
 * VisualSurface used to dispatch on the exercise's single `spec.visual.mode`, so a MIXED exercise
 * (modules 21/22/23/24/25 carry TRACE and/or MAP tasks under one peel/diff block) could only ever
 * render ONE surface — the TRACE/MAP tasks were uncompletable in the browser. The fix: render the
 * surface for the CURRENT TASK's mode, inferred from its verify PRIMITIVES (the closed registry is
 * the source of truth — the same primitives that gate the task select the surface that drives them):
 *
 *   sequence_matches / sim_alert_is              -> TRACE   (the named deck the task assembles)
 *   mapping_correct / mapping_score_at_least     -> MAP
 *   region_labeled_correctly / field_value_is /
 *     decoded_artifact_matches                   -> PEEL    (the proven canary surface)
 *
 * A TRACE task names its deck via `canonical_ref` (sequence_matches) or `deck` (sim_alert_is, which
 * carries no canonical_ref) so a multi-deck host renders + verifies against the RIGHT deck. This is
 * DATA-only inference (no code-in-data): it reads check names + the deck id the verifier already
 * targets. Pure + DOM-free; unit-tested; shared by VisualSurface and LabPlayer.
 */
import type { ExerciseSpec } from "../../../lib/exercise-spec";

/** The surface a task's primitives select. */
export type VisualTaskMode = "peel" | "trace" | "map";

/** What a task needs from the visual surface: the inferred mode + (TRACE) the deck name. */
export interface VisualTaskTarget {
  mode: VisualTaskMode;
  /** For a TRACE task, the deck it assembles (its `canonical_ref` or explicit `deck`); else null. */
  deck: string | null;
}

const TRACE_CHECKS = new Set(["sequence_matches", "sim_alert_is"]);
const MAP_CHECKS = new Set(["mapping_correct", "mapping_score_at_least"]);

type TaskLike = { verify?: Array<Record<string, unknown>> };

/**
 * Infer one task's visual surface mode + deck from its verify primitives. The FIRST mode-bearing
 * check wins (a task is single-mode by construction). A TRACE task's deck is the `canonical_ref`
 * (sequence_matches) or the explicit `deck` param (sim_alert_is). Returns PEEL when no TRACE/MAP
 * primitive is present (the default surface, and the proven canary path).
 */
export function visualTaskTarget(task: TaskLike): VisualTaskTarget {
  for (const chk of task.verify ?? []) {
    const name = String(chk.check);
    if (TRACE_CHECKS.has(name)) {
      const deck =
        typeof chk.deck === "string" ? chk.deck
        : typeof chk.canonical_ref === "string" ? chk.canonical_ref
        : null;
      return { mode: "trace", deck };
    }
    if (MAP_CHECKS.has(name)) return { mode: "map", deck: null };
  }
  return { mode: "peel", deck: null };
}

/**
 * Resolve a TRACE task's deck, inheriting from the nearest preceding TRACE task when the task names
 * no deck itself. A `sim_alert_is` break-round task (e.g. module 24's t9) carries no `canonical_ref`
 * — it operates on the deck the preceding `sequence_matches` task established. We scan the tasks up
 * to (and including) the target and carry the last explicitly-named deck forward, so a deckless
 * TRACE task resolves to the same deck the learner was just assembling. Deterministic + spec-derived
 * (no spec edit needed); a `sim_alert_is` may still carry an explicit `deck` to be self-contained.
 */
function inheritedDeck(tasks: TaskLike[], targetIndex: number): string | null {
  let deck: string | null = null;
  for (let i = 0; i <= targetIndex && i < tasks.length; i++) {
    const t = visualTaskTarget(tasks[i]);
    if (t.mode === "trace" && t.deck) deck = t.deck;
  }
  return deck;
}

/**
 * The deck a TRACE task verifies against, by task id: its own named deck, or (for a deckless
 * break-round) the nearest preceding named deck. Used by the Lab Player's per-task verify sweep so
 * a `sim_alert_is` task reads the same deck the learner just assembled.
 */
export function inheritedTraceDeck(tasks: Array<TaskLike & { id?: string }>, taskId: string): string | null {
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const own = visualTaskTarget(tasks[idx]);
  if (own.deck) return own.deck;
  return inheritedDeck(tasks, idx);
}

/**
 * The first-incomplete (current) task's visual target — what the surface should render. `completed`
 * reports which task ids are already recorded; the surface follows the learner's progress. When no
 * task is current (all done) the LAST task's target is shown (a stable resting surface). A spec with
 * no tasks (or a reflection-only tail) falls back to the block's default mode. A deckless TRACE task
 * inherits the nearest preceding deck (a break-round following its sequence task).
 */
export function currentVisualTarget(
  tasks: TaskLike[],
  completed: (taskId: string) => boolean,
  fallbackMode: VisualTaskMode = "peel",
): VisualTaskTarget {
  const actionable = tasks.filter((t) => (t as { type?: string }).type !== "reflection");
  const current = actionable.find((t) => !completed((t as { id?: string }).id ?? ""));
  const target = current ?? actionable[actionable.length - 1];
  if (!target) return { mode: fallbackMode, deck: null };
  const tgt = visualTaskTarget(target);
  if (tgt.mode === "trace" && !tgt.deck) {
    return { mode: "trace", deck: inheritedDeck(actionable, actionable.indexOf(target)) };
  }
  return tgt;
}

/** Map a spec block's default mode onto a surface mode (peel/diff-the-trace -> peel; trace/build -> trace). */
export function blockFallbackMode(specMode: NonNullable<ExerciseSpec["visual"]>["mode"] | undefined): VisualTaskMode {
  if (specMode === "trace" || specMode === "build-and-break") return "trace";
  if (specMode === "map") return "map";
  return "peel";
}
