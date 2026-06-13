# Rubric — Four Counters, One Question

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Locate the contract truth-field | Selects `mfa_enabled`/`mfaEnabled`/`mfa_enabled = 2`/`sp:SignedParts` in each of the four real contracts at its true node — `region_labeled_correctly` + `field_value_is` | §3, §4.1 |
| 2 | Read the four wire shapes | Maps each payload to its contract + control surface and reads the REST sparse vs over-fetch difference — `field_value_is` | §4.2, §5 |
| 3 | Locate + recompute the credential | Places each paradigm's credential (header bearer vs in-message WS-Security) and recomputes the SOAP PasswordDigest to match the clean envelope — `decoded_artifact_matches` | §4.3 |
| 4 | Compose + decode precision | Reads the precise GraphQL query's depth and the gRPC `mfa_enabled = false` byte (`0x10 0x00`) off the wire — `field_value_is`, `decoded_artifact_matches` | §4.4, §4.5 |
| 5 | Diagnose the four control surfaces | Clicks the divergent field in each bad twin (REST field, GraphQL depth+introspection, SOAP stale-Created digest, gRPC reflection+alg:none) — `region_labeled_correctly`, `decoded_artifact_matches`, `validator_passes` | §4.6, §5 |
| 6 | Produce the determination grid | Maps each failure to its OWASP API 2023 item (API3/API4/API9/API2) with the completeness-proof method and the feature that must be OFF — `mapping_correct` | §4.6, §7 |
