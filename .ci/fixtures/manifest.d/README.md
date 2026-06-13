# `manifest.d/` — per-module fidelity-manifest fragments

The fidelity manifest is **`../manifest.yaml` PLUS every `*.yaml` file in this directory.** A single
shared loader (`../load-manifest.ts`, `loadManifest()`) reads the base file and merges every fragment
here into one manifest with the identical shape every consumer already expects:

```
{ meta, seeds, hole_defs, entries }
```

This split exists so the Wave-4 module agents (modules 17–25) can each add their own taught-command
surface **without touching `manifest.yaml` and without colliding on a merge.** One agent, one fragment.

## How to write a fragment

Create `manifest.d/m<NN>-<topic>.yaml` (e.g. `m22-applied-cryptography-pki.yaml`). A fragment carries
**only** `entries:` and (optionally) `seeds:` — never `meta:` or `hole_defs:` (those are global and
live in the base file; the loader rejects a fragment that defines them).

```yaml
# manifest.d/m22-applied-cryptography-pki.yaml
seeds:                              # optional — only if your module needs a new seed profile
  m22:
    kind: visual                    # Wave-4 visual engine: REAL bytes committed under
                                    # .ci/fixtures/assets/<topic>/*.json (no home tree, no PATH tools)
entries:
  - id: m22-cert-validity           # ids are globally unique across the base + ALL fragments
    module: "22"
    source: authored                # one of: docker-linux-userland | docker-linux-booted |
    match: authored-with-citation   #         macos-host | pwsh-authored | wasm-engine | authored
    citation: "RFC 5280 §4.1 …"     # authored/pwsh-authored REQUIRE a citation (manifest-lint gate)
    cmd: "openssl x509 -text -noout -in leaf.pem"
```

## Rules the loader enforces (and `manifest-lint.ts` checks per-entry)

1. **No `meta` / `hole_defs` in a fragment** — global-only; the loader throws naming your file.
2. **Globally-unique entry `id`** — a duplicate across the base or any other fragment throws,
   naming both owners. Prefix every id with your module (`m17-…`, `m22-…`) to stay collision-free.
3. **One owner per seed** — redefining a `seeds:` key that the base or another fragment already
   owns throws. Namespace your seed by module id.
4. Every per-entry rule in `manifest-lint.ts` still applies to your fragment's entries: valid
   `source` + `match` class, the booted-family provenance gate, captured-fixture coverage for
   `docker-*`/`macos-host` entries, and a `citation` on every `authored`/`pwsh-authored` entry.

## Honesty doctrine (constitutional)

Every fixture an entry points to is REAL bytes/records captured with local tools (openssl certs,
`dig` DNS wire bytes, `docker inspect`/`docker save` OCI manifests, real JWTs, `xxd`/`python3`), or —
where capture is impossible — **authored from the cited RFC/spec** with the citation in the entry
(`match: authored-with-citation`). The parser/engine/state-machine over those bytes is the oracle;
there is never an authored answer key. See `research/it-foundations/VISUAL-ENGINE-SPEC.md` §3.

Fragments are merged in lexicographic filename order; merge order never affects correctness because
ids and seed keys are unique. `manifest.d/` is optional — with no fragments, the base manifest is
unchanged.
