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
const OUT_MODULES = join(HERE, "..", "src", "content", "modules");
const OUT_TRACKS = join(HERE, "..", "src", "content", "tracks");

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

console.log(
  `sync-content: ${moduleCount} modules -> src/content/modules, ${trackCount} tracks -> src/content/tracks`
);
if (moduleCount === 0) {
  console.error("sync-content: FAIL — no modules synced (expected the repo's modules/ tree)");
  process.exit(1);
}
