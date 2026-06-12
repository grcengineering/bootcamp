/**
 * Lab-surface session contracts (web ISA Wave 2 — engine dispatch).
 *
 * DOM-free TypeScript: everything here runs identically under `bun test`. The Terminal
 * component renders a `LabSession` — a structural widening of the shell contract that
 * the bash/zsh ShellSession and the PowerShell session satisfy AS-IS (sync results) and
 * that async wrappers (the git surface, whose porcelain rides isomorphic-git promises)
 * satisfy by returning promises. The verifier registry's ProbeSession is a subset of
 * this surface, so one probe path serves every engine class.
 */
import type { ExecEvent, SeedSpec } from "../../../engines/shell/types";
import type { ProbeSession } from "../../../verifiers/registry";

export type { ExecEvent };

export type LabExecResult =
  | { state: "done"; events: ExecEvent[]; exit: number }
  | { state: "pending"; events: ExecEvent[] };

export type MaybePromise<T> = T | Promise<T>;

/** What the Terminal needs to drive any terminal-class engine (shell, pwsh, git, api). */
export interface LabSession extends ProbeSession {
  prompt(): string;
  exec(line: string): MaybePromise<LabExecResult>;
  feedStdin(text: string): MaybePromise<LabExecResult>;
  eof(): MaybePromise<LabExecResult>;
  interrupt(): MaybePromise<LabExecResult>;
  complete(partial: string): { completions: string[]; replacePrefix: string };
  historyUp(): string | null;
  historyDown(): string | null;
  setCols(cols: number): void;
  snapshot(): unknown;
  writeFileAs?(path: string, content: string, provenance: string): void;
  reseedFiles?(seed: SeedSpec): void;
}

/** True when an engine returned a promise (async surface) rather than a sync result. */
export function isThenable<T>(v: MaybePromise<T>): v is Promise<T> {
  return typeof (v as { then?: unknown })?.then === "function";
}

/**
 * Flatten a SeedSpec's home-relative files into a plain name → content map for the
 * console/builder surfaces (directories skipped; `~/` prefix stripped).
 */
export function seedToFileMap(seed: SeedSpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of seed.files) {
    if (f.dir || f.content === undefined) continue;
    out[f.path.replace(/^~\//, "").replace(/^\//, "")] = f.content;
  }
  return out;
}

/** Join exec events into stdout/stderr strings (probe + transcript helpers). */
export function eventText(events: ExecEvent[], stream: "stdout" | "stderr"): string {
  return events.filter((e) => e.stream === stream).map((e) => e.text).join("");
}
