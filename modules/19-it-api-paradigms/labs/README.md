# Lab — Four Counters, One Question (the Inspect-&-Assemble surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run: the lab loads four **real machine-readable contracts** and four **real clean/broken wire
payload pairs** over the SAME eight-user `acme.example` model and renders them as nested,
keyboard-selectable regions (the PEEL / Diff / build-and-break surface, `engine: visual`).

## What runs

- **The artifacts:** the four contracts (`.ci/fixtures/assets/api/users.openapi.json`,
  `users.wsdl`, `users.graphql`, `users.proto`), the gRPC-over-HTTP/2 exchange
  (`grpc-listusers.json`), the side-by-side payloads (`payloads.json`), and the four-paradigm
  Diff-the-Trace pairs (`diff-the-trace.json`).
- **The oracles:** the contract parsers (`oas`/`wsdl`/`sdl`/`proto`), the protobuf-wire + HTTP/2
  decoder (`pbwire`), the GraphQL limiter sim (`gqlsim`), and the SHA-1/Base64 WS-Security digest
  transform — all in `web/src/engines/visual/`. Each parses the real artifact into a nested parse
  tree (or runs the real validation rule); every node value is computed from the real bytes/records.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`,
  `validator_passes`, `mapping_correct`) reading those probes. The golden/anti transcripts in
  `exercises/transcripts/` replay the learner's select/read/decode actions through the same surface
  the player drives.

## Why this is honest

The protobuf decode is **byte-exact-verified** against protobuf.dev's verified examples
(`a = 150 → 08 96 01`; `b = "testing" → 12 07 74 65 73 74 69 6e 67`; `mfa_enabled = false → 10 00`)
in `web/tests/pbwire-fidelity.test.ts`. The SHA-1 transform stands on RFC 3174 vectors; the
WS-Security PasswordDigest is the transform's real output over the OASIS example nonce/created with a
cited password (recomputed, never authored). The contract truth-fields are read off the real spec
grammars. The four bad twins are genuine instances of each misconfiguration. The discriminating field
is each oracle's computed divergence — there is no answer key. The decoder is the answer key.
