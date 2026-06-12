/**
 * Builder host (web ISA ISC-80..88, ISC-137 — Lab Player side).
 *
 * Binds an exercise spec's `builder:` block to the structured-sim models in
 * src/engines/builders: the editable-file Workspace, the matching/mapping widget,
 * the module-14 scoring grid, the module-13 CCM scheduler (declared time-compression
 * control), and the module-15 capstone assembler.
 *
 * The validator registry below is CODE, not data: a spec names a validator from the
 * closed enum (exercise-spec BuilderSpecSchema); all execution semantics live in the
 * ported validators, which are byte-accepted against the repo's real lab checks
 * (ISC-137). The host never re-implements a verdict.
 *
 * DOM-free; unit-tested under `bun test`.
 */
import type { ExerciseSpec } from "../../../lib/exercise-spec";
import type { MappingScoreProbe, ProbeSession, ValidatorRunProbe } from "../../../verifiers/registry";
import {
  CapstoneAssembler,
  CcmScheduler,
  MappingModel,
  ScoringGrid,
  Workspace,
  createCapstoneAssembler,
  createCcmScheduler,
  createScoringGrid,
  createWorkspace,
  evaluateAnalysis,
  mappingModelFromCsv,
  runExpectedLoss,
  runGate,
  validateCapstone,
  validateCoverage,
  validateCrosswalk,
  validateOscal,
  type ReadonlyFs,
  type ValidatorRun,
} from "../../../engines/builders";

export type BuilderSpec = NonNullable<ExerciseSpec["builder"]>;

/** Closed validator registry (names = BuilderSpecSchema enum; semantics = ported code). */
export const VALIDATORS: Record<string, (argv: string[], fs: ReadonlyFs) => ValidatorRun> = {
  "evaluate-analysis": (argv, fs) => {
    const content = fs.read(argv[0] ?? "");
    if (content === null) return { stdout: "", stderr: `no such file: ${argv[0] ?? "(missing argv)"}\n`, exit: 2 };
    return evaluateAnalysis(content);
  },
  gate: (argv, fs) => runGate(argv, fs),
  crosswalk: (argv, fs) => validateCrosswalk(argv, fs),
  coverage: (argv, fs) => validateCoverage(argv, fs),
  oscal: (argv, fs) => validateOscal(argv, fs),
  "expected-loss": (argv, fs) => runExpectedLoss(argv, fs),
  capstone: (argv, fs) => validateCapstone(argv, fs),
};

export interface BuilderSnapshot {
  v: 1;
  surface: BuilderSpec["surface"];
  workspace?: ReturnType<Workspace["snapshot"]>;
  mapping?: ReturnType<MappingModel["snapshot"]>;
  grid?: ReturnType<ScoringGrid["snapshot"]>;
  capstone?: ReturnType<CapstoneAssembler["snapshot"]>;
  runs: string[];
}

export class BuilderHost {
  readonly surface: BuilderSpec["surface"];
  readonly workspace: Workspace;
  readonly mapping: MappingModel | null;
  readonly grid: ScoringGrid | null;
  readonly ccm: CcmScheduler | null;
  readonly capstone: CapstoneAssembler | null;
  private readonly builder: BuilderSpec;
  private lastValidator: ValidatorRun | null = null;
  private lastScore: MappingScoreProbe | null = null;
  private runs: string[] = [];

  constructor(builder: BuilderSpec, seedFiles: Record<string, string>) {
    this.builder = builder;
    this.surface = builder.surface;
    this.workspace = createWorkspace(
      Object.entries(seedFiles).map(([path, content]) => ({
        path,
        content,
        readOnly: isReadOnlySeed(builder, path),
      })),
    );
    this.mapping =
      builder.surface === "mapping" && builder.mapping
        ? mappingModelFromCsv(seedFiles[builder.mapping.seed_file] ?? "left,target,label\n", {
            leftCols: builder.mapping.left_cols,
            targets: builder.mapping.targets,
            labels: builder.mapping.labels,
          })
        : null;
    this.grid = builder.surface === "scoring-grid" ? createScoringGrid() : null;
    this.ccm =
      builder.surface === "ccm" && builder.ccm
        ? createCcmScheduler({
            seedStateJson: seedFiles[builder.ccm.state_file] ?? "{}",
            startIso: builder.ccm.start,
            intervalHours: builder.ccm.interval_hours_options[0] ?? 24,
          })
        : null;
    this.capstone = builder.surface === "capstone" ? createCapstoneAssembler() : null;
  }

  /**
   * Run the spec-named validator against the CURRENT surface state. The mapping surface
   * first writes its CSV into the workspace (the exact bytes the real validator reads)
   * and scores against the answer key when one is configured.
   */
  runValidator(): ValidatorRun {
    const name = this.builder.validator;
    if (!name) {
      this.lastValidator = { stdout: "", stderr: "this exercise has no validator configured\n", exit: 64 };
      return this.lastValidator;
    }
    if (this.mapping && this.builder.mapping) {
      this.workspace.write(this.builder.mapping.seed_file, this.mapping.toCsv());
      this.scoreMapping();
    }
    // The capstone surface's repo IS the assembler's SimFs (`-e dir/` semantics intact).
    const fs: ReadonlyFs = this.capstone ? this.capstone.fs : this.workspace;
    let run: ValidatorRun;
    try {
      run = VALIDATORS[name]!(this.builder.validator_args, fs);
    } catch (e) {
      // The original bun/bash validators crash with the error on stderr (e.g. ENOENT on a
      // missing input) and a non-zero exit — mirrored, never swallowed.
      run = { stdout: "", stderr: `${e instanceof Error ? e.message : String(e)}\n`, exit: 1 };
    }
    this.lastValidator = run;
    this.runs.push(`validator:${name} ${this.builder.validator_args.join(" ")}`.trim());
    return run;
  }

