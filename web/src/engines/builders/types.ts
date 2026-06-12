/**
 * Structured-sim builder engine — shared contract (web ISA ISC-80..88, ISC-137).
 *
 * Pure DOM-free TypeScript. Every module's repo-owned lab validator is ported here as a
 * pure function `(argv, fs) → ValidatorRun` whose stdout/stderr/exit are BYTE-IDENTICAL to
 * the real validator process (bash / `bun`), accepted against captured ground truth in
 * web/tests/fixtures/builder-captures.json (produced by web/scripts/capture-builder-fixtures.ts
 * from the committed bytes under modules/<m>/labs/). Honesty class: fixture-pinned port of
 * repo-owned code — never invented output.
 */

/** One validator invocation's observable result — exactly what the real process produced. */
export interface ValidatorRun {
  stdout: string;
  stderr: string;
  exit: number;
}

/** Read-only file access a validator port consumes (mirrors readFileSync/existsSync). */
export interface ReadonlyFs {
  read(path: string): string | null;
  exists(path: string): boolean;
}

/** Internal control-flow signal mirroring `process.exit(n)` in the original validators. */
export class ExitSignal {
  constructor(public readonly code: number) {}
}

/**
 * Output collector mirroring console.log / console.error stream separation.
 * Each call appends one line + "\n", exactly like the originals.
 */
export class Io {
  private out: string;
  private err: string;
  // Explicit constructor: bun's coverage counts implicit field-initializer ctors as unhittable.
  constructor() {
    this.out = "";
    this.err = "";
  }
  log(line: string): void {
    this.out += line + "\n";
  }
  error(line: string): void {
    this.err += line + "\n";
  }
  result(exit: number): ValidatorRun {
    return { stdout: this.out, stderr: this.err, exit };
  }
}

/** Run a ported validator body, translating ExitSignal into a ValidatorRun. */
export function runPort(body: (io: Io) => void): ValidatorRun {
  const io = new Io();
  try {
    body(io);
  } catch (e) {
    if (e instanceof ExitSignal) return io.result(e.code);
    throw e;
  }
  /* istanbul ignore next -- every original terminates via process.exit; defensive only */
  return io.result(0);
}

// ---------------------------------------------------------------------------
// Minimal POSIX path helpers (DOM-free; node:path is unavailable in the browser).
// Semantics match node:path.posix for the path shapes lab specs use.
// ---------------------------------------------------------------------------

export function posixDirname(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  if (i === -1) return ".";
  if (i === 0) return "/";
  return trimmed.slice(0, i);
}

export function posixBasename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i === -1 ? trimmed : trimmed.slice(i + 1);
}

export function posixJoin(...parts: string[]): string {
  const joined = parts.filter((s) => s.length > 0).join("/");
  return normalizePath(joined);
}

/** Collapse `//`, resolve `.` segments (keeps a leading `/`; no `..` resolution needed by labs). */
export function normalizePath(p: string): string {
  const abs = p.startsWith("/");
  const segs = p.split("/").filter((s) => s.length > 0 && s !== ".");
  const out = (abs ? "/" : "") + segs.join("/");
  return out === "" ? "." : out;
}

/** The seven irreducible loop stages (curriculum canon; modules 00/14/15 validators share it). */
export const LOOP_STAGES = [
  "UNDERSTAND",
  "LOCATE",
  "QUERY",
  "EVALUATE",
  "EVIDENCE",
  "MONITOR",
  "OWN",
] as const;
export type LoopStage = (typeof LOOP_STAGES)[number];

/** Cross-module learner artifact (shape compatible with lib/labstate.ts `artifacts` store). */
export interface LearnerArtifact {
  name: string;
  content: string;
  module: string;
}
