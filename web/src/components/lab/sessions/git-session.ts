/**
 * Git terminal session (web ISA ISC-66 — Lab Player side).
 *
 * The module-05 surface is the familiar terminal: the shell engine runs everything
 * EXCEPT `git …` lines, which route to the GitEngineAdapter (real isomorphic-git state,
 * synthesized porcelain — the adapter's declared honesty class). Free-form learner flows
 * are verified by REPO STATE via the cached `state()` probe, never by porcelain strings.
 *
 * Worktree truth: the shell VFS is what the learner sees and edits (nano, redirects);
 * before every git command the lab directory is mirrored into the adapter's worktree
 * (one-way create/update — file deletion flows are outside the porcelain's taught
 * surface and route to the real-machine lab, documented divergence).
 *
 * Determinism: the adapter clock is a pinned ramp off the sim epoch (+60s per git
 * command), so snapshot/restore REPLAYS the recorded git commands and reproduces
 * identical SHAs — the same content-addressing argument the fidelity suite relies on.
 *
 * DOM-free; unit-tested under `bun test`.
 */
import type { ShellSession } from "../../../engines/shell/types";
import type { GitEngineAdapter, GitRepoState } from "../../../engines/git";
import type { RepoStateProbe } from "../../../verifiers/registry";
import { isThenable, type LabExecResult, type LabSession, type MaybePromise } from "./types";

export interface GitSessionSnapshot {
  v: 1;
  shell: unknown;
  /** Every `git …` line executed, in order (replayed on restore — deterministic SHAs). */
  gitCommands: string[];
  history: string[];
  lastExit: number;
}

export interface GitSessionOptions {
  /** ISO sim epoch (ISC-132) — seeds the deterministic commit-clock ramp. */
  epoch: string;
  /** Worktree directory (defaults to the adapter's, normally ~/lab05). */
  dir?: string;
}

export class GitTerminalSession implements LabSession {
  private readonly shell: ShellSession;
  private readonly git: GitEngineAdapter;
  private readonly epochSec: number;
  private gitCommands: string[] = [];
  private hist: string[] = [];
  private cursor = 0;
  private exit = 0;
  private cachedState: GitRepoState | null = null;
  private onStateChange: (() => void) | null = null;
  /** Serializes git commands (multi-line paste must not interleave mirror/clock/commit). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(shell: ShellSession, git: GitEngineAdapter, opts: GitSessionOptions, onStateChange?: () => void) {
    this.shell = shell;
    this.git = git;
    this.epochSec = Math.floor(Date.parse(opts.epoch) / 1000);
    this.onStateChange = onStateChange ?? null;
    this.bumpClock();
  }

  /** Pinned ramp: epoch + 60s per executed git command (deterministic, replayable). */
  private bumpClock(): void {
    const n = this.gitCommands.length;
    this.git.setClock(() => ({ timestamp: this.epochSec + 60 * (n + 1), timezoneOffset: 0 }));
  }

  /** Cached repo state for repo_state_matches (refreshed after every git command). */
  repoState(): RepoStateProbe | null {
    return this.cachedState;
  }

  exec(line: string): MaybePromise<LabExecResult> {
    if (/^\s*git(\s|$)/.test(line)) {
      const next = this.queue.then(() => this.execGit(line));
      this.queue = next.catch(() => undefined);
      return next;
    }
    const r = this.shell.exec(line);
    const record = (res: LabExecResult): LabExecResult => {
      if (line.trim() !== "") { this.hist.push(line); this.cursor = this.hist.length; }
      if (res.state === "done") this.exit = res.exit;
      return res;
    };
    return isThenable(r) ? r.then(record) : record(r);
  }

