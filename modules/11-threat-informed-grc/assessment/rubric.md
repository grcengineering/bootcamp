# Module 11 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| Control vs threat | O1 | Explains, without notes, why "we have a control for that" and "that control mitigates a threat we face" are different claims, and why only the second is defensible | §3, §4.1 |
| Coverage mapping | O2 | Builds a coverage map reading both signals — names every coverage gap (threat with no control) and reads the map's structure as threats × controls | §3, §4.3, §4.4 |
| Removal verdict | O3 | Recommends at least one control for kill/downgrade with evidence: names the assumed-mitigated threats, shows zero prioritized-threat mappings, states running cost; "always had it" is rejected | §4.4, §4.5, §5.2 |
| Stakeholder interview | O4 | Interview surfaces who produces the evidence, what work they were already doing, and where the control forces extra work — locating where truth lives vs where evidence is gathered | §4.6, §5.3 |
| Evidence by-product | O5 | Redesigned control flow makes evidence a by-product of real work; states why it is both cheaper and harder to fake, and names the threat it still mitigates | §4.7, §5.4 |
| Verified artifact | O6 | Validator run shows FAIL on both defects (coverage gap + zero-threat control) then PASS once resolved; exit code used as the verdict; map is CSV/JSON ready for the capstone | §4.4, §4.8, §6 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
