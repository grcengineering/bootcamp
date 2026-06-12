/**
 * Module 15 capstone assembler model (web ISA ISC-87/131) — the 8-point contract checklist
 * (7 loop stages + before/after) binding prior exercise artifacts into a portfolio view.
 *
 * The checklist is DERIVED by parsing the ported validate-capstone output against the
 * current repo state — the validator stays the single source of truth; the model never
 * re-implements coverage logic. The learner's module-00 one-pager re-opens here as the
 * "before" half of the program-long before/after diff (design-inputs module 15 row).
 */
import { capstoneSeedFiles } from "./capstone-seed";
import { SimFs } from "./sim-fs";
import type { LearnerArtifact, LoopStage, ValidatorRun } from "./types";
import { LOOP_STAGES } from "./types";
import { validateCapstone } from "./validate-capstone";

export interface ChecklistPoint {
  /** Loop stage, or "BEFORE_AFTER" for the eighth contract point. */
  id: LoopStage | "BEFORE_AFTER";
  label: string;
  ok: boolean;
  /** The artifact path the validator resolved, or the gap it named. */
  detail: string;
}

export interface BoundArtifact extends LearnerArtifact {
  /** Repo path the artifact landed at. */
  path: string;
  /** Checklist slot it discharges (or "portfolio" for supporting evidence). */
  slot: LoopStage | "BEFORE_AFTER" | "portfolio";
}

export interface ValidationRecord {
  seq: number;
  exit: number;
  stdout: string;
}

export class CapstoneAssembler {
  fs: SimFs;
  readonly manifestPath = "capstone-manifest.yaml";
  private bound: BoundArtifact[] = [];
  private runs: ValidationRecord[] = [];

  constructor() {
    this.fs = new SimFs();
    this.fs.seed(capstoneSeedFiles());
  }

  // ---- repo editing surface -------------------------------------------------

  manifest(): string {
    return this.fs.read(this.manifestPath) ?? "";
  }

  editManifest(content: string): void {
    this.fs.write(this.manifestPath, content);
  }

  writeFile(path: string, content: string): void {
    this.fs.write(path, content);
  }

  readFile(path: string): string | null {
    return this.fs.read(path);
  }

  // ---- artifact binding (the capstone re-uses prior modules' work) -----------

  /**
   * Bind a prior exercise artifact into the repo at `path`, recording its provenance.
   * E.g. the module-09 policy replaces the placeholder rego; the module-13 evidence
   * records land under evidence/.
   */
  bindArtifact(slot: LoopStage | "portfolio", path: string, artifact: LearnerArtifact): void {
    if (slot !== "portfolio" && !LOOP_STAGES.includes(slot)) {
      throw new Error(`unknown checklist slot: ${slot}`);
    }
    this.fs.write(path, artifact.content);
    this.bound.push({ ...artifact, path, slot });
  }

  /**
   * Bind the learner's module-00 one-pager as the "before" half of the program-long
   * before/after diff — it lands at before/<name> and is tracked as the BEFORE_AFTER input.
   */
  bindBeforeArtifact(artifact: LearnerArtifact): string {
    const path = `before/${artifact.name.split("/").pop()}`;
    this.fs.write(path, artifact.content);
    this.bound.push({ ...artifact, path, slot: "BEFORE_AFTER" });
    return path;
  }

  /** The program-long diff view: the module-00 "before" beside the capstone's after writeup. */
  beforeAfter(): { before: BoundArtifact | null; after: string | null } {
    const before = this.bound.find((b) => b.slot === "BEFORE_AFTER") ?? null;
    const baPath = this.manifest().match(/^before_after:\s*(\S+)\s*$/m)?.[1] ?? "before-after.md";
    return { before, after: this.fs.read(baPath) };
  }

  /** Portfolio view: every bound artifact with its source module and repo path. */
  portfolio(): BoundArtifact[] {
    return this.bound.map((b) => ({ ...b }));
  }

  // ---- validation (single source of truth: the ported validator) -------------

  /** Run the ported validate-capstone against the CURRENT repo state; record the invocation. */
  validate(): ValidatorRun {
    const run = validateCapstone([this.manifestPath], this.fs);
    this.runs.push({ seq: this.runs.length + 1, exit: run.exit, stdout: run.stdout });
    return run;
  }

  /** Validator invocation history (the lab tracks exit codes across attempts). */
  validationHistory(): ValidationRecord[] {
    return this.runs.map((r) => ({ ...r }));
  }

  /**
   * The 8-point contract checklist, parsed from the validator's actual output lines
   * (`  STAGE       ok  -> path` / `  STAGE       MISSING (…)` / before/after lines).
   * Pure inspection — does NOT append to the invocation history (validate() does).
   */
  checklist(): ChecklistPoint[] {
    const run = validateCapstone([this.manifestPath], this.fs);
    const points: ChecklistPoint[] = [];
    for (const stage of LOOP_STAGES) {
      const ok = run.stdout.match(new RegExp(`^  ${stage} +ok  -> (.+)$`, "m"));
      const missing = run.stdout.match(new RegExp(`^  ${stage} +MISSING \\((.+)\\)$`, "m"));
      points.push({
        id: stage,
        label: `${stage} artifact mapped and present`,
        ok: ok !== null,
        detail: ok ? ok[1] : missing ? missing[1] : "not reported",
      });
    }
    const baOk = run.stdout.match(/^ {2}before\/after ok -> (.+)$/m);
    points.push({
      id: "BEFORE_AFTER",
      label: "before/after writeup present (legacy vs engineered, same control)",
      ok: baOk !== null,
      detail: baOk ? baOk[1] : "no before_after pointer or file not found",
    });
    return points;
  }

  /** Ship gate: all 8 points green (== the validator's exit 0). */
  readyToShip(): boolean {
    return this.checklist().every((p) => p.ok);
  }

  // ---- persistence ------------------------------------------------------------

  snapshot(): { version: 1; files: Record<string, string>; bound: BoundArtifact[]; runs: ValidationRecord[] } {
    return {
      version: 1,
      files: this.fs.snapshot(),
      bound: this.bound.map((b) => ({ ...b })),
      runs: this.runs.map((r) => ({ ...r })),
    };
  }

  restore(snap: { version: 1; files: Record<string, string>; bound: BoundArtifact[]; runs: ValidationRecord[] }): void {
    const fresh = new SimFs();
    for (const [path, content] of Object.entries(snap.files)) {
      if (content === "<dir>") fresh.mkdirp(path);
      else fresh.write(path, content);
    }
    this.fs = fresh;
    this.bound = snap.bound.map((b) => ({ ...b }));
    this.runs = snap.runs.map((r) => ({ ...r }));
  }
}

export function createCapstoneAssembler(): CapstoneAssembler {
  return new CapstoneAssembler();
}