  private async execGit(line: string): Promise<LabExecResult> {
    this.hist.push(line);
    this.cursor = this.hist.length;
    this.mirrorWorktree();
    this.bumpClock();
    const r = await this.git.run(line.trim());
    this.gitCommands.push(line.trim());
    this.exit = r.exit;
    try {
      this.cachedState = await this.git.state();
    } catch {
      this.cachedState = null; // pre-init: no repo state yet
    }
    this.onStateChange?.();
    const events: LabExecResult["events"] = [];
    if (r.stdout !== "") events.push({ stream: "stdout", text: r.stdout });
    if (r.stderr !== "") events.push({ stream: "stderr", text: r.stderr });
    return { state: "done", events, exit: r.exit };
  }

  /** One-way mirror of the shell lab dir into the adapter worktree (create/update). */
  private mirrorWorktree(): void {
    const dir = this.git.dir;
    const walk = (abs: string, rel: string): void => {
      const entries = this.shell.listDir(abs);
      if (entries === null) return;
      for (const name of entries) {
        if (name === "." || name === ".." || name === ".git") continue;
        const childAbs = `${abs}/${name}`;
        const childRel = rel === "" ? name : `${rel}/${name}`;
        const content = this.shell.readFile(childAbs);
        if (content !== null) this.git.writeFile(childRel, content);
        else walk(childAbs, childRel); // directory
      }
    };
    walk(dir, "");
  }

  /** Editor writes land in BOTH worlds (shell VFS provenance + git worktree mirror). */
  writeFileAs(path: string, content: string, provenance: string): void {
    this.shell.writeFileAs?.(path, content, provenance);
    this.mirrorWorktree(); // keeps `git status` honest before the next git command
  }

  snapshot(): GitSessionSnapshot {
    return {
      v: 1,
      shell: this.shell.snapshot(),
      gitCommands: [...this.gitCommands],
      history: [...this.hist],
      lastExit: this.exit,
    };
  }

  /** Replay the recorded git commands against a fresh adapter (deterministic SHAs). */
  async restoreGit(snap: GitSessionSnapshot): Promise<void> {
    this.hist = [...snap.history];
    this.cursor = this.hist.length;
    this.exit = snap.lastExit;
    for (const cmd of snap.gitCommands) {
      this.mirrorWorktree();
      this.bumpClock();
      await this.git.run(cmd);
      this.gitCommands.push(cmd);
    }
    try {
      this.cachedState = await this.git.state();
    } catch {
      this.cachedState = null;
    }
    this.onStateChange?.();
  }

  // ---- history is wrapper-owned (git lines must recall like any other) --------------
  history(): string[] { return [...this.hist]; }
  historyUp(): string | null {
    if (this.cursor === 0) return null;
    this.cursor--;
    return this.hist[this.cursor] ?? null;
  }
  historyDown(): string | null {
    if (this.cursor >= this.hist.length) return null;
    this.cursor++;
    return this.cursor === this.hist.length ? "" : this.hist[this.cursor]!;
  }
  lastExit(): number { return this.exit; }

  // ---- delegation ---------------------------------------------------------------------
  prompt(): string { return this.shell.prompt(); }
  feedStdin(text: string): MaybePromise<LabExecResult> { return this.shell.feedStdin(text); }
  eof(): MaybePromise<LabExecResult> { return this.shell.eof(); }
  interrupt(): MaybePromise<LabExecResult> { return this.shell.interrupt(); }
  complete(partial: string) { return this.shell.complete(partial); }
  setCols(cols: number) { this.shell.setCols(cols); }
  exists(p: string) { return this.shell.exists(p); }
  readFile(p: string) { return this.shell.readFile(p); }
  listDir(p: string) { return this.shell.listDir(p); }
  producedBy(p: string) { return this.shell.producedBy(p); }
  runScriptClean(p: string, args: string[], opts?: { perturb?: boolean }) {
    return this.shell.runScriptClean(p, args, opts);
  }
  reseedFiles(seed: Parameters<NonNullable<ShellSession["reseedFiles"]>>[0]): void {
    this.shell.reseedFiles?.(seed);
  }
}
