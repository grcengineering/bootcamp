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

export const ExerciseSpecSchema = z.object({
  id: z.string().regex(/^lab-\d{2}[a-z]?$/),
  module: z.string().min(1),
  title: z.string().min(1),
  owner: z.string().min(1),
  volatility: z.enum(["A", "B", "C"]),
  review_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  engine: z.enum(["shell-linux", "shell-macos", "powershell", "python", "sql", "policy", "api", "git", "builder", "mixed"]),
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
  tasks: z.array(TaskSchema).min(1),
  completion: z.object({ evidence_pack: z.boolean().default(true) }).strict().default({ evidence_pack: true }),
}).strict();

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
