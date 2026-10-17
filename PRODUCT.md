# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Public GRC practitioners entering or deepening GRC Engineering, from zero technical fluency to the full canon. The curriculum was built for a mixed-baseline team at Vanta, but the audience is the wider public; Vanta is the author, not the only reader. Learners work through modules and in-browser exercises on their own time. Five role tracks apply: Generalist, Governance, Risk (first and third party), Compliance, and Customer Trust & Assurance Engineer.

## Product Purpose

A progressive, original-content curriculum that takes learners from zero to the GRC Engineering canon (grc.engineering), with a hands-on, in-browser exercise in every module. Success is a learner who meets every module objective from our content alone and ends with audit-ready evidence of what they did.

## Positioning

Real-artifact honesty. Every value a learner reads is an oracle's parse of a committed real artifact (a packet, a certificate, a token), never an authored answer key. The build computes it and the browser recomputes it byte-identically. Terminal outputs are CI-diffed against ground truth captured from real machines, and when a simulation drifts from reality the build goes red. Learner completions append to a tamper-evident evidence chain the learner owns.

## Operating Context

Curriculum-as-code: modules are versioned, PR-reviewed, CI-gated (anatomy, originality, style, link, lab-repro), and monitored for rot by a dashboard. Modules live in `modules/NN-*/` (`module.md`, `meta.yaml`, `labs/`, `assessment/`, `exercises/exercise.yaml`). The learner app lives in `web/`. Run the engine with `bun run ci`.

## Capabilities and Constraints

- 26 modules across four tiers (Foundations, Engineering, GRC-as-Code, GRC-as-Product), including an IT-foundations band (modules 16-25).
- Interactive exercises: terminal simulation, real engines compiled for the browser (Python, SQLite, jq, Cedar, OPA, git), and structured simulations for non-terminal modules, driven by data specs verified by a closed, mutation-tested verifier registry.
- Learner state is browser-local with encrypted cross-device sync (AES-256-GCM, passphrase-derived key). No accounts.
- Built with Astro 7 under `web/`; tooling is bun and TypeScript.
- Originality contract: third-party material appears only under `## Supplemental Learning Material`, always optional, never load-bearing.
- Hosted on GitHub Pages at https://bootcamp.grc.engineering (DNS at Namecheap), with manual deployment through `.github/workflows/pages.yml`.

## Brand Commitments

- Extends the GRC Engineering Design System (adopted in commit 994a285). Future UI work builds on it rather than replacing it.
- Grounded in the grc.engineering manifesto; Justin Pagano is accountable Curriculum Owner.
- Voice and style follow `style/`.

## Evidence on Hand

- 26 modules green across every gate: 1243 tests, 26 `dist/labs/`, lints 26/26, rot dashboard 26 green (README, 2026-06-13).
- Eighteen real-bytes oracles in `web/src/engines/visual/`.
- Role framework and track definitions in `ROLE-COMPETENCY-FRAMEWORK.md` and `tracks/`.
- Absent: learner testimonials, completion statistics, and usage data. Do not fabricate them.

## Product Principles

1. Never show a learner a value the build did not compute from a real artifact.
2. A learner who clicks zero external links must still meet every objective.
3. The learner owns their data and their evidence; nothing leaves the browser without their passphrase.
4. The product is itself a control: drift between simulation and reality is a failure someone owns.
5. Teach the loop question (where does a control claim's truth live, travel, and how do I read it), not tool trivia.

## Accessibility & Inclusion

WCAG 2.2 AA for every learner-facing surface; `style/` holds the a11y checklist. Learners arrive with mixed technical baselines, so no surface may assume prior terminal or code fluency unless the module says so.
