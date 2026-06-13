# Lab — Peel the Image (the Inspect-&-Assemble surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh` to
run: the lab loads two **real OCI images** — a clean stock `alpine:latest` and a misconfigured
`docker build` twin — and renders their manifest, config, and layer tars as nested,
keyboard-selectable regions (the PEEL / MAP / Diff surface, `engine: visual`).

## What runs

- **The artifacts:** the two images' real blobs in `.ci/fixtures/assets/containers/` —
  `clean-manifest.json` / `clean-config.json` (stock alpine arm64v8), `misconfigured-manifest.json` /
  `misconfigured-config.json` (the real `docker build` twin), and `secret-layer.tar.gz` (the real
  gzip'd tar of the twin's added layer, whose single entry is `/app-credentials.env`). The fixture
  `oci-images.json` wires the blobs together with provenance, the per-image `oci_truth`, the
  findings→controls MAP key, and the three Diff-the-Trace control pairs.
- **The oracle:** the ported OCI image reader (`web/src/engines/visual/oci.ts`) — `parseOci` turns the
  manifest + config into a nested parse tree (config `User`/`ExposedPorts`/`Env`/`Cmd` + the ordered
  layer descriptors with real sha256 digests); `walkLayerTar` + `findBakedSecret` decompress and walk
  the real layer tar to surface the baked secret. The seed (`web/src/lib/oci-seed.ts`) builds the
  panels the same way `lib/api-seed` builds the api panels, so the browser and the replay test see
  byte-identical panels.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `mapping_correct`) reading those
  probes. The golden/anti transcripts in `exercises/transcripts/` replay the learner's
  select / read / place actions through the same surface the player drives
  (`web/tests/exercise-replay-21.test.ts`).

## Why this is honest

OCI is content-addressable. Each manifest cites its config and each layer by `sha256:<hex>`, and every
one of those digests **equals the recomputed SHA-256 of the committed blob** (`shasum -a 256` at
capture time and `web/tests/oci-fidelity.test.ts` via `crypto.subtle`). A tampered blob would fail the
digest check, so the fixtures cannot silently drift. The baked secret is read straight from the real,
decompressed `secret-layer.tar.gz`; `findBakedSecret` trips on the credential with the same
pattern family a real secret scanner uses — the credential genuinely lives in that layer's bytes (a
documented AWS *example* key, not a live secret, but really written into the real tar). The clean twin
is the upstream stock image, not a fully-hardened one: stock alpine has no explicit `User`, which per
the OCI runtime default also means root — the reader reports that honestly ("absent → defaults to
root"), and the teaching contrast is the set of findings the misconfigured build *adds*. The
discriminating field in each diff is the reader's computed divergence over two real images. There is no
answer key; the reader is the answer key. Anyone can `docker save` the same tags and recompute the
identical digests.
