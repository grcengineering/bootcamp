# Module 09 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section, not the whole module.

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| Policy-as-code framing | O1 | Explains, without jargon, that PaC moves the *verdict* (not the fact) out of a human's head into an executable function — and names what it deliberately leaves behind | §3, §4.1 |
| Two-language encoding | O2 | Encodes the same control as a Cedar `forbid` and a Rego `deny` rule, both correct, and names what each language forced them to specify that the other did not | §4.2, §4.3, §5.1 |
| Gate with teeth | O3 | Gate runs the verdict against the input and **exits non-zero on a violation** (zero when clean), so the non-compliant change is blocked; learner states why the exit code is what gives the gate teeth | §4.5, §5.2 |
| Evidence by-product | O4 | Gate auto-emits a structured, versioned record on every run — a `passed:false` and a `passed:true` — and the learner explains why proof falling out of EVALUATE cannot drift from what happened | §4.6, §5.3 |
| Diagnosing policy-rot | O5 | Correctly diagnoses the supplied rotted policy as green-but-meaningless, names the ownership gap that let it rot, and states the fix | §4.7, §5.4 |
| Tool-fit decision | O6 | Decides in writing whether PaC fit *this* control — defending "yes" with owner + cadence, or "no" with the manual alternative — and can defend the inverse case | §4.8, §5.4 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
