/**
 * oci-manifest unit suite (Wave-4): the parser/reader branches the fidelity suite doesn't
 * exercise — runsAsRoot across every User form, the invalid-manifest guard, the ParseTreeProbe
 * accessors over the image tree, every findBakedSecret pattern family, walkLayerTar edge cases
 * (end-of-archive, directory entries, truncation), and verifyDigest's malformed-digest guards.
 * Every assertion is over the real committed blobs or a minimal synthetic tar built in-test; the
 * parser is the oracle. (Coverage floor 95/95 on web/src/engines/visual/oci.ts.)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import {
  parseOci,
  walkLayerTar,
  findBakedSecret,
  verifyDigest,
  runsAsRoot,
  type OciImage,
  type OciManifest,
  type OciImageConfig,
  type LayerEntry,
} from "../src/engines/visual/oci";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/containers");
const readJson = (f: string) => JSON.parse(readFileSync(join(ASSETS, f), "utf8"));
const misImage: OciImage = { manifest: readJson("misconfigured-manifest.json"), config: readJson("misconfigured-config.json") };

/** Build a minimal single-file ustar tar (512 header + data padded to 512) for edge tests. */
function makeTar(name: string, body: string, typeflag = "0"): Uint8Array {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  header.set(enc.encode(name).subarray(0, 100), 0);
  // size as octal in bytes 124..135 (11 octal digits + NUL)
  const sizeOctal = body.length.toString(8).padStart(11, "0");
  header.set(enc.encode(sizeOctal), 124);
  header[156] = typeflag.charCodeAt(0);
  const data = enc.encode(body);
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
  padded.set(data);
  const eof = new Uint8Array(1024); // two zero blocks
  const out = new Uint8Array(512 + padded.length + eof.length);
  out.set(header, 0);
  out.set(padded, 512);
  out.set(eof, 512 + padded.length);
  return out;
}

describe("runsAsRoot — the OCI runtime default + every User form (CM-6)", () => {
  test("absent/empty User defaults to root (uid 0)", () => {
    expect(runsAsRoot(undefined)).toBe(true);
    expect(runsAsRoot("")).toBe(true);
  });
  test("explicit root / uid 0 is root; a username or non-zero uid is not", () => {
    expect(runsAsRoot("root")).toBe(true);
    expect(runsAsRoot("0")).toBe(true);
    expect(runsAsRoot("0:0")).toBe(true);
    expect(runsAsRoot("appuser")).toBe(false);
    expect(runsAsRoot("1000")).toBe(false);
    expect(runsAsRoot("1000:1000")).toBe(false);
  });
});

describe("parseOci — structure guard + probe accessors over the image tree", () => {
  test("an invalid manifest (no config / no layers) throws", () => {
    expect(() => parseOci({ manifest: {} as OciManifest, config: {} })).toThrow(/invalid OCI manifest/);
    expect(() => parseOci({ manifest: { config: { digest: "x", mediaType: "y", size: 1 } } as OciManifest, config: {} })).toThrow(/invalid OCI manifest/);
  });

  test("config sub-fields are id-addressed (their 0:0 span is not range-resolvable)", () => {
    const p = parseOci(misImage);
    // config sub-fields carry the placeholder span 0:0 → reachable by id, NOT by range
    expect(p.region("config.user")).not.toBeNull();
    expect(p.regionAt({ start: 0, end: 0 })).toBeNull();
    // the layer/manifest descriptors ARE range-addressable (ordinal spans)
    const layer1 = p.region("layer1")!;
    expect(p.regionAt({ start: layer1.start, end: layer1.end })!.id).toBe("layer1");
    // decode() returns the descriptor value for an exact ordinal range
    expect(p.decode({ start: layer1.start, end: layer1.end })).toContain("sha256:48092d7235b3");
    expect(p.decode({ start: 99, end: 100 })).toBeNull();
    expect(p.region("nope")).toBeNull();
    // byteLength == the root region's end (layers+2)
    expect(p.byteLength).toBe(p.root.end);
    expect(p.byteLength).toBe(misImage.manifest.layers.length + 2);
  });

  test("the manifest config descriptor + image summary read straight from the real blob", () => {
    const p = parseOci(misImage);
    expect(p.region("manifest.config")!.value).toContain(misImage.manifest.config.digest);
    expect(p.region("manifest.config")!.value).toContain(`${misImage.manifest.config.size} bytes`);
    expect(p.region("image")!.value).toContain("arm64/linux");
  });

  test("a config with Entrypoint but no Cmd falls back to Entrypoint; empty config reads 'none'", () => {
    const withEntrypoint: OciImage = {
      manifest: misImage.manifest,
      config: { config: { Entrypoint: ["/entry", "--flag"] } },
    };
    expect(parseOci(withEntrypoint).region("config.cmd")!.value).toBe("/entry --flag");
    const bare: OciImage = { manifest: misImage.manifest, config: {} };
    const pb = parseOci(bare);
    expect(pb.region("config.cmd")!.value).toBe("none");
    expect(pb.region("config.env")!.value).toBe("none");
    expect(pb.region("config.exposed_ports")!.value).toBe("none");
    // absent config.User → root-by-default
    expect(pb.region("config.user")!.value).toBe("absent → defaults to root (uid 0)");
  });
});

