# GRC Engineering Bootcamp

A progressive, **100%-original-content** curriculum that takes a mixed-baseline team
from zero technical fluency to the full GRC Engineering canon — built for the team
at Vanta, structured as *curriculum-as-code* (the curriculum is itself
GRC-engineered: versioned, PR-reviewed, CI-tested, continuously monitored for rot).

## What's here

| File | What it is |
|------|------------|
| [`GRC-Engineering-Curriculum.md`](./GRC-Engineering-Curriculum.md) | The 4-tier curriculum overview & sequencing skeleton (Foundations → Engineering → GRC-as-Code → GRC-as-Product), grounded in the [grc.engineering](https://grc.engineering) canon. Now used as the **resource appendix / backlog input** — third-party resources are *supplemental*, not the spine. |
| [`Production-And-Maintenance-Plan.md`](./Production-And-Maintenance-Plan.md) | The operating model: the originality contract, the curriculum-as-code architecture, the module template, the 9-gate production pipeline + RACI, the anti-rot maintenance model, CI quality gates, and the **six learning tracks** (Generalist + Governance / Risk[1st+3rd] / Compliance / Customer Trust & Assurance Engineer). |
| [`Module-Terminal-And-Command-Line-Basics.md`](./Module-Terminal-And-Command-Line-Basics.md) | Module 01 — the fully-worked **proof module**, authored from first principles, conforming to the standard module anatomy. Demonstrates the production model yields real, original, teachable content. |

## Originality contract (short version)

We don't own facts — we own the *explanation*. Mental models, examples, labs,
assessments, sequencing, and framing are original and in-house. Third-party
material appears **only** under an explicit `## Supplemental Learning Material`
heading, always optional and never load-bearing: a learner who clicks zero links
must still meet every objective from our content alone. Full contract in the
Production & Maintenance Plan, §1.

## Status

**Planning / approval gate.** Module 01 (Terminal & Command Line Basics) is the
only authored module — it exists as the proof that the model works. The remaining
modules are **not yet authored**, pending three decisions (Production &
Maintenance Plan, §9):

1. Approve the original-content + curriculum-as-code model?
2. All six tracks in scope, or a subset first?
3. Who is the single accountable **Curriculum Owner**?

## Target repo layout (instantiated as authoring is approved)

```
bootcamp/
  modules/NN-<name>/module.md   # original module content (fixed anatomy)
                    meta.yaml    # owner, volatility tier, last_reviewed, review_due
                    labs/        # original lab assets
                    assessment/  # original assessment + rubric
  tracks/                        # the 6 track definitions (who learns what, what depth)
  style/                         # voice/style guide, Vale rules, a11y checklist
  .ci/                           # link-check, lab-repro smoke tests, originality lint
  dashboard/                     # rot dashboard (reads every meta.yaml = CCM on the curriculum)
```

Until authoring is approved, the three planning documents live at the repo root.
