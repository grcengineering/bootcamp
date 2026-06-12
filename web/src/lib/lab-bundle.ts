/**
 * Shape of a synced lab bundle (src/content/labs/<module>.json), emitted by
 * scripts/sync-content.ts from each module's exercises/exercise.yaml plus the
 * fixture seed tree (.ci/fixtures/seeds/). Pages and islands consume bundles
 * as pure data (web ISA ISC-101).
 */
import type { ExerciseSpec } from "./exercise-spec";
import type { SeedSpec } from "../engines/shell/types";

export interface LabBundle {
  spec: ExerciseSpec;
  seed: SeedSpec;
  expectations: Record<string, string>;
  epoch: string;
}

export const ENGINE_LABELS: Record<ExerciseSpec["engine"], string> = {
  "shell-linux": "Linux terminal",
  "shell-macos": "macOS terminal",
  powershell: "PowerShell",
  python: "Python",
  sql: "SQL",
  policy: "Policy-as-code",
  api: "API lab",
  git: "Git",
  builder: "Guided builder",
  mixed: "Mixed engines",
};
