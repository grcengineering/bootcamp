# Module 13 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** control claim and a pair of captured-state snapshots (one compliant, one drifted in a
> way the learner has not seen) and must, unaided and within 60 minutes, deliver a working
> continuous-controls-monitoring loop and a written walkthrough.

## What the learner delivers

1. A **working CCM loop** for the given control: an automated check that reads a captured-state
   snapshot, evaluates the control, prints a `PASS`/`FAIL` line, and returns a correct **exit
   code** (zero on pass, non-zero on drift) — and emits a **dated evidence record on every run**,
   pass or fail.
2. A **populated append-only history store** with a record for both the compliant run and the
   drifted run, plus a **dashboard tile** (a query over that store) that prints the **current**
   verdict and a **trailing-30-day** trend — demonstrably distinguishing "green now" from "green
   the whole window."
3. A **drift alert** that fired **only** on the drifted run and names the control, the specific
   drifted resource, and the timestamp — plus a **written walkthrough** that correctly:
   - explains why a point-in-time pass is not continuous assurance;
   - states what the exit code drives in the loop and why the loop branches on it, not on text;
   - explains why a *passing* evidence record is kept (the proof-of-the-negative argument);
   - reads the 30-day trend tile as evidence the bare current-state light is not;
   - states, **stage by stage** (control / check / evidence / history+dashboard / alert / schedule),
     which parts the learner would own versus rent, and names one vendor claim they would refuse
     to treat as evidence.

## Fresh fixtures (assessor setup)

Do **not** reuse the guided-lab fixtures verbatim — produce a fresh pair so the answer differs.
Use the lab generator as a starting point, then hand-edit the snapshots so a *different* resource
drifts and (optionally) a *different* observable flag is the one that fails:

```bash
bash ../labs/setup.sh /tmp/assess13
cp ../labs/fixtures/state-compliant.json /tmp/assess13/assess-compliant.json
cp ../labs/fixtures/state-drifted.json   /tmp/assess13/assess-drifted.json
# then hand-edit /tmp/assess13/assess-drifted.json so a DIFFERENT bucket drifts
# (e.g. flip the flags on a renamed bucket the learner has not seen), and optionally
# state a slightly different control claim (a different required flag set).
```

The assessor records, before the learner begins: the expected verdict for each snapshot, the
exit code each should produce, which resource the alert must name, and the correct own-vs-rent
reasoning for at least two of the five loop stages. The lab's `ccm-check.sh` is the reference
implementation; a learner may extend it or write their own equivalent, but the **five parts of
the loop must all be present and wired together.**

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
