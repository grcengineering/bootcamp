# Module 06 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| API mental model | O1 | Can explain API-as-service-counter and read a status code as a verdict, to a non-engineer | §3, §4.2 |
| LOCATE the truth | O2 | Maps the control claim to the exact endpoint + field, and reports both the raw and active no-MFA counts with a justified choice | §4.1, §5.1, §5.3 |
| Auth ladder | O3 | Names the correct auth rung for the API, requests least-privilege scope, and distinguishes a `401` from a `403` | §4.3, §4.2 |
| Complete pagination | O4 | Aggregates across **all** pages and verifies the count against the advertised `total`; refuses to report on a truncated pull | §4.4, §5.2, §5.4 |
| Rate-limit handling | O5 | Explains the correct `429` response (honor `Retry-After`, back off) and why dropping records on `429` is silent incompleteness | §4.5 |
| Audit-ready artifact | O6 | Git-versioned script emits a control-mapped report and exits PASS / FAIL / tooling-error as distinct codes | §5.3, §5.4 |
| Reproducibility & ownership | O6 | Report is byte-identical on re-run and lives in Git with a README naming the control | §5.4, §6 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
