# Assessment — Where the Claim Can Be True: Tracing a Request Through the Tiers

**Competency artifact (not a quiz).** Unaided, from real HTTP-header artifacts and a real JWT
provided at assessment time, the learner produces the evidence below. Every value is read off a real
header/token; the `hdr` header parser and the `jwt` decoder are the verifiers. Each clean/broken
pair's discriminating field is the parser's computed divergence over the two real header values, not
a stored answer.

## What the learner delivers

1. **A per-tier control-ownership map.** The learner maps each control claim onto the tier that can
   produce its truth — WAF→edge/reverse-proxy (SC-7/CC6.6), authN/authZ→application (AC-3/IA-2),
   TLS-in-transit→every hop (SC-8), encryption-at-rest→data tier (SC-28), logging→THROUGHOUT
   (AU-2/AU-3) — and splits "encrypted in transit AND at rest" into its two owning tiers. Gated by
   `region_labeled_correctly` / `field_value_is` on the header each claim's truth is read from (or
   `mapping_correct` against the cited tier-ownership key in the MAP variant).

2. **Recovered provenance.** From the request as it arrives at the app tier, the learner reads the
   client's protocol from `Forwarded proto=https` and the real client IP from `for=` — the only way
   the app can know what the client did after upstream TLS termination. Gated by
   `region_labeled_correctly` and `field_value_is` against the RFC 7239 parser.

3. **A stateful/stateless classification.** The learner classifies the `Set-Cookie SID=…` session
   (stateful — an opaque pointer at the application tier's store, protected by `Secure`/`HttpOnly`)
   against the `Bearer` JWT (stateless — a signed token that IS the state, verified by the app),
   naming which tier holds the state in each. Gated by `field_value_is` / `decoded_artifact_matches`.

4. **A four-pair Diff-the-Trace finding.** For each broken twin, the learner clicks the single field
   where the control breaks at its owning tier — the missing `Forwarded proto=` (WAF un-traversed,
   the defense-in-depth gap), the cookie missing `Secure`/`HttpOnly` (SC-23 session gap), the
   `/account` response carrying an `Age` header that proves a shared cache served a sensitive response
   (SC-8/SC-28-adjacent), and the `alg:none` token (IA-2 unprotected) — then writes a finding naming
   the tier, header/field, broken control, framework reference, and owning team. Gated by
   `region_labeled_correctly`, `field_value_is`, and `decoded_artifact_matches`.

## Honesty

Every header is a real RFC-literal value the `hdr` oracle parses per its RFC grammar; the JWT is a
real three-segment HS256 token (its alg:none twin a real RFC 8725 §2.1 unprotected-token instance).
The discriminating field in each pair is the parser's computed divergence over the two real headers —
`proto=` present vs absent, `Secure`/`HttpOnly` present vs stripped, `no-store` vs a cached
`public`+`Age`, a signed `alg` vs `none`. There is no answer key; the parser's parse tree is the
answer key.