describe("walkLayerTar — tar parsing edge cases", () => {
  test("a single-file tar yields one regular-file entry", () => {
    const tar = makeTar("etc/hosts", "127.0.0.1 localhost\n");
    const entries = walkLayerTar(tar);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("etc/hosts");
    expect(new TextDecoder().decode(entries[0].bytes)).toContain("localhost");
  });

  test("directory entries (typeflag '5') and empty-name entries are skipped", () => {
    const dir = makeTar("var/log/", "", "5");
    expect(walkLayerTar(dir).length).toBe(0);
  });

  test("an empty/zero-block buffer yields no entries (end-of-archive)", () => {
    expect(walkLayerTar(new Uint8Array(1024)).length).toBe(0);
    expect(walkLayerTar(new Uint8Array(0)).length).toBe(0);
  });

  test("a truncated data region throws (a corrupt blob is not a valid layer)", () => {
    // a header claiming 600 bytes but with no data following
    const header = new Uint8Array(512);
    const enc = new TextEncoder();
    header.set(enc.encode("big.bin"), 0);
    header.set(enc.encode((600).toString(8).padStart(11, "0")), 124);
    header[156] = "0".charCodeAt(0);
    expect(() => walkLayerTar(header)).toThrow(/truncated tar entry/);
  });

  test("the REAL secret layer round-trips through gzip → tar → entry", () => {
    const blob = readFileSync(join(ASSETS, "secret-layer.tar.gz"));
    const tar = new Uint8Array(gunzipSync(blob));
    const entries = walkLayerTar(tar);
    expect(entries[0].name).toBe("app-credentials.env");
    // re-gzip + re-walk to prove the path is deterministic over real bytes
    const reTar = new Uint8Array(gunzipSync(gzipSync(tar)));
    expect(walkLayerTar(reTar)[0].name).toBe("app-credentials.env");
  });
});

describe("findBakedSecret — every credential pattern family", () => {
  function entry(body: string): LayerEntry {
    const bytes = new TextEncoder().encode(body);
    return { name: "f", size: bytes.length, bytes };
  }
  test("AWS secret access key assignment trips", () => {
    expect(findBakedSecret([entry("AWS_SECRET_ACCESS_KEY=abc123/def+ghi")])!.pattern).toBe("AWS secret access key");
  });
  test("AWS access key id trips", () => {
    expect(findBakedSecret([entry("aws_access_key_id = AKIAIOSFODNN7EXAMPLE")])!.pattern).toBe("AWS access key id");
  });
  test("a generic SECRET/TOKEN/PASSWORD/API_KEY assignment trips", () => {
    expect(findBakedSecret([entry("DB_PASSWORD=hunter2")])!.pattern).toBe("generic secret/token assignment");
    expect(findBakedSecret([entry("api_key = zzz")])!.pattern).toBe("generic secret/token assignment");
  });
  test("a PEM private key header trips", () => {
    expect(findBakedSecret([entry("-----BEGIN RSA PRIVATE KEY-----\nMIIE...")])!.pattern).toBe("PEM private key");
  });
  test("clean content returns null (the negative leg)", () => {
    expect(findBakedSecret([entry("just some logs\nno secrets here\n")])).toBeNull();
    expect(findBakedSecret([])).toBeNull();
  });
});

describe("verifyDigest — sha256 chain + malformed-digest guards", () => {
  test("the empty blob hashes to the well-known SHA-256 of empty", async () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const ok = await verifyDigest(new Uint8Array(0), "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(ok).toBe(true);
  });
  test("a non-sha256 algorithm or malformed hex is rejected without hashing", async () => {
    expect(await verifyDigest(new Uint8Array(0), "sha512:deadbeef")).toBe(false);
    expect(await verifyDigest(new Uint8Array(0), "sha256:notvalidhex")).toBe(false);
    expect(await verifyDigest(new Uint8Array(0), "no-colon")).toBe(false);
  });
  test("verifyDigest works on a sub-array view (correct byteOffset slicing)", async () => {
    // build a buffer with leading padding, then a view onto the empty-hash region (zero length)
    const backing = new Uint8Array([1, 2, 3, 4]);
    const view = backing.subarray(2, 2); // zero-length view at offset 2
    expect(await verifyDigest(view, "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(true);
  });
});
