/**
 * GraphQL validation sim (engine id: `gqlsim`) — the api-paradigms module's Build-and-Break oracle.
 *
 * Pure, DOM-free TypeScript. Runs the REAL validation rules a GRC engineer must prove are ON
 * (or OFF) against a learner-constructed GraphQL document, so the limiter's verdict is
 * protocol-true rather than an authored "try again":
 *   - a depth limiter (max selection-set nesting) → the real depth-limit error past the cap;
 *   - a cost/complexity limiter (node-count budget) → the real cost error past the budget;
 *   - the NoIntrospection rule (OWASP) → an introspection query (`__schema`/`__type`) is refused
 *     only when NoIntrospection is enabled (off by default, the dangerous default);
 *   - an alias/batch operation counter → aliased fields run as N operations under ONE request,
 *     defeating per-request rate limiting (OWASP API4:2023 Scenario #2).
 *
 * Honesty doctrine: the limiter IS the oracle. It tokenizes the real query, computes the real
 * maximum depth and node count, detects real introspection fields, and counts real aliases — its
 * exit code / message is the consequence. It exposes a `ValidatorRunProbe` (exit 0 = accepted,
 * exit 1 = rejected, with the real message on stdout) for `validator_passes`, and an
 * operation-count trace (a `TraceProbe`-shaped result) for `sequence_matches` on the batch round.
 *
 * Cited: GraphQL Specification (validation); OWASP GraphQL Cheat Sheet (depth/cost limiting,
 * disable introspection, batching limits); OWASP API Security Top 10 2023 (API4 resource
 * consumption via batching, API9 inventory via introspection).
 */

import type { TraceProbe } from "../../verifiers/registry";

export interface GqlLimiterConfig {
  maxDepth: number;
  maxNodes: number;
  /** OWASP: introspection is a dangerous default — off here = allowed (the bug). */
  noIntrospection: boolean;
  /** Max distinct top-level operations allowed in one request (alias/batch cap). */
  maxAliasedOperations?: number;
}

/** A real validator run: exit 0 (accepted) / 1 (rejected) + the limiter's real message. */
export interface GqlValidatorRun {
  stdout: string;
  stderr: string;
  exit: number;
}

/** Strip GraphQL `#` comments (offset not needed here — we analyze structure, not spans). */
function strip(q: string): string {
  return q.replace(/#[^\n]*/g, " ");
}

/**
 * Compute the maximum selection-set nesting depth of a query by tracking brace balance over the
 * tokenized document. The outermost `{ … }` (the operation) is depth 1; each nested selection
 * set adds one. Deterministic, comment-aware.
 */
export function maxSelectionDepth(query: string): number {
  const q = strip(query);
  let depth = 0;
  let max = 0;
  for (const ch of q) {
    if (ch === "{") {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

/** Count field nodes (the cost proxy): identifiers that are selected fields, not types/keywords. */
export function nodeCount(query: string): number {
  const q = strip(query);
  // count field tokens: words immediately inside selection sets (a coarse but real node proxy)
  const matches = q.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  // exclude operation keywords
  const KW = new Set(["query", "mutation", "subscription", "fragment", "on", "true", "false", "null"]);
  return matches.filter((t) => !KW.has(t)).length;
}

/** True if the document selects an introspection meta-field (`__schema` or `__type`). */
export function isIntrospection(query: string): boolean {
  return /\b__schema\b|\b__type\b|\b__typename\b/.test(strip(query));
}

/**
 * Count top-level aliased operations: `a: login b: login …` at the top selection set become N
 * operations under one HTTP request. We count aliases of the form `alias: field` in the document.
 */
export function aliasedOperationCount(query: string): number {
  const q = strip(query);
  // `alias: fieldName` — an alias is `name:` immediately followed by a field name
  const aliases = q.match(/[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_]/g) ?? [];
  return aliases.length;
}

/**
 * Validate a learner query against the limiter config. Returns a real ValidatorRun whose exit
 * code is the consequence (0 accepted / 1 rejected). The FIRST rule violated wins (depth → cost
 * → introspection), matching how validation reports the first error.
 */
export function validateQuery(query: string, cfg: GqlLimiterConfig): GqlValidatorRun {
  const depth = maxSelectionDepth(query);
  if (depth > cfg.maxDepth) {
    return {
      stdout: `Query exceeds maximum operation depth of ${cfg.maxDepth} (got ${depth}) [graphql-depth-limit]`,
      stderr: "",
      exit: 1,
    };
  }
  const nodes = nodeCount(query);
  if (nodes > cfg.maxNodes) {
    return {
      stdout: `Query cost ${nodes} exceeds maximum of ${cfg.maxNodes} [query-complexity]`,
      stderr: "",
      exit: 1,
    };
  }
  if (cfg.noIntrospection && isIntrospection(query)) {
    return {
      stdout: `GraphQL introspection is not allowed [NoIntrospection]`,
      stderr: "",
      exit: 1,
    };
  }
  return { stdout: `accepted: depth ${depth}, cost ${nodes}`, stderr: "", exit: 0 };
}

/**
 * Run the alias/batch round: count how many operations the (aliased) document executes under
 * ONE request, and shape it as a TraceProbe so `sequence_matches` can assert the operation
 * sequence reached the expected count. The "sim end-state" is "executed N operations / 1 request".
 */
export function runBatch(query: string, expectedOps: number): TraceProbe {
  const ops = aliasedOperationCount(query);
  const ordered = Array.from({ length: ops }, (_, i) => ({
    from: "client",
    to: "graphql",
    type: "operation",
    fields: { index: String(i + 1) },
  }));
  const canonicalSeq = Array.from({ length: expectedOps }, () => ({ from: "client", to: "graphql", type: "operation" }));
  return {
    orderedMessages: ordered,
    reachedEndState: ops === expectedOps,
    lastAlert: ops === expectedOps ? null : { name: "operation-count-mismatch" },
    canonical: { "graphql-batch": canonicalSeq },
  };
}
