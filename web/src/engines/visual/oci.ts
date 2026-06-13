/**
 * oci-manifest (engine id: `oci`) — the containers-and-virtualization module's oracle.
 *
 * Pure, DOM-free TypeScript: parses a REAL OCI image manifest + its image config into the
 * SAME ParseTreeProbe shape the packet-dissector and syslog parser produce, so the PEEL surface
 * and the closed verifier registry treat an image exactly like a frame or a log line. It reads
 * the control-truth the module teaches — the config's `User` (uid 0 = root), `ExposedPorts`,
 * `Env`, `Cmd`, and the manifest's ORDERED layer descriptors with their real sha256 digests —
 * and (for the baked-secret leg) surfaces the contents of a layer's tar so the secret-bearing
 * layer is genuinely peelable, cited by its real digest as provenance.
 *
 * The parse tree IS the oracle: every region value the surface shows is read straight from the
 * real OCI JSON / the real layer tar, never authored. The honesty doctrine is enforced by the
 * content-addressable chain itself — the manifest cites its config by `sha256:...` and that
 * digest equals the committed blob's recomputed SHA-256 (web/tests/oci-fidelity.test.ts asserts
 * this, so the fixtures cannot silently drift). Field meanings cite the OCI Image Spec
 * (image-manifest / image-config), CIS Docker Benchmark, and NIST 800-190 / 800-53 (CM-6 run as
 * non-root, CM-7 least functionality / exposed ports, IA-5 / SC-28 secrets management).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";
export type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";
// (ParseRegion is used by buildOciPanelTree's secret-region injection below.)

// ----------------------------------------------------------------------------
// OCI JSON shapes (the subset the module reads — OCI Image Spec v1.x)
// ----------------------------------------------------------------------------

/** A content descriptor (OCI Image Spec — Descriptor). */
export interface OciDescriptor {
  mediaType: string;
  digest: string;
  size: number;
}

/** An OCI image manifest (application/vnd.oci.image.manifest.v1+json). */
export interface OciManifest {
  schemaVersion: number;
  mediaType?: string;
  config: OciDescriptor;
  layers: OciDescriptor[];
  annotations?: Record<string, string>;
}

/** The runtime/build config carried inside the config blob (OCI Image Spec — image config). */
export interface OciImageConfig {
  architecture?: string;
  os?: string;
  variant?: string;
  config?: {
    User?: string;
    ExposedPorts?: Record<string, unknown>;
    Env?: string[];
    Cmd?: string[];
    Entrypoint?: string[];
    WorkingDir?: string;
  };
  history?: Array<{ created?: string; created_by?: string; empty_layer?: boolean; comment?: string }>;
  rootfs?: { type: string; diff_ids: string[] };
}

// ----------------------------------------------------------------------------
// control-truth readers (the cited meanings — closed, small, sufficient for the module)
// ----------------------------------------------------------------------------

/**
 * Is this image's effective runtime user root? The OCI config's `User` may be a username
 * ("root"), a numeric uid ("0"), "uid:gid", or absent. Per the OCI runtime default, an ABSENT
 * User means the container runs as root (uid 0) — the very CM-6 finding the module teaches, so
 * absence is reported as root, not as "unknown".
 */
export function runsAsRoot(user: string | undefined): boolean {
  if (user === undefined || user === "") return true; // OCI default = root (uid 0)
  const uidPart = user.split(":")[0].trim();
  return uidPart === "root" || uidPart === "0";
}

/** Human description of the User field's control-truth (CM-6 / IA). */
function describeUser(user: string | undefined): string {
  if (user === undefined || user === "") return "absent → defaults to root (uid 0)";
  return runsAsRoot(user) ? `${user} → ROOT (uid 0)` : `${user} → non-root`;
}

/** The exposed ports as a sorted, comma-joined string (CM-7 least functionality). */
function describePorts(ports: Record<string, unknown> | undefined): string {
  const keys = Object.keys(ports ?? {}).sort();
  return keys.length ? keys.join(", ") : "none";
}

// ----------------------------------------------------------------------------
// parser → ParseTreeProbe
// ----------------------------------------------------------------------------

/** A parsed OCI image: the manifest + its (already-fetched) config blob. */
export interface OciImage {
  manifest: OciManifest;
  config: OciImageConfig;
}

