# Module 12 — Assessment Rubric

Each row is **Pass / Not-yet**. All rows must be **Pass** to clear the module. A Not-yet routes
the learner back to the named concept section.

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| Schema vs. format | O1 | Explains, without jargon, what a *schema* (enforceable contract) gives you that a shared *format* does not — a document that can fail validation | §3, §4.1 |
| OSCAL layers | O2 | Names what each layer (catalog / profile / component-definition / assessment-POA&M) is the machine-readable version of | §3, §4.2–§4.4 |
| Crosswalk → OSCAL | O3 | Produces a catalog of the provided control(s) and a profile that imports it and selects the in-scope subset; explains the mapping from the Module-10 crosswalk | §4.2, §4.3, §5.1, §5.2 |
| Authoring & validation | O4 | Produces a schema-valid minimal set and runs a validator that exits 0 on the valid set; required fields present, profile references resolve | §4.4, §4.7, §5.4 |
| Diagnosing a rejection | O5 | From a failing run, names the broken field or dangling reference *and* the downstream consumer (auditor tool / FedRAMP pipeline / sister team) it would break | §4.5, §4.7, §5.4 |
| Control-to-policy link (C2P) | O6 | Implemented control carries a *resolvable* link to the provided policy id; validator confirms it; learner explains how this wires the claim to the enforcement | §4.5, §4.6, §5.3 |

**Telemetry:** record each criterion's Pass/Not-yet per learner. Aggregate per-objective
pass-rate feeds the rot model — any objective below `assessment_passrate_threshold` flags the
**content** (not the learner) for revision.
