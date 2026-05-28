# Module 05 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** directory of evidence files (regenerate one with a different fixture — see "Fresh
> evidence set" below) and must, unaided and within 60 minutes, deliver the artifact and
> walkthrough.

## What the learner delivers

1. A **Git-versioned Python tool** that, given a directory of raw evidence files, validates each
   against a stated control checklist, **handles malformed input gracefully** (records it as a
   finding rather than crashing), and **writes a structured report** (`report.json` or
   equivalent) showing both verdicts and the files that could not be evaluated.
2. A **`pytest` suite with meaningful assertions** — at minimum: correct PASS on a good record,
   correct FAIL on a bad record, correct FAIL on a record **missing** the checked field, and
   proof that a **malformed file is recorded as an error** while good files are still judged.
   Assertion-free "coverage" tests are explicitly disallowed and score Not-yet on Meaningful tests.
3. A **Git history** containing **≥1 feature delivered on its own branch, reviewed in a pull
   request, and merged** into the main line, with commit messages that explain *why* — so the
   repository is its own change-management evidence.
4. A short **written or spoken walkthrough** that correctly: traces one record through the
   judgment function; explains why a malformed file is a recorded finding while a failing
   assertion is a logic bug; names one test and the real behavior it proves; and maps
   branch → PR → merge onto the change-management control.

## Fresh evidence set (assessor setup)

Do **not** reuse the guided-lab fixtures. Generate a fresh evidence directory with different
hosts, a different distribution of pass/fail, and a different malformed line, e.g.:

```bash
bash ../labs/setup.sh /tmp/assess05      # then hand-edit hosts/values so the answer differs
```

The assessor notes the expected verdict counts and which file is the intended malformed one
before the learner begins. (Optionally adjust the control to a different field — e.g. screen-lock
enabled — to force the learner to read the checklist rather than recall the lab.)

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
