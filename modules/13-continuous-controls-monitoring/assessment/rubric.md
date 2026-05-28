# Module 13 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section, not the whole module.

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| Snapshot vs. monitor | O1 | Explains, without jargon, why a point-in-time pass is not continuous assurance; states the control as a binary, observable claim | §3, §4.1 |
| The five-part loop | O2 | Names all five parts (control, check, evidence, history+dashboard, alert) and traces one control's state through them; identifies the schedule as what makes it "continuous" | §3, §4.8 |
| Check + exit-code verdict | O3 | Builds a check that returns a correct exit code (0 pass / non-zero drift) and emits a dated evidence record on **every** run; explains why the loop branches on the exit code, not the text | §4.2, §4.3, §4.4 |
| Evidence store + dashboard | O4 | Produces an append-only history with a record per run and a tile showing current state + 30-day trend; explains why passing records are kept and why the trend is evidence the status light is not | §4.4, §4.5, §4.6 |
| Diagnosing drift | O5 | From the alert alone, names the control, the drifted resource, and the moment compliance was lost; alert fired only on the failing run | §4.7, §5.3 |
| Build-vs-buy judgment | O6 | States, stage by stage, which loop parts to own vs. rent and why; names a vendor claim refused as evidence | §4.8, §5.4 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
