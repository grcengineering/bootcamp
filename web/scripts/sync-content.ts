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
import { buildM02Seed } from "../src/engines/linuxadmin";
import { buildVisualOptions, type FixtureSet, type PacketFixture } from "../src/lib/visual-seed";
import { buildApiVisualOptions, type ApiFixture } from "../src/lib/api-seed";
import { buildOciVisualOptions, type OciFixture, type OciImageBlobs } from "../src/lib/oci-seed";
import {
  buildWebVisualOptions,
  buildCryptoVisualOptions,
  buildIdentityVisualOptions,
  buildInternetVisualOptions,
  buildLoggingVisualOptions,
  buildCloudVisualOptions,
  type WebFixture,
  type CryptoDiffFixture,
  type SyslogFixture,
  type MatrixFixture,
  type JwtFixture,
  type CryptoChainFixture,
  type DnsFixture,
  type ContentExtras,
} from "../src/lib/visual-content-seed";
import type { OciManifest, OciImageConfig } from "../src/engines/visual/oci";
import { loadManifest } from "../../.ci/fixtures/load-manifest";

/** The Wave-4 contract/wire oracles served from .ci/fixtures/assets/api/ (vs the net `pkt` canary). */
const API_ORACLES = new Set(["oas", "wsdl", "sdl", "proto", "pbwire", "gqlsim"]);

/** The Wave-4 header/crypto/identity/logging/cloud oracles → their committed asset subdir + builder. */
const CONTENT_ORACLE_DIR: Record<string, string> = {
  hdr: "web",       // module 18 — RFC 7239/6265/9111 headers + RFC 7519 JWT
  x509: "crypto",   // module 22 — TLS leaf/chain certificates (also module 24's leaf)
  jwt: "crypto",    // module 23 — JWT + SAML identity artifacts
  syslog: "logging", // module 25 — RFC 5424 syslog lines
  csa: "cloud",     // module 20 — the cited shared-responsibility matrix
  dns: "net",       // module 24 — RFC 1035 DNS query/response + the leaf cert
};

/** Read a JSON asset from one of the committed asset subdirs. */
function readAssetJson<T>(subdir: string, file: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, "assets", subdir, file), "utf8")) as T;
}
function readAssetText(subdir: string, file: string): string {
  return readFileSync(join(FIXTURES, "assets", subdir, file), "utf8");
}

/** The real artifacts the crypto/identity/internet modules need beyond their primary fixture. */
function loadContentExtras(oracle: string): ContentExtras {
  const extras: ContentExtras = {};
  if (oracle === "x509") {
    // module 22: the leaf chain + the JWT (the "encoding != protection" PEEL).
    extras.certChain = readAssetJson<CryptoChainFixture>("crypto", "google-cert-chain.json");
    extras.jwt = readAssetJson<JwtFixture>("crypto", "jwt-tokens.json");
  } else if (oracle === "jwt") {
    // module 23: the JWT + the OASIS SAML clean/expired assertions.
    extras.jwt = readAssetJson<JwtFixture>("crypto", "jwt-tokens.json");
    extras.samlClean = readAssetText("identity", "saml-assertion.xml");
    extras.samlExpired = readAssetText("identity", "saml-assertion-expired.xml");
  } else if (oracle === "dns") {
    // module 24: the DNS query + response + the leaf cert (the encryption-boundary surface).
    extras.dnsQuery = readAssetJson<DnsFixture>("net", "dns-query-example-com.json");
    extras.dnsResponse = readAssetJson<DnsFixture>("net", "dns-response-example-com.json");
    extras.certChain = readAssetJson<CryptoChainFixture>("crypto", "google-cert-chain.json");
  }
  return extras;
}

/** Load one OCI image's committed real blobs (module 21 served from .ci/fixtures/assets/containers/). */
function loadOciBlobs(ref: { manifest_blob: string; config_blob: string; secret_layer_blob?: string }): OciImageBlobs {
  const dir = join(FIXTURES, "assets", "containers");
  const manifest = JSON.parse(readFileSync(join(dir, ref.manifest_blob), "utf8")) as OciManifest;
  const config = JSON.parse(readFileSync(join(dir, ref.config_blob), "utf8")) as OciImageConfig;
  const blobs: OciImageBlobs = { manifest, config };
  if (ref.secret_layer_blob) {
    blobs.secretLayerGz = new Uint8Array(readFileSync(join(dir, ref.secret_layer_blob)));
    blobs.secretLayerIndex = manifest.layers.length - 1;
  }
  return blobs;
}
/** The four real machine-readable contracts the api-paradigms PEEL/diff surface parses. */
const API_CONTRACT_FILES = ["users.openapi.json", "users.wsdl", "users.graphql", "users.proto"];

