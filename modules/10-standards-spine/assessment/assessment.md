# Module 10 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** set of profile requirements (assemble one — see "Fresh requirement set" below) and
> must, unaided and within 45 minutes, deliver the crosswalk artifact, the validator runs, and
> the walkthrough.

## What the learner delivers

1. A **crosswalk file** (CSV or JSON) mapping every provided profile requirement to one or more
   NIST 800-53 spine controls, with an **honest relationship label** (`exact` / `broader` /
   `narrower` / `partial`) on every mapped row, and any genuinely unmappable requirement recorded
   **explicitly as an orphan** rather than force-fit onto a loosely related control.
2. **Two validator runs** (the learner's own validator, or the lab's `validate-crosswalk.ts`):
   one showing the crosswalk **failing** on the orphan, and one showing it **passing** after the
   orphan is resolved or formally accepted as a documented spine gap — with **exit code as the
   verdict** in both.
3. A **spoken or written walkthrough** that correctly: explains why NIST 800-53 is the spine and
   the other frameworks are profiles; reads two of the learner's rows' relationship labels and
   justifies each; and **identifies the one false-equivalence trap** the assessor planted in a
   sample row (a row labeled `exact` whose honest label is `partial` or `narrower`).

## Fresh requirement set (assessor setup)

Do **not** reuse the guided-lab fixture. Assemble a fresh set of 8–12 profile requirements drawn
from at least **three** different frameworks (e.g., a few SOC 2 `CC` criteria, a few ISO 27001
Annex A controls, a few CIS v8 safeguards, optionally one PCI or HIPAA requirement). Include:

- at least **one requirement with no obvious spine home** (a real orphan candidate), and
- at least **one pre-filled sample row deliberately mislabeled `exact`** where the true
  relationship is `partial`/`narrower` (the planted false-equivalence trap the learner must spot).

```bash
bash ../labs/setup.sh /tmp/assess10      # then replace the seed rows with the fresh requirement set
```

The assessor records, before the learner begins: the intended spine mapping for each requirement,
which requirement is the genuine orphan, and which sample row is the planted false equivalence.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
