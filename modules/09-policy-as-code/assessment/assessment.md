# Module 09 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** control statement and a sample input handed out at assessment time, and must, unaided
> and within 60 minutes, deliver the artifact and walkthrough. The languages are learnable in a
> week; this assessment checks the judgment — encoding a verdict correctly in two shapes, gating
> it, emitting proof, and deciding whether policy-as-code was the right tool at all.

## What the learner delivers

1. **The control in two languages.** The supplied control expressed as policy in **Cedar** (a
   `permit`/`forbid` statement) **and** in **Rego** (a `deny` rule), each correctly encoding the
   *same* verdict over the supplied input shape. The learner states, in one sentence per language,
   what that language forced them to specify that the other did not.
2. **A CI gate that blocks.** A runnable script a pipeline would call that runs the verdict against
   the input and **exits non-zero on a violation** (and zero when clean), so a non-compliant change
   would be blocked from merging. The learner may use the reference `run-policy-gate.sh` /
   `check.sh` from `labs/fixtures/`, adapt them, or write their own equivalent — the exit-code
   contract is what is scored, not the implementation.
3. **Evidence records, auto-emitted.** A **structured, versioned** evidence record produced by the
   gate on **every** run — at minimum a `passed:false` record from a violating input and a
   `passed:true` record from a clean input — each carrying control id, policy engine, decision,
   passed, violations, input ref, timestamp, and run id.
4. **A written tool-fit justification + rot diagnosis.** One paragraph arguing whether
   policy-as-code was the right tool for *this* control — naming the **owner and review cadence**
   if "yes," or the **manual alternative** if "no" — *plus* a correct diagnosis of the supplied
   **rotted policy**: why it is green-but-meaningless, the ownership gap that let it rot, and the
   fix.

## Fresh inputs (assessor setup)

Do **not** reuse the guided-lab fixtures verbatim. Hand the learner a control whose verdict differs
from `legacy-admin` so the answer cannot be copied — for example, *"deployments must never grant the
`break-glass` role"* or *"no access change may target the `prod-root` resource"* — plus a clean and a
violating sample input in a comparable CSV/JSON shape, and a fresh rotted-policy snippet whose
green-but-meaningless flaw differs from the lab's `last_reviewed` example.

```bash
bash ../labs/setup.sh /tmp/assess09
# then hand-edit the fixtures: change the forbidden action/role/resource in
# access-clean.csv and access-violation.csv, and author a fresh rotted-policy.txt
# whose check is present-but-hollow in a NEW way (e.g. asserts a field is non-empty
# rather than that a decision was actually made).
```

The assessor records the expected gate decision for each input and the correct two-language
encodings before the learner begins. The fixtures in `labs/fixtures/` are the reference
implementation; a learner may use them or write their own equivalent.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner back
to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