/** Load the committed api fixtures (JSON bundles) + the raw contract files for the api oracles. */
function loadApiFixtures(): { fixtures: Record<string, ApiFixture>; contracts: Record<string, string> } {
  const dir = join(FIXTURES, "assets", "api");
  const fixtures: Record<string, ApiFixture> = {};
  const contracts: Record<string, string> = {};
  if (!existsSync(dir)) return { fixtures, contracts };
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json") && !API_CONTRACT_FILES.includes(name)) {
      fixtures[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as ApiFixture;
    }
  }
  for (const f of API_CONTRACT_FILES) {
    const p = join(dir, f);
    if (existsSync(p)) contracts[f] = readFileSync(p, "utf8");
  }
  return { fixtures, contracts };
}

/** Load every committed packet fixture under .ci/fixtures/assets/net/ as a FixtureSet. */
function loadVisualFixtureSet(): FixtureSet {
  const dir = join(FIXTURES, "assets", "net");
  const set: FixtureSet = {};
  if (!existsSync(dir)) return set;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    set[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as PacketFixture;
  }
  return set;
}

interface SeedFileOut {
  path: string; content?: string; dir?: boolean; mode?: number;
  owner?: string; group?: string; mtimeMs?: number;
}
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
// manifest.yaml PLUS every manifest.d/*.yaml fragment (Wave-4 fan-out): each module agent owns
// its own fragment, so a fragment-defined seed profile (e.g. m22) validates here without any
// edit to the shared base file.
const manifestPath = join(FIXTURES, "manifest.yaml");
const manifest = existsSync(manifestPath) ? loadManifest(FIXTURES) : null;
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
  // Non-shell profiles may lack home/path_bin (e.g. m04's typed object_store) — guarded.
  const seedDef = manifest?.seeds?.[spec.seed.profile];
  if (!seedDef) {
    console.error(`sync-content: FAIL — ${id} names seed profile '${spec.seed.profile}' not in .ci/fixtures/manifest.yaml`);
    process.exit(1);
  }
  // Booted admin profile (module 02): the bundle ships the FULL web-01 machine seed —
  // root-owned /etc files, the ssh unit, the apt DB, the scenario keypair — assembled by
  // the engine's own builder (buildM02Seed), the exact construction the fidelity + replay
  // suites use (one world for capture, tests, and the browser). The session must then be
  // created with `adminLab` for the booted command family; emitted on the bundle below.
  let adminLab: { password: string } | undefined;
  let host: string | undefined;
  let seed: SeedSpecOut;
  if (seedDef.system && seedDef.apply) {
    const profileDir = join(FIXTURES, "seeds", spec.seed.profile);
    const sd = (rel: string) => readFileSync(join(profileDir, rel), "utf8");
    const built = buildM02Seed({
      etcPasswd: sd("system/etc/passwd"),
      etcGroup: sd("system/etc/group"),
      etcHostname: sd("system/etc/hostname"),
      sshdConfig: sd("system/etc/ssh/sshd_config"),
      sshServiceUnit: sd("system/usr/lib/systemd/system/ssh.service"),
      skel: {
        ".bashrc": sd("system/etc/skel/.bashrc"),
        ".profile": sd("system/etc/skel/.profile"),
        ".bash_logout": sd("system/etc/skel/.bash_logout"),
      },
      aptInstalled: sd("system/var/apt-installed.txt"),
      idEd25519: sd("home/.ssh/id_ed25519"),
      idEd25519Pub: sd("home/.ssh/id_ed25519.pub"),
      authorizedKeys: sd("home/.ssh/authorized_keys"),
      debPlaceholder: sd("home/evidence-collector_1.0.0_all.deb"),
      labSetupTool: sd("bin/lab-setup"),
    });
    seed = {
      files: built.files as SeedFileOut[],
      tools: {
        ...built.tools,
        ...(seedDef.path_bin ? readSeedTools(join(FIXTURES, seedDef.path_bin), spec.seed.path_tools) : {}),
      },
    };
    const contract = manifest?.meta?.contracts?.["docker-linux-booted"];
    adminLab = { password: String(contract?.password ?? "labpass") };
    host = sd("system/etc/hostname").trim();
  } else {
    const files = seedDef.home ? walkSeedHome(join(FIXTURES, seedDef.home)) : [];
    for (const ref of spec.seed.files) {
      const src = join(MODULES, id, "exercises", ref.from);
      if (!existsSync(src)) {
        console.error(`sync-content: FAIL — ${id} seed file ref '${ref.from}' not found`);
        process.exit(1);
      }
      files.push({ path: ref.path, content: readFileSync(src, "utf8") });
    }
    if (spec.seed.path_tools.length > 0 && !seedDef.path_bin) {
      console.error(`sync-content: FAIL — ${id} names path_tools but seed profile '${spec.seed.profile}' has no path_bin`);
      process.exit(1);
    }
    seed = {
      files,
      tools: seedDef.path_bin ? readSeedTools(join(FIXTURES, seedDef.path_bin), spec.seed.path_tools) : {},
    };
  }

  // Console-engine exercise assets (Wave-4 fix 2026-06-13): a `console.assets` list (e.g.
  // module 17's stores-seed.sql) names files under modules/<id>/exercises/assets/ that the
  // ConsoleHost must hand the engine on every run (the sql adapter execs *.sql first). These
  // are spec-local content, NOT a manifest seed profile, so they must be loaded INTO seed.files
  // here — otherwise the browser ConsoleHost gets an empty DB and the real engine honestly
  // reports `no such table` (the replay test seeds directly and hid this). seedToFileMap keys
  // on file.path, so path === the bare asset name the spec's `assets:` references.
  for (const assetName of spec.console?.assets ?? []) {
    const src = join(MODULES, id, "exercises", "assets", assetName);
    if (!existsSync(src)) {
      console.error(`sync-content: FAIL — ${id} console.assets '${assetName}' not found at exercises/assets/${assetName}`);
      process.exit(1);
    }
    if (!seed.files.some((f) => f.path === assetName)) {
      seed.files.push({ path: assetName, content: readFileSync(src, "utf8") });
    }
  }

  // PowerShell engine seed (web ISA ISC-63): the manifest profile's typed object stores,
  // with the authored gpresult report file resolved — same loader rule the m04 fidelity
  // suite uses (trailing newline stripped when seeding gpresultReport).
  let windowsSeed: unknown;
  if (spec.engine === "powershell") {
    if (!seedDef.object_store) {
      console.error(`sync-content: FAIL — ${id} (engine: powershell) needs seeds.${spec.seed.profile}.object_store in the manifest`);
      process.exit(1);
    }
    const storePath = join(FIXTURES, seedDef.object_store);
    const rawStore = JSON.parse(readFileSync(storePath, "utf8"));
    const reportFile = rawStore.gpresultReportFile;
    windowsSeed = {
      ...rawStore,
      gpresultReport:
        typeof reportFile === "string"
          ? readFileSync(join(dirname(storePath), reportFile), "utf8").replace(/\n$/, "")
          : (rawStore.gpresultReport ?? ""),
    };
    delete (windowsSeed as Record<string, unknown>).gpresultReportFile;
  }

  // Visual engine seed (Wave-4): resolve the spec's visual.artifact.from against the
  // committed packet fixtures and normalize to VisualHost panels (lib/visual-seed) — the
  // SAME panels the replay test builds, so browser and test see identical real bytes.
  let visual: ReturnType<typeof buildVisualOptions> | undefined;
  if (spec.engine === "visual") {
    if (!spec.visual) {
      console.error(`sync-content: FAIL — ${id} (engine: visual) needs a visual: block`);
      process.exit(1);
    }
    if (spec.visual.oracle === "oci") {
      // Wave-4 module 21 (containers): the OCI image reader over the two real images. The seed
      // (lib/oci-seed) gunzips the secret layer at build time and serializes the panels as `oci`
      // sources, so the browser and the replay test rebuild byte-identical parse trees.
      const fromFile = spec.visual.artifact.from.replace(/^assets\/containers\//, "").replace(/^assets\//, "");
      const fxPath = join(FIXTURES, "assets", "containers", fromFile);
      if (!existsSync(fxPath)) {
        console.error(`sync-content: FAIL — ${id} visual.artifact.from '${spec.visual.artifact.from}' not found under .ci/fixtures/assets/containers`);
        process.exit(1);
      }
      const fx = JSON.parse(readFileSync(fxPath, "utf8")) as OciFixture;
      visual = buildOciVisualOptions(
        spec.visual.mode,
        spec.visual.oracle,
        loadOciBlobs(fx.images.clean),
        loadOciBlobs(fx.images.misconfigured),
        fx.map,
      );
    } else if (API_ORACLES.has(spec.visual.oracle)) {
      // Wave-4 contract/wire oracle: parse the committed api artifacts into the SAME parse-tree
      // panels the replay test builds (lib/api-seed), so browser and test see identical records.
      const { fixtures, contracts } = loadApiFixtures();
      const fromFile = spec.visual.artifact.from.replace(/^assets\/api\//, "").replace(/^assets\//, "");
      const primary = fixtures[fromFile] ?? Object.values(fixtures).find((f) => f.id === fromFile.replace(/\.json$/, ""));
      if (!primary) {
        console.error(`sync-content: FAIL — ${id} visual.artifact.from '${spec.visual.artifact.from}' not found under .ci/fixtures/assets/api`);
        process.exit(1);
      }
      visual = buildApiVisualOptions(spec.visual.mode, spec.visual.oracle, primary, contracts);
    } else if (CONTENT_ORACLE_DIR[spec.visual.oracle]) {
      // Wave-4 header/crypto/identity/logging/cloud oracles (modules 18, 20, 22, 23, 24, 25): each
      // module's primary fixture lives in its own asset subdir; the builder serializes the REAL
      // artifacts as ApiPanelSource descriptors so the browser re-runs the SAME parser. The parser
      // over the real bytes IS the oracle — no authored answer key.
      const subdir = CONTENT_ORACLE_DIR[spec.visual.oracle];
      const fromFile = spec.visual.artifact.from.replace(new RegExp(`^assets/${subdir}/`), "").replace(/^assets\//, "");
      const fxPath = join(FIXTURES, "assets", subdir, fromFile);
      if (!existsSync(fxPath)) {
        console.error(`sync-content: FAIL — ${id} visual.artifact.from '${spec.visual.artifact.from}' not found under .ci/fixtures/assets/${subdir}`);
        process.exit(1);
      }
      const { mode, oracle } = spec.visual;
      if (oracle === "hdr") {
        visual = buildWebVisualOptions(mode, oracle, JSON.parse(readFileSync(fxPath, "utf8")) as WebFixture);
      } else if (oracle === "csa") {
        visual = buildCloudVisualOptions(mode, oracle, JSON.parse(readFileSync(fxPath, "utf8")) as MatrixFixture);
      } else if (oracle === "syslog") {
        visual = buildLoggingVisualOptions(mode, oracle, JSON.parse(readFileSync(fxPath, "utf8")) as SyslogFixture);
      } else if (oracle === "x509") {
        visual = buildCryptoVisualOptions(mode, oracle, JSON.parse(readFileSync(fxPath, "utf8")) as CryptoDiffFixture, loadContentExtras(oracle));
      } else if (oracle === "jwt") {
        // module 23's primary fixture (the JWT tokens) is read via the extras loader; the builder
        // composes the JWT + SAML panels and the OAuth dance.
        visual = buildIdentityVisualOptions(mode, oracle, loadContentExtras(oracle));
      } else if (oracle === "dns") {
        visual = buildInternetVisualOptions(mode, oracle, loadContentExtras(oracle));
      } else {
        console.error(`sync-content: FAIL — ${id} content oracle '${oracle}' has no builder`);
        process.exit(1);
      }
    } else {
      const set = loadVisualFixtureSet();
      const fromFile = spec.visual.artifact.from.replace(/^assets\/net\//, "").replace(/^assets\//, "");
      const primary = set[fromFile] ?? Object.values(set).find((f) => f.id === fromFile.replace(/\.json$/, ""));
      if (!primary) {
        console.error(`sync-content: FAIL — ${id} visual.artifact.from '${spec.visual.artifact.from}' not found under .ci/fixtures/assets/net`);
        process.exit(1);
      }
      visual = buildVisualOptions(spec.visual.mode, spec.visual.oracle, primary, set);
    }
  }

  // Generated expectations (from: generated lookups), minus provenance keys.
  const expPath = join(MODULES, id, "exercises", "transcripts", "expectations.json");
  const expectations: Record<string, string> = {};
  if (existsSync(expPath)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(expPath, "utf8")) as Record<string, string>)) {
      if (!k.startsWith("_")) expectations[k] = v;
    }
  }

  // Per-seed scenario epoch wins over the global fixture epoch (e.g. m02's May 27 clock).
  const bundleEpoch: string = seedDef.epoch ?? epoch;
  writeFileSync(
    join(OUT_LABS, `${id}.json`),
    JSON.stringify(
      {
        spec, seed, expectations, epoch: bundleEpoch,
        ...(windowsSeed !== undefined ? { windowsSeed } : {}),
        ...(adminLab !== undefined ? { adminLab, host } : {}),
        ...(visual !== undefined ? { visual } : {}),
      },
      null,
      2,
    ),
  );
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