/**
 * Parse a real OCI image (manifest + config) into a ParseTreeProbe. The region tree:
 *   image
 *   ├── manifest        (config descriptor + ordered layer descriptors)
 *   │   ├── manifest.config        (the config blob's digest + size)
 *   │   ├── layer0 … layerN        (ordered descriptors, each with its real sha256)
 *   └── config          (the runtime config — the control-truth fields)
 *       ├── config.user             (User → root/non-root, CM-6)
 *       ├── config.exposed_ports    (ExposedPorts, CM-7)
 *       ├── config.env              (Env)
 *       └── config.cmd              (Cmd)
 * Region `start`/`end` are positional indices into the descriptor list (not byte offsets — an
 * image is structured JSON, not a flat byte buffer), so a layer's region span is its ordinal,
 * letting the PEEL surface render layers as ordered stacked regions. Throws on a structurally
 * invalid manifest (no config/layers — there is no image to peel).
 */
export function parseOci(image: OciImage): ParseTreeProbe {
  const { manifest, config } = image;
  if (!manifest || !manifest.config || !Array.isArray(manifest.layers))
    throw new Error("invalid OCI manifest: missing config descriptor or layers array");

  const root: ParseRegion = {
    id: "image",
    start: 0,
    end: manifest.layers.length + 2,
    label: "OCI image",
    layer: "image",
    value: `${config.architecture ?? "?"}/${config.os ?? "?"}${config.variant ? `/${config.variant}` : ""}, ${manifest.layers.length} layer(s)`,
    rfc: "OCI Image Spec v1",
    children: [],
  };

  // ---- manifest -------------------------------------------------------------
  const manifestRegion: ParseRegion = {
    id: "manifest",
    start: 0,
    end: manifest.layers.length + 1,
    label: "image manifest",
    layer: "manifest",
    value: `config ${shortDigest(manifest.config.digest)} + ${manifest.layers.length} layer descriptor(s)`,
    rfc: "OCI Image Manifest",
    children: [
      {
        id: "manifest.config",
        start: 0,
        end: 1,
        label: "config descriptor",
        layer: "manifest",
        value: `${manifest.config.digest} (${manifest.config.size} bytes)`,
        rfc: "OCI Descriptor → config",
        children: [],
      },
    ],
  };
  manifest.layers.forEach((layer, i) => {
    manifestRegion.children.push({
      id: `layer${i}`,
      start: i + 1,
      end: i + 2,
      label: `layer ${i}`,
      layer: "manifest",
      value: `${layer.digest} (${layer.size} bytes, ${layer.mediaType})`,
      rfc: "OCI Image Manifest → layers[]",
      children: [],
    });
  });
  root.children.push(manifestRegion);

  // ---- config (the control-truth) -------------------------------------------
  const c = config.config ?? {};
  const configRegion: ParseRegion = {
    id: "config",
    start: manifest.layers.length + 1,
    end: manifest.layers.length + 2,
    label: "image config",
    layer: "config",
    value: `User ${describeUser(c.User)}, ports ${describePorts(c.ExposedPorts)}`,
    rfc: "OCI Image Config",
    children: [
      {
        id: "config.user",
        start: 0,
        end: 0,
        label: "User",
        layer: "config",
        value: describeUser(c.User),
        rfc: "OCI config.User · CM-6 (run as non-root)",
        children: [],
      },
      {
        id: "config.exposed_ports",
        start: 0,
        end: 0,
        label: "ExposedPorts",
        layer: "config",
        value: describePorts(c.ExposedPorts),
        rfc: "OCI config.ExposedPorts · CM-7 (least functionality)",
        children: [],
      },
      {
        id: "config.env",
        start: 0,
        end: 0,
        label: "Env",
        layer: "config",
        value: (c.Env ?? []).join(" ") || "none",
        rfc: "OCI config.Env",
        children: [],
      },
      {
        id: "config.cmd",
        start: 0,
        end: 0,
        label: "Cmd",
        layer: "config",
        value: (c.Cmd ?? c.Entrypoint ?? []).join(" ") || "none",
        rfc: "OCI config.Cmd / Entrypoint",
        children: [],
      },
    ],
  };
  root.children.push(configRegion);

  return buildProbe(root, manifest.layers.length + 2);
}

