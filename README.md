# GRC Engineering Bootcamp

A progressive, **100%-original-content** curriculum that takes a mixed-baseline team
from zero technical fluency to the full GRC Engineering canon — built for the team
at Vanta, structured as *curriculum-as-code* (the curriculum is itself
GRC-engineered: versioned, PR-reviewed, CI-tested, continuously monitored for rot).

## What's here

| File | What it is |
|------|------------|
| [`GRC-Engineering-Curriculum.md`](./GRC-Engineering-Curriculum.md) | The 4-tier curriculum overview & sequencing skeleton (Foundations → Engineering → GRC-as-Code → GRC-as-Product), grounded in the [grc.engineering](https://grc.engineering) canon. Now used as the **resource appendix / backlog input** — third-party resources are *supplemental*, not the spine. |
| [`Production-And-Maintenance-Plan.md`](./Production-And-Maintenance-Plan.md) | The operating model: the originality contract, the curriculum-as-code architecture, the module template, the 9-gate production pipeline + RACI, the anti-rot maintenance model, CI quality gates, and the **five learning tracks** (Generalist + Governance + Risk[1st+3rd] + Compliance + Customer Trust & Assurance Engineer). |
| [`ISA.md`](./ISA.md) | The project **Ideal State Artifact** — system of record: ideal state, the ISCs (which double as the CI gates), decisions, and the changelog of understanding. |
| [`modules/`](./modules/) | The authored modules, each as `module.md` (9-section anatomy) + `meta.yaml` + `labs/` + `assessment/`. Module 01 (Terminal & CLI) is **published**; the rest are being authored via the pipeline. |
| [`tracks/`](./tracks/) · [`style/`](./style/) · [`.ci/`](./.ci/) · [`dashboard/`](./dashboard/) | The five track definitions + coverage matrix; the voice/style/a11y guides; the CI gates (anatomy/originality/style/link/lab-repro); the rot dashboard. |

## Originality contract (short version)

We don't own facts — we own the *explanation*. Mental models, examples, labs,
assessments, sequencing, and framing are original and in-house. Third-party
material appears **only** under an explicit `## Supplemental Learning Material`
heading, always optional and never load-bearing: a learner who clicks zero links
must still meet every objective from our content alone. Full contract in the
Production & Maintenance Plan, §1.

## Status

**Approval gate cleared — engine instantiated (2026-05-28).** The three §9 decisions are resolved:

1. ✅ Original-content + curriculum-as-code model **approved as-is**.
2. ✅ **All five tracks** in scope (Generalist + Governance + Risk[1st+3rd] + Compliance + Customer Trust & Assurance).
3. ✅ **Curriculum Owner:** Justin Pagano (accountable) · Jai (operational).

The curriculum-as-code repo is now stood up: Module 01 migrated to `modules/`, CI gates live
(`bun run ci`), the rot dashboard renders, and the five track definitions + coverage matrix are
wired. Authoring of the remaining backlog (Part I + Modules 02–15) is pipelined via the
production workflow. The anti-rot machinery (CI + dashboard + triggers) went live **with**
module #1, not at the end.

**Wave 2 — interactive exercises (2026-06-12, in build).** Every module gains a hands-on,
in-browser exercise in the bootcamp app (`web/`): a terminal simulation whose taught-command
outputs are **CI-diffed against ground truth captured from real machines** (digest-pinned Ubuntu
containers + a real Mac, under executable environment contracts), real engines compiled for the
browser where they exist (Python, SQLite, jq, Cedar, OPA, git plumbing), and realistic structured
simulations for the non-terminal modules — all driven by `modules/*/exercises/exercise.yaml`
specs (data, not code) verified by a closed, mutation-tested verifier registry. Learner state is
browser-local with encrypted cross-device sync (AES-256-GCM, passphrase-derived key); completions
append to a tamper-evident evidence chain — the learner's own audit-ready evidence pack.
Simulation fidelity is the repo's newest control: when reality drifts from the simulation, the
build goes red and someone owns it.

**Waves 3–4 — the IT-foundations band (2026-06-13).** Ten Tier-1 modules (16–25) add the
IT/internet-foundations substrate the GRC canon sits on: networking, databases, web-app
architecture, API paradigms, cloud shared responsibility, containers/virtualization, applied
crypto/PKI, identity protocols, how-the-internet-works, and logging/observability. Each is framed
by its **loop question** — *where does a control claim's truth physically live, travel, and how do
I read it* — and runs on a generalized **visual surface** (PEEL a real frame to the byte, TRACE
real protocol messages into a stateful sim, MAP control cards against a cited key, build-and-break
a real validator, and diff-the-trace a clean/broken pair to the single divergent field). Eighteen
real-bytes oracles back it (`web/src/engines/visual/`): a packet dissector, DNS/DNS-resolution,
TLS 1.3 + OAuth/OIDC + SAML, x.509, JWT, crypto transforms, the four API contracts
(OpenAPI/WSDL/SDL/.proto) + gRPC wire + GraphQL limiter, HTTP headers, syslog, and the OCI image
reader. **Honesty doctrine holds end-to-end:** every value a learner reads is the oracle's parse of
the committed real artifact, never an authored answer key — the build computes it and the browser
recomputes it byte-identically. All 26 modules are green across every gate (1243 tests, 26
`dist/labs/`, lints 26/26, rot dashboard 🟢26). See
[`research/it-foundations/INTEGRATION-MATRIX.md`](./research/it-foundations/INTEGRATION-MATRIX.md).

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

The planning documents (`Production-And-Maintenance-Plan.md`, `ROLE-COMPETENCY-FRAMEWORK.md`,
`GRC-Engineering-Curriculum.md`) remain at the repo root as the operating model + backlog input.

**Run the engine:** `bun run ci` (anatomy + originality + style lints → lab-repro → tests/coverage
→ link-check → rot dashboard). Individual gates: `bun run lint`, `bun run labs`, `bun run dashboard`.
