# Module 06 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** paginated API fixture (regenerate one with a different page count, total, and answer
> — see "Fresh fixture" below) and must, unaided and within 45 minutes, deliver the artifact,
> the LOCATE plan, and the walkthrough.

## What the learner delivers

1. A **Git-versioned script** that, from one or more provided API response pages, aggregates the
   `data` arrays across **all** pages, **verifies completeness** against the advertised `total`
   (and **refuses to report** on a mismatch — failing loud, not under-reporting), computes the
   control metric "users without MFA," distinguishes active from non-active offenders, and emits
   an **audit-ready JSON report mapped to a named control**. It exits **`0` on control PASS**, a
   **distinct non-zero on control FAIL**, and **`1` only on a tooling error**.
2. A **LOCATE plan** answering the five docs questions from §4.7 for the assessed API: auth rung
   and how to get a token; the endpoint + field that holds the control's truth; the pagination
   shape and its stop signal; the rate limit; the error response shape.
3. A **written or spoken walkthrough** that correctly: maps the control claim to its truth-field;
   traces one request through verb → address → auth → status → JSON; explains the auth rung chosen
   and why; explains how the script knows it got *every* page; and states the meaning of each
   exit code.

## Fresh fixture (assessor setup)

Do **not** reuse the guided-lab fixtures. Generate a fresh set with a different page count,
a different advertised `total`, and a different correct answer, e.g.:

```bash
bash ../labs/setup.sh /tmp/assess06     # then hand-edit rows, page count, and the `total` field
                                        # so the no-MFA count and the PASS/FAIL verdict differ
```

Include a deliberate trap: make the obvious "first page only" count differ from the complete,
all-pages count, so a learner who skips pagination produces a confidently wrong number. The
assessor notes the expected complete count, the active-only count, and the intended PASS/FAIL
exit semantics before the learner begins.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
