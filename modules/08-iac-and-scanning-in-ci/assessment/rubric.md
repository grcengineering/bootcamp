# Module 08 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| IaC framing | O1 | Explains, without jargon, what declaring infrastructure as text makes checkable *before* anything is created | §3, §4.1 |
| Reading findings | O2 | Correctly reads a scan result: which rules failed, their identifiers, and their severities | §4.2 |
| Control mapping | O3 | Maps each blocking finding to the correct named control; articulates why the control map is the owned artifact | §4.3 |
| Gate composition | O4 | Gate blocks the non-compliant result and passes the compliant one; severity floor stated and justified | §4.4, §4.5 |
| Diagnosing a block | O5 | From gate output, names the blocking finding, its control, and the code change that clears it | §4.5, §5.2 |
| Evidence emission | O6 | Produces the PASS evidence record and explains why it cannot drift from reality | §4.6, §5.3 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
