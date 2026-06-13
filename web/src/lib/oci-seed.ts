/**
 * Containers/virtualization visual seed (Wave-4, module 21) — turns the committed REAL OCI image
 * blobs (.ci/fixtures/assets/containers/*) + a spec's visual mode into VisualHost panels, the same
 * way lib/api-seed turns the api artifacts into panels and lib/visual-seed turns the net pcaps into
 * panels. Pure + DOM-free (the only Node-only step — gunzip of the layer .tar.gz — happens here at
 * BUILD time, so the resulting `source` descriptor is fully serializable and the browser rebuilds the
 * tree from raw tar hex via the pure walkLayerTar/findBakedSecret path). Shared by the build step
 * (scripts/sync-content) and the module-21 replay test so the browser and the test see byte-identical
 * panels.
 *
 * The blobs are the source of truth: this only SELECTS which real image each panel parses and hands
 * the bytes to the `oci` oracle (engines/visual/oci.buildOciPanelTree, via the serializable
 * OciPanelSource). It never authors a decoded value — the OCI reader's parse tree over the real
 * manifest/config/layer-tar IS the panel. The honesty chain is content-addressable: each manifest
 * cites its config and layers by sha256:<hex>, and oci-fidelity.test.ts recomputes those digests over
 * the committed blobs.
 */
import { gunzipSync } from "node:zlib";
import type { VisualHostOptions, VisualMode } from "../components/lab/sessions/visual-host";
import type { OciManifest, OciImageConfig, OciPanelSource } from "../engines/visual/oci";

/** One image's committed real blobs (manifest JSON, config JSON, optional secret-layer .tar.gz). */
export interface OciImageBlobs {
  manifest: OciManifest;
  config: OciImageConfig;
  /** The gzip'd layer tar whose real bytes carry the baked secret (misconfigured twin only). */
  secretLayerGz?: Uint8Array;
  /** Which manifest.layers[] index the secret tar corresponds to (so the secret region nests there). */
  secretLayerIndex?: number;
}

/** The committed containers fixture (oci-images.json) shape the seed reads. */
export interface OciFixture {
  id: string;
  kind: string;
  images: {
    clean: OciImageRef;
    misconfigured: OciImageRef;
  };
  map?: OciMapSeed;
  diff_pairs?: Array<{
    id: string;
    control_claim: string;
    framework_ref: string;
    discriminating_field: string;
  }>;
}
interface OciImageRef {
  label: string;
  manifest_blob: string;
  config_blob: string;
  secret_layer_blob?: string;
}

/** The MAP key for the findings→controls + VM-vs-container board (cited; mapping_correct reads it). */
export interface OciMapItem {
  id: string;
  label: string;
  keyZone: string;
  keyRef?: string;
}
export interface OciMapSeed {
  zones: string[];
  items: OciMapItem[];
}

/** Lowercase-hex of a byte buffer (pure). */
function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Build one image's serializable OCI panel source. The gunzip of the secret-layer .tar.gz happens
 * HERE (build time, Node), and the raw uncompressed tar bytes are carried forward as hex so the
 * browser's pure rebuild (walkLayerTar + findBakedSecret) can find the secret without zlib. The
 * reader, not an answer key, finds the hit — this only hoists the decompression.
 */
export function ociPanelSource(blobs: OciImageBlobs): OciPanelSource {
  const source: OciPanelSource = { oracle: "oci", manifest: blobs.manifest, config: blobs.config };
  if (blobs.secretLayerGz) {
    const tar = gunzipSync(Buffer.from(blobs.secretLayerGz));
    source.layerTarHex = bytesToHex(new Uint8Array(tar));
    source.secretLayerIndex = blobs.secretLayerIndex ?? blobs.manifest.layers.length - 1;
  }
  return source;
}

/**
 * Build the VisualHost options for the containers module. The `oci` oracle is the only oracle here;
 * the mode selects the surface:
 *  - peel — the misconfigured twin's manifest+config (User/ExposedPorts/layers) + the secret layer;
 *  - diff-the-trace — the clean + misconfigured panels side by side (click the field that breaks
 *    each control claim) PLUS the findings→controls MAP board.
 *
 * `clean`/`misconfigured` supply the loaded image bytes; `mapSeed` (optional) supplies the cited
 * findings→controls + VM-vs-container key for the MAP board in diff-the-trace mode.
 */
export function buildOciVisualOptions(
  mode: VisualMode,
  oracle: string,
  clean: OciImageBlobs,
  misconfigured: OciImageBlobs,
  mapSeed?: OciMapSeed,
): VisualHostOptions {
  if (oracle !== "oci") throw new Error(`buildOciVisualOptions: unsupported oracle '${oracle}' (expected oci)`);

  if (mode === "peel") {
    return {
      mode,
      oracle,
      panels: [{ id: "misconfigured", label: "Image · misconfigured twin", source: ociPanelSource(misconfigured) }],
    };
  }

  if (mode === "diff-the-trace") {
    const panels: VisualHostOptions["panels"] = [
      { id: "clean", label: "Image · clean: stock alpine:latest", source: ociPanelSource(clean) },
      { id: "misconfigured", label: "Image · broken: docker build twin (root, ports, secret)", source: ociPanelSource(misconfigured) },
    ];
    return { mode, oracle, panels, ...(mapSeed ? { map: { zones: mapSeed.zones, items: mapSeed.items } } : {}) };
  }

  throw new Error(`buildOciVisualOptions: unsupported mode '${mode}'`);
}