  /** Mapping answer-key diff (mapping_score_at_least probe). */
  scoreMapping(): MappingScoreProbe | null {
    if (!this.mapping || !this.builder.mapping?.key_file) return this.lastScore;
    const keyCsv = this.workspace.read(this.builder.mapping.key_file);
    if (keyCsv === null) return null;
    const key = parseKeyCsv(keyCsv, this.builder.mapping.left_cols);
    const scores = this.mapping.scoreAgainstKey(key);
    this.lastScore = { correct: scores.filter((s) => s.correct).length, total: scores.length };
    return this.lastScore;
  }

  /** Scoring-grid validation rides the same validatorRun seam (happy-path.sh wording). */
  validateGrid(): ValidatorRun {
    if (!this.grid) return { stdout: "", stderr: "not a scoring-grid surface\n", exit: 64 };
    const v = this.grid.validate();
    this.lastValidator = v.pass
      ? { stdout: "PASS: all 7 loop stages carry a valid BUILD/BUY/HYBRID call\n", stderr: "", exit: 0 }
      : { stdout: "", stderr: v.failures.join("\n") + "\n", exit: 1 };
    this.runs.push("validator:scoring-grid");
    return this.lastValidator;
  }

  /** Capstone validation through the assembler (its own validator binding). */
  validateCapstoneRepo(): ValidatorRun {
    if (!this.capstone) return { stdout: "", stderr: "not a capstone surface\n", exit: 64 };
    const run = this.capstone.validate();
    this.lastValidator = run;
    this.runs.push("validator:capstone");
    return run;
  }

  /** CCM ticks feed the same seam: the latest run's check verdict is the validator run. */
  ccmTick(n = 1): ValidatorRun {
    if (!this.ccm) return { stdout: "", stderr: "not a ccm surface\n", exit: 64 };
    const results = this.ccm.run(n);
    const last = results[results.length - 1]!;
    this.lastValidator = {
      stdout: `${last.capturedAt} ${last.runId} rc=${last.rc}${last.alertPath ? ` alert=${last.alertPath}` : ""}\n`,
      stderr: "",
      exit: last.rc,
    };
    this.runs.push(`ccm:tick x${n}`);
    return this.lastValidator;
  }

  lastValidatorRun(): ValidatorRunProbe | null {
    return this.lastValidator;
  }

  lastMappingScore(): MappingScoreProbe | null {
    return this.lastScore;
  }

  snapshot(): BuilderSnapshot {
    return {
      v: 1,
      surface: this.surface,
      workspace: this.workspace.snapshot(),
      ...(this.mapping ? { mapping: this.mapping.snapshot() } : {}),
      ...(this.grid ? { grid: this.grid.snapshot() } : {}),
      ...(this.capstone ? { capstone: this.capstone.snapshot() } : {}),
      runs: [...this.runs],
    };
  }

  restore(snap: BuilderSnapshot): void {
    if (snap.workspace) this.workspace.restore(snap.workspace);
    if (snap.mapping && this.mapping) this.mapping.restore(snap.mapping);
    if (snap.grid && this.grid) this.grid.restore(snap.grid);
    if (snap.capstone && this.capstone) this.capstone.restore(snap.capstone);
    this.runs = [...snap.runs];
    this.lastValidator = null; // verdicts are real validator output only — re-run to re-earn
    this.lastScore = null;
  }

  /** The registry-facing probe (file_* primitives see the workspace; history sees runs). */
  probeSession(): ProbeSession {
    return {
      prompt: () => "builder ",
      history: () => [...this.runs],
      lastExit: () => this.lastValidator?.exit ?? -1,
      exists: (p) => this.readAny(p) !== null,
      readFile: (p) => this.readAny(p),
      listDir: () => this.workspace.list(),
      producedBy: () => null,
      runScriptClean: () => ({ stdout: "", stderr: "builder surfaces verify via validator_passes", exit: 64 }),
    };
  }

  private readAny(p: string): string | null {
    const norm = p.replace(/^~\//, "").replace(/^\//, "");
    if (this.capstone) {
      const fromRepo = this.capstone.readFile(norm);
      if (fromRepo !== null) return fromRepo;
    }
    return this.workspace.read(norm);
  }
}

/** Answer keys and reference validators are read-only seeds; everything else is editable. */
function isReadOnlySeed(builder: BuilderSpec, path: string): boolean {
  return builder.mapping?.key_file === path;
}

function parseKeyCsv(csv: string, leftCols: number): Array<{ target: string; label: string }> {
  return csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(1)
    .map((l) => {
      const cells = l.split(",").map((c) => c.trim());
      return { target: cells[leftCols] ?? "", label: cells[leftCols + 1] ?? "" };
    });
}
