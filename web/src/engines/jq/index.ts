/**
 * jq engine adapter — jq-wasm (REAL jq 1.8.1 compiled to WASM) (web ISA ISC-70).
 *
 * Engine class: real-engine-wasm. Filters are evaluated by the actual jq binary; stdout,
 * stderr, and exit codes are jq's own. The wasm is base64-embedded inside the package's
 * single JS artifact, so the engine is same-origin by construction (ISC-73) — it ships as
 * a lazy-loaded bundle chunk; a copy is also placed at /engines/jq/jq.js by
 * scripts/fetch-engines.ts as the measured payload-budget artifact (budgets.ts).
 *
 * Input contract (modules 01/06 bridge):
 *  - bare filter:  run(".users[].name", { "input.json": … })  → jq <filter> input.json
 *  - taught CLI:   run("jq -r '.[] | .actor' audit-events.json", files) — the terminal
 *    bridge hands the typed line straight through; flags and the file operand are honored.
 */
import * as jq from "jq-wasm";
import type { EngineAdapter, EngineRunResult } from "../adapters";

export const JQ_DEFAULT_INPUT = "input.json";

export interface JqInvocation {
  filter: string;
  flags: string[];
  /** File operand (defaults to input.json when absent). */
  file: string;
}

/** Parse either a bare filter or a `jq …` command line (single/double quotes honored). */
export function parseInvocation(input: string): JqInvocation {
  const trimmed = input.trim();
  if (!/^jq(\s|$)/.test(trimmed)) {
    return { filter: trimmed, flags: [], file: JQ_DEFAULT_INPUT };
  }
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  const [, ...rest] = tokens; // drop "jq"
  const flags: string[] = [];
  let filter: string | null = null;
  let file: string | null = null;
  for (const t of rest) {
    if (t.startsWith("-")) flags.push(t);
    else if (filter === null) filter = t;
    else file = t;
  }
  return { filter: filter ?? ".", flags, file: file ?? JQ_DEFAULT_INPUT };
}

/** Parse newline-delimited JSON values (a 0-exit jq run's stdout); null when not NDJSON. */
export function parseJsonValues(stdout: string): unknown[] | null {
  try {
    return stdout
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as unknown);
  } catch {
    // multi-line pretty output (no -c): not NDJSON; stdout remains authoritative
    return null;
  }
}

/** jq always newline-terminates non-empty streams; normalize wasm-boundary output. */
export function ensureTrailingNewline(text: string): string {
  return text === "" || text.endsWith("\n") ? text : text + "\n";
}

export class JqEngineAdapter implements EngineAdapter {
  readonly id: string;
  private warmed: boolean;

  constructor() {
    this.id = "jq";
    this.warmed = false;
  }

  /** Warm the embedded wasm (first call instantiates; later calls are no-ops). */
  async load(): Promise<void> {
    if (this.warmed) return;
    await jq.version();
    this.warmed = true;
  }

  async run(input: string, files?: Record<string, string>): Promise<EngineRunResult> {
    await this.load();
    const inv = parseInvocation(input);
    const json = files?.[inv.file];
    if (json === undefined) {
      return { stdout: "", stderr: `jq: error: Could not open ${inv.file}: No such file or directory\n`, exit: 2 };
    }
    const r = await jq.raw(json, inv.filter, inv.flags);
    const stdout = ensureTrailingNewline(r.stdout);
    const stderr = ensureTrailingNewline(r.stderr);
    // every output line of a 0-exit non-raw jq run is a JSON value — parsed for verifiers
    const values = r.exitCode === 0 && !inv.flags.includes("-r") ? parseJsonValues(stdout) : null;
    return { stdout, stderr, exit: r.exitCode, ...(values !== null ? { artifacts: { values } } : {}) };
  }

  /** The real engine's version string (provenance surface, e.g. "jq-1.8.1"). */
  async version(): Promise<string> {
    return jq.version();
  }
}
