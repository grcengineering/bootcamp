# Module 15 — Assessment (facilitator copy)

> Competency artifact, not a quiz. This is the **terminal assessment of the entire curriculum**:
> Mirrors `module.md` §7. The learner ships one real control end to end and proves it, and a
> **different reviewer** (never the author) independently reproduces the proof from a clean
> checkout within the assessment window. The capstone is also demoed to the cohort.

## What the learner delivers

1. A **shipped control repository** for one real control, containing:
   - a `capstone-manifest.yaml` mapping each of the seven loop stages
     (UNDERSTAND → LOCATE → QUERY → EVALUATE → EVIDENCE → MONITOR → OWN) to a real artifact, plus a
     `before_after` pointer, and a **validator the reviewer runs** that asserts all seven stages are
     covered and the before/after is present, **exiting `0`**;
   - an **end-to-end pipeline** where the scheduled/monitored path invokes the *same*
     QUERY → EVALUATE → EVIDENCE code the manual run does, and produces the verdict the evidence
     claims (the seam holds — not a parallel copy);
   - a `README.md` that treats the control as a **product**: customers, a single accountable owner,
     a backlog with at least one honest known gap, a success metric, and a UX rationale.
2. A **`before-after.md`** comparing the *same* control's legacy and engineered states on **at least
   four concrete dimensions** (effort, frequency, drift detection, durability), scored against the
   five legacy-GRC problems, including **at least one residual gap that did not improve**,
   cross-referenced to a backlog item.
3. A **spoken or written walkthrough** that correctly: maps the control to all seven stages and names
   the artifact discharging each; explains why the engineered version is more trustworthy than the
   legacy one using the before/after and live monitoring as the argument (not assertion); and
   diagnoses honestly where the control's coverage is still thin.

## Reviewer reproduction (assessor setup)

The reviewer is **a different engineer than the author** (per the production pipeline's
technical-accuracy gate). From a **clean checkout** of the learner's capstone repo, the reviewer:

```bash
./validate-capstone.sh capstone-manifest.yaml   # must report 7 stages covered + before/after, exit 0
# then run the pipeline end to end (collect -> evaluate -> evidence) and confirm the
# scheduled/monitored path produces the same verdict the committed evidence claims.
```

The reviewer notes any stage the manifest *claims* but the repo does not actually satisfy (the §5.4
failure mode: e.g., a MONITOR that collects but never evaluates or alerts). A claimed-but-unsatisfied
stage is a **Not-yet** on the Coverage row regardless of what the manifest says.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner back
to the specific concept section named in the rubric — not the whole module. Per-criterion pass-rates
are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls
below `assessment_passrate_threshold` (0.80) in `meta.yaml`. Because this is the capstone, a
sustained dip here is also a signal about the *upstream* modules whose threads failed to integrate —
the failure is read as a curriculum defect, not a learner defect.
