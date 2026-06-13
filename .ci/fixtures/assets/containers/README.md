# Container fixtures — real OCI image bytes (honesty doctrine)

Every blob in this directory is a real, content-addressed OCI artifact. Nothing here is authored
or invented — the digests prove it.

## What was captured, how, and when

- **When:** 2026-06-13.
- **How:**
  - **Clean twin** — `docker pull alpine:latest && docker save alpine:latest`. The OCI-layout
    tarball's image index pointed at the multi-arch index; the host-platform (arm64v8) image
    manifest `sha256:74e11dac…` cites config `sha256:92385f4b…` and one rootfs layer
    `sha256:c05efffa…`. The manifest and config blobs are committed here verbatim.
  - **Misconfigured twin** — a real `docker build` (buildkit) from the Dockerfile recorded in
    `oci-images.json` → provenance, then `docker save`. Image manifest `sha256:7869dc00…` cites
    config `sha256:2cd49630…` and two layers: the stock rootfs `sha256:c05efffa…` plus a new
    178-byte layer `sha256:48092d72…` whose tar carries `/app-credentials.env`. The manifest,
    config, and the secret-bearing layer (`secret-layer.tar.gz`) are committed here verbatim.

## The committed real blobs

- `clean-manifest.json` / `clean-config.json` — stock alpine:latest (arm64v8).
- `misconfigured-manifest.json` / `misconfigured-config.json` — the real `docker build` twin
  (User root, ExposedPorts 22 + 8080, expanded Env, two layers).
- `secret-layer.tar.gz` — the real gzip'd tar of the second layer; its single entry is
  `/app-credentials.env` containing a documented AWS *example* secret key.
- `oci-images.json` — the derived fixture wiring the blobs together with provenance, the per-
  image `oci_truth`, and the three Diff-the-Trace control pairs.

## Why this is the oracle, not an answer key

OCI is content-addressable. Each manifest cites its config and each layer by `sha256:<hex>`, and
every one of those digests **equals the recomputed SHA-256 of the committed blob** (verified with
`shasum -a 256` at capture time and by `web/tests/oci-fidelity.test.ts` via `crypto.subtle`). The
TS OCI reader (`web/src/engines/visual/oci.ts`) parses these exact blobs; the parse tree is the
oracle the PEEL surface shows and the verifiers gate against. A tampered blob would fail the
digest check, so the fixtures cannot silently drift.

The baked-secret leg is equally honest: `walkLayerTar` decompresses `secret-layer.tar.gz` and
reads the real `/app-credentials.env`; `findBakedSecret` trips on the credential with the same
pattern family a real secret scanner uses. The secret genuinely lives in that layer's bytes —
the puzzle is generated from the parser's read, not from a stored "right answer."

> Note on the "clean" twin: stock alpine has no explicit `User`, which per the OCI runtime
> default means it too runs as root. The parser reports this honestly ("absent → defaults to
> root"); the teaching contrast is the set of findings the misconfigured build *adds*. See the
> `honesty_note` in `oci-images.json`.
