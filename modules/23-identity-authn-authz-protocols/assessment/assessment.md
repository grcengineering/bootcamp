# Assessment — The Valet Key: Reading Who You Are and What You May Do

**Competency artifact (not a quiz).** Unaided, from real identity artifacts provided at assessment
time, the learner produces the evidence below. Every value is read off real bytes; the JWT/SAML
parser's parse tree and the OAuth/OIDC sim's verdict are the verifier.

## What the learner delivers

1. **Decoded JWT claims.** Decoding the base64url segments with no key, the learner reports the
   `header.alg` and the reserved claims `exp` and `iss`, demonstrating that a JWT is a signed claim
   readable by anyone holding it — not an encrypted secret. Each is gated by
   `region_labeled_correctly` (the selection equals the parser's true region) plus `field_value_is`
   / `decoded_artifact_matches` (the read/decode equals the oracle's output).

2. **An ordered OAuth2/OIDC dance.** The learner assembles the authorization-code + OIDC sequence in
   the correct order with correct routing — `authorization_request` → `authorization_response`
   (code) → `token_request` → `token_response` (token) → `resource_request` (Bearer) →
   `resource_response` — gated by `sequence_matches` against the real RFC 6749 state machine, and
   explains the valet-key separation and what a resource call before the token exchange returns
   (`invalid_request`).

3. **Read SAML control-truth.** From the clean assertion the learner reports the
   `AuthnContextClassRef` (how the user authenticated) and the `<Conditions NotOnOrAfter>` (the
   validity window). Gated by `region_labeled_correctly` and `field_value_is`.

4. **A Diff-the-Trace finding.** Given a clean artifact and a real tampered twin — an `alg:none` JWT
   and an assertion past its `NotOnOrAfter` — the learner clicks the single field where evidence
   contradicts the control claim (`region_labeled_correctly` against the parser's computed
   divergence, `field_value_is` on the divergent value) and writes a **finding**: field, clean
   value, broken value, control broken, framework reference.

## Honesty

Every artifact is real: the JWT is a real three-segment RFC 7519 token; the `alg:none` twin is a
real tampered instance with an empty signature segment (and a genuinely-past `exp`); the SAML
assertion is the OASIS example, and its expired twin is byte-identical except its `<Conditions
NotOnOrAfter>` is a past instant. The discriminating field is the parser's computed divergence over
the real bytes (and the staleness is `evaluateConditions()`'s computed comparison to "now") — never
an authored answer key. The learner can re-derive every JWT value with a base64url decode and every
assertion value by reading the XML.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
