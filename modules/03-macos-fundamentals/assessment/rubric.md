# Module 03 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet, return to |
|---|---|---|---|
| Subsystem map | O1 | Names the correct subsystem owning each of the five controls' truth, unprompted | §3, §4.1–4.7 |
| Auditor explanation | O2 | Explains to a non-Mac auditor *where* each claim physically lives and why it is authoritative | §3 |
| Live query & read | O3 | Runs each subsystem's canonical status tool and reads the output to a correct verdict | §4.1–4.7 |
| UNKNOWN discipline | O4 | Evaluator returns UNKNOWN (not FAIL/PASS) on a check that could not run; explains why | §4.8, §5.2 |
| Labeled packet | O5 | Emits one labeled line per control: CONTROL \| SUBSYSTEM \| VERDICT \| RAW, evidence kept clean | §5.4 |
| Two-subsystem control | O5 | Screen-lock verdict requires both MDM-managed AND policy-present; unmanaged => FAIL | §4.7, §5.3 |
| Deterministic re-run | O6 | Packet is byte-identical across two runs; articulates the continuous-monitoring link | §4.8, §5.4 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
