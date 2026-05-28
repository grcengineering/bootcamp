# Module 00 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **real
> control they actually own** (chosen during the §6 lab) and delivers a one-page analysis plus a
> short defense. This is the *before* half of the program-long before/after — the same artifact
> is re-opened at the capstone (Module 15).

## What the learner delivers

1. A **one-page legacy-vs-engineered analysis** (`legacy-vs-engineered-<control>.md`, ~350–600
   words) that:
   - phrases the control as a single **falsifiable claim** and names **where its truth physically
     lives today**;
   - scores the control against **all five** named legacy problems (manual toil; transactional
     relationship; whack-a-mole; closed-framework focus; commoditized compliance), each addressed
     by name;
   - describes the **legacy arrow** and identifies when/how reality is consulted;
   - maps the **same** control through **all seven** loop stages (UNDERSTAND → LOCATE → QUERY →
     EVALUATE → EVIDENCE → MONITOR → OWN) with a **concrete, named LOCATE**, making the
     reality→policy inversion explicit;
   - closes with a one-sentence **inversion statement** for this specific control.
2. A short **spoken or written defense** that: states the **inversion thesis cold** (without
   notes), and connects **at least one of the five principles** to the legacy problem it answers.

## Assessor setup (no tooling)

There is no fixture to hand out — the learner supplies their own real control. Before the
defense, the assessor confirms the chosen control is a genuine *claim about system state*
(§4.1), not a policy paragraph. The structural shape the analysis must hit is identical to the
sample produced by `../labs/setup.sh` (which the lab-repro CI validates); assessors may read that
sample to calibrate what "conforming" looks like, but must **not** accept it as the learner's own
work.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.

## Retention note

The artifact is **kept**, not discarded after grading. Module 15 (capstone) re-opens this exact
file against the now-engineered version of the same control; the delta is the program's proof of
effect. An assessment with no retained artifact cannot be closed.
