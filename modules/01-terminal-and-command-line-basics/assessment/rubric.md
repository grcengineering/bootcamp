# Module 01 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Orientation | O3 | Correctly states location and surroundings from the prompt / `pwd` / `ls`, unprompted | §4.1–4.2 |
| REPL fluency | O2 | Traces a command through read → evaluate → run → output without notes | §3 |
| Composition | O4 | Solves it with piped small programs; no monolithic shortcut tool | §4.3 |
| Stream control | O4, O5 | Evidence file is clean; errors are in a separate log via `2>`; explains *why* | §4.3 |
| Verdict | O5 | Uses the exit code as the machine-readable result; states the pass-code correctly | §4.4 |
| Reproducibility | O6 | Script runs twice with identical evidence; articulates the GRC link | §4.6 |
| Explanation quality | O1 | Could explain "terminal vs shell" to a non-engineer using the origin story | §3 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
