# Module 01 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** access export (regenerate one with a different fixture — see "Fresh export" below)
> and must, unaided and within 30 minutes, deliver the artifact and walkthrough.

## What the learner delivers

1. A **re-runnable script** that, from a single argument (a raw access export), produces one
   evidence file answering a stated control question via **composed small programs** (no
   monolithic all-in-one tool), with **collection errors separated into their own log via
   stderr redirection (`2>`)**, and that **exits `0` exactly when the control passes**.
2. A **spoken or written walkthrough** that correctly: identifies the working directory and how
   they knew it; traces one command through the REPL steps; explains the pipe composition;
   explains the stdout/stderr separation; and states the pass/fail meaning of the exit code.

## Fresh export (assessor setup)

Do **not** reuse the guided-lab fixture. Generate a fresh export with different rows and a
different malformed line, e.g.:

```bash
bash ../labs/setup.sh /tmp/assess01      # then hand-edit rows/roles so the answer differs
```

The assessor notes the expected count and the intended pass/fail exit semantics before the
learner begins.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
