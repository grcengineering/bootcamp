import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Collections are populated by scripts/sync-content.ts from the repo's modules/ + tracks/.
const modules = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/modules" }),
  schema: z
    .object({
      id: z.string(),
      title: z.string(),
      module: z.string().optional(),
      tier: z.coerce.number().optional(),
      loop_stages: z.array(z.string()).optional(),
      tracks: z.array(z.string()).optional(),
      owner: z.string().optional(),
      volatility: z.string().optional(),
      last_reviewed: z.coerce.string().optional(),
      review_due: z.coerce.string().optional(),
      objectives: z.array(z.string()).optional(),
      assessment_passrate_threshold: z.coerce.number().optional(),
      status: z.string().optional(),
    })
    .passthrough(),
});

const tracks = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/tracks" }),
  schema: z.object({ id: z.string(), title: z.string() }).passthrough(),
});

export const collections = { modules, tracks };
