/**
 * Structured-sim builder engine for the 8 non-terminal-primary modules
 * (00, 08, 10, 11, 12, 13, 14, 15) — web ISA ISC-80..88 + ISC-137.
 *
 * Two layers:
 *  1. Ported lab validators — the repo's OWN validators (modules/<m>/labs/) as pure TS
 *     functions, byte-accepted against captured real runs (tests/fixtures/builder-captures.json).
 *  2. Interaction models — editable-file workspace, matching/mapping widget, scoring grid +
 *     decision memo (14), CCM scheduler with time-compression + drift injection + dashboard
 *     tile (13), capstone assembler binding the module-00 artifact (15).
 *
 * All DOM-free; the Lab Player renders these models and routes events.
 */

// shared contract
export type { ValidatorRun, ReadonlyFs, LearnerArtifact, LoopStage } from "./types";
export { LOOP_STAGES } from "./types";
export { SimFs } from "./sim-fs";

// ported validators (ISC-137)
export {
  evaluateAnalysis,
  analyzeDocument,
  LEGACY_PROBLEMS,
  ANALYSIS_STAGES,
  type AnalysisReport,
} from "./evaluate-analysis"; // module 00
export { runGate, extractFailed, mapControl, type FailedCheck, type GateOptions } from "./gate"; // module 08
export { validateCrosswalk } from "./validate-crosswalk"; // module 10
export { validateCoverage } from "./validate-coverage"; // module 11
export { validateOscal } from "./validate-oscal"; // module 12
export {
  normalizeBuckets,
  evaluateControl,
  emitEvidence,
  CCM_CONTROL_ID,
  type EmitResult,
} from "./ccm-check"; // module 13
export {
  computeExposure,
  sampleLosses,
  lossHistogram,
  makeRng,
  percentile,
  runExpectedLoss,
  type RiskInput,
  type ExposureResult,
  type LossHistogram,
} from "./expected-loss"; // module 14
export { validateCapstone, coverageValue, beforeAfterValue } from "./validate-capstone"; // module 15

// interaction models (ISC-80..88)
export { Workspace, createWorkspace, type WorkspaceSeedFile, type WorkspaceSnapshot } from "./workspace";
export { MappingModel, mappingModelFromCsv, type MappingRow, type RowScore } from "./matching";
export {
  ScoringGrid,
  createScoringGrid,
  DECIDING_QUESTIONS,
  REFERENCE_CALLS,
  VALID_CALLS,
  validateMemo,
  renderMemo,
  memoArtifact,
  type BuildBuyCall,
  type MemoParts,
} from "./scoring-grid";
export {
  CcmScheduler,
  createCcmScheduler,
  seedThirtyOneRowHistory,
  type CcmSchedulerOptions,
  type TickResult,
  type LedgerEntry,
  type DashboardTile,
  type BucketState,
} from "./ccm-scheduler";
export {
  CapstoneAssembler,
  createCapstoneAssembler,
  type ChecklistPoint,
  type BoundArtifact,
  type ValidationRecord,
} from "./capstone-assembler";
export { capstoneSeedFiles, CAPSTONE_MANIFEST, CAPSTONE_MANIFEST_INCOMPLETE } from "./capstone-seed";
