# Module 07 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** set of control-plane records (regenerate them with different rows and a different
> offending event — see "Fresh records" below) and must, unaided and within 45 minutes, deliver
> the artifact and walkthrough.

## What the learner delivers

1. A **re-runnable script** that evaluates two controls from two different cloud parts:
   - one **encryption control from a posture finding (STATE)** — read the `status` field, keep the
     finding verbatim as evidence; and
   - one **access control from audit events (EVENTS)** — keep only privilege-granting actions,
     extract the hour, flag any grant outside business hours, keep each offending event whole.
   Each control emits a **machine-readable verdict**, and the script's evaluation is
   **deterministic** — two runs produce byte-identical output.
2. A **SQL query** that produces a **per-control risk metric** (a failure *rate*, not just a count)
   from the supplied evidence table, with the result reconciled against a hand count of the rows.
3. A **spoken or written walkthrough** that correctly: maps each control to its cloud part using
   the four-part model (identity boundary / resource policy / audit log / posture service);
   classifies each control question as *state* or *event* and justifies the source chosen;
   explains why a query is stronger evidence than an export; and states why deterministic
   evaluation is the precondition for continuous monitoring.

## Fresh records (assessor setup)

Do **not** reuse the guided-lab fixtures. Generate fresh records, then hand-edit so the answers
differ from the lab:

```bash
bash ../labs/setup.sh /tmp/assess07     # then edit:
#   - posture-findings.json: change which resource is in scope and flip a status
#   - audit-events.json:     move the offending grant to a different hour / actor (or add a second)
#   - evidence.csv:          change the row mix so the per-control fail_pct is a new number
```

The assessor notes, before the learner begins: the expected encryption verdict, the expected
out-of-hours violation count, and the expected per-control failure percentages.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
