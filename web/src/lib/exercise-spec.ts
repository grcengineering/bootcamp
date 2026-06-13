/**
 * Exercise spec schema (style/EXERCISE-SPEC.md) — shared by the app (render/verify) and
 * .ci/exercise-lint.ts (CI gate). Specs are data; this schema is the shape police.
 */
import { z } from "zod";

export const HintSchema = z.union([
  z.object({ nudge: z.string().min(1) }).strict(),
  z.object({ concept: z.string().min(1) }).strict(),
  z.object({ reveal: z.string().min(1) }).strict(),
]);

export const CheckSchema = z
  .object({ check: z.string().min(1) })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]));

export const TaskSchema = z.object({
  id: z.string().regex(/^t\d+[a-z]?$/),
  type: z.enum(["action", "reflection"]),
  objective: z.array(z.number().int().positive()).min(1),
  instruction: z.string().min(1),
  verify: z.array(CheckSchema).default([]),
  hints: z.array(HintSchema).default([]),
  explain: z.string().optional(),
}).strict().superRefine((t, ctx) => {
  if (t.type === "action") {
    if (t.verify.length === 0)
      ctx.addIssue({ code: "custom", message: `action task ${t.id} needs ≥1 verify check` });
    if (t.hints.length < 2)
      ctx.addIssue({ code: "custom", message: `action task ${t.id} needs a hint ladder (≥2 rungs)` });
    const last = t.hints[t.hints.length - 1];
    if (last && !("reveal" in last))
      ctx.addIssue({ code: "custom", message: `action task ${t.id}'s last hint rung must be a reveal` });
  }
  if (t.type === "reflection" && t.verify.length > 0)
    ctx.addIssue({ code: "custom", message: `reflection task ${t.id} must not be machine-gated (ISC-74)` });
});

export const SeedFileRef = z.object({
  path: z.string(),
  from: z.string(),
}).strict();

/**
 * Console-surface configuration (engines: python | sql | policy | jq) — all optional,
 * additive (module-01's spec is unchanged; older specs parse identically).
 */
export const ConsoleSpecSchema = z.object({
  /** policy engine flavor: cedar = live authoring (default), opa = precompiled + input mutation. */
  flavor: z.enum(["cedar", "opa"]).optional(),
  /** Seeded file opened in the editable buffer (default: the first seeded file). */
  main_file: z.string().optional(),
  /** Seeded files passed to every engine run (e.g. requests.json/entities.json, *.sql, input.json). */
  assets: z.array(z.string()).default([]),
  /** Run-button label (default per engine). */
  run_label: z.string().optional(),
}).strict();

/**
 * Visual-surface seed (engine: visual) — the Inspect-&-Assemble island's payload
 * (VISUAL-ENGINE-SPEC §1.1). The artifact names the REAL committed bytes the oracle parses;
 * `oracle` names which ported engine produces the parse tree / state machine; `mode` selects
 * the surface. The spec stays data — all parse/state-machine logic lives in engine code.
 */
export const VisualSpecSchema = z.object({
  artifact: z.object({
    /** What kind of real artifact the oracle parses (the canary uses `pcap`). */
    kind: z.enum([
      "pcap", "dns-msg", "doh-json", "pem-chain", "jwt", "saml-xml",
      "oci-manifest", "syslog-5424", "set-cookie", "forwarded", "http-cache",
      "openapi", "wsdl", "graphql-sdl", "proto", "grpc-http2", "json-store", "kv-store",
      "responsibility-matrix",
    ]),
    /** Provenance: the committed real fixture under .ci/fixtures/assets/. */
    from: z.string(),
  }),
  /**
   * Which ported oracle produces the parse tree / state machine (the canary uses `pkt`).
   * `csa` is the MAP-mode label for the cited Cloud Security Alliance / AWS shared-responsibility
   * matrix — not a byte parser but the committed authoritative key the `mapping_correct` verifier
   * reads (the cited matrix IS the oracle for a conceptual MAP module; VISUAL-ENGINE-SPEC §1.4).
   */
  oracle: z.enum(["pkt", "dns", "x509", "jwt", "xform", "tls13", "dnsres", "oauth", "hdr", "oas", "wsdl", "sdl", "proto", "pbwire", "gqlsim", "syslog", "oci", "saml", "csa"]),
  /** Surface mode (PEEL fully implemented for the canary; TRACE/MAP stubbed for later waves). */
  mode: z.enum(["peel", "trace", "map", "build-and-break", "diff-the-trace"]),
}).strict();

