/**
 * Statement evaluator (web ISA ISC-63/64): runs parsed pipelines against the Host,
 * routing object streams between stages and rendering only at the console boundary.
 * Also executes learner scripts (.\Collect-EndpointCompliance.ps1) through the SAME
 * interpreter as interactive input — no second semantics (root decision 2026-06-12).
 */
import { parse, type Expr, type Pipeline, type Stage } from "./parser";
import { PsParseError, IncompleteInput } from "./lexer";
import { formatValues } from "./formatter";
import {
  ALIASES,
  CMDLETS,
  CmdletError,
  MUTATING_VERBS,
  type CmdletResult,
  type Host,
} from "./cmdlets";
import { makeObject, type PsValue } from "./values";
import type { ExecEvent } from "./types";

const MAX_SCRIPT_DEPTH = 8;

export { CmdletError } from "./cmdlets";

export interface RunOutcome { events: ExecEvent[]; exit: number }

/** Parse + run a source text (one or many statements). Parse errors become stderr. */
export function executeSource(host: Host, src: string): RunOutcome {
  let statements: Pipeline[];
  try {
    statements = parse(src);
  } catch (e) {
    if (!(e instanceof PsParseError) && !(e instanceof IncompleteInput)) throw e;
    return { events: [{ stream: "stderr", text: e.message + "\n" }], exit: 1 };
  }
  return executeStatements(host, statements);
}

export function executeStatements(host: Host, statements: Pipeline[]): RunOutcome {
  const events: ExecEvent[] = [];
  let exit = 0;
  for (const p of statements) {
    try {
      const r = executeStatement(host, p);
      events.push(...r.events);
      exit = r.exit;
    } catch (e) {
      if (e instanceof CmdletError) {
        events.push({ stream: "stderr", text: e.message + "\n" });
        exit = 1;
        continue;
      }
      throw e;
    }
  }
  return { events, exit };
}

function executeStatement(host: Host, p: Pipeline): RunOutcome {
  // Learner scripts run standalone: `.\Collect-EndpointCompliance.ps1`
  if (p.head.kind === "cmd" && isScriptPath(p.head.stage.name)) {
    if (p.stages.length > 0 || p.redirect !== null || p.head.stage.args.length > 0) {
      throw new CmdletError(`${p.head.stage.name} : this lab's taught subset runs scripts standalone (no arguments, pipes, or redirection on the script call).`);
    }
    return runScript(host, p.head.stage.name);
  }

  const result = evalPipeline(host, p);
  const text = formatValues(result.values, host.cols);
  if (p.redirect !== null) {
    host.vfs.write(p.redirect, host.cwd, text.replace(/\n/g, "\r\n"), host.currentLine);
    return { events: [], exit: 0 };
  }
  return { events: text === "" ? [] : [{ stream: "stdout", text }], exit: 0 };
}

function isScriptPath(name: string): boolean {
  return name.startsWith(".\\") || name.startsWith("./");
}

/** Run a learner script through the SAME interpreter; failing statements stream their
 *  error and the script continues (PowerShell's non-terminating default). */
function runScript(host: Host, name: string): RunOutcome {
  const content = host.vfs.read(name, host.cwd);
  if (content === null) {
    throw new CmdletError(notRecognized(name));
  }
  if (host.scriptDepth >= MAX_SCRIPT_DEPTH) {
    throw new CmdletError(`${name} : script call depth exceeded the lab's runaway budget — execution stopped. [sim boundary]`);
  }
  host.scriptDepth++;
  try {
    return executeSource(host, content);
  } finally {
    host.scriptDepth--;
  }
}

export function evalPipeline(host: Host, p: Pipeline): CmdletResult {
  let current: CmdletResult | null = null;
  if (p.head.kind === "cmd") {
    current = runCommand(host, p.head.stage, null);
  } else {
    const v = evalValue(host, p.head.expr);
    current = Array.isArray(v)
      ? { values: v, collection: true }
      : { values: [v], collection: false };
  }
  for (const stage of p.stages) {
    current = runCommand(host, stage, current);
  }
  return current;
}

export function runCommand(host: Host, stage: Stage, input: CmdletResult | null): CmdletResult {
  const lower = stage.name.toLowerCase();
  const resolved = ALIASES[lower] ?? lower;
  const entry = CMDLETS[resolved];
  if (entry) {
    return entry.run({ host, evalValue: (e) => evalValue(host, e) }, stage.args, input);
  }
  const verb = lower.split("-")[0];
  if (lower.includes("-") && MUTATING_VERBS.includes(verb)) {
    throw new CmdletError(
      `${stage.name} : this simulated evidence session is read-only by construction — a collector observes and changes nothing (module 04 §4.8). [sim boundary]`,
    );
  }
  throw new CmdletError(notRecognized(stage.name));
}

/** Real PS 5.1 CommandNotFoundException text (Microsoft Learn, "term is not recognized"). */
function notRecognized(name: string): string {
  return (
    `${name} : The term '${name}' is not recognized as the name of a cmdlet, function, ` +
    `script file, or operable program. Check the spelling of the name, or if a path was ` +
    `included, verify that the path is correct and try again.`
  );
}

export function evalValue(host: Host, e: Expr): PsValue {
  switch (e.t) {
    case "lit": return e.v;
    case "bare": return e.v;
    case "arr": return e.items.map((i) => evalValue(host, i));
    case "hash": return { psType: "hash", entries: e.entries.map(([k, v]) => [k, evalValue(host, v)] as [string, PsValue]) };
    case "pscustom":
      return makeObject(
        "System.Management.Automation.PSCustomObject",
        e.entries.map(([k, v]) => [k, evalValue(host, v)] as [string, PsValue]),
      );
    case "paren": {
      const r = evalPipeline(host, e.inner);
      if (e.member !== null) return projectMember(r, e.member);
      if (r.collection) return r.values;
      return r.values.length === 1 ? r.values[0] : r.values;
    }
    default:
      throw new CmdletError("Filter blocks { $_.Property ... } only apply inside Where-Object in this lab's taught subset.");
  }
}

/**
 * Member access on a pipeline result. `.Count` counts the stream (PS 5.1+: scalars
 * expose .Count too — module 04 §4.5 note). Property access enumerates; results from
 * collection-semantics queries KEEP array shape (lab-bundle canon — see types.ts).
 */
function projectMember(r: CmdletResult, member: string): PsValue {
  if (member.toLowerCase() === "count") return r.values.length;
  const projected = r.values.map((v) => {
    if (typeof v === "object" && v !== null && !Array.isArray(v) && v.psType === "object") {
      const lower = member.toLowerCase();
      for (const [k, val] of v.entries) if (k.toLowerCase() === lower) return val;
      return null;
    }
    return null;
  });
  if (r.collection) return projected;
  return projected.length === 1 ? projected[0] : projected;
}
