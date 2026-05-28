# Module 10 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Spine vs profile | O1 | Explains why 800-53 (the superset) is the spine and the other frameworks are profiles selecting subsets of it — without notes | §3 |
| Spine literacy | O2 | Correctly reads a spine control ID as family + number and names which 800-53 family a given requirement belongs to | §4.1 |
| Framework shapes | O3 | States what each framework actually *is* (SOC 2 report criteria, ISO ISMS, CSF outcomes-by-function, CIS prescriptive safeguards) and that they converge | §4.2–4.5 |
| Honest mapping | O4 | Every mapped row carries a relationship label (`exact`/`broader`/`narrower`/`partial`) that matches the real semantics; one-to-many handled correctly | §4.6 |
| Defect diagnosis | O5 | Records the genuine orphan as an orphan (not force-fit) AND identifies the assessor's planted false-equivalence row; explains the audit cost of each | §4.7 |
| Verified artifact | O6 | Validator run shows FAIL on the orphan then PASS once resolved; exit code used as the verdict; crosswalk is CSV/JSON ready for OSCAL conversion | §4.7–4.8, §6 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
