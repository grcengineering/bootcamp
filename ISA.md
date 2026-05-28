---
project: grc-engineering-bootcamp
effort: E3
phase: execute
progress: 20/44
mode: build
started: 2026-05-28
updated: 2026-05-28
owner: Justin Pagano (accountable) · Jai (operational)
---

# ISA — GRC Engineering Bootcamp (curriculum-as-code)

> System of record for the bootcamp. The curriculum is itself GRC-engineered: versioned in git, every change a PR, every PR CI-tested, every module owned with a review-due date, rot continuously monitored. This ISA is the ideal-state articulation, the test harness (the ISCs are the gates), and the changelog of understanding.

## Problem

A mixed-baseline team (some never opened a terminal, some already script) needs to reach the full GRC Engineering canon. Iteration 1 used named third-party courses as the spine — which (a) contradicts the manifesto's "mindset, not a stack" thesis, (b) rots silently as links die and tools change, and (c) owns no explanation. There is no instantiated curriculum: four planning docs + one proof module sit at repo root; nothing is versioned as teachable, maintainable units.

## Vision

A new engineer clones the repo and *learns GRC Engineering by watching it run on their own training material*: the module is the versioned policy, green CI is the evidence, the rot dashboard is continuous controls monitoring, `meta.yaml` is ownership. The medium is the method. When the team can keep their own curriculum green, they have a live, honest lesson in why controls rot — and when they can't, the dashboard goes red and someone owns it. Euphoric surprise: the curriculum *is* the first control they engineer.

## Out of Scope

