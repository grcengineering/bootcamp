/**
 * Verifier primitive registry (web ISA ISC-133; RedTeam finding 10).
 *
 * THE closed vocabulary exercise specs may reference. Specs are data: they name a primitive
 * and supply params; all execution semantics live here, unit-tested and mutation-tested
 * (root ISA ISC-77). exercise-lint validates every spec check against this registry's
 * Zod schemas at CI time (root ISA ISC-79).
 *
 * Primitives consume ONLY the engine's public probe API — they never reach into internals.
 */
import { z } from "zod";
import type { ShellSession } from "../engines/shell/types";

/**
 * The probe surface primitives may interrogate — a structural subset of ShellSession that
 * the PowerShell session and the Lab Player's console/builder probe sessions also satisfy.
 * Widening (not changing) the original contract: every ShellSession is a ProbeSession.
 */
export type ProbeSession = Pick<
  ShellSession,
  "prompt" | "history" | "lastExit" | "exists" | "readFile" | "listDir" | "producedBy" | "runScriptClean"
>;

/** A real engine run's observable result (adapters.ts EngineRunResult shape, structural). */
export interface EngineResultProbe {
  stdout: string;
  stderr: string;
  exit: number;
  artifacts?: Record<string, unknown>;
}

/** A ported lab validator's observable result (engines/builders ValidatorRun shape). */
export interface ValidatorRunProbe {
  stdout: string;
  stderr: string;
  exit: number;
}

/** Mapping-widget score snapshot (answer-key diff the builder surface computed). */
export interface MappingScoreProbe {
  correct: number;
  total: number;
}

/**
 * One observed curl exchange against the mock vendor (request side is ground truth — the
 * learner typed it; response status is known only when the output was inspectable, e.g.
 * `curl -i` without piping — recorded as null otherwise, never inferred).
 */
export interface ApiExchangeProbe {
  method: string;
  /** Path WITHOUT query string, e.g. "/api/v2/users". */
  path: string;
  /** `cursor` query param value; null = first page / absent. */
  cursor: string | null;
  /** HTTP status when honestly known (curl -i, unpiped); null = not captured. */
  status: number | null;
}

/** Git repo state snapshot (engines/git GitRepoState shape, cached by the git session). */
export interface RepoStateProbe {
  branch: string | undefined;
  branches: string[];
  headSha: string | null;
  commits: Array<{ oid: string; subject: string; parents: number }>;
}

export interface VerifyContext {
  /** Generated expectations (exercises/transcripts/expectations.json) keyed by task+check. */
  expectations: Record<string, string>;
  /** Key for `from: generated` lookups: `${taskId}:${checkIndex}`. */
  expectationKey: string;
  /** Last engine run (console surfaces: python/sql/policy/jq) — engine_result_equals, policy_decision_is. */
  engineResult?: EngineResultProbe | null;
  /** Last ported-validator run (builder surfaces) — validator_passes. */
  validatorRun?: ValidatorRunProbe | null;
  /** Mapping-widget score (builder mapping surface) — mapping_score_at_least. */
  mappingScore?: MappingScoreProbe | null;
  /** Observed curl exchanges (api surface) — api_pull_complete. */
  apiExchanges?: ApiExchangeProbe[];
  /** Cached git repo state (git surface) — repo_state_matches. */
  repoState?: RepoStateProbe | null;
}

export interface VerifyOutcome {
  pass: boolean;
  /** Shown to the learner on pass — the evidence that satisfied the check (web ISA ISC-119). */
  evidence: string;
  /** Shown on fail — names the gap, never the answer (UX pattern 2). */
  gap: string;
}

type Runner<P> = (session: ProbeSession, params: P, ctx: VerifyContext) => VerifyOutcome;

export interface Primitive<S extends z.ZodTypeAny = z.ZodTypeAny> {
  kind: string;
  params: S;
  run: Runner<z.infer<S>>;
}

