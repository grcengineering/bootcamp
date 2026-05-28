# Module 04 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Subsystem location | O1, O3 | Names which subsystem owns each control claim (BitLocker / Defender / registry-policy / Security log / local accounts), unprompted | §3, §4.2–4.6 |
| Object pipeline & selection | O2, O4 | Selects named properties from `Get-*` output rather than parsing text; explains why that makes the evidence durable | §4.1 |
| Effective vs intended | O3, O5 | Cites the *effective* screen-lock value from the registry, not just the *intended* policy; explains the difference | §4.4 |
| Failed-logon evidence | O3, O4 | Pulls failed-logon events as objects and states what the count does and does not prove | §4.5 |
| Read-only collection | O6 | Script is built entirely from `Get-` commands; nothing can mutate endpoint state | §4.8 |
| Control mapping & export | O6 | Each field is labeled to a SOC 2 CC6 control; bundle exports to both JSON and CSV | §4.7, §5.4 |
| Reproducibility | O6 | Script runs twice with a structurally identical bundle; articulates the continuous-assurance link | §2, §4.8 |
| Local vs cloud seam | O5, O7 | Names at least one control the endpoint cannot prove and the Entra ID / conditional-access subsystem that owns it | §4.7 |
| Diagnosis | O5 | Distinguishes real non-compliance from a collection error from a not-applicable result | §4.3, §4.8 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
