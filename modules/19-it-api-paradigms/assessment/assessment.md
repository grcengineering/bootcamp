# Assessment — Four Counters, One Question: Where the Control Lives

**Competency artifact (not a quiz).** Unaided, from the four real contracts and four clean/broken
capture pairs provided at assessment time, the learner produces the evidence below. Every value is
read off real artifacts; the contract/wire parsers + the SHA-1/Base64 digest transform are the
verifiers. The protobuf decode is byte-exact-verified against protobuf.dev's examples.

## What the learner delivers

1. **Four located truth-fields.** From the four machine-readable contracts, the learner selects the
   MFA truth-field in each — OpenAPI `components.schemas.User.properties.mfa_enabled` (boolean), WSDL
   `sp:SignedParts` (Body must be signed), SDL `User.mfaEnabled` (Boolean!), .proto `mfa_enabled = 2`
   (field tag 2). Gated by `region_labeled_correctly` against each real parser's tree and
   `field_value_is` on the read value.

2. **A decoded gRPC frame.** The learner reads the `:path` (intent, not a verb), the 1-byte
   compressed-flag, the 4-byte big-endian length, and — after calibrating on `a = 150 → 08 96 01` —
   the protobuf byte pair `0x10 0x00` decoding to `mfa_enabled = false`. Gated by
   `region_labeled_correctly` and `decoded_artifact_matches` against the real protobuf decoder.

3. **A recomputed credential digest.** The learner recomputes the WS-Security PasswordDigest
   `Base64(SHA-1(nonce + created + password))` and confirms it reproduces the clean envelope's stated
   digest — then watches it diverge on the stale-Created twin. Gated by `decoded_artifact_matches`
   against the transform (the oracle), never the envelope's claim.

4. **A four-paradigm Diff-the-Trace determination.** For each bad twin, the learner clicks the single
   field/byte where the control breaks — the REST response's extra `salary`/`ssn` property (API3), the
   GraphQL 12-deep circular + introspection (API4+API9), the SOAP stale `wsu:Created` whose recomputed
   digest no longer matches (API2), the gRPC reflection-in-prod `:path` + `alg:none` JWT (API9+API2) —
   then fills a one-screen determination grid stating, per paradigm, the completeness-proof method, the
   runtime feature that must be OFF, and the OWASP API 2023 mapping. Gated by `region_labeled_correctly`,
   `decoded_artifact_matches` (SOAP digest), `validator_passes` (the GraphQL limiter rejecting the
   circular query), and `mapping_correct` (the OWASP-to-paradigm grid, cited).

## Honesty

Every contract and capture is a real artifact over the shared eight-user `acme.example` model; each
bad twin is a genuine instance of the misconfiguration. The protobuf decode is byte-exact against
protobuf.dev's verified examples; the SOAP digest is the SHA-1/Base64 transform's real output over the
real bytes (the OASIS example nonce/created with a cited password, recomputed — never an authored
string). The discriminating field is each oracle's computed divergence. There is no answer key; the
decoder is the answer key.
