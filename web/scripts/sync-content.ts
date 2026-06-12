// Build-time bridge: curriculum markdown + meta.yaml -> Astro content collections.
// ONE SOURCE OF TRUTH: curriculum is authored in ../../modules and ../../tracks; this script
// projects it into src/content/ so Astro can render it. Never hand-edit src/content/*.
// Runs before `astro build`/`astro dev` (see package.json). Frontmatter scalars are quoted so
// js-yaml (Astro's frontmatter parser, YAML 1.1) does not coerce dates to Date objects.
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", ".."); // web/scripts -> web -> repo root
const MODULES = join(REPO, "modules");
const TRACKS = join(REPO, "tracks");
const FIXTURES = join(REPO, ".ci", "fixtures");
const BADGES_YAML = join(REPO, "badges.yaml");
const OUT_MODULES = join(HERE, "..", "src", "content", "modules");
const OUT_TRACKS = join(HERE, "..", "src", "content", "tracks");
const OUT_LABS = join(HERE, "..", "src", "content", "labs");
const OUT_CONTENT = join(HERE, "..", "src", "content");

function reset(dir: string) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
function firstH1(md: string): string | null {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}
function stripFirstH1(md: string): string {
  return md.replace(/^#\s+.+?(\n|$)/, "");
}
// Build frontmatter with every string scalar quoted (safe for YAML 1.1 / js-yaml).
function frontmatter(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(String(x))).join(", ")}]`);
    } else if (typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else if (typeof v === "boolean") {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(String(v))}`);
    }
  }
  return lines.join("\n");
}

reset(OUT_MODULES);
reset(OUT_TRACKS);

let moduleCount = 0;
for (const id of readdirSync(MODULES).sort()) {
  const dir = join(MODULES, id);
  if (!statSync(dir).isDirectory()) continue;
  const mdPath = join(dir, "module.md");
  if (!existsSync(mdPath)) continue;
  const body = readFileSync(mdPath, "utf8");
  const metaPath = join(dir, "meta.yaml");
  const meta = (existsSync(metaPath) ? parse(readFileSync(metaPath, "utf8")) : {}) ?? {};
  const title = meta.title || firstH1(body) || id;
  const fm = frontmatter({ id, title, ...meta });
  writeFileSync(join(OUT_MODULES, `${id}.md`), `---\n${fm}\n---\n\n${stripFirstH1(body)}`);
  moduleCount++;
}

let trackCount = 0;
if (existsSync(TRACKS)) {
  for (const f of readdirSync(TRACKS).sort()) {
    if (!f.endsWith(".md")) continue;
    const body = readFileSync(join(TRACKS, f), "utf8");
    const id = f.replace(/\.md$/, "");
    const title = firstH1(body) || id;
    const fm = frontmatter({ id, title });
    writeFileSync(join(OUT_TRACKS, f), `---\n${fm}\n---\n\n${stripFirstH1(body)}`);
    trackCount++;
  }
}

// ---------------------------------------------------------------------------
// Wave 2 (web ISA ISC-101): exercise specs + seed bundles + badge definitions.
// Exercise specs are DATA owned by modules/*/exercises/exercise.yaml; seed file
// bytes are owned by .ci/fixtures/seeds/<profile>/ (the same ground truth the
// fidelity suite replays). This projects both into src/content/labs/<module>.json:
//   { spec, seed: SeedSpec, expectations, epoch }
// so the Lab Player renders pure data — the app never hardcodes exercise content.
// ---------------------------------------------------------------------------
import { ExerciseSpecSchema, findBannedKeys } from "../src/lib/exercise-spec";

interface SeedFileOut { path: string; content?: string; dir?: boolean; mode?: number }
interface SeedSpecOut { files: SeedFileOut[]; tools: Record<string, string> }

