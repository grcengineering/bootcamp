/**
 * Shape of a synced lab bundle (src/content/labs/<module>.json), emitted by
 * scripts/sync-content.ts from each module's exercises/exercise.yaml plus the
 * fixture seed tree (.ci/fixtures/seeds/). Pages and islands consume bundles
 * as pure data (web ISA ISC-101).
 */
import type { ExerciseSpec } from "./exercise-spec";
import type { SeedSpec } from "../engines/shell/types";
import type { VisualHostOptions } from "../components/lab/sessions/visual-host";

export interface LabBundle {
  spec: ExerciseSpec;
  seed: SeedSpec;
  expectations: Record<string, string>;
  epoch: string;
  /**
   * Visual-surface seed (engine: visual only): the resolved Inspect-&-Assemble panels over
   * the REAL committed fixture bytes (.ci/fixtures/assets/), normalized by lib/visual-seed.ts
   * — the same panels the replay test builds. Absent for every other engine class.
   */
  visual?: VisualHostOptions;
  /**
   * PowerShell engine seed (engine: powershell only) — the manifest seed profile's typed
   * object stores (.ci/fixtures/seeds/m04/*.json with gpresultReportFile resolved), shaped
   * as engines/powershell WindowsSeed. Absent for every other engine class.
   */
  windowsSeed?: unknown;
  /**
   * Linux-admin lab wiring (module 02's booted web-01 profile only): the shell session is
   * created with `adminLab` so the booted command family (sudo/systemctl/journalctl/ssh…)
   * is live, and `host` overrides the prompt hostname (web-01). Absent everywhere else.
   */
  adminLab?: { password: string };
  host?: string;
}

export const ENGINE_LABELS: Record<ExerciseSpec["engine"], string> = {
  "shell-linux": "Linux terminal",
  "shell-macos": "macOS terminal",
  powershell: "PowerShell",
  python: "Python",
  sql: "SQL",
  policy: "Policy-as-code",
  jq: "jq",
  api: "API lab",
  git: "Git",
  builder: "Guided builder",
  visual: "Packet inspector",
  mixed: "Mixed engines",
};