/** Builder-surface configuration (engine: builder) — names which widget model renders. */
export const BuilderSpecSchema = z.object({
  surface: z.enum(["workspace", "mapping", "scoring-grid", "ccm", "capstone"]),
  /** Ported validator (closed registry in the builder host — code, not data). */
  validator: z.enum([
    "evaluate-analysis", "gate", "crosswalk", "coverage", "oscal", "expected-loss", "capstone",
  ]).optional(),
  /** argv for the validator (paths into the workspace). */
  validator_args: z.array(z.string()).default([]),
  mapping: z.object({
    /** How many leading CSV columns are fixed identity columns. */
    left_cols: z.number().int().min(1),
    /** Seed CSV file (workspace path). */
    seed_file: z.string(),
    /** Closed vocabularies offered by the widget. */
    targets: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
    /** Answer-key CSV (workspace path) for the per-row score (mapping_score_at_least). */
    key_file: z.string().optional(),
  }).strict().optional(),
  ccm: z.object({
    /** Seed state-document file (workspace path). */
    state_file: z.string(),
    /** ISO start of the schedule (declared time compression starts here). */
    start: z.string(),
    /** Bucket name offered by the drift-injection control. */
    drift_bucket: z.string(),
    /** Selectable hours-per-tick choices (declared compression control). */
    interval_hours_options: z.array(z.number().int().min(1)).default([24]),
  }).strict().optional(),
}).strict();

export const ExerciseSpecSchema = z.object({
  id: z.string().regex(/^lab-\d{2}[a-z]?$/),
  module: z.string().min(1),
  title: z.string().min(1),
  owner: z.string().min(1),
  volatility: z.enum(["A", "B", "C"]),
  review_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  engine: z.enum(["shell-linux", "shell-macos", "powershell", "python", "sql", "policy", "jq", "api", "git", "builder", "visual", "mixed"]),
  claim_thread: z.string().optional(),
  payload_budget_bytes: z.number().int().min(0).default(0),
  desktop_recommended: z.boolean().default(false),
  seed: z.object({
    profile: z.string(),
    home: z.string(),
    files: z.array(SeedFileRef).default([]),
    path_tools: z.array(z.string()).default([]),
  }).strict(),
  intro: z.string().min(1),
  walkthrough_first_input: z.string().optional(),
  /** Console-surface config (python/sql/policy/jq engines only) — optional, additive. */
  console: ConsoleSpecSchema.optional(),
  /** Builder-surface config (builder engine only) — optional, additive. */
  builder: BuilderSpecSchema.optional(),
  /** Visual-surface config (visual engine only) — optional, additive (VISUAL-ENGINE-SPEC §1.1). */
  visual: VisualSpecSchema.optional(),
  tasks: z.array(TaskSchema).min(1),
  completion: z.object({ evidence_pack: z.boolean().default(true) }).strict().default({ evidence_pack: true }),
}).strict().superRefine((s, ctx) => {
  const CONSOLE_ENGINES: string[] = ["python", "sql", "policy", "jq"];
  if (s.engine === "builder" && !s.builder)
    ctx.addIssue({ code: "custom", message: "engine: builder requires a builder: block (surface selection)" });
  if (s.builder && s.engine !== "builder")
    ctx.addIssue({ code: "custom", message: `builder: block is only valid with engine: builder (got ${s.engine})` });
  if (s.console && !CONSOLE_ENGINES.includes(s.engine))
    ctx.addIssue({ code: "custom", message: `console: block is only valid with engines ${CONSOLE_ENGINES.join("|")} (got ${s.engine})` });
  if (s.builder?.surface === "mapping" && !s.builder.mapping)
    ctx.addIssue({ code: "custom", message: "builder.surface: mapping requires builder.mapping config" });
  if (s.builder?.surface === "ccm" && !s.builder.ccm)
    ctx.addIssue({ code: "custom", message: "builder.surface: ccm requires builder.ccm config" });
  if (s.engine === "visual" && !s.visual)
    ctx.addIssue({ code: "custom", message: "engine: visual requires a visual: block (artifact + oracle + mode)" });
  if (s.visual && s.engine !== "visual")
    ctx.addIssue({ code: "custom", message: `visual: block is only valid with engine: visual (got ${s.engine})` });
});

export type ExerciseSpec = z.infer<typeof ExerciseSpecSchema>;

/** Keys that smuggle code into data — banned anywhere in a spec (RedTeam finding 10). */
export const BANNED_KEYS = ["expr", "js", "script", "eval", "code", "exec"];

export function findBannedKeys(node: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(node)) node.forEach((v, i) => hits.push(...findBannedKeys(v, `${path}[${i}]`)));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (BANNED_KEYS.includes(k)) hits.push(`${path}.${k}`);
      hits.push(...findBannedKeys(v, `${path}.${k}`));
    }
  }
  return hits;
}
