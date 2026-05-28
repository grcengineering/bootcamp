# Module 07 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Four-part mapping | O1 | Maps each control to identity boundary / resource policy / audit log / posture service correctly, unprompted | §3, §4.3 |
| Risk metric in SQL | O2 | Writes a query producing a per-control failure *rate*; reconciles it against a hand count of the rows | §4.5 |
| Reading the record | O3 | Reads the verdict from a structured finding / event, not a console screenshot | §4.1, §4.3, §4.4 |
| Two-source report | O4 | Combines a posture finding (state) and an audit-log query (events) into one evidence report | §5.1–5.3 |
| Idempotent verdict | O5 | Script gives byte-identical output across two runs; explains why that enables monitoring | §4.6 |
| State vs. events | O6 | Classifies each control question correctly and justifies query-over-export to an auditor | §4.2, §4.7 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