/** Identity helper that preserves each primitive's inferred param type (keeps `run` fully typed). */
function definePrimitive<S extends z.ZodTypeAny>(p: { kind: string; params: S; run: Runner<z.infer<S>> }): Primitive<S> {
  return p;
}

const valueOrGenerated = z.object({
  value: z.string().optional(),
  from: z.literal("generated").optional(),
}).refine((v) => (v.value !== undefined) !== (v.from === "generated"), {
  message: "exactly one of value | from:generated",
});

function resolveExpected(p: { value?: string; from?: "generated" }, ctx: VerifyContext): string {
  if (p.from === "generated") {
    const v = ctx.expectations[ctx.expectationKey];
    if (v === undefined) throw new Error(`missing generated expectation: ${ctx.expectationKey}`);
    return v;
  }
  return p.value!;
}

const norm = (s: string) => s.replace(/\n$/, "");

export const PRIMITIVES = {
  file_exists: definePrimitive({
    kind: "file_exists",
    params: z.object({ check: z.literal("file_exists"), path: z.string() }),
    run: (s, p) => ({
      pass: s.exists(p.path),
      evidence: `${p.path} exists`,
      gap: `${p.path} does not exist yet`,
    }),
  }),

  file_absent: definePrimitive({
    kind: "file_absent",
    params: z.object({ check: z.literal("file_absent"), path: z.string() }),
    run: (s, p) => ({
      pass: !s.exists(p.path),
      evidence: `${p.path} is absent`,
      gap: `${p.path} should not exist`,
    }),
  }),

  file_content_equals: definePrimitive({
    kind: "file_content_equals",
    params: z.object({ check: z.literal("file_content_equals"), path: z.string() })
      .and(valueOrGenerated),
    run: (s, p, ctx) => {
      const got = s.readFile(p.path);
      const want = resolveExpected(p, ctx);
      const pass = got !== null && norm(got) === norm(want);
      return {
        pass,
        evidence: `${p.path} contains ${JSON.stringify(norm(want))}`,
        gap: got === null
          ? `${p.path} does not exist yet`
          : `${p.path} doesn't contain the expected result yet`,
      };
    },
  }),

  file_content_matches: definePrimitive({
    kind: "file_content_matches",
    params: z.object({ check: z.literal("file_content_matches"), path: z.string(), regex: z.string() }),
    run: (s, p) => {
      const got = s.readFile(p.path);
      const pass = got !== null && new RegExp(p.regex, "m").test(got);
      return {
        pass,
        evidence: `${p.path} matches /${p.regex}/`,
        gap: got === null ? `${p.path} does not exist yet` : `${p.path} doesn't match the expected pattern yet`,
      };
    },
  }),

  file_not_matches: definePrimitive({
    kind: "file_not_matches",
    params: z.object({ check: z.literal("file_not_matches"), path: z.string(), regex: z.string() }),
    run: (s, p) => {
      const got = s.readFile(p.path);
      const pass = got !== null && !new RegExp(p.regex, "m").test(got);
      return {
        pass,
        evidence: `${p.path} is clean of /${p.regex}/`,
        gap: got === null ? `${p.path} does not exist yet` : `${p.path} contains something this task forbids — re-read the constraint`,
      };
    },
  }),

  last_exit_code: definePrimitive({
    kind: "last_exit_code",
    params: z.object({ check: z.literal("last_exit_code"), equals: z.number().int() }),
    run: (s, p) => ({
      pass: s.lastExit() === p.equals,
      evidence: `last exit code was ${p.equals}`,
      gap: `the last command's exit code was ${s.lastExit()}, looking for ${p.equals}`,
    }),
  }),

  history_contains: definePrimitive({
    kind: "history_contains",
    params: z.object({ check: z.literal("history_contains"), regex: z.string() }),
    run: (s, p) => ({
      pass: s.history().some((h) => new RegExp(p.regex).test(h)),
      evidence: `a command matching /${p.regex}/ was run`,
      gap: `no command matching the expected shape has been run yet`,
    }),
  }),

  /**
   * Provenance constraint (web ISA ISC-126): inspects the command line that PRODUCED an
   * artifact — composition rules verify how the result was made, not keystrokes.
   */
  artifact_produced_by: definePrimitive({
    kind: "artifact_produced_by",
    params: z.object({
      check: z.literal("artifact_produced_by"),
      path: z.string(),
      min_pipes: z.number().int().min(0).optional(),
      required_commands: z.array(z.string()).optional(),
      forbidden_commands: z.array(z.string()).optional(),
    }),
    run: (s, p) => {
      const line = s.producedBy(p.path);
      if (line === null) return { pass: false, evidence: "", gap: `${p.path} hasn't been produced by a command yet` };
      const segments = splitPipeline(line);
      const cmds = segments.map(firstWord);
      const pipes = segments.length - 1;
      if (p.min_pipes !== undefined && pipes < p.min_pipes)
        return { pass: false, evidence: "", gap: `the producing command used ${pipes} pipe(s); compose with at least ${p.min_pipes}` };
      for (const rc of p.required_commands ?? [])
        if (!cmds.includes(rc)) return { pass: false, evidence: "", gap: `the composition should include ${rc}` };
      for (const fc of p.forbidden_commands ?? [])
        if (cmds.includes(fc)) return { pass: false, evidence: "", gap: `${fc} is an all-in-one shortcut here — compose small programs instead` };
      return { pass: true, evidence: `produced by: ${line}`, gap: "" };
    },
  }),

  stream_separated: definePrimitive({
    kind: "stream_separated",
    params: z.object({
      check: z.literal("stream_separated"),
      clean_file: z.string(),
      error_file: z.string(),
      error_regex: z.string(),
    }),
    run: (s, p) => {
      const clean = s.readFile(p.clean_file);
      const errs = s.readFile(p.error_file);
      const re = new RegExp(p.error_regex, "m");
      if (clean === null) return { pass: false, evidence: "", gap: `${p.clean_file} does not exist yet` };
      if (errs === null) return { pass: false, evidence: "", gap: `${p.error_file} does not exist yet` };
      if (re.test(clean)) return { pass: false, evidence: "", gap: `${p.clean_file} is contaminated — the complaint belongs on stderr` };
      if (!re.test(errs)) return { pass: false, evidence: "", gap: `${p.error_file} doesn't hold the collection complaint yet` };
      return { pass: true, evidence: `evidence is clean; complaint captured in ${p.error_file}`, gap: "" };
    },
  }),

  /** Reproducibility (web ISA ISC-127): clean re-runs with perturbed clock/entropy must agree. */
  script_reproducible: definePrimitive({
    kind: "script_reproducible",
    params: z.object({
      check: z.literal("script_reproducible"),
      path: z.string(),
      args: z.array(z.string()).default([]),
      expect_stdout: z.string().optional(),
    }),
    run: (s, p) => {
      if (!s.exists(p.path)) return { pass: false, evidence: "", gap: `${p.path} does not exist yet` };
      const a = s.runScriptClean(p.path, p.args, { perturb: true });
      const b = s.runScriptClean(p.path, p.args, { perturb: true });
      if (a.exit !== 0 || b.exit !== 0)
        return { pass: false, evidence: "", gap: `the script exited non-zero (${a.exit || b.exit}) in a clean environment` };
      if (a.stdout !== b.stdout)
        return { pass: false, evidence: "", gap: "two clean runs disagreed — something non-deterministic leaked into the evidence" };
      if (p.expect_stdout !== undefined && norm(a.stdout) !== norm(p.expect_stdout))
        return { pass: false, evidence: "", gap: "the script runs, but its evidence isn't the expected result yet" };
      return { pass: true, evidence: `two clean runs produced identical evidence: ${JSON.stringify(norm(a.stdout))}`, gap: "" };
    },
  }),

  cwd_is: definePrimitive({
    kind: "cwd_is",
    params: z.object({ check: z.literal("cwd_is"), path: z.string() }),
    run: (s, p) => {
      const here = s.readFile === undefined ? "" : currentDir(s);
      return {
        pass: here === p.path,
        evidence: `working directory is ${p.path}`,
        gap: `you're standing in ${here} — the prompt is the first witness`,
      };
    },
  }),

  /**
   * Real-engine result check (console surfaces — python/sql/policy/jq): the LAST engine
   * run's stream must equal the expected text (trailing-newline normalized, same rule as
   * file_content_equals); optionally the exit code too. The result comes from the real
   * engine — this primitive only compares, never simulates.
   */
  engine_result_equals: definePrimitive({
    kind: "engine_result_equals",
    params: z.object({
      check: z.literal("engine_result_equals"),
      stream: z.enum(["stdout", "stderr"]).default("stdout"),
      exit: z.number().int().optional(),
    }).and(valueOrGenerated),
    run: (_s, p, ctx) => {
      const r = ctx.engineResult;
      if (!r) return { pass: false, evidence: "", gap: "run your code against the engine first" };
      const want = resolveExpected(p, ctx);
      if (p.exit !== undefined && r.exit !== p.exit)
        return { pass: false, evidence: "", gap: `the engine exited ${r.exit}, looking for ${p.exit}` };
      const got = p.stream === "stderr" ? r.stderr : r.stdout;
      if (norm(got) !== norm(want))
        return { pass: false, evidence: "", gap: `the engine's ${p.stream} isn't the expected result yet` };
      return { pass: true, evidence: `engine ${p.stream} was ${JSON.stringify(norm(want))}`, gap: "" };
    },
  }),

  /**
   * Ported lab-validator gate (builder surfaces): the LAST validator run must exit with
   * the expected code (default 0 = pass), optionally with stdout matching a pattern.
   * The validator is the repo's own ported check — single source of truth (ISC-137).
   */
  validator_passes: definePrimitive({
    kind: "validator_passes",
    params: z.object({
      check: z.literal("validator_passes"),
      exit: z.number().int().default(0),
      stdout_matches: z.string().optional(),
    }),
    run: (_s, p, ctx) => {
      const r = ctx.validatorRun;
      if (!r) return { pass: false, evidence: "", gap: "run the validator against your work first" };
      if (r.exit !== p.exit)
        return { pass: false, evidence: "", gap: `the validator exited ${r.exit}, looking for ${p.exit} — its output names the gap` };
      if (p.stdout_matches !== undefined && !new RegExp(p.stdout_matches, "m").test(r.stdout))
        return { pass: false, evidence: "", gap: "the validator ran, but its verdict isn't the expected one yet" };
      return {
        pass: true,
        evidence: `validator exited ${p.exit}${p.stdout_matches ? ` and reported /${p.stdout_matches}/` : ""}`,
        gap: "",
      };
    },
  }),

  /**
   * Mapping-widget score floor (builder mapping surfaces — crosswalk, coverage map):
   * the answer-key diff must show at least `min_correct` rows (and/or `min_fraction`)
   * fully correct. The score is computed by the surface from the closed answer key.
   */
  mapping_score_at_least: definePrimitive({
    kind: "mapping_score_at_least",
    params: z.object({
      check: z.literal("mapping_score_at_least"),
      min_correct: z.number().int().min(0).optional(),
      min_fraction: z.number().min(0).max(1).optional(),
    }).refine((v) => v.min_correct !== undefined || v.min_fraction !== undefined, {
      message: "at least one of min_correct | min_fraction",
    }),
    run: (_s, p, ctx) => {
      const m = ctx.mappingScore;
      if (!m) return { pass: false, evidence: "", gap: "score your mapping first (run the check)" };
      if (p.min_correct !== undefined && m.correct < p.min_correct)
        return { pass: false, evidence: "", gap: `${m.correct} of ${m.total} rows are right so far — keep going (${p.min_correct} needed)` };
      if (p.min_fraction !== undefined && m.total > 0 && m.correct / m.total < p.min_fraction)
        return { pass: false, evidence: "", gap: `${m.correct} of ${m.total} rows are right so far — keep going` };
      return { pass: true, evidence: `${m.correct} of ${m.total} mapping rows correct`, gap: "" };
    },
  }),

  /**
   * Complete paginated evidence pull (api surface, ISC-76/77): every required cursor
   * ("" = the first, cursor-less page) must have been requested with GET against the
   * collection. Request side is ground truth (the learner typed it). Response status is
   * honored when honestly known (curl -i, unpiped): the LAST observed exchange for a
   * required cursor must not be a known non-200 — unknown statuses don't fail the check
   * (specs that need strict status gating pair this with history_contains on `curl -i`).
   */
  api_pull_complete: definePrimitive({
    kind: "api_pull_complete",
    params: z.object({
      check: z.literal("api_pull_complete"),
      collection: z.string(),
      cursors: z.array(z.string()).min(1),
    }),
    run: (_s, p, ctx) => {
      const log = ctx.apiExchanges ?? [];
      const onCollection = log.filter((e) => e.method === "GET" && e.path === p.collection);
      if (onCollection.length === 0)
        return { pass: false, evidence: "", gap: `no GET request to ${p.collection} observed yet` };
      for (const want of p.cursors) {
        const wantCursor = want === "" ? null : want;
        const hits = onCollection.filter((e) => e.cursor === wantCursor);
        if (hits.length === 0)
          return {
            pass: false,
            evidence: "",
            gap: want === ""
              ? `the first page of ${p.collection} hasn't been pulled yet`
              : `a page of ${p.collection} is still missing — follow pagination.next_cursor until it is null`,
          };
        const last = hits[hits.length - 1];
        if (last.status !== null && last.status !== 200)
          return {
            pass: false,
            evidence: "",
            gap: `the last pull of that page answered ${last.status} — read the status and the body's message`,
          };
      }
      return { pass: true, evidence: `all ${p.cursors.length} page(s) of ${p.collection} pulled`, gap: "" };
    },
  }),

  /**
   * Policy decision check (policy surface, ISC-71/72): the LAST engine run's decision
   * artifacts (CedarDecision[] from the real evaluator) must show the expected decision
   * at the given request index, optionally determined by a policy whose id matches.
   */
  policy_decision_is: definePrimitive({
    kind: "policy_decision_is",
    params: z.object({
      check: z.literal("policy_decision_is"),
      index: z.number().int().min(0),
      decision: z.enum(["allow", "deny"]),
      reason_includes: z.string().optional(),
    }),
    run: (_s, p, ctx) => {
      const decisions = ctx.engineResult?.artifacts?.["decisions"];
      if (!Array.isArray(decisions))
        return { pass: false, evidence: "", gap: "evaluate your policy against the request set first" };
      const d = decisions[p.index] as { decision?: string; reason?: string[] } | undefined;
      if (!d || typeof d.decision !== "string")
        return { pass: false, evidence: "", gap: `request ${p.index} wasn't evaluated — check the request set ran fully` };
      if (d.decision !== p.decision)
        return {
          pass: false,
          evidence: "",
          gap: `request ${p.index} decided ${d.decision.toUpperCase()}, the scenario requires ${p.decision.toUpperCase()}`,
        };
      if (p.reason_includes !== undefined && !(d.reason ?? []).some((r) => r.includes(p.reason_includes!)))
        return { pass: false, evidence: "", gap: `the decision stands, but not for the policy the scenario expects` };
      return { pass: true, evidence: `request ${p.index} → ${p.decision.toUpperCase()} by the real evaluator`, gap: "" };
    },
  }),

  /**
   * Git repo-state check (git surface, ISC-66): free-form learner flows are verified by
   * REAL repo state (isomorphic-git plumbing via the session's cached state probe) —
   * never by string-matching synthesized porcelain.
   */
  repo_state_matches: definePrimitive({
    kind: "repo_state_matches",
    params: z.object({
      check: z.literal("repo_state_matches"),
      branch: z.string().optional(),
      branches_include: z.array(z.string()).optional(),
      head_subject_matches: z.string().optional(),
      min_commits: z.number().int().min(0).optional(),
    }),
    run: (_s, p, ctx) => {
      const r = ctx.repoState;
      if (!r) return { pass: false, evidence: "", gap: "no git repository state yet — has the repo been initialized?" };
      if (p.branch !== undefined && r.branch !== p.branch)
        return { pass: false, evidence: "", gap: `you're on ${r.branch ?? "no branch"} — the task expects ${p.branch}` };
      for (const b of p.branches_include ?? [])
        if (!r.branches.includes(b))
          return { pass: false, evidence: "", gap: `branch ${b} doesn't exist yet` };
      if (p.min_commits !== undefined && r.commits.length < p.min_commits)
        return { pass: false, evidence: "", gap: `the history has ${r.commits.length} commit(s) — the flow produces at least ${p.min_commits}` };
      if (p.head_subject_matches !== undefined) {
        const head = r.commits[0];
        if (!head || !new RegExp(p.head_subject_matches).test(head.subject))
          return { pass: false, evidence: "", gap: "HEAD's commit message isn't the expected change yet" };
      }
      const facts: string[] = [];
      if (p.branch) facts.push(`on ${p.branch}`);
      if (p.branches_include?.length) facts.push(`branches: ${p.branches_include.join(", ")}`);
      if (p.min_commits !== undefined) facts.push(`${r.commits.length} commit(s)`);
      if (p.head_subject_matches) facts.push(`HEAD: ${r.commits[0]?.subject}`);
      return { pass: true, evidence: `repo state verified — ${facts.join(" · ") || "repository exists"}`, gap: "" };
    },
  }),
};

