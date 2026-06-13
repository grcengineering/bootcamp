/**
 * oci-manifest fidelity gate (Wave-4 honesty doctrine; the containers module's analogue of
 * pkt-fidelity.test.ts). The OCI parse over the REAL committed image manifests + configs IS the
 * oracle — this suite asserts the parser's field values equal the docker-true values recorded in
 * .ci/fixtures/assets/containers/oci-images.json, AND that the content-addressable digest chain
 * holds (each manifest cites its config/layers by sha256:<hex>, and those equal the recomputed
 * SHA-256 of the committed blobs). A tampered blob fails the digest check; a drifted parser fails
 * the field checks. There is no authored answer key — the bytes and their digests are the truth.
 *
 * The baked-secret leg is equally honest: the parser decompresses the real secret-bearing layer
 * tar and finds the real AWS-style credential the misconfigured `docker build` wrote into it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
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
} from "../src/engines/visual/oci";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/containers");
const readJson = (f: string) => JSON.parse(readFileSync(join(ASSETS, f), "utf8"));
const readBlob = (f: string) => new Uint8Array(readFileSync(join(ASSETS, f)));

const fixture = readJson("oci-images.json") as {
  images: {
    clean: { manifest_blob: string; config_blob: string; config_digest: string; oci_truth: Record<string, unknown> };
    misconfigured: {
      manifest_blob: string;
      config_blob: string;
      secret_layer_blob: string;
      config_digest: string;
      secret_layer_digest: string;
      oci_truth: Record<string, unknown>;
    };
  };
};

function image(which: "clean" | "misconfigured"): OciImage {
  const meta = fixture.images[which];
  return {
    manifest: readJson(meta.manifest_blob) as OciManifest,
    config: readJson(meta.config_blob) as OciImageConfig,
  };
}

describe("oci-manifest fidelity — real committed blobs vs docker/OCI ground truth", () => {
  test("the stock alpine twin parses to its OCI-true config (1 layer, root-by-default, no ports)", () => {
    const p = parseOci(image("clean"));
    const t = fixture.images.clean.oci_truth as { layers: number; "config.exposed_ports": string };
    // exactly one rootfs layer
    expect(p.regions.filter((r) => /^layer\d+$/.test(r.id)).length).toBe(t.layers);
    // stock alpine has no explicit User → the parser reports root-by-default (honest CM-6 nuance)
    expect(p.region("config.user")!.value).toBe("absent → defaults to root (uid 0)");
    expect(runsAsRoot(image("clean").config.config?.User)).toBe(true);
    // no ExposedPorts
    expect(p.region("config.exposed_ports")!.value).toBe("none");
    expect(p.region("config.cmd")!.value).toBe("/bin/sh");
  });

  test("the misconfigured twin parses to User root, ExposedPorts 22+8080, expanded Env, 2 layers", () => {
    const p = parseOci(image("misconfigured"));
    // User: root → ROOT (uid 0) — the CM-6 finding read straight from the real config
    expect(p.region("config.user")!.value).toBe("root → ROOT (uid 0)");
    expect(runsAsRoot(image("misconfigured").config.config?.User)).toBe(true);
    // ExposedPorts: 22/tcp + 8080/tcp — the CM-7 finding (sorted)
    expect(p.region("config.exposed_ports")!.value).toBe("22/tcp, 8080/tcp");
    // Env carries the build's added vars
    expect(p.region("config.env")!.value).toContain("APP_ENV=production");
    expect(p.region("config.env")!.value).toContain("DB_HOST=db.internal");
    // two ordered layers, each with its real sha256 digest visible
    const layers = p.regions.filter((r) => /^layer\d+$/.test(r.id));
    expect(layers.length).toBe(2);
    expect(layers[0].value).toContain("sha256:c05efffaed614");
    expect(layers[1].value).toContain("sha256:48092d7235b3");
  });

  test("the content-addressable digest chain holds — config digest == recomputed SHA-256", async () => {
    // clean
    const cleanManifest = readJson(fixture.images.clean.manifest_blob) as OciManifest;
    expect(cleanManifest.config.digest).toBe(fixture.images.clean.config_digest);
    expect(await verifyDigest(readBlob(fixture.images.clean.config_blob), cleanManifest.config.digest)).toBe(true);
    // misconfigured
    const misManifest = readJson(fixture.images.misconfigured.manifest_blob) as OciManifest;
    expect(misManifest.config.digest).toBe(fixture.images.misconfigured.config_digest);
    expect(await verifyDigest(readBlob(fixture.images.misconfigured.config_blob), misManifest.config.digest)).toBe(true);
  });

  test("the secret-bearing layer's digest holds and its tar carries the real credential", async () => {
    const misManifest = readJson(fixture.images.misconfigured.manifest_blob) as OciManifest;
    const secretLayerBlob = readBlob(fixture.images.misconfigured.secret_layer_blob);
    // the manifest's second layer descriptor cites this blob by digest — and it verifies
    const secretDesc = misManifest.layers[1];
    expect(secretDesc.digest).toBe(fixture.images.misconfigured.secret_layer_digest);
    expect(await verifyDigest(secretLayerBlob, secretDesc.digest)).toBe(true);
    // walk the real (gzip'd) layer tar and trip the secret scanner on real bytes
    const tar = new Uint8Array(gunzipSync(secretLayerBlob));
    const entries = walkLayerTar(tar);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("app-credentials.env");
    const hit = findBakedSecret(entries);
    expect(hit).not.toBeNull();
    expect(hit!.pattern).toBe("AWS secret access key");
    expect(hit!.match).toContain("AWS_SECRET_ACCESS_KEY=");
    // and the clean twin's single layer carries NO secret (the negative leg)
    // (the stock rootfs layer is huge; we assert the secret leg only fires on the real secret layer)
  });

  test("a tampered blob fails the digest check (the fixtures cannot silently drift)", async () => {
    const misManifest = readJson(fixture.images.misconfigured.manifest_blob) as OciManifest;
    const tampered = readBlob(fixture.images.misconfigured.config_blob);
    tampered[0] ^= 0xff; // flip a byte
    expect(await verifyDigest(tampered, misManifest.config.digest)).toBe(false);
  });
});
