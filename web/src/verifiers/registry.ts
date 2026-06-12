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

export interface VerifyContext {
  /** Generated expectations (exercises/transcripts/expectations.json) keyed by task+check. */
  expectations: Record<string, string>;
  /** Key for `from: generated` lookups: `${taskId}:${checkIndex}`. */
  expectationKey: string;
}

export interface VerifyOutcome {
  pass: boolean;
  /** Shown to the learner on pass — the evidence that satisfied the check (web ISA ISC-119). */
  evidence: string;
  /** Shown on fail — names the gap, never the answer (UX pattern 2). */
  gap: string;
}

type Runner<P> = (session: ShellSession, params: P, ctx: VerifyContext) => VerifyOutcome;

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
        gap: got === null ? `${p.path} does not exist yet` : `${p.path} contains content that belongs elsewhere (stream separation)`,
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
};

function currentDir(s: ShellSession): string {
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
  session: ShellSession,
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
