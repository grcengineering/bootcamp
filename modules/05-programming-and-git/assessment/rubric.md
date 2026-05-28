# Module 05 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Compose from primitives | O2 | Reads a directory and judges records using variables, a collection, a conditional, and a loop; can trace the data flow | §4.1–4.3 |
| Function + file + exceptions | O3 | A parse-and-judge function reads files and survives a malformed one via `try`/`except`, recording it rather than crashing | §4.4–4.5 |
| Meaningful tests | O4 | Suite asserts good-pass, bad-fail, missing-field-fail, and malformed-recorded; no assertion-free coverage padding | §4.6 |
| Diagnose correctly | O5 | Distinguishes a failing assertion (logic bug) from a recorded report error (honest finding) and acts accordingly | §4.5–4.6, §5.4 |
| Git-as-control mapping | O6 | Maps branch / commit / PR / merge to who-changed-what, review, and the immutable record — in their own words | §3, §4.7 |
| Change-managed history | O7 | Git history shows ≥1 feature branch reviewed in a PR and merged; commit messages explain *why* | §4.7, §5.3 |
| Explanation quality | O1 | Could explain "a program is data + decisions + repetition" to a non-programmer | §3 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
