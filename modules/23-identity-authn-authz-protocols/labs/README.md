# Lab — The Valet Key (the Inspect-&-Assemble PEEL / TRACE surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no identity provider to stand up: the lab loads **real identity artifacts** and renders
them as selectable regions and orderable cards (the visual surface, `engine: visual`).

## What runs

- **The artifacts:**
  - a real three-segment HS256 JWT and its real `alg:none` / past-`exp` tamper twin, committed at
    `.ci/fixtures/assets/crypto/jwt-tokens.json`;
  - the OASIS SAML 2.0 example assertion and its expired-`<Conditions>` twin, committed at
    `.ci/fixtures/assets/identity/saml-assertion.xml` and `saml-assertion-expired.xml`;
  - the RFC 6749 §4.1 authorization-code + OIDC dance as orderable cards, committed at
    `.ci/fixtures/assets/identity/oauth-oidc-dance.json`.
- **The oracles:**
  - `web/src/engines/visual/jwt.ts` base64url-splits the JWT segments and JSON-decodes the
    header/payload — the decode (no key) IS the oracle;
  - `web/src/engines/visual/saml.ts` reads the assertion's `<Issuer>`, `<Subject>/<NameID>`,
    `<Conditions NotBefore/NotOnOrAfter>`, `<AudienceRestriction>`, `<AuthnStatement>`, and
    `<AuthnContextClassRef>` (field reading only — **not** XML-DSig validation; the module says so);
  - `web/src/engines/visual/oauth-oidc-sim.ts` runs the real RFC 6749 / OIDC Core state machine —
    the accepted order, and the `invalid_request` a wrong move raises, are the protocol's behaviour.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`,
  `sequence_matches`) reading the parse tree / trace probe. The golden/anti transcripts in
  `exercises/transcripts/` replay the learner's select/decode/order actions through the same
  surface the player drives.

## Why this is honest

The JWT decode is fidelity-checked against a base64url decode of the committed token
(`web/tests/crypto-fidelity.test.ts`); the SAML reader and the OAuth/OIDC sim are checked against
the cited RFC/OASIS values and the real error codes in `web/tests/identity-protocol.test.ts`. The
`alg:none` twin is a real tampered instance; the expired assertion is byte-identical to the clean
one except its `<Conditions NotOnOrAfter>` is a past instant, and the staleness verdict is
`evaluateConditions()`'s computed comparison to "now," never an authored answer. See
`.ci/fixtures/assets/identity/README.md` and `.ci/fixtures/assets/crypto/README.md` for full
provenance. The parser / state-machine over the real bytes IS the oracle.
