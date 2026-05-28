# Module 11 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** control library and threat list (assemble one — see "Fresh inputs" below) and must,
> unaided and within 60 minutes, deliver the coverage map, the validator runs, the evidence-based
> removal recommendation, the redesigned control flow, and the walkthrough.

## What the learner delivers

1. A **completed threat→control coverage map** (CSV or JSON) in which every prioritized threat
   maps to at least one control with an **honest mitigation label** (`prevents` / `detects` /
   `partial`), validated by **two runs**: one showing the map **failing** on *both* defects — a
   coverage gap (a prioritized threat with no control) and a zero-threat control (an in-scope
   control mitigating no prioritized threat) — and one showing it **passing** after both are
   resolved, with **exit code as the verdict** in both.
2. An **evidence-based removal recommendation** for at least one control: naming the threats the
   control was *assumed* to mitigate, showing it maps to **none** of the prioritized threats,
   stating its **running cost**, and choosing `kill` / `downgrade` / `keep-and-fix-threat-list`
   with a defensible rationale. "We've always had it" is an automatic Not-yet.
3. A **redesigned stakeholder-facing control flow** for one *surviving* control, presented as a
   before/after, in which the **evidence is a by-product of doing the real work** — with a stated
   reason why the redesign makes the control **both cheaper to run and harder to fake**, and a
   statement of the **threat it still mitigates** (a redesign of a control that mitigates nothing
   is not a pass).
4. A **spoken or written walkthrough** that correctly: explains the difference between "we have a
   control for that" and "that control mitigates a threat we face"; reads two coverage-map rows
   and justifies their mitigation labels; and **identifies the control the assessor planted as a
   zero-threat control** and the verdict it deserves.

## Fresh inputs (assessor setup)

Do **not** reuse the guided-lab fixtures verbatim. Assemble a fresh set so the answer differs:

- A **prioritized threat list** of 5–8 stable technique identifiers drawn from the real public
  taxonomy, relevant to a stated (different) environment than the lab's SaaS scenario.
- An **in-scope control list** of 4–7 controls, engineered to contain **at least one control that
  maps to none** of the prioritized threats (the planted zero-threat control), with a plausible
  "assumed to mitigate" story so the learner must reason rather than guess.
- A **partially-filled coverage map** seeded with honest example rows and **at least one coverage
  gap** (a prioritized threat with an empty `control_id`), plus optionally one row with a
  deliberately inflated mitigation label (e.g. `prevents` where `partial` is honest) for the
  learner to catch and correct.

```bash
bash ../labs/setup.sh /tmp/assess11      # then replace the seed inputs with the fresh set
```

The assessor records, before the learner begins: the intended mapping for each threat, which
control is the planted zero-threat control and its deserved verdict, which threat is the genuine
coverage gap, and any inflated mitigation label seeded as a trap.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
