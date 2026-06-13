# Rubric — The Valet Key

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Decode a JWT claim with no key | Selects the JWT header at its true boundary and decodes it to `{"alg":"HS256",…}` with no key — `region_labeled_correctly`, `decoded_artifact_matches` | §3, §4.1 |
| 2 | Read the expiry claim | Reads `jwt.payload.exp` off the payload as the token's expiry deadline — `field_value_is` | §4.2, §5.1 |
| 3 | Read the issuer claim | Reads `jwt.payload.iss` and states why a verifier must pin the issuer — `field_value_is` | §4.2 |
| 4 | Compose the valet-key dance | Orders the OAuth2/OIDC authorization-code dance with correct routing so the sim reaches resource access — `sequence_matches` | §4.3, §5.3 |
| 5 | Read the authentication method | Reads the SAML `AuthnContextClassRef` as how the user authenticated — `field_value_is`, `region_labeled_correctly` | §4.4 |
| 6 | Read the validity window | Reads the clean assertion's `<Conditions NotOnOrAfter>` and states the SP rejects at/after it — `field_value_is` | §4.4, §5.4 |
| 7 | Diagnose alg:none | On the tamper twin, selects `jwt.header.alg` and reads `none`, the unsigned-token break — `region_labeled_correctly`, `field_value_is` | §4.5, §5.4 |
| 8 | Diff-the-Trace: stale assertion | On the expired twin, clicks the single divergent field `NotOnOrAfter` and reads the past value — `region_labeled_correctly`, `field_value_is` | §4.6, §5.4 |
| 9 | Write the access finding | Writes a finding naming the field, both values, control broken, and framework ref (AC-3 / IA-2 / CC6.1) | §2, §5.4 |
