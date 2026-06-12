/**
 * PowerShell engine entry point (web ISA ISC-63/64).
 *
 * Pure DOM-free TypeScript implementing the contract in ./types.ts. The browser layer
 * renders events and routes keystrokes; the m04 fidelity suite replays every authored
 * fixture (.ci/fixtures/captured/m04-*.json) through createPowerShellEngine().
 */
import type {
  ExecResult,
  PowerShellEngine,
  PowerShellSession,
  PowerShellSessionOptions,
  PsSessionSnapshot,
  RunCleanResult,
  WindowsSeed,
} from "./types";
import { WinVfs, winNormalize, type SerializedWinVfs, type WinFileRecord } from "./vfs";
import { parse } from "./parser";
import { IncompleteInput, PsParseError } from "./lexer";
import { executeStatements, type RunOutcome } from "./interpreter";
import { ALIASES, CMDLETS, type Host } from "./cmdlets";

export type * from "./types";

const CANONICAL_COMMANDS = [
  ...Object.values(CMDLETS).map((c) => c.canonical),
  ...Object.keys(ALIASES),
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

class PsSessionImpl implements PowerShellSession {
  private host: Host;
  private hist: string[] = [];
  private historyCursor = 0;
  private lastExitCode = 0;
  private pendingBuf: string | null = null;
  private startedAt = Date.now();
  private baseElapsed = 0;

  constructor(private opts: PowerShellSessionOptions, snap?: PsSessionSnapshot) {
    const vfs = snap
      ? WinVfs.deserialize(snap.vfs as SerializedWinVfs, opts.home)
      : seededVfs(opts.seed, opts.home);
    this.host = {
      seed: opts.seed,
      vfs,
      cwd: snap?.cwd ?? opts.home,
      cols: opts.cols,
      currentLine: "",
      scriptDepth: 0,
    };
    if (snap) {
      this.hist = [...snap.history];
      this.lastExitCode = snap.lastExit;
      this.baseElapsed = snap.elapsedMs;
    }
    this.historyCursor = this.hist.length;
  }

  prompt(): string {
    return this.pendingBuf !== null ? ">> " : `PS ${this.host.cwd}> `;
  }

  exec(line: string): ExecResult {
    const src = this.pendingBuf !== null ? this.pendingBuf + "\n" + line : line;
    this.pendingBuf = null;
    let outcome: RunOutcome;
    try {
      const statements = parse(src);
      if (src.trim() !== "") {
        this.hist.push(src);
        this.historyCursor = this.hist.length;
      }
      this.host.currentLine = src;
      outcome = executeStatements(this.host, statements);
    } catch (e) {
      if (e instanceof IncompleteInput) {
        this.pendingBuf = src;
        return { state: "pending", events: [] };
      }
      if (e instanceof PsParseError) {
        this.hist.push(src);
        this.historyCursor = this.hist.length;
        this.lastExitCode = 1;
        return { state: "done", events: [{ stream: "stderr", text: e.message + "\n" }], exit: 1 };
      }
      throw e;
    }
    this.lastExitCode = outcome.exit;
    return { state: "done", events: outcome.events, exit: outcome.exit };
  }

  feedStdin(text: string): ExecResult {
    return this.exec(text);
  }

  eof(): ExecResult {
    if (this.pendingBuf === null) {
      return { state: "done", events: [], exit: this.lastExitCode };
    }
    const src = this.pendingBuf;
    this.pendingBuf = null;
    let message = "Incomplete input.";
    try {
      parse(src);
    } catch (e) {
      if (e instanceof IncompleteInput || e instanceof PsParseError) message = e.message;
    }
    this.lastExitCode = 1;
    return { state: "done", events: [{ stream: "stderr", text: message + "\n" }], exit: 1 };
  }

  interrupt(): ExecResult {
    this.pendingBuf = null;
    return { state: "done", events: [], exit: this.lastExitCode };
  }

  complete(partial: string): { completions: string[]; replacePrefix: string } {
    const m = /(\S*)$/.exec(partial)!;
    const word = m[1];
    const lower = word.toLowerCase();
    const fromCommands = CANONICAL_COMMANDS.filter((c) => c.toLowerCase().startsWith(lower));
    const fromFiles = (this.host.vfs.listDir(this.host.cwd, this.host.cwd) ?? []).filter((f) =>
      f.toLowerCase().startsWith(lower),
    );
    const completions = word === "" ? fromCommands : [...new Set([...fromCommands, ...fromFiles])];
    return { completions, replacePrefix: word };
  }

  historyUp(): string | null {
    if (this.historyCursor === 0) return null;
    this.historyCursor--;
    return this.hist[this.historyCursor];
  }

  historyDown(): string | null {
    if (this.historyCursor >= this.hist.length) return null;
    this.historyCursor++;
    return this.historyCursor === this.hist.length ? "" : this.hist[this.historyCursor];
  }

  history(): string[] {
    return [...this.hist];
  }

  lastExit(): number {
    return this.lastExitCode;
  }

  setCols(cols: number): void {
    this.host.cols = cols;
  }

  // ---- verifier probes -------------------------------------------------------------
  exists(path: string): boolean {
    return this.host.vfs.exists(path, this.host.cwd);
  }

  readFile(path: string): string | null {
    return this.host.vfs.read(path, this.host.cwd);
  }

  listDir(path: string): string[] | null {
    return this.host.vfs.listDir(path, this.host.cwd);
  }

  producedBy(path: string): string | null {
    return this.host.vfs.producedBy(path, this.host.cwd);
  }

  /**
   * Reproducibility probe (ISC-127 / lab task 7): the script re-runs in a FRESH seeded
   * session (clean stores, clean home) with a perturbed clock, twice by the caller;
   * agreement is then a property of the learner's script, not of session leftovers.
   * Taught collectors take no parameters; args are accepted for contract parity.
   */
  runScriptClean(path: string, _args: string[], opts?: { perturb?: boolean }): RunCleanResult {
    const content = this.host.vfs.read(path, this.host.cwd);
    if (content === null) {
      return { stdout: "", stderr: `${path}: no such script in this session\n`, exit: 1 };
    }
    const epochMs = Date.parse(this.opts.epoch) + (opts?.perturb ? 97_000 : 0);
    const clean = new PsSessionImpl({ ...this.opts, epoch: new Date(epochMs).toISOString() });
    const scriptName = ".\\__clean-run__.ps1";
    clean.writeFileAs(scriptName, content, "runScriptClean");
    let r = clean.exec(scriptName);
    if (r.state === "pending") r = clean.eof();
    const stdout = r.events.filter((e) => e.stream === "stdout").map((e) => e.text).join("");
    const stderr = r.events.filter((e) => e.stream === "stderr").map((e) => e.text).join("");
    return { stdout, stderr, exit: r.state === "done" ? r.exit : 1 };
  }

  // ---- persistence -----------------------------------------------------------------
  snapshot(): PsSessionSnapshot {
    const blob = this.host.vfs.serialize();
    const produced: Record<string, string> = {};
    for (const f of blob.files) if (f.producedBy !== null) produced[f.path] = f.producedBy;
    return {
      version: 1,
      vfs: blob,
      cwd: this.host.cwd,
      history: [...this.hist],
      lastExit: this.lastExitCode,
      elapsedMs: this.baseElapsed + (Date.now() - this.startedAt),
      producedBy: produced,
    };
  }

  // ---- UI integration --------------------------------------------------------------
  writeFileAs(path: string, content: string, provenance: string): void {
    this.host.vfs.write(path, this.host.cwd, content, provenance);
  }

  reseedFiles(seed: WindowsSeed): void {
    this.host.vfs.resetHome(seedRecords(seed, this.opts.home));
  }
}

function seedRecords(seed: WindowsSeed, home: string): WinFileRecord[] {
  return (seed.files ?? []).map((f) => ({
    path: winNormalize(f.path, home),
    content: f.content,
    producedBy: null,
  }));
}

function seededVfs(seed: WindowsSeed, home: string): WinVfs {
  const vfs = new WinVfs(home);
  for (const rec of seedRecords(seed, home)) vfs.write(rec.path, home, rec.content, null);
  return vfs;
}

export function createPowerShellEngine(): PowerShellEngine {
  return {
    create: (opts: PowerShellSessionOptions) => new PsSessionImpl(opts),
    restore: (snap: PsSessionSnapshot, opts: PowerShellSessionOptions) => new PsSessionImpl(opts, snap),
  };
}