function walkSeedHome(homeDir: string): SeedFileOut[] {
  const out: SeedFileOut[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) {
        out.push({ path: `~/${childRel}`, dir: true });
        walk(full, childRel);
      } else {
        out.push({ path: `~/${childRel}`, content: readFileSync(full, "utf8") });
      }
    }
  };
  if (existsSync(homeDir)) walk(homeDir, "");
  return out;
}

function readSeedTools(binDir: string, names: string[]): Record<string, string> {
  const tools: Record<string, string> = {};
  for (const name of names) {
    const full = join(binDir, name);
    if (!existsSync(full)) {
      console.error(`sync-content: FAIL — seed tool '${name}' missing from ${binDir}`);
      process.exit(1);
    }
    tools[name] = readFileSync(full, "utf8");
  }
  return tools;
}

reset(OUT_LABS);
let labCount = 0;
const manifestPath = join(FIXTURES, "manifest.yaml");
const manifest = existsSync(manifestPath) ? parse(readFileSync(manifestPath, "utf8")) : null;
const epoch: string = manifest?.meta?.epoch ?? "2026-06-01T09:00:00Z";

for (const id of readdirSync(MODULES).sort()) {
  const exPath = join(MODULES, id, "exercises", "exercise.yaml");
  if (!existsSync(exPath)) continue;
  const raw = parse(readFileSync(exPath, "utf8"));
  const banned = findBannedKeys(raw);
  if (banned.length) {
    console.error(`sync-content: FAIL — banned keys in ${id} exercise spec: ${banned.join(", ")}`);
    process.exit(1);
  }
  const parsed = ExerciseSpecSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`sync-content: FAIL — invalid exercise spec for ${id}:\n${parsed.error.message}`);
    process.exit(1);
  }
  const spec = parsed.data;

  // Seed bundle: fixture seed profile (home tree + PATH tools) + spec-local file refs.
  const seedDef = manifest?.seeds?.[spec.seed.profile];
  if (!seedDef) {
    console.error(`sync-content: FAIL — ${id} names seed profile '${spec.seed.profile}' not in .ci/fixtures/manifest.yaml`);
    process.exit(1);
  }
  const files = walkSeedHome(join(FIXTURES, seedDef.home));
  for (const ref of spec.seed.files) {
    const src = join(MODULES, id, "exercises", ref.from);
    if (!existsSync(src)) {
      console.error(`sync-content: FAIL — ${id} seed file ref '${ref.from}' not found`);
      process.exit(1);
    }
    files.push({ path: ref.path, content: readFileSync(src, "utf8") });
  }
  const seed: SeedSpecOut = {
    files,
    tools: readSeedTools(join(FIXTURES, seedDef.path_bin), spec.seed.path_tools),
  };

  // Generated expectations (from: generated lookups), minus provenance keys.
  const expPath = join(MODULES, id, "exercises", "transcripts", "expectations.json");
  const expectations: Record<string, string> = {};
  if (existsSync(expPath)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(expPath, "utf8")) as Record<string, string>)) {
      if (!k.startsWith("_")) expectations[k] = v;
    }
  }

  writeFileSync(join(OUT_LABS, `${id}.json`), JSON.stringify({ spec, seed, expectations, epoch }, null, 2));
  labCount++;
}

// Badge definitions (data in the curriculum repo — web ISA ISC-139).
let badgeCount = 0;
if (existsSync(BADGES_YAML)) {
  const badges = parse(readFileSync(BADGES_YAML, "utf8"));
  writeFileSync(join(OUT_CONTENT, "badges.json"), JSON.stringify(badges, null, 2));
  badgeCount = badges?.badges?.length ?? 0;
}

console.log(
  `sync-content: ${moduleCount} modules -> src/content/modules, ${trackCount} tracks -> src/content/tracks, ` +
    `${labCount} lab bundle(s) -> src/content/labs, ${badgeCount} badge def(s) -> src/content/badges.json`
);
if (moduleCount === 0) {
  console.error("sync-content: FAIL — no modules synced (expected the repo's modules/ tree)");
  process.exit(1);
}
