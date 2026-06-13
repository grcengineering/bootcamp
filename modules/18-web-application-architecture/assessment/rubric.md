# Rubric — Where the Claim Can Be True

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Explain the tiers | States what each tier (client / edge / app / data) does so each hop is a candidate control owner | §3, §4.1 |
| 2 | Map a claim to its tier | Names the tier that can produce each claim's truth + its NIST/SOC 2 control, and splits "in transit AND at rest" into SC-8 (every hop) and SC-28 (the DB) | §4.2, §4.3 |
| 3 | Trace the provenance | Recovers the client protocol from `Forwarded proto=https` and the client IP from `for=` — `region_labeled_correctly`, `field_value_is` | §4.4, §5.2 |
| 4 | Classify stateful vs stateless | Reads the `Set-Cookie SID` (stateful, server store) vs the `Bearer` JWT (stateless, signed token) and names which tier holds the state — `field_value_is`, `decoded_artifact_matches` | §4.5, §5.3 |
| 5 | Diagnose the defense-in-depth gap | Clicks the missing `Forwarded proto=` (WAF un-traversed), the cookie missing `Secure`/`HttpOnly`, the cached `/account` (`Age`), and the `alg:none` token — `region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches` | §4.7, §5.4 |
| 6 | Produce the finding | Writes per failure the owning tier, header/field, broken control, framework ref (SC-8/SC-23/SC-28/AU-3/IA-2), and owning team | §4.7, §7 |
