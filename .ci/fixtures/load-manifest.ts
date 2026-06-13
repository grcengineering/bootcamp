/**
 * Fragment-aware fidelity-manifest loader (Wave-4 fan-out support).
 *
 * The fidelity manifest is `manifest.yaml` PLUS every `manifest.d/*.yaml` fragment. Each of the
 * nine Wave-4 module agents writes its own fragment under `manifest.d/` so they never touch the
 * shared base file and never collide on a merge. This loader is the SINGLE place that reads and
 * merges them, so every consumer (manifest-lint, exercise-lint, capture, the web fidelity suite,
 * the web replay/seed loaders) sees one coherent manifest with the identical shape it always had:
 *   { meta, seeds, hole_defs, entries }
 *
 * Merge rules (deterministic, fragment order = lexicographic by filename):
 *   - `meta` and `hole_defs` live ONLY in the base — a fragment carrying either is an error
 *     (those are global; fragments add module-scoped entries/seeds, not contracts).
 *   - `entries` — concatenated base-first, then each fragment in filename order. Duplicate `id`
 *     across the whole set is an error (the manifest's primary key is the entry id).
 *   - `seeds` — shallow-merged; a fragment redefining a base seed key (or another fragment's) is
 *     an error (seed profiles are owned by exactly one source).
 *
 * The loader is pure + total: it throws (with the offending file + key) on any collision so a CI
 * gate fails loudly rather than silently dropping a fragment's entries. `manifest.d/` is optional
 * (absent → the base manifest unchanged), so this is fully backwards compatible.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";

export interface ManifestEntry {
  id: string;
  module?: string;
  source: string;
  match: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- entries carry free-form
  // per-class fields (cmd/pre/post/holes/citation/seed/…); legacy readers index them as `any`,
  // matching how the raw YAML was always consumed. The merge logic itself stays typed.
  [k: string]: any;
}

export interface FidelityManifest {
  // `meta` / `seeds` are consumed by many readers via free-form index access (meta.epoch,
  // meta.contracts[source], seeds[id].home, …) exactly as the raw `parse(yaml)` value was.
  // Typing them `any` keeps this loader a drop-in replacement with zero downstream re-typing,
  // while the merge logic below is strongly typed. (Test/CI tooling, not shipped app code.)
  // `seeds` is always returned as a populated object (the merge starts from {...base.seeds}), so
  // it is non-optional — legacy readers index it without an undefined guard, as before.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seeds: Record<string, any>;
  hole_defs?: unknown[];
  entries: ManifestEntry[];
  /** Provenance: which file each entry id came from (base or a fragment) — for error messages. */
  readonly sources: Record<string, string>;
}

/** The directory holding `manifest.yaml` and the `manifest.d/` fragment folder. */
export const FIXTURES_DIR = dirname(new URL(import.meta.url).pathname);

/**
 * Load `manifest.yaml` merged with every `manifest.d/*.yaml` fragment. `dir` defaults to this
 * file's own directory so callers in either package resolve the same path.
 */
export function loadManifest(dir: string = FIXTURES_DIR): FidelityManifest {
  const basePath = join(dir, "manifest.yaml");
  const base = parse(readFileSync(basePath, "utf8")) ?? {};

  const entries: ManifestEntry[] = [...(base.entries ?? [])];
  const seeds: Record<string, unknown> = { ...(base.seeds ?? {}) };
  const sources: Record<string, string> = {};
  const seedOwner: Record<string, string> = {};
  for (const e of entries) {
    if (e?.id) {
      if (sources[e.id]) throw new Error(`manifest.yaml: duplicate entry id '${e.id}'`);
      sources[e.id] = "manifest.yaml";
    }
  }
  for (const k of Object.keys(seeds)) seedOwner[k] = "manifest.yaml";

  const fragDir = join(dir, "manifest.d");
  if (existsSync(fragDir)) {
    const fragments = readdirSync(fragDir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    for (const name of fragments) {
      const frag = parse(readFileSync(join(fragDir, name), "utf8")) ?? {};
      const where = `manifest.d/${name}`;
      if (frag.meta !== undefined)
        throw new Error(`${where}: fragments may not define 'meta' — it is global to manifest.yaml`);
      if (frag.hole_defs !== undefined)
        throw new Error(`${where}: fragments may not define 'hole_defs' — they are global to manifest.yaml`);
      for (const [k, v] of Object.entries((frag.seeds ?? {}) as Record<string, unknown>)) {
        if (seedOwner[k])
          throw new Error(`${where}: seed '${k}' already defined in ${seedOwner[k]} — seeds are owned by one source`);
        seedOwner[k] = where;
        seeds[k] = v;
      }
      for (const e of (frag.entries ?? []) as ManifestEntry[]) {
        if (!e?.id) throw new Error(`${where}: every entry needs an id`);
        if (sources[e.id])
          throw new Error(`${where}: duplicate entry id '${e.id}' (already in ${sources[e.id]})`);
        sources[e.id] = where;
        entries.push(e);
      }
    }
  }

  return {
    meta: base.meta,
    seeds,
    hole_defs: base.hole_defs,
    entries,
    sources,
  };
}