// ----------------------------------------------------------------------------
// layer-tar walk (the baked-secret leg, OCI Image Spec § layer tar)
// ----------------------------------------------------------------------------

/** One file entry inside a layer's tar (name + size + the raw bytes). */
export interface LayerEntry {
  name: string;
  size: number;
  bytes: Uint8Array;
}

/**
 * Walk a single uncompressed POSIX/ustar tar (an OCI layer's filesystem diff) into its file
 * entries. OCI layer blobs are tar (optionally gzip'd); the caller decompresses the
 * `.tar.gz` blob to raw tar bytes before handing them here. Pure: reads the 512-byte tar
 * header blocks (name @0, size octal @124, typeflag @156) — the layer's contents ARE the
 * oracle for the baked-secret finding. Skips non-regular entries; stops at the end-of-archive
 * zero blocks. Throws only on a truncated header (a corrupt blob, not a valid layer).
 */
export function walkLayerTar(tar: Uint8Array): LayerEntry[] {
  const entries: LayerEntry[] = [];
  let off = 0;
  const dec = new TextDecoder("utf-8");
  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    // End-of-archive: a zero-filled block.
    if (header.every((b) => b === 0)) break;
    const name = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, "");
    const sizeOctal = dec.decode(header.subarray(124, 136)).replace(/\0.*$/, "").replace(/\s+$/, "").trim();
    const size = sizeOctal === "" ? 0 : parseInt(sizeOctal, 8);
    const typeflag = String.fromCharCode(header[156]);
    const dataStart = off + 512;
    if (dataStart + size > tar.length) throw new Error(`truncated tar entry: ${name}`);
    // typeflag "0"/"\0" = regular file; others (dirs "5", etc.) carry no readable body here.
    if ((typeflag === "0" || typeflag === "\0") && name !== "") {
      entries.push({ name, size, bytes: tar.subarray(dataStart, dataStart + size) });
    }
    // advance past data, rounded up to the next 512-byte boundary.
    off = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/**
 * Scan a layer's tar entries for a baked secret using the same closed credential-pattern set a
 * real secret scanner trips on (the parser, not an answer key, finds the hit). Returns the
 * matching entry + the pattern name that fired, or null. The patterns cover the test credential
 * the module's misconfigured fixture bakes in (an AWS-style secret access key in a *.env file)
 * plus the common high-signal families — this is the genuine "secret glows in the layer that
 * added it" mechanic over real bytes.
 */
