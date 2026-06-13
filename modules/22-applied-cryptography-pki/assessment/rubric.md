# Rubric — The Padlock Is a Lie

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Sort by running the transform | Labels SHA-256 as HASH and base64 as ENCODE because the transform reverses (or never does), not by appearance — `region_labeled_correctly`, `decoded_artifact_matches` | §3, §4.1 |
| 2 | Encoding ≠ protection | Decodes the JWT header with no key to readable JSON and states a signed token is not an encrypted secret — `decoded_artifact_matches` | §4.1, §5.1 |
| 3 | Locate the in-transit deadline | Selects the leaf's notAfter and states it anchors the in-transit half of the claim — `region_labeled_correctly`, `field_value_is` | §4.3, §5.2 |
| 4 | Read the binding fields | Reads BasicConstraints (CA:FALSE) and the SAN (the host covered) off the real leaf — `field_value_is` | §4.4, §5.2 |
| 5 | Read the chain link | Reads the issuer and states which next cert's subject it must equal to chain — `field_value_is` | §4.4 |
| 6 | Compose the handshake | Orders the TLS 1.3 full-handshake so the sim reaches the established state — `sequence_matches` | §4.5, §5.3 |
| 7 | Trigger the real refusal | Plays a message out of order and reads the real `unexpected_message(10)` alert — `sim_alert_is` | §4.5, §5.3 |
| 8 | Diff-the-Trace (expired) | Clicks the divergent notAfter on the real expired cert and binds it to openssl code 10 — `region_labeled_correctly`, `field_value_is` | §4.6, §5.4 |
| 9 | Diff-the-Trace (wrong host) | Clicks the divergent SAN on the real wrong-host cert (does not cover the host) — `region_labeled_correctly`, `field_value_is` | §4.6, §5.4 |
| 10 | Re-runnable evidence verdict | Confirms SHA-256("")=e3b0c442… and maps in-transit→CC6.7/SC-8, at-rest→CC6.1/SC-28+SC-13 — `decoded_artifact_matches` | §2, §4.7 |