function currentDir(s: ProbeSession): string {
  // The prompt always tells the truth: parse cwd from it (public API only).
  const m = s.prompt().match(/:([^$]*)\$\s*$/) ?? s.prompt().match(/ ([^ %]*) %\s*$/);
  return m ? m[1].trim() : "";
}

function splitPipeline(line: string): string[] {
  // Split on | outside quotes (verifier-grade parse: provenance lines come from the engine
  // post-parse, so quoting here is simple).
  const out: string[] = []; let cur = ""; let q: string | null = null;
  for (const ch of line) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === "|") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function firstWord(segment: string): string {
  return segment.split(/\s+/)[0] ?? "";
}

export type AnyCheckParams = { check: keyof typeof PRIMITIVES } & Record<string, unknown>;

/** Validate + run one spec check. Throws on unknown primitive or invalid params (lint catches earlier). */
export function runCheck(
  session: ProbeSession,
  raw: AnyCheckParams,
  ctx: VerifyContext,
): VerifyOutcome {
  const prim = PRIMITIVES[raw.check];
  if (!prim) throw new Error(`unknown verifier primitive: ${String(raw.check)}`);
  const params = prim.params.parse(raw);
  return prim.run(session, params as never, ctx);
}

/** Registry descriptor for exercise-lint (root ISA ISC-79) — serializable schema surface. */
export function registryDescriptor(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [kind, prim] of Object.entries(PRIMITIVES)) {
    // param key names for lint-side validation messages
    const shape = (prim.params as unknown as { _def?: unknown });
    out[kind] = Object.keys((shape as { shape?: Record<string, unknown> }).shape ?? {});
  }
  return out;
}