- Buying or configuring an LMS (the repo is the LMS substrate).
- Reinventing universal facts/syntax/standards (TCP/IP, Bloom's taxonomy, `cd`) — those are stated in our words and cited, never re-derived.
- Third-party content as load-bearing material (it lives only under §8 Supplemental, always optional).
- Certifications as the goal (de-emphasized by design; capability portfolio first).
- Pushing/publishing anything externally this build (local commits only until explicit "yes push").

## Principles

- **We own the explanation, not the facts.** Originate where our framing beats a link; link out otherwise (BitterPill guardrail).
- **Volatility is contained structurally.** Stable fundamentals (§1–4,7 = Tier A) are isolated from volatile third-party content (§8 = Tier C) so decay is quarantined and CI-checkable.
- **Maintenance is a first-class, automated, visible activity** — not an afterthought. The anti-rot machinery ships with module #1, not at the end.
- **The pipeline is the discipline being taught.** Production *is* the engineering lesson: PR-gated, reviewed, reproduced-from-clean.
- **Measurable outcomes over checkbox.** Objectives are Bloom-falsifiable; assessments are artifacts, not trivia quizzes.

## Constraints

- **bun + TypeScript** for all tooling (zero `npm`/`npx`); CI runnable with bun alone (no Vale dependency required).
- Everything is **Markdown in git**; every change a PR; CI on every PR + nightly.
- Fixed **9-section module anatomy** (§1–8 in `module.md`, §9 = `meta.yaml`); enforced by `anatomy-lint`.
- **Originality contract** enforced by `originality-lint` (no third-party URL outside §8) + no-laundering review.
- `research/job-market/` corpus is **gitignored, local-only** — never staged, never pushed (exfiltration boundary).
- **Five role tracks** (Generalist + Governance + Risk[1st+3rd] + Compliance + Customer Trust & Assurance) — not six.
- 95% meaningful-coverage floor on `.ci/`+`dashboard/` TypeScript tooling (content markdown is not "code").

## Goal

Instantiate a living curriculum-as-code repository that produces and maintains 100% original GRC Engineering training material across five role tracks, where the curriculum is itself GRC-engineered — versioned, PR-gated, CI-tested (anatomy + originality + style + lab-repro + link-check), rot-monitored via a dashboard, and ownership-tracked per module. Done when the engine runs green on the migrated proof module and authoring of the full backlog is pipelined.

## Criteria

### Engine / foundation (this wave — VERIFIED 2026-05-28)
- [x] ISC-1: `modules/01-terminal-and-command-line-basics/module.md` has §1–8 present
- [x] ISC-2: Module 01 `meta.yaml` has required keys; `owner` = Justin Pagano (≠ TBD)
- [x] ISC-3: Module 01 `labs/` and `assessment/` directories exist with assets
- [x] ISC-4: `bun .ci/anatomy-lint.ts` exits 0 on the module set
- [x] ISC-5: `bun .ci/originality-lint.ts` exits 0 (no URL outside §8)
- [x] ISC-6: `bun .ci/style-lint.ts` exits 0 (no banned/unmeasurable objective verbs)
- [x] ISC-7: `bun .ci/link-check.ts` probes every §8 URL and reports reachability (3/3)
- [x] ISC-8: `bash .ci/lab-repro.sh` runs Module 01 happy-path → exit 0, admin-count = 3
- [x] ISC-9: `bun dashboard/generate.ts` renders the rot table and writes `dashboard/ROT-DASHBOARD.md`
- [x] ISC-10: `.ci/triggers.yaml` present with the Loop-2 triggered-review list
- [x] ISC-11: `.github/workflows/ci.yml` runs lints + labs + linkcheck + dashboard (every step verified locally)
- [x] ISC-12: `tracks/` has 5 track definitions + `coverage-matrix.md`
- [x] ISC-13: `package.json` exposes `lint` / `labs` / `dashboard` / `ci` scripts (bun)
- [x] ISC-14: `style/STYLE.md`, `a11y-checklist.md`, `banned-verbs.txt` present
- [x] ISC-15: `bun test --coverage` meets threshold on `.ci/lib.ts` (96% funcs / 98.9% lines ≥ 0.95)
- [x] ISC-16: Anti: `research/job-market/` corpus is never staged/committed (gitignored; status clean)
- [x] ISC-17: Anti: nothing pushed to `origin` or published without explicit "yes push" (no push executed)
- [x] ISC-18: `README.md` Status reflects gate-cleared / instantiated state
- [x] ISC-19: `CHANGELOG.md` has the instantiation entry
- [x] ISC-20: `ISA.md` exists at repo root with E3+ sections populated

### Per-module anatomy & originality contract (applies to every authored module)
- [ ] ISC-21: Every module §1 objectives are Bloom-measurable (no banned verbs)
- [ ] ISC-22: Every module §1–7 is original prose (originality-lint clean)
- [ ] ISC-23: Every module's third-party links are quarantined to §8
- [ ] ISC-24: Every module ships `labs/happy-path.sh` that reproduces in CI
- [ ] ISC-25: Every module ships `assessment/` (artifact spec + rubric, not a quiz)
- [ ] ISC-26: Every module `meta.yaml` has owner + volatility + review_due
- [ ] ISC-27: Anti: no module objective uses unmeasurable verbs (understand/know/be familiar with/learn about)
- [ ] ISC-28: Anti: no module presents paraphrased third-party framing as original (no-laundering)

### Authoring waves (pending — pipelined via workflow)
- [ ] ISC-29: Part I (What GRC Engineering Is) authored as original content
- [ ] ISC-30: Module 02 — Linux system fundamentals authored
- [ ] ISC-31: Module 03 — macOS fundamentals authored (role-split)
- [ ] ISC-32: Module 04 — Windows fundamentals authored (role-split)
- [ ] ISC-33: Module 05 — Programming + Git authored (centerpiece)
- [ ] ISC-34: Module 06 — APIs authored (Tier-1 capstone)
- [ ] ISC-35: Modules 07–11 (Tier 2 — Engineering) authored
- [ ] ISC-36: Modules 12–13 (Tier 3 — GRC-as-Code) authored
- [ ] ISC-37: Modules 14–15 (Tier 4 — Product + Capstone) authored
- [ ] ISC-38: 5 role-track definitions wired to the coverage matrix (D/W/A per module)
- [ ] ISC-39: Each of 5 tracks has a defined Role Capstone deliverable
- [ ] ISC-40: Antecedent: each authored module passes all CI gates before merge

### Authoring quality (added 2026-05-28 from commitment-boundary advisor — CI is a form-floor, not a quality oracle)
- [ ] ISC-41: Anti: agent-authored prose contains no uncited near-verbatim regurgitation (semantic similarity check — *deferred tooling: link-linting cannot see this*)
- [ ] ISC-42: Each authored module gets a cross-family adversarial review (reviewer model family ≠ author's); reject rate tracked (≈0 ⇒ rubber-stamping)
- [ ] ISC-43: Antecedent: the Curriculum Owner reads each module before merge to main (no auto-merge-on-green for prose)
- [ ] ISC-44: Cross-module coherence pass (shared glossary, working cross-refs, terminology reconciliation) after parallel drafts

## Test Strategy

| isc | type | check | threshold | tool |
|---|---|---|---|---|
| ISC-1 | anatomy | §1–8 headings present in module.md | all 8 | `anatomy-lint` |
| ISC-4 | gate | anatomy-lint exit code | 0 | `bun` |
| ISC-5 | gate | originality-lint exit code | 0 | `bun` |
| ISC-6 | gate | style-lint exit code | 0 | `bun` |
| ISC-8 | lab | happy-path exit + admin-count | 0 / "3" | `bash` |
| ISC-9 | render | ROT-DASHBOARD.md written + table | file exists | `bun` |
| ISC-15 | coverage | `bun test --coverage` on lib.ts | ≥ configured | `bun test` |
| ISC-16 | anti | `git status --porcelain research/` empty in index | empty | `git` |
| ISC-22 | originality | URLs only in §8 across all modules | 0 violations | `originality-lint` |
| ISC-24 | lab | every module happy-path reproduces | all pass | `lab-repro.sh` |
| ISC-29..37 | content | module.md present + passes all CI gates | per module | pipeline |

## Features

| name | description | satisfies | depends_on | parallelizable |
|---|---|---|---|---|
| engine | repo skeleton, CI lints, dashboard, package scripts, tests | ISC-1..20 | — | no (foundation) |
| anatomy-contract | the 9-section anatomy + originality enforced as code | ISC-21..28 | engine | no |
| common-core | Part I + Modules 02–06 original authoring | ISC-29..34 | engine | yes (1 author/module) |
| tier2-4 | Modules 07–15 original authoring | ISC-35..37 | engine | yes (1 author/module) |
| track-wiring | 5 track defs + coverage matrix + capstones | ISC-38,39 | common-core | partial |
| anti-rot | triggers.yaml + dashboard + review cadence live with module #1 | ISC-9,10,11 | engine | no |

## Decisions

- 2026-05-28: **Gate cleared.** D1 = approve model as-is; D2 = all five tracks in scope; D3 = Justin accountable, Jai operational. (Classifier returned E3 via fail-safe timeout; conversation-context confirms execution scope — E3 held, heavy authoring delegated to background workflow.)
- 2026-05-28: **Five tracks, not six.** README/Plan said "six" but every enumeration lists five; Role-Competency Framework defines five. Treating as five; flagged to owner.
- 2026-05-28: **Style gate is zero-dep TypeScript**, not Vale (Vale not installed). `.vale.ini` provided as optional add-on.
- 2026-05-28: **Local commits only.** Per [[explicit_deploy_confirmation]], push to origin / publication needs explicit "yes push". Build commits stay local.
- 2026-05-28: **Module authoring delegated** to a background workflow (one author + one adversarial reviewer per module), conforming to the anatomy + originality contract + Module 01 exemplar.
- 2026-05-28: refined: **Advisor (commitment-boundary) reframed CI as a *form-floor*, not a quality backstop** — gates are syntactic; the real authoring risks (correctness, uncited regurgitation, off-voice, section-stuffing, cross-module incoherence) are semantic and slip through. Adopted: (a) **canary one module end-to-end** before any fan-out; (b) **cross-family** adversarial review (author ≠ reviewer family) with tracked reject rate; (c) **human (Owner) read gates merge** to main — no auto-merge-on-green for prose; (d) **cross-module coherence pass** after drafts; (e) **semantic-originality** similarity check (uncited regurgitation is invisible to link-linting). Fan-out of Modules 03–15 **HELD** pending the canary + Owner read. New ISCs 41–44.

## Changelog

- 2026-05-28 — conjectured: the CI gates (anatomy/originality/style/lab-repro/link) are a sufficient backstop to let parallel agents author modules safely. refuted_by: commitment-boundary advisor — gates are syntactic; quality/originality/correctness risks are semantic and pass straight through. learned: CI is a form-floor, not a quality oracle; canary + cross-family review + human merge-gate + semantic-originality check are required before trusting agent-authored content. criterion_now: ISC-41–44 added; fan-out gated on canary + Owner read.

## Verification

Foundation wave — 2026-05-28, all gates run locally (evidence quoted):
- ISC-1/3: `grep -nE '^## [0-9]+\.'` → §1–8 present; `labs/` + `assessment/` exist with assets.
- ISC-4 anatomy-lint: `1/1 modules pass` (EXIT 0).
- ISC-5 originality-lint: `1/1 modules pass` (EXIT 0).
- ISC-6 style-lint: `1/1 modules pass (6 objectives)` (EXIT 0).
- ISC-7 link-check: `3/3 reachable` — linuxcommand.org, missing.csail.mit.edu, overthewire.org (200s).
- ISC-8 lab-repro: `PASS: admin-count=3, stream-separated, reproducible across two runs` (EXIT 0).
- ISC-9 dashboard: wrote `dashboard/ROT-DASHBOARD.md`; Module 01 = 🟢 `ok 364d`.
- ISC-15 coverage: `bun test --coverage` → 96.00% funcs / 98.90% lines (≥ 0.95), 33 pass / 0 fail (EXIT 0). Uncovered 27–28 = defensive `statSync` catch (intentionally unchased per 95%-not-100% rule).
- ISC-16: `git status --short | grep research/job-market` → empty (corpus gitignored).
- ISC-17: no `git push` executed; `origin` untouched.
