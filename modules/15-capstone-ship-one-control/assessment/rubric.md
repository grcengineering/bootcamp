# Module 15 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module — and the program.
A Not-yet routes the learner back to the named concept section. Every row maps to an objective.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Loop coverage | O1, O5 | The `capstone-manifest.yaml` maps all 7 loop stages to real artifacts and the validator reports full coverage + before/after, exit `0`; no stage is *claimed but unsatisfied* | §4.1–4.2, §5.1 |
| End-to-end integration | O2 | The scheduled/monitored path invokes the same QUERY → EVALUATE → EVIDENCE code as the manual run and produces the verdict the evidence claims (the seam holds) | §4.3 |
| Control-as-product | O3 | `README.md` names customers, a single accountable owner, a backlog with ≥1 honest known gap, a success metric, and a UX rationale | §4.4 |
| Before/after rigor | O4 | `before-after.md` compares the *same* control on ≥4 concrete dimensions, scores both sides against the 5 legacy problems, and names ≥1 residual gap cross-referenced to the backlog | §4.5, §5.3 |
| Critical diagnosis | O5 | Correctly distinguishes a stage that is *done* from one merely *claimed*, in their own work or a peer's (e.g., logging mistaken for monitoring) | §4.3, §5.4 |
| Trust argument | O6 | Explains to a non-manifesto stakeholder why the engineered control is more trustworthy, using the before/after and live monitoring as evidence, not assertion | §3, §2 |
| Reviewer reproduction | O2, O5 | A *different* reviewer reproduces the coverage proof and pipeline verdict from a clean checkout; the reproduction matches the claimed result | §4.6 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective pass-rate
feeds the rot model — any objective below `assessment_passrate_threshold` flags the **content** (not
the learner) for revision. Because this is the capstone, a sustained dip also points upstream: the
threads from Modules 1–14 that failed to integrate are the defect, not the learner.