export function findBakedSecret(entries: LayerEntry[]): { entry: LayerEntry; pattern: string; match: string } | null {
  const dec = new TextDecoder("utf-8");
  const patterns: Array<[string, RegExp]> = [
    ["AWS secret access key", /AWS_SECRET_ACCESS_KEY\s*=\s*\S+/],
    ["AWS access key id", /AKIA[0-9A-Z]{16}/],
    // A key whose final word is a credential token (SECRET/TOKEN/PASSWORD/API_KEY/PASSWD),
    // possibly prefixed by other key words ("DB_PASSWORD", "MY-API_KEY"), then "= value".
    ["generic secret/token assignment", /(?:^|[^A-Za-z])(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY)\s*=\s*\S+/im],
    ["PEM private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ];
  for (const entry of entries) {
    const text = dec.decode(entry.bytes);
    for (const [name, re] of patterns) {
      const m = re.exec(text);
      if (m) return { entry, pattern: name, match: m[0] };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// digest verification (the content-addressable honesty chain)
// ----------------------------------------------------------------------------

/**
 * Verify that a blob's bytes hash to the digest a descriptor cites. OCI digests are
 * "sha256:<hex>"; this recomputes SHA-256 over the raw blob and compares. Async (uses the Web
 * Crypto SubtleCrypto available in both the browser and Bun) — the fidelity suite awaits it to
 * prove the committed fixtures are the real, unmodified blobs. Returns true iff the digest
 * matches (algorithm + hex), false on any mismatch or malformed digest.
 */
export async function verifyDigest(blob: Uint8Array, digest: string): Promise<boolean> {
  const [algo, hex] = digest.split(":");
  if (algo !== "sha256" || !/^[0-9a-f]{64}$/.test(hex ?? "")) return false;
  const view = new Uint8Array(blob); // ensure a standalone ArrayBuffer-backed view
  const buf = await crypto.subtle.digest("SHA-256", view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
  const got = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  return got === hex;
}

function shortDigest(d: string): string {
  const hex = d.split(":")[1] ?? d;
  return `sha256:${hex.slice(0, 12)}…`;
}

// ----------------------------------------------------------------------------
// serializable panel source (the build↔browser seam, parallel to api-oracle)
// ----------------------------------------------------------------------------

/**
 * A serializable description of one OCI panel's REAL artifact — the manifest + config JSON plus the
 * UNCOMPRESSED layer tar bytes (as hex) for the secret-bearing layer. Functions don't survive JSON,
 * so (exactly like the api panels serialize a contract string and the `pkt` canary serializes hex)
 * the build step decompresses the `.tar.gz` ONCE and serializes the raw tar hex; the browser and the
 * replay test both rebuild the live parse tree from this via `buildOciPanelTree`. The gunzip is the
 * only Node-only step, so it is hoisted to build time — the secret-finding itself (walkLayerTar +
 * findBakedSecret over the real raw tar bytes) is pure and runs identically in both places. The
 * reader over the real bytes is the oracle; the source carries only real bytes, never a parse tree.
 */
export interface OciPanelSource {
  oracle: "oci";
  manifest: OciManifest;
  config: OciImageConfig;
  /** Hex of the UNCOMPRESSED layer tar carrying the secret (pre-gunzipped at build time), if any. */
  layerTarHex?: string;
  /** manifest.layers[] index the secret tar corresponds to (the secret region nests under that layer). */
  secretLayerIndex?: number;
}

/** Decode a lowercase-hex string to bytes (pure, browser-safe — no Buffer/zlib). */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Rebuild the live OCI parse tree from a serializable source. Parses the manifest+config via
 * `parseOci`, and (when the raw layer-tar hex is supplied) walks it with `walkLayerTar` +
 * `findBakedSecret` and nests a real `layerN.secret` region under the layer that carries it — cited
 * by that layer's real digest as provenance. Pure + browser-safe.
 */
export function buildOciPanelTree(source: OciPanelSource): ParseTreeProbe {
  const tree = parseOci({ manifest: source.manifest, config: source.config });
  if (!source.layerTarHex) return tree;
  const entries = walkLayerTar(hexToBytes(source.layerTarHex));
  const hit = findBakedSecret(entries);
  if (!hit) return tree;
  const idx = source.secretLayerIndex ?? source.manifest.layers.length - 1;
  const layerRegion = tree.region(`layer${idx}`);
  if (!layerRegion) return tree;
  const layerDigest = source.manifest.layers[idx]?.digest ?? "";
  layerRegion.children.push({
    id: `layer${idx}.secret`,
    start: layerRegion.start,
    end: layerRegion.end,
    label: `baked secret in layer ${idx}`,
    layer: "manifest",
    value: `/${hit.entry.name} (${hit.pattern}) — provenance ${layerDigest}`,
    rfc: "OCI layer tar · IA-5 / SC-28 · CIS Docker 4.10 (no secrets in images)",
    children: [],
  });
  return reindexOci(tree.root, tree.byteLength);
}

/** Re-flatten + re-index a mutated region tree into a fresh ParseTreeProbe (same contract as buildProbe). */
function reindexOci(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map<string, ParseRegion>();
  for (const r of regions) {
    if (r.start === 0 && r.end === 0) continue;
    const k = `${r.start}:${r.end}`;
    if (!byRange.has(k)) byRange.set(k, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}

// ----------------------------------------------------------------------------
// probe assembly (same contract as pkt.buildProbe)
// ----------------------------------------------------------------------------

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  // The config sub-fields all carry the placeholder span 0:0 (they are JSON fields, not byte
  // ranges); range lookups therefore resolve config sub-fields by id only. Index the first
  // region per distinct, non-degenerate range for the layer/manifest descriptors.
  const byRange = new Map<string, ParseRegion>();
  for (const r of regions) {
    if (r.start === 0 && r.end === 0) continue; // config sub-fields are id-addressed only
    const k = `${r.start}:${r.end}`;
    if (!byRange.has(k)) byRange.set(k, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
