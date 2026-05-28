# Module 08 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** pair of scan-result fixtures and a partial control map (regenerate variants — see
> "Fresh fixtures" below) and must, unaided and within 45 minutes, deliver the artifact and
> walkthrough.

## What the learner delivers

1. A **working gate invocation** that, run against the non-compliant scan result, **blocks**
   (exits non-zero) and, run against the compliant result, **passes** (exits zero), with a
   stated, defensible **severity floor**.
2. A **completed control map** — at minimum a correct row for every blocking finding, translating
   each scanner rule identifier into the named control it enforces.
3. A **captured evidence record** from the passing run, plus a **written walkthrough** that
   correctly: explains what infrastructure-as-code makes checkable and *when*; names the control
   each blocking finding maps to; states what the severity floor decided and why; and explains why
   the gate-emitted evidence record cannot drift from what actually happened.

## Fresh fixtures (assessor setup)

Do **not** reuse the guided-lab fixtures verbatim. Produce a fresh pair so the answer differs —
e.g. change which rule IDs fail and at which severities, and hand the learner a control map with
the blocking rows blanked so they must complete the mapping themselves:

```bash
bash ../labs/setup.sh /tmp/assess08
# then hand-edit /tmp/assess08/checkov-noncompliant.json (different failing rule IDs/severities)
# and blank the blocking rows of /tmp/assess08/control-map.csv
```

The assessor notes the expected gate decision (which findings block at the chosen floor) and the
correct control mappings before the learner begins. The gate (`labs/fixtures/gate.sh`) is the
reference implementation; a learner may use it or write their own equivalent.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
