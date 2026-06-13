# API-paradigms fixtures (module 19) — provenance

Real machine-readable contracts + wire payloads over ONE shared model — the eight-user
`acme.example` set (four lack MFA) — so "the same control question, four shapes" is byte-for-byte
concrete. The parser / decoder / transform over each artifact IS the oracle (VISUAL-ENGINE-SPEC
honesty doctrine); there is no authored answer key.

## The shared model

`User { email, mfa_enabled }` over eight users: alice, carol, erin, grace have MFA; bob, dan,
frank, heidi do not. Every contract and payload names the SAME field; only the shape differs.

## Files

| File | What | Oracle | Provenance / match class |
|------|------|--------|--------------------------|
| `users.openapi.json` | OpenAPI 3.1.0 REST contract | `oas` | Authored to OpenAPI 3.1.0 (spec.openapis.org); the truth-field is `components.schemas.User.properties.mfa_enabled: boolean`. match: authored-with-citation |
| `users.wsdl` | WSDL 1.1 + WS-SecurityPolicy SOAP contract | `wsdl` | Authored to WSDL 1.1 (w3.org/TR/wsdl) + WS-SecurityPolicy 1.2; the truth-field is `sp:SignedParts` (Body must be signed). match: authored-with-citation |
| `users.graphql` | GraphQL SDL | `sdl` | Authored to the GraphQL SDL spec (spec.graphql.org); `type User { mfaEnabled: Boolean! }`. match: authored-with-citation |
| `users.proto` | protobuf proto3 gRPC contract | `proto` | Authored to proto3 (protobuf.dev); `bool mfa_enabled = 2;` (the `= 2` field tag bridges to the wire). match: authored-with-citation |
| `grpc-listusers.json` | gRPC-over-HTTP/2 ListUsers exchange | `pbwire` | The protobuf message body is the wire encoding of the shared 8-user seed; the encoder was byte-exact-verified this session against protobuf.dev's examples (a=150 → `08 96 01`; b="testing" → `12 07 74 65 73 74 69 6e 67`; mfa_enabled=false → `10 00`). gRPC framing `[flag:1B][len:4B BE][msg]` per grpc PROTOCOL-HTTP2.md. match: computed |
| `payloads.json` | REST (full/sparse) + SOAP envelope + GraphQL query/response + credentials | `oas`/`wsdl`/`sdl` | Real payloads over the shared seed; the REST over-fetch/sparse sizes are MEASURED from these committed bytes (the published JSON:API reference figure is ~22.7KB/~2.5KB). The WS-Security UsernameToken uses the OASIS example Nonce/Created; the PasswordDigest is the SHA-1/Base64 transform's recomputed output over those values + the OASIS example password (self-consistent). JWT per RFC 7519. match: authored-with-citation / computed |
| `diff-the-trace.json` | Four clean/broken pairs, one control failure per paradigm | `oas`/`wsdl`/`sdl`/`pbwire`/`gqlsim` | Each broken twin is a real instance of its misconfiguration: REST over-returns `salary`/`ssn` (API3); GraphQL is a 12-deep circular selection set + introspection (API4+API9); SOAP carries a stale `wsu:Created` whose recomputed digest no longer matches (API2); gRPC routes to the server-reflection `:path` with an `alg:none` JWT (API9+API2). OWASP API Security Top 10 2023. match: authored-with-citation |

## Honesty notes

- **Byte-exact protobuf.** The gRPC body bytes are the real wire encoding, verified against
  protobuf.dev's published examples in `web/tests/pbwire-fidelity.test.ts` — the decoder asserts
  `a=150 → 08 96 01`, `b="testing" → 12 07 74 65 73 74 69 6e 67`, and `mfa_enabled=false → 10 00`.
- **WS-Security digest.** `PasswordDigest = Base64(SHA-1(nonce + created + password))`. The cited
  OASIS digest (`weYI3nXd8LjMNVksCKFV8t3rgHh3Rw==`) could not be reproduced from the cited inputs
  (its source password is undisclosed), so — per the honesty doctrine (the transform is the oracle,
  never an authored string) — the fixture commits the digest RECOMPUTED from the OASIS example
  Nonce/Created + the OASIS example password `taadtaadpstcsm`: `AtYMdWClJo7PIuTpqmhmEEoEZyc=`. The
  stale-Created twin's recomputed digest (`xsV9u/k/s5u5fCiDHO0Mx6IP92w=`) diverges — the computed
  replay finding. SHA-1 is fidelity-checked against RFC 3174 vectors.
- **The diff divergence is computed.** Each Diff-the-Trace discriminating field is the oracle's
  computed difference between the clean and broken artifact, not a stored answer.
