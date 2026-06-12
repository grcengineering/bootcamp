/**
 * Uniform engine-adapter contract (web ISA ISC-66..73).
 *
 * Every real (WASM) engine — sql.js, Cedar, OPA, isomorphic-git, jq, Pyodide — is wrapped
 * behind this one interface so the Lab Player drives them identically: load lazily, run an
 * input against seeded files, get a terminal-shaped result back.
 *
 * Honesty rules (web ISA Principles):
 *  - Adapters are THIN: results come from the real engine, never from canned strings.
 *    The only synthesized text is declared rendering (git porcelain — fixture-verified;
 *    SQL list-mode table — a rendering of real engine rows, labeled in the adapter).
 *  - DOM-free: every adapter core runs identically under `bun test`. Browser-only loader
 *    glue (worker bootstrap, URL fetching) lives in separate `browser.ts`/`worker.ts`
 *    files, marked as excluded from the coverage gate.
 *  - Same-origin only (ISC-73): loaders take injected sources (bytes or app-local URLs);
 *    no adapter ever embeds a third-party URL.
 */

/** Terminal-shaped result every engine returns. */
export interface EngineRunResult {
  stdout: string;
  stderr: string;
  /** 0 success; non-zero mirrors the real tool's failure semantics. */
  exit: number;
  /**
   * Structured engine output for verifiers (closed registry / domain-native test
   * artifacts): SQL result sets, Cedar decisions, OPA result sets, git state, parsed jq
   * values, Python expression repr. Never required for rendering — stdout/stderr stand alone.
   */
  artifacts?: Record<string, unknown>;
}

export interface EngineAdapter {
  /** Stable engine id (matches exercise.yaml `engine:` values / budgets.ts keys). */
  readonly id: string;
  /**
   * Idempotent lazy initialization (compile/instantiate WASM, open DB, boot interpreter).
   * Heavy work happens here — construction must stay cheap so reading pages never pay.
   */
  load(): Promise<void>;
  /**
   * Run one input against the engine.
   * @param input engine-native input: SQL text, Cedar policy source, OPA input JSON,
   *              a `git …` command line, a jq filter (or `jq …` invocation), Python source.
   * @param files seeded/learner files visible to the run (path → utf8 content).
   */
  run(input: string, files?: Record<string, string>): Promise<EngineRunResult>;
}

/** Convenience constructors used across adapters (keeps result shaping uniform). */
export function ok(stdout: string, artifacts?: Record<string, unknown>): EngineRunResult {
  return { stdout, stderr: "", exit: 0, ...(artifacts ? { artifacts } : {}) };
}

export function fail(stderr: string, exit = 1, artifacts?: Record<string, unknown>): EngineRunResult {
  return { stdout: "", stderr, exit, ...(artifacts ? { artifacts } : {}) };
}

/** Normalizes thrown values into a printable message without losing engine detail. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}
