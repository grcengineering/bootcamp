/**
 * PowerShell engine public contract (web ISA ISC-63/64; authored 2026-06-12).
 *
 * Mirrors the shell contract (src/engines/shell/types.ts) — same method surface — so the
 * Terminal component and the verifier registry drive either engine identically.
 *
 * Honesty rules (web ISA Principles; DESIGN-INPUTS risk 1):
 *  - No production PowerShell-on-WASM exists and the five evidence cmdlets are Windows-only,
 *    so the simulated environment is PINNED: Windows PowerShell 5.1, culture en-US,
 *    box WIN-LAB04, user labuser. Output is produced by RULES (an object pipeline +
 *    a faithful default-formatter), never by canned per-command strings.
 *  - Canon hierarchy (root decision 2026-06-12): the module's committed lab fixtures
 *    (labs/setup.sh bundle shape, labs/sample-bundle-compliant.json) and module-04 §5
 *    worked examples are THE byte canon; formatting rules are authored from Microsoft
 *    Learn documentation and recorded with citations in .ci/fixtures/captured/m04-*.json.
 *  - Documented deliberate divergences from a real PS 5.1 box (each carried in fixture
 *    notes): (1) ConvertTo-Json renders the module/lab canon shape (2-space indent,
 *    inline scalar arrays) — real PS 5.1 4-space output matches neither the module nor
 *    the committed lab bundles; (2) property access on a collection-semantics query
 *    (Get-WinEvent, Get-LocalGroupMember, unfiltered Get-BitLockerVolume) always yields
 *    an array, even for one result — the committed lab bundles require LocalAdmins to be
 *    a JSON array and the happy-path evaluator parses it as one; (3) tables render
 *    without the surrounding blank lines a live console shows (the §5 prose blocks are
 *    the byte canon); (4) registry ScreenSaveTimeOut is seeded numeric per the module's
 *    canonical bundle (real REG_SZ is a string).
 *  - stdout events use \n; files written by the session use \r\n line endings (Windows).
 */

export interface ExecEvent { stream: "stdout" | "stderr"; text: string }

export type ExecResult =
  | { state: "done"; events: ExecEvent[]; exit: number }
  /** Input is an incomplete construct (open @{ }, ( ), { }, quote, or trailing |): the
   *  console is waiting for continuation lines (PS `>> ` prompt). Feed via feedStdin. */
  | { state: "pending"; events: ExecEvent[] };

export interface RunCleanResult { stdout: string; stderr: string; exit: number }

/** One BitLocker volume in the simulated box's BitLocker subsystem. */
export interface BitLockerVolumeSeed {
  MountPoint: string;
  VolumeType: string;
  VolumeStatus: string;
  EncryptionPercentage: number;
}

/** One Security-log record. TimeCreated is ISO local time ("2026-05-27T21:14:03"),
 *  rendered en-US ("5/27/2026 9:14:03 PM") by the formatter — deterministic, no host TZ. */
export interface SecurityEventSeed {
  TimeCreated: string;
  Id: number;
  LevelDisplayName: string;
  ProviderName: string;
  Message: string;
}

export interface LocalGroupMemberSeed {
  ObjectClass: string;
  Name: string;
  PrincipalSource: string;
}

export interface SeedFileSpec { path: string; content: string }

/** The simulated Windows endpoint: typed object stores per named subsystem (module 04 §3). */
export interface WindowsSeed {
  hostname: string;
  bitlockerVolumes: BitLockerVolumeSeed[];
  /** Single Defender status object; insertion order is display order. */
  defenderStatus: Record<string, string | number | boolean>;
  /** Hive-qualified key path (e.g. "HKCU:\\Control Panel\\Desktop") → value name → data. */
  registry: Record<string, Record<string, string | number>>;
  /** Security log, oldest first; Get-WinEvent returns newest first. */
  securityLog: SecurityEventSeed[];
  /** Local account database: group name → members. */
  localGroups: Record<string, LocalGroupMemberSeed[]>;
  /** Authored RSoP report rendered by `gpresult /R` (authored-with-citation fixture). */
  gpresultReport: string;
  /** Optional pre-seeded files under the writable home (C:\Users\labuser). */
  files?: SeedFileSpec[];
}

export interface PowerShellSessionOptions {
  seed: WindowsSeed;
  /** ISO timestamp; sim clock = epoch + real elapsed-ms since session start (ISC-132). */
  epoch: string;
  cols: number;          // live-updatable via setCols()
  user: string;          // e.g. "labuser"
  home: string;          // e.g. "C:\\Users\\labuser"
}

export interface PsSessionSnapshot {
  version: 1;
  vfs: unknown;          // engine-owned serialization
  cwd: string;
  history: string[];
  lastExit: number;
  elapsedMs: number;
  producedBy: Record<string, string>;
}

export interface PowerShellSession {
  /** Current prompt: `PS C:\Users\labuser> `; `>> ` while a continuation is pending. */
  prompt(): string;

  /** Execute one input line (or pasted multi-line text) exactly as typed. */
  exec(line: string): ExecResult;

  /** Continuation lines for a pending multi-line construct. */
  feedStdin(text: string): ExecResult;
  /** Ctrl+D — attempts to close a pending construct; reports the missing-token error. */
  eof(): ExecResult;
  /** Ctrl+C — cancels pending input and returns to a fresh prompt. */
  interrupt(): ExecResult;

  /** Tab completion over cmdlet names (canonical casing) and VFS file names. */
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
  /** Provenance: the exact input line that last wrote this file (ISC-126). */
  producedBy(path: string): string | null;
  /** Re-run a learner script in a CLEAN session (fresh seed, perturbed clock), for
   *  reproducibility checks (ISC-127 / lab task 7 "run it twice"). */
  runScriptClean(path: string, args: string[], opts?: { perturb?: boolean }): RunCleanResult;

  // ---- persistence (ISC-92/135) ----
  snapshot(): PsSessionSnapshot;

  // ---- UI integration surface (parity with the shell contract) ----
  /** Honest editor writes: provenance records what the learner actually did. */
  writeFileAs(path: string, content: string, provenance: string): void;
  /** Restore seeded files WITHOUT touching history or completed state (ISC-117). */
  reseedFiles(seed: WindowsSeed): void;
}

export interface PowerShellEngine {
  create(opts: PowerShellSessionOptions): PowerShellSession;
  restore(snap: PsSessionSnapshot, opts: PowerShellSessionOptions): PowerShellSession;
}
