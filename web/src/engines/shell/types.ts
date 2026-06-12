/**
 * Shell engine public contract (web ISA ISC-35..52; frozen 2026-06-12).
 *
 * Pure DOM-free TypeScript. The browser layer renders and routes keystrokes; ALL simulation
 * logic lives behind this interface and runs identically under `bun test`, where the fidelity
 * suite replays every captured fixture (.ci/fixtures/captured/*.json) through it.
 *
 * Honesty rules (web ISA Principles):
 *  - Output is replayed reality (fixtures define acceptance), produced by faithful
 *    implementation — never invented "plausible" text.
 *  - The simulated machine is a SPECIFIC declared box (the env-contract image). Commands the
 *    box lacks fail exactly as the box fails (captured negative space).
 *  - Fictional lab tools run as the SAME script bytes the capture container ran
 *    (seed `tools` are bash sources interpreted by this engine).
 */

export type ShellVariant = "bash-linux" | "zsh-macos";

export interface SeedFile {
  path: string;          // absolute, or ~-relative to home
  content?: string;      // utf8 (omit for dir)
  dir?: boolean;
  mode?: number;         // default 0o644 files / 0o755 dirs
}

export interface SeedSpec {
  files: SeedFile[];
  /** PATH tools: name → bash script source (installed at /usr/local/bin/<name>, mode 0755). */
  tools: Record<string, string>;
}

export interface ShellSessionOptions {
  variant: ShellVariant;
  seed: SeedSpec;
  /** ISO timestamp; sim clock = epoch + real elapsed-ms since session start (ISC-132). */
  epoch: string;
  cols: number;          // live-updatable via setCols()
  user: string;          // e.g. "analyst"
  host: string;          // e.g. "workstation"
  home: string;          // e.g. "/home/analyst"
}

export interface ExecEvent { stream: "stdout" | "stderr"; text: string }

export type ExecResult =
  | { state: "done"; events: ExecEvent[]; exit: number }
  /** Command is waiting on stdin (e.g. `cat` with no args). Feed via feedStdin/eof/interrupt. */
  | { state: "pending"; events: ExecEvent[] };

export interface SessionSnapshot {
  version: 1;
  variant: ShellVariant;
  vfs: unknown;          // engine-owned serialization
  env: Record<string, string>;
  cwd: string;
  history: string[];
  lastExit: number;
  elapsedMs: number;
  producedBy: Record<string, string>;
}

export interface RunCleanResult { stdout: string; stderr: string; exit: number }

export interface ShellSession {
  /** Current prompt, e.g. `analyst@workstation:~/lab01$ ` (zsh variant: `analyst@mac ~ %`). */
  prompt(): string;

  /** Execute one input line exactly as typed (pipes, redirs, ;/&&/||, heredocs, $(), globs). */
  exec(line: string): ExecResult;

  /** Interactive stdin for pending commands. */
  feedStdin(text: string): ExecResult;
  /** Ctrl+D. */
  eof(): ExecResult;
  /** Ctrl+C — also cancels pending input; returns the ^C event + fresh-prompt state. */
  interrupt(): ExecResult;

  /** Tab completion over commands (PATH + builtins) and VFS paths. */
  complete(partial: string): { completions: string[]; replacePrefix: string };

  historyUp(): string | null;
  historyDown(): string | null;
  history(): string[];
  lastExit(): number;

  setCols(cols: number): void;

  // ---- verifier probes (closed registry uses ONLY these) ----
  exists(path: string): boolean;
  readFile(path: string): string | null;
  listDir(path: string): string[] | null;
  /** Provenance: the exact input line that last wrote this file (ISC-126 artifact_produced_by). */
  producedBy(path: string): string | null;
  /**
   * Re-run a learner script in a CLEAN sub-environment with perturbed clock/entropy,
   * twice; used by reproducibility checks (ISC-127).
   */
  runScriptClean(path: string, args: string[], opts?: { perturb?: boolean }): RunCleanResult;

  // ---- persistence (ISC-92/135) ----
  snapshot(): SessionSnapshot;

  // ---- optional UI integration surface (added 2026-06-12 post-review; additive) ----
  /**
   * Honest editor writes (nano panel): writes a file with explicit provenance so
   * `producedBy` records "nano <file>" instead of a synthetic heredoc the learner never typed.
   */
  writeFileAs?(path: string, content: string, provenance: string): void;
  /** Restore the exercise's seeded files/tools WITHOUT touching history, env, cwd (ISC-117). */
  reseedFiles?(seed: SeedSpec): void;
}

export interface ShellEngine {
  create(opts: ShellSessionOptions): ShellSession;
  restore(snap: SessionSnapshot, opts: ShellSessionOptions): ShellSession;
}
