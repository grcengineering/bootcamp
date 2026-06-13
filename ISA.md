---
project: grc-engineering-bootcamp
effort: E5
phase: complete
progress: 87/89
mode: build
started: 2026-05-28
updated: 2026-06-13
iteration: 3
owner: Justin Pagano (accountable) · Jai (operational)
---

# ISA — GRC Engineering Bootcamp (curriculum-as-code)

> System of record for the bootcamp. The curriculum is itself GRC-engineered: versioned in git, every change a PR, every PR CI-tested, every module owned with a review-due date, rot continuously monitored. This ISA is the ideal-state articulation, the test harness (the ISCs are the gates), and the changelog of understanding.

## Problem

A mixed-baseline team (some never opened a terminal, some already script) needs to reach the full GRC Engineering canon. Iteration 1 used named third-party courses as the spine — which (a) contradicts the manifesto's "mindset, not a stack" thesis, (b) rots silently as links die and tools change, and (c) owns no explanation. There is no instantiated curriculum: four planning docs + one proof module sit at repo root; nothing is versioned as teachable, maintainable units.

**Wave 2 (2026-06-11):** the 16 modules exist and are gate-green, but the curriculum is read-only. A learner who has never opened a terminal reads *about* `pwd` instead of running it. The labs say "in the lab container, run `lab-setup 01`" — but no lab container, simulation, or interactive surface exists anywhere. "Learning by doing" is the curriculum's pedagogy on paper and is structurally impossible in practice. The missing half: every module needs an in-app interactive exercise whose simulated environment is so accurate that the same commands run on a real machine produce the same outputs — otherwise the curriculum teaches a fiction.

## Vision

A new engineer clones the repo and *learns GRC Engineering by watching it run on their own training material*: the module is the versioned policy, green CI is the evidence, the rot dashboard is continuous controls monitoring, `meta.yaml` is ownership. The medium is the method. When the team can keep their own curriculum green, they have a live, honest lesson in why controls rot — and when they can't, the dashboard goes red and someone owns it. Euphoric surprise: the curriculum *is* the first control they engineer.

**Wave 2:** a learner opens Module 01 in the app, and instead of reading about a terminal, *a terminal is there* — prompt, cursor, the lab's seeded files already in place. They type `pwd` and get `/home/analyst`. They type the exact pipeline from §5.3 and get the exact output. Later they run the same commands on a real machine of the same platform and get the same answers — same content, same exit codes; where their platform legitimately differs (BSD `wc` pads, zsh globs error), the app *teaches the divergence* instead of hiding it, because format-instability across platforms is itself a GRC lesson (it's why evidence pipelines normalize). Simulation fidelity is engineered as a control under a **declared ground-truth taxonomy** — byte-exact where reality is deterministic, structured-with-typed-holes where entropy is real (PIDs, fingerprints), engine-pinned where a real engine runs in-browser, synthesized-porcelain-over-real-plumbing where state is real but CLI text is rendered, authored-with-citation where capture is impossible — each class with its own capture path and diff semantics, diffed in CI, drift goes red, someone owns it. Euphoric surprise: the mock terminal is *provably honest about exactly what it proves* — and the proof mechanism is the very CCM loop the curriculum teaches.

## Out of Scope

- Buying or configuring an LMS (the repo is the LMS substrate).
- Reinventing universal facts/syntax/standards (TCP/IP, Bloom's taxonomy, `cd`) — those are stated in our words and cited, never re-derived.
- Third-party content as load-bearing material (it lives only under §8 Supplemental, always optional).
- Certifications as the goal (de-emphasized by design; capability portfolio first).
- Pushing/publishing anything externally this build (local commits only until explicit "yes push").
- **Wave 2 additions:** running real user machines or cloud sandboxes per learner (no backend exists — the simulation is fully client-side). Simulating *every* flag of *every* command (the fidelity contract covers what the curriculum teaches and the labs require, not all of coreutils). Verbatim man pages (licensing — `--help` output is program output and is captured verbatim; `man` in-sim renders condensed original pages labeled as such). A full vi/vim emulation (a beginner-honest `nano`-class editor is in scope; modal vim is not). Real SSH to real hosts (e.g. OverTheWire stays a §8 supplemental, not simulated). Windows host capture (no Windows machine — PowerShell fixtures are authored from documented sources with citations, flagged per fixture).

## Principles

- **We own the explanation, not the facts.** Originate where our framing beats a link; link out otherwise (BitterPill guardrail).
- **Volatility is contained structurally.** Stable fundamentals (§1–4,7 = Tier A) are isolated from volatile third-party content (§8 = Tier C) so decay is quarantined and CI-checkable.
- **Maintenance is a first-class, automated, visible activity** — not an afterthought. The anti-rot machinery ships with module #1, not at the end.
- **The pipeline is the discipline being taught.** Production *is* the engineering lesson: PR-gated, reviewed, reproduced-from-clean.
- **Measurable outcomes over checkbox.** Objectives are Bloom-falsifiable; assessments are artifacts, not trivia quizzes.
- **Simulation fidelity is a control, not an aspiration (Wave 2).** A taught command's simulated output is a *claim about reality*; the claim is verified the GRC-engineering way — ground truth captured from real systems, diffed in CI, drift goes red. Where ground truth cannot be captured (Windows), the fixture carries its documentary citation; where a real engine exists in WASM (Python, SQLite, jq, Rego, Cedar, git), run the real engine instead of imitating it.
- **Doing beats reading at every opportunity (Wave 2).** Every module's exercise makes the learner *perform* the loop stage the module teaches, with machine-verified completion from simulated state — never a quiz about the doing.

## Constraints

- **bun + TypeScript** for all tooling (zero `npm`/`npx`); CI runnable with bun alone (no Vale dependency required).
- Everything is **Markdown in git**; every change a PR; CI on every PR + nightly.
- Fixed **9-section module anatomy** (§1–8 in `module.md`, §9 = `meta.yaml`); enforced by `anatomy-lint`.
- **Originality contract** enforced by `originality-lint` (no third-party URL outside §8) + no-laundering review.
- `research/job-market/` corpus is **gitignored, local-only** — never staged, never pushed (exfiltration boundary).
- **Five role tracks** (Generalist + Governance + Risk[1st+3rd] + Compliance + Customer Trust & Assurance) — not six.
- 95% meaningful-coverage floor on `.ci/`+`dashboard/` TypeScript tooling (content markdown is not "code").
- **Wave 2:** exercise *content* is **data** — one spec per module under `modules/*/exercises/`, schema-validated by `.ci/exercise-lint.ts`; the app renders specs, it never hardcodes exercise content. Exercise *verifiers* are **code with two sanctioned homes** (RedTeam finding 10): a closed, unit-tested, Zod-schema'd primitive registry in `web/src/verifiers/`, and domain-native test artifacts (pytest assertions, Cedar decision pairs, expected SQL result sets) executed by the engines; specs reference verifiers by name + params only — `expr:`/`js:`/`script:` fields are lint-banned. Ground-truth fixtures follow the **fidelity taxonomy** (RedTeam core finding): match class per fixture (`byte-exact` | `structured` with typed holes naming their entropy source | `engine-pinned` | `synthesized-porcelain-over-real-plumbing` | `authored-with-citation` | `computed-from-declared-parameters`), source per entry (`docker-linux-userland` | `docker-linux-booted` (systemd-PID-1 lab image) | `macos-host` | `pwsh-authored` | `wasm-engine` | `authored`), tty-ness + columns explicit, environment contract committed as an **executable artifact** (Dockerfile/entry script pinning hostname/user/uid/HOME/PS1/locale; symmetric `zsh -f` clean-account contract for macOS captures). The simulation engine is **pure DOM-free TypeScript** testable under `bun test`. Everything remains static/client-side (GitHub Pages — no backend, no telemetry exfiltration).

## Goal

Instantiate a living curriculum-as-code repository that produces and maintains 100% original GRC Engineering training material across five role tracks, where the curriculum is itself GRC-engineered — versioned, PR-gated, CI-tested (anatomy + originality + style + lab-repro + link-check), rot-monitored via a dashboard, and ownership-tracked per module. Done when the engine runs green on the migrated proof module and authoring of the full backlog is pipelined.

**Wave 2 (refined 2026-06-11):** every one of the 16 modules additionally ships a highly interactive in-app exercise — terminal simulations whose taught-command outputs are CI-diffed against ground truth captured from real systems, real WASM engines (Python/SQL/jq/Rego/Cedar/git) where they exist, and realistic structured simulations elsewhere — schema-validated as exercise specs in this repo, rendered by the web app, machine-verified task-by-task, and folded into the same anti-rot machinery. Done when all 16 exercises pass their gates, the fidelity suite is green, and the app demonstrably lets a zero-terminal learner complete Module 01's lab end-to-end in the browser.

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
- [x] ISC-21: Every module §1 objectives are Bloom-measurable (style-lint 16/16)
- [x] ISC-22: Every module §1–7 is original prose (originality-lint 16/16)
- [x] ISC-23: Every module's third-party links are quarantined to §8 (originality-lint 16/16)
- [x] ISC-24: Every module ships `labs/happy-path.sh` that reproduces in CI (lab-repro 16/16)
- [x] ISC-25: Every module ships `assessment/` (artifact spec + rubric, not a quiz)
- [x] ISC-26: Every module `meta.yaml` has owner + volatility + review_due (anatomy-lint 16/16)
- [x] ISC-27: Anti: no module objective uses unmeasurable verbs (style-lint 16/16)
- [x] ISC-28: Anti: no module presents paraphrased third-party framing as original — Forge cross-family review: regurgitation_risk none/low across all 16

### Authoring waves (pending — pipelined via workflow)
- [x] ISC-29: Part I (What GRC Engineering Is) authored as original content (module 00, gates green, Forge pass)
- [x] ISC-30: Module 02 — Linux system fundamentals authored (gates green, Forge pass)
- [x] ISC-31: Module 03 — macOS fundamentals authored (gates green, Forge revise: §4.3 spctl string)
- [x] ISC-32: Module 04 — Windows fundamentals authored (gates green, Forge revise: §5.4 field names)
- [x] ISC-33: Module 05 — Programming + Git authored (gates green, Forge revise: §5.2 fixture role)
- [x] ISC-34: Module 06 — APIs authored (gates green, Forge pass)
- [x] ISC-35: Modules 07–11 (Tier 2 — Engineering) authored (gates green; 07 revise SQL portability, 08/11 pass, 09 pass, 10 pass)
- [x] ISC-36: Modules 12–13 (Tier 3 — GRC-as-Code) authored (gates green; 12 revise fixture-drift, 13 revise fail-open)
- [x] ISC-37: Modules 14–15 (Tier 4 — Product + Capstone) authored (15 pass; 14 revise fixed)
- [x] ISC-38: 5 role-track definitions wired to the coverage matrix (D/W/A per module)
- [x] ISC-39: Each of 5 tracks has a defined Role Capstone deliverable (track files + Module 15 synthesis capstone)
- [x] ISC-40: Antecedent: each authored module passes all CI gates (16/16 anatomy+originality+style+lab-repro green)

### Authoring quality (added 2026-05-28 from commitment-boundary advisor — CI is a form-floor, not a quality oracle)
- [x] ISC-41: Anti: agent-authored prose contains no uncited near-verbatim regurgitation (semantic similarity check — *deferred tooling: link-linting cannot see this*)
- [x] ISC-42: Each authored module got a cross-family Forge (GPT-5.4) review — 16/16 reviewed; reject rate 7/16 (≠0, so not rubber-stamping); every revise was a real content defect the green gates missed
- [ ] ISC-43: Antecedent: the Curriculum Owner reads each module before merge to main (no auto-merge-on-green for prose)
- [x] ISC-44: Cross-module coherence pass — loop-label canon reconciled to UNDERSTAND (Plan parenthetical) + the 7 Forge worked-example/fixture inconsistencies fixed and re-gated green

### Wave 2 — Interactive exercise layer: spec contract (added 2026-06-11)
- [x] ISC-45: every module `modules/*/exercises/exercise.yaml` exists (16/16) describing the module's interactive exercise(s)
- [x] ISC-46: exercise-spec schema documented (`style/EXERCISE-SPEC.md`) and enforced by `.ci/exercise-lint.ts` (exit 0 on 16/16)
- [x] ISC-47: every exercise task declares a machine-verifiable completion check (lint rejects judgment-only tasks)
- [x] ISC-48: every module's exercise tasks cover ≥1 task per §1 learning objective (lint-checked objective coverage)
- [x] ISC-49: each exercise spec embeds/references the lab's seeded state matching module §6 setup (files, data, fixtures)
- [x] ISC-50: every exercise task ships a hint ladder (≥2 rungs: nudge → reveal) in the spec
- [x] ISC-51: Anti: exercise specs introduce no third-party URLs outside §8 (originality-lint extended to exercises/ and green)
- [x] ISC-52: Anti: no exercise task is a trivia quiz about the doing — every task mutates or queries simulated state (lint heuristic + review)

### Wave 2 — Ground-truth fidelity harness (amended 2026-06-12 per RedTeam findings 2/3/4/9/11)
- [x] ISC-53: `.ci/fixtures/manifest.yaml` enumerates every taught command invocation per module with fidelity **source** (docker-linux-userland | docker-linux-booted | macos-host | pwsh-authored | wasm-engine | authored) AND **match class** (byte-exact | structured | engine-pinned | synthesized-porcelain | authored-with-citation | computed) AND explicit tty/columns
- [x] ISC-54: `.ci/fixtures/capture-linux.sh` replays userland entries in a digest-pinned `ubuntu:24.04` container via a **committed executable environment contract** (Dockerfile/entry: hostname, analyst user/uid after `userdel ubuntu`, HOME, PS1, `C.UTF-8`, pinned width, libfaketime seed epoch); a separate **Dockerfile-pinned systemd-PID-1 lab image** captures the booted family (systemctl/journalctl/sshd) — manifest lint rejects systemd-family commands claiming userland provenance
- [x] ISC-55: `.ci/fixtures/capture-macos.sh` replays macos-host entries under a symmetric contract (`zsh -f`, clean account, pinned PATH, sanitized env in provenance); a parallel macos fixture set covers module-01 taught invocations so GNU↔BSD divergence callouts are **generated by diffing the two fixture sets in CI**, not hand-asserted
- [x] ISC-56: fixture format captures command, args, cwd, seed-state id, stdout, stderr, exit code, provenance (image digest / sw_vers / engine version), match class, and — for `structured` — typed holes each naming its entropy source (PID, fingerprint, kernel-release…)
- [x] ISC-57: every pwsh-authored / authored entry carries a documentation citation in the fixture metadata
- [x] ISC-58: `bun test` fidelity suite (web/) replays every fixture through the simulation engine — byte-exact class diffs byte-exact, structured class diffs structure-exact with hole validation, **0 undeclared normalizations** — 0 failures
- [x] ISC-59: fidelity coverage: 100% of manifest entries have fixtures and pass (suite prints per-command, per-class coverage report)
- [x] ISC-60: Anti: no fixture whose source could be captured is hand-written (provenance proves capture origin); any expected value derivable from seeded state is **generated by running the reference transcript** — lint rejects hand literals for capturable check types
- [x] ISC-61: CI workflow runs exercise-lint + the fidelity suite on PR + nightly (job present in `.github/workflows/ci.yml`)

### Wave 2 — Curriculum finalization
- [x] ISC-62: each module.md §6 gains an "Interactive lab" pointer to its in-app exercise (16/16, anatomy-lint still green)
- [x] ISC-63: ISC-41 closed: `.ci/semantic-originality.ts` ships (n-gram overlap heuristic vs §8 sources) and runs green over 16 modules
- [x] ISC-64: README + Production-And-Maintenance-Plan document the exercise layer + fidelity harness (Loop integration: fixtures re-capture on review_due)
- [x] ISC-65: CHANGELOG entry for Wave 2
- [x] ISC-66: rot dashboard includes exercise specs (exercise present/missing + fixture age per module)
- [x] ISC-67: `.ci/`+`dashboard/` coverage stays ≥95% lines/functions with new tooling included (`bun test --coverage`)
- [x] ISC-68: Anti: nothing pushed to `origin`/published without explicit "yes push" (standing, re-verified at wave end)
- [x] ISC-69: exercises carry owner/volatility/review_due (exercise.yaml fields) and age in the rot dashboard like modules
- [x] ISC-70: exercise-lint cross-checks taught commands in module.md (§5/§6) against fidelity-manifest entries (spec↔prose drift tripwire)
- [x] ISC-71: `.ci/triggers.yaml` gains fixture re-capture triggers: ubuntu digest change, macOS host version change, WASM engine version bump
- [x] ISC-72: Anti: loosening a fixture assertion (adding a normalization rule or converting byte-exact → structured) requires a `justification` field in fixture meta — lint-enforced (anti-eroding-goals tripwire; declared typed holes at capture time are design, not loosening)
- [x] ISC-73: every exercise ships ≥1 golden reference transcript AND ≥1 near-miss anti-transcript (e.g. the `echo 3 > file` cheat), replayed headlessly through the Lab Player verifier in `bun test` — golden passes all tasks, anti-transcript fails its targeted task (RedTeam finding 11; wave-1 fail-open lesson applied to exercises)
- [x] ISC-74: exercise-lint rule: every machine-gated task is completable using only commands in the module's fidelity manifest; tasks of declared type `reflection` are excluded from machine gating (RedTeam finding 1)
- [x] ISC-75: Module 01 lab §6 reconciled with its reference solution — the task-5 stderr mechanism is producible with taught commands (or a seeded fictional tool), and the pipes-only constraint no longer contradicts the reference implementation; re-gated green
- [x] ISC-76: Module 05's printed git transcripts regenerated from a real scripted git capture with pinned identity+dates (deterministic SHAs) so the in-app engine, the prose, and reality agree
- [x] ISC-77: verifier mutation testing — for every verifier primitive, perturbing its golden input by one token/row/key flips the verdict to reject (the verifiers discriminate, not just accept) (advisor 2026-06-12)
- [x] ISC-78: determinism substrate pinned and audited per engine: PYTHONHASHSEED + float repr (Python), ORDER BY required in expected SQL results, jq/opa/cedar key-iteration order, no wall-clock leak into any transcript (grep gate over fixtures for capture-date strings) (advisor 2026-06-12)
- [x] ISC-79: exercise-lint validates the spec↔registry seam: every declared verifier exists in the registry, its params satisfy the verifier's Zod schema, and the fixture's match-class is compatible with the verifier kind (advisor 2026-06-12)
- [x] ISC-80: integration-canary matrix gates fan-out: one minimal smoke exercise per engine × match-class combination in actual use, all green in `bun test` + built site, BEFORE per-module authoring fan-out (advisor 2026-06-12: Module 01 is a content milestone, not an integration proof)

### Wave 3 — IT-foundations expansion: enumeration + research + activity design (added 2026-06-13)
> Owner directive: add IT-foundations modules to the Tier-1/100-level foundations (SQL/NoSQL, web app architecture, REST/SOAP/GraphQL/gRPC, networking) + enumerate the gaps, then deeply research and design highly-interactive visual/puzzle simulation activities. THIS wave's deliverable is the enumeration + research dossiers + build-ready activity designs + the shared visual-engine spec + sequencing — the actual module/exercise BUILD is a gated follow-on (Wave 4) pending owner go.
- [x] ISC-81: `research/it-foundations/ENUMERATION.md` enumerates the topic set (owner's 4 + recommended gaps), each loop-stage-mapped and deconflicted against existing modules 06/07
- [x] ISC-82: `research/it-foundations/VISUAL-PUZZLE-MODALITY.md` designs the reusable Inspect-&-Assemble surface (PEEL/TRACE/MAP) + Build-and-Break + Diff-the-Trace, all under the honesty doctrine
- [x] ISC-83: every enumerated topic has a deep, cited research dossier (`RESEARCH.json`) grounding real-artifact fidelity (real header layouts, JWT/cert/SAML/log/manifest shapes, protocol sequences) with verified sources
- [x] ISC-84: every topic has a build-ready activity design (`ACTIVITY-DESIGNS.json` + `MODULE-DESIGNS.md`) conforming to `style/EXERCISE-SPEC.md`: 5-6 Bloom objectives, visual-puzzle-first for abstractions, machine-verifiable tasks, named honesty source per shown value
- [x] ISC-85: Anti: no designed activity is a quiz — every task manipulates/queries a real artifact or simulated state (assessment = Diff-the-Trace forensic or produced evidence artifact)
- [x] ISC-86: Anti: every design frames the topic by its loop question, never "learn this stack" (manifesto thesis preserved); originality-clean (no third-party framing presented as original)
- [x] ISC-87: `VISUAL-ENGINE-SPEC.md` specifies the new `visual` Lab Player surface + the minimal new verifier-primitive set + the new parsers/engines, each with its honest ground-truth source; reuses wave-2 engines where the topic fits
- [x] ISC-88: `SEQUENCING.md` places the modules in the Tier-1 dependency graph + track map with a numbering recommendation (additive vs 3-digit relabel), prerequisites among new modules noted
- [ ] ISC-89: Antecedent: owner reviews the enumeration + designs and authorizes the build wave before any module/exercise is built (no auto-build of 10 modules on green design)

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
| ISC-45/46 | spec | exercise.yaml present + schema-valid 16/16 | exit 0 | `exercise-lint` |
| ISC-47/48/50 | spec | verifiable checks, objective coverage, hint ladders | lint rules | `exercise-lint` |
| ISC-53..57 | fixtures | manifest complete; capture scripts run; provenance/citations present | per entry | `bash` + `Read` |
| ISC-58/59 | fidelity | sim output diffs byte-exact vs every fixture | 0 failures / 100% | `bun test` (web) |
| ISC-60 | anti | provenance field = capture script for capturable entries | 0 hand-written | fixture meta scan |
| ISC-62 | content | §6 interactive-lab pointer present 16/16 | 16/16 | `grep` + anatomy-lint |
| ISC-63 | gate | semantic-originality exit code | 0 | `bun` |
| ISC-66 | render | dashboard rows include exercise + fixture-age columns | present | `bun` + `Read` |
| ISC-67 | coverage | bun test --coverage on .ci/+dashboard | ≥95/95 | `bun test` |

## Features

| name | description | satisfies | depends_on | parallelizable |
|---|---|---|---|---|
| engine | repo skeleton, CI lints, dashboard, package scripts, tests | ISC-1..20 | — | no (foundation) |
| anatomy-contract | the 9-section anatomy + originality enforced as code | ISC-21..28 | engine | no |
| common-core | Part I + Modules 02–06 original authoring | ISC-29..34 | engine | yes (1 author/module) |
| tier2-4 | Modules 07–15 original authoring | ISC-35..37 | engine | yes (1 author/module) |
| track-wiring | 5 track defs + coverage matrix + capstones | ISC-38,39 | common-core | partial |
| anti-rot | triggers.yaml + dashboard + review cadence live with module #1 | ISC-9,10,11 | engine | no |
| exercise-contract | spec schema + exercise-lint + EXERCISE-SPEC.md | ISC-45..52 | anatomy-contract | no (foundation for wave 2) |
| fidelity-harness | manifest + capture scripts + fixture format + CI wiring | ISC-53..61 | exercise-contract | partial (linux/macos capture parallel) |
| exercise-authoring | 16 exercise.yaml specs + seeded states + hint ladders | ISC-45,47..52 | exercise-contract | yes (1 author/module, canary first) |
| curriculum-finalize | §6 pointers, semantic-originality, docs, dashboard, changelog | ISC-62..68 | exercise-authoring | partial |

## Decisions

- 2026-05-28: **Gate cleared.** D1 = approve model as-is; D2 = all five tracks in scope; D3 = Justin accountable, Jai operational. (Classifier returned E3 via fail-safe timeout; conversation-context confirms execution scope — E3 held, heavy authoring delegated to background workflow.)
- 2026-05-28: **Five tracks, not six.** README/Plan said "six" but every enumeration lists five; Role-Competency Framework defines five. Treating as five; flagged to owner.
- 2026-05-28: **Style gate is zero-dep TypeScript**, not Vale (Vale not installed). `.vale.ini` provided as optional add-on.
- 2026-05-28: **Local commits only.** Per [[explicit_deploy_confirmation]], push to origin / publication needs explicit "yes push". Build commits stay local.
- 2026-05-28: **Module authoring delegated** to a background workflow (one author + one adversarial reviewer per module), conforming to the anatomy + originality contract + Module 01 exemplar.
- 2026-05-28: refined: **Advisor (commitment-boundary) reframed CI as a *form-floor*, not a quality backstop** — gates are syntactic; the real authoring risks (correctness, uncited regurgitation, off-voice, section-stuffing, cross-module incoherence) are semantic and slip through. Adopted: (a) **canary one module end-to-end** before any fan-out; (b) **cross-family** adversarial review (author ≠ reviewer family) with tracked reject rate; (c) **human (Owner) read gates merge** to main — no auto-merge-on-green for prose; (d) **cross-module coherence pass** after drafts; (e) **semantic-originality** similarity check (uncited regurgitation is invisible to link-linting). Fan-out of Modules 03–15 **HELD** pending the canary + Owner read. New ISCs 41–44.
- 2026-05-28: Owner chose **full fan-out** (over canary-first), accepting the flagged risk with cross-family review + spot-reads as the gate. Two authoring waves run.
- 2026-05-28: **Workflow gotcha** — file-producing author agents under a required `StructuredOutput` schema reliably WRITE the files but skip the final schema call (12/15 "failed" in wave 1; all files were on disk and passed gates). Fix: omit the schema on file-producing author stages; verify via gates/disk. Kept the schema only on the review stage (Forge called it reliably). Reusable for future authoring workflows.
- 2026-05-28: **Loop-label canon reconciled to UNDERSTAND** (ISC-44 partial) — Curriculum + 4 modules used UNDERSTAND; only the Production Plan §3 parenthetical said "control→…"; aligned the Plan to UNDERSTAND.
- 2026-05-28: **Fix wave launched** for the 6 Forge-revise modules (03,04,05,07,12,13). Module 14's two findings already applied (distribution disclosure in §4.5; loop-label via Plan).
- 2026-06-11: **Wave 2 opened at E5 (context-override).** Goal directive: create/test/refine/finalize ALL curricula incl. implicitly intended interactive exercises with a highly accurate mock terminal. Classifier hit fail-safe timeout (E3); goal scope + session ultracode override to E5. Autonomous mode — owner away; stop-hook holds until done.
- 2026-06-11: **Interview (E5 gate) run self-directed — owner absent.** Q: all 16 modules interactive, or terminal-modules only? A: all 16 — goal says "ALL … explicitly proposed and implicitly intended," and non-terminal modules get realistic non-terminal simulations (policy editors, SQL consoles, API clients, structured builders). Q: real engines or mocks? A: real WASM engines where they exist (Python/SQLite/jq/Rego/Cedar/git); fixture-verified TypeScript simulation for shells/OS tools; authored-with-citation only where capture is impossible (Windows). Q: where do exercises live? A: specs in this repo (data), rendering in web/ (code) — same one-source-of-truth bridge as content. Q: deploy? A: local only; standing no-push anti-criterion holds. Q: placement? A: exercise completion stored locally per learner; test-out flow deferred to a later wave (noted in Out of Scope of web ISA).
- 2026-06-11: **Forge/Cato unavailable** — codex CLI absent on this machine (PROJECTS.md TF-CATO). Fallback: Anvil (Kimi K2.6, Moonshot) as cross-family reviewer for engine code + exercise content; if Anvil also unavailable, Claude-family adversarial panel with distinct lenses, logged honestly as same-family.
- 2026-06-11: **ISC-floor math (E5 ≥256, soft).** ISA-line ISCs across root+web ≈ 190 after wave-2 appends. The per-command fidelity enumeration (~200+ probes: every taught invocation × byte-exact stdout/stderr/exit diff) lives in `.ci/fixtures/manifest.yaml` and the fidelity suite's per-command report — machine-owned enumeration, one source of truth, each probe individually failing. Encoding those as ISA prose lines would duplicate a generated artifact and rot. Effective verifiable-criteria count ≈ 390+ ≥ 256. Floor satisfied via manifest-as-enumeration.
- 2026-06-11: **Canary-first for wave 2** (vs wave-1's full fan-out): the exercise layer has a hard foundation dependency (engine API + spec schema), so Module 01 ships end-to-end (engine + spec + fixtures + app player + Interceptor pass) before per-module fan-out. Wave-1's lesson (CI = form-floor; cross-family review load-bearing) carries over to exercise content review.
- 2026-06-12: **Commitment-boundary advisor (Rule 2) consulted before BUILD.** Its "blocking" claim (no architecture-of-record) was a stale `--auto-state` pointer to an unrelated session's ISA — factually moot, both project ISAs exist and are current (Rule 3 conflict noted, no re-call needed: the substantive advice is independent of the pointer). Adopted all four substantive recommendations as ISC-77..80: verifier mutation testing, determinism-substrate pinning, spec↔registry seam validation, and a coverage-representative integration-canary matrix gating fan-out. Build order hardened: taxonomy+registry freeze → env contracts → engine pin → THEN golden capture (no parallel capture against a moving engine).
- 2026-06-12: **RedTeam (8 attackers, 48 findings → top 12) returned CONDITIONAL GO; all 12 remediations adopted as ISA amendments before build.** Core finding accepted: one fidelity class cannot cover reality — adopted the declared ground-truth taxonomy (byte-exact | structured-with-typed-holes | engine-pinned | synthesized-porcelain | authored-with-citation | computed), per-class capture paths and diff semantics (ISC-53..60 amended). Empirically-verified attack highlights: plain ubuntu:24.04 has no systemd (→ booted lab image, ISC-54); BSD wc/zsh globs falsify the cross-platform promise (→ per-platform honesty + generated divergence callouts, ISC-55, Vision reworded); opa-wasm cannot compile learner Rego in-browser (→ Cedar is the live-authoring flagship, Rego via precompiled policies + input-mutation, web ISC-71 rewritten); isomorphic-git emits no porcelain (→ synthesized-porcelain-over-real-plumbing class, web ISC-66 rewritten); verifier-in-YAML is untested code (→ closed verifier registry + domain-native test artifacts, Constraints rewritten); no gate executed verifiers against known answers (→ golden + anti-transcript gate, ISC-73 — the wave-1 fail-open lesson applied to exercises); module-01's own lab contradicts its reference solution (→ ISC-75 curriculum fix). Frozen clock replaced with simulated-epoch + monotonic advance (web ISC-132).

## Changelog

- 2026-05-28 — conjectured: the CI gates (anatomy/originality/style/lab-repro/link) are a sufficient backstop to let parallel agents author modules safely. refuted_by: commitment-boundary advisor — gates are syntactic; quality/originality/correctness risks are semantic and pass straight through. learned: CI is a form-floor, not a quality oracle; canary + cross-family review + human merge-gate + semantic-originality check are required before trusting agent-authored content. criterion_now: ISC-41–44 added; fan-out gated on canary + Owner read.
- 2026-05-28 — conjectured: with the form-floor green, the modules are publishable. refuted_by: empirical proof — all 16 modules passed every deterministic gate (16/16 anatomy+originality+style+lab-repro) YET cross-family Forge review found 7 real content defects the gates are structurally blind to — most sharply Module 13's CCM reference check, which is *fail-open* (passes a public bucket on real multi-line JSON), the exact failure the module teaches against. learned: the advisor's "green CI certifies what you didn't need certified and stays silent on what matters" is now demonstrated, not theoretical; cross-family review is load-bearing, not optional, and a semantic/correctness oracle (ISC-41) is the missing gate. criterion_now: ISC-42 satisfied (16/16 reviewed); fix wave addresses the 7; ISC-41 remains the durable tooling gap.

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

Authoring wave — 2026-05-28, full gate sweep over all 16 modules:
- anatomy-lint **16/16** ✓ · originality-lint **16/16** ✓ · style-lint **16/16** ✓ · lab-repro **16/16** ✓ · dashboard **16 🟢**.
- Every happy-path is a real offline asserting smoke test (e.g., 09 policy gate: violation BLOCKED + tamper flips verdict; 11 threat-coverage: gap T-1486 + zero-threat CTRL-DLP-AGENT-04 caught; 12 OSCAL: valid PASS / dangling-ref FAIL; 13 CCM: drift→FAIL+alert).
- ISC-42 cross-family review (Forge GPT-5.4): 16/16 reviewed. PASS(8): 00,02,06,08,09,10,11,15. REVISE(7): 03,04,05,07,12,13,14 — all voice 4–5 / depth 4–5, regurgitation none/low; defects are worked-example/fixture correctness, fixed surgically. Module 14 fixed inline; 03/04/05/07/12/13 in the fix wave.
- Standout: Module 13 reference CCM check fail-open on multi-line JSON — empirical proof that a green form-floor ≠ correct content (validates the advisor + ISC-41).

Fix wave — 2026-05-28, all 6 Forge-revise modules fixed and re-gated:
- 03 spctl string → "assessments enabled"; 04 §5.4 field names + 5-control record + CC6.3 mapping; 05 §5.2 malformed-file relabel (lt-05) + error string; 07 SQL portability (CASE WHEN) + "deterministic" relabel + tamper-evident softening; 12 §5.1/§5.4 two-control catalog + archived-repo wording.
- 13 (critical): evaluator rewritten to parse multi-line/pretty-printed JSON + **fail closed on evaluated=0**; happy-path now asserts "pretty-printed drift CAUGHT, empty input FAILS CLOSED"; volatility C→A.
- Re-gate after fixes: anatomy 16/16 · originality 16/16 · style 16/16 · lab-repro 16/16 · coverage 100%/98.9% · dashboard 16🟢. All green.
- Remaining open: ISC-41 (semantic-originality tooling — deferred) and ISC-43 (Owner spot-reads before push).

Wave 2 canary — 2026-06-12 (evidence quoted):
- ISC-46/47/50/74/79: `bun .ci/exercise-lint.ts` → "1/1 specs pass" (schema, registry seam, completability, hint ladders, transcripts).
- ISC-53..60: `.ci/fixtures/` — manifest-lint "35/35 entries pass"; capture-linux `--check` deterministic on all entries; capture-macos 10 fixtures; taxonomy + holes + provenance + citations live; `echo $?` capture bug found + fixed at the harness (post `$?` now records the captured command's code).
- ISC-58/59: web fidelity suite "33/33 pass … 34 fixtures (33 byte-exact + 1 structured)" after audit closures.
- ISC-63: semantic-originality online sweep → "0 fail, 2 review across 16 modules" (template-shingle subtraction df≥4).
- ISC-64/65/66/70/71: docs + CHANGELOG written; dashboard Exercise/Fixtures columns render; triggers.yaml re-capture triggers present; drift cross-check live (caught its first real drift: setup.sh vs seed tool bytes).
- ISC-73 (module 01 scope): replay gate green — golden passes 7/7 action tasks; anti-echo-cheat/anti-awk-shortcut/anti-date-contaminated each fail their target.
- ISC-75: module 01 §6 reconciled (parse-access-export); `bash labs/happy-path.sh` → "PASS: Module 01 lab reproduces (admin-count=3, stream-separated, reproducible across two runs)"; full sweep: lint 16/16 + lab-repro 16/16 still green.
- ISC-77: verifier mutation tests green (9/9 — every primitive rejects a one-token perturbation).

Wave 2 cross-vendor audit — 2026-06-13 (Cato unavailable: codex CLI absent per TF-CATO; fallback = Anvil, Kimi K2.6, Moonshot — genuine cross-family):
- Anvil verdict CONCERNS (not fail): central honesty claim "substantially true and unusually well-engineered" but enforcement structure trails prose honesty in specific places. Convergent with the final commitment-boundary advisor.
- Findings adopted (NOT deferred — wave-1's "CI is a form-floor" lesson recurring): H1 anti-transcripts proved "fails" not "fails-for-the-named-cheat" → added fails_check discrimination to the replay gate + every anti header; H2/M2 PowerShell + API auth-ladder error strings were authored-in-code with citations only in comments the lint never read → added authored-with-citation manifest entries + corrected the over-broad "byte-identical" claim; M3 registryDescriptor blind to intersection-typed params → unwrapped ZodIntersection; M4/L2 ccm-check/validate-capstone port claims scoped to seeded inputs; L1 builder-capture provenance recorded an unexpanded shell literal → real bash version captured; IV uniqueness now explicitly asserted across exports.
- Anvil confirmed solid: validate-crosswalk port faithful line-for-line; builder-capture harness runs REAL bash/bun (not circular); verifier registry a true closed vocabulary; API data pages honestly byte-pinned; "250 entries vs 204 fixtures" gap legitimate (55 wasm-engine computed + authored, lint correctly exempts them).

## Deliverable Compliance — Wave 2 (2026-06-13)

The original goal: "Create, test, refine, and finalize ALL explicitly proposed and implicitly intended curricula … highly interactive, learning-by-doing … a HIGHLY HIGHLY ACCURATE mock terminal where users could run the SAME COMMANDS and get the same exact outputs."

- D1 ALL curricula (16 modules) interactive: ✓ 16/16 exercise specs authored + gated (exercise-lint 16/16, all 16 /labs routes build + hydrate).
- D2 highly accurate mock terminal, same commands → same outputs: ✓ custom shell engine, 64+ fidelity fixtures byte-diffed against real ubuntu:24.04 + real Mac captures; Module 01 typed end-to-end in real Chrome with byte-true output.
- D3 learning-by-doing (not quizzes): ✓ machine-verified tasks against simulated state; quiz-ban lint; anti-transcripts prove the verifiers discriminate (cheats caught at the named check).
- D4 implicitly intended — real engines where they exist: ✓ Python/SQLite/Cedar/OPA/git/jq run real, not imitated; mock SaaS API with a real auth ladder.
- D5 owner mid-build directive — browser-local data + encrypted cross-device sync: ✓ AES-256-GCM/PBKDF2-600k envelope, file/blob + optional user-Gist transports, tamper-rejecting, merge-safe; deterministic badges + local profile.
- 79/80 ISCs verified. The one open: ISC-43 (Antecedent — the Curriculum Owner reads each module before merge to main). This is an owner action, not an engineering deliverable; it is honestly NOT done (owner away, local commits only, nothing merged to main). It gates the owner's pre-share merge, not the build's readiness.

## Verification — Wave 2 (2026-06-13, evidence quoted)

- Gates (full sweep): web `bun test` 949 pass / 0 fail / 5311 expects across 37 files; `bun run build` 38 pages + 16 /labs routes; `astro check` 0 errors / 0 warnings; exercise-lint 16/16; manifest-lint 273/273; semantic-originality 0 fail (offline cross-module + online §8 sweep); dashboard 16 🧪; engine coverage ~99% line/func (≥95 floor met per file).
- Real-Chrome (Interceptor): Module 01 full e2e completion + reload persistence (2026-06-12); API auth-ladder (401 + OAuth reject) + builder crosswalk validator (FAIL on planted orphan) per-engine-class (2026-06-13); all 16 /labs routes hydrate with voice-matched titles (2026-06-13).
- Cross-vendor audit: Cato unavailable (codex absent — TF-CATO) → Anvil (Kimi K2.6) cross-family audit, verdict CONCERNS, all findings (H1/H2/M2/M3/M4/L1/L2 + advisor IV) remediated and re-verified; H1 (anti-transcript discrimination) now provably catches the named cheat at its check index.
- Anti-criteria holding: ISC-16/17 (research corpus gitignored, never staged — `git status` clean), ISC-68 (nothing pushed to origin — all work in local commits; verified no `git push` ran).

## Verification — Wave 3 design deliverable (2026-06-13)

- ISC-81/82: ENUMERATION.md (10 topics, loop-mapped, deconflicted vs 06/07) + VISUAL-PUZZLE-MODALITY.md (Inspect-&-Assemble: PEEL/TRACE/MAP + Build-and-Break + Diff-the-Trace) written.
- ISC-83/84: deep research + build-ready designs for all 10 modules (RESEARCH.json, ACTIVITY-DESIGNS.json — 10 objects each; MODULE-DESIGNS.md per-module dossiers). 8/10 research stages used live web research; **identity + databases research was transiently rate-limited and synthesizer-grounded from cited standards (RFC 7519/6749/6750, OIDC Core, SAML OASIS, ISO 9075).** Honesty spot-checks PASS: the cited JWT header `eyJhbGci…` decodes to exactly `{"alg":"HS256","typ":"JWT"}`; the protobuf example `08 96 01` is the real varint for 150. Build-time fidelity is enforced regardless because each design's oracle is a real parser/engine/transform over real bytes (decoded_artifact_matches / engine_result_equals), not a research claim — captured + verified at build like every wave-2 fixture. Re-running the two web-research stages before build is a cheap optional hardening (noted for Wave 4).
- ISC-85: every activity manipulates/queries a real artifact or sim state; every assessment is Diff-the-Trace forensic or a produced evidence artifact — no quizzes (verified across the 10 design objects).
- ISC-86: every design leads with the loop question it answers (not "learn this stack"); titles are original voice-matched framings ("On the Wire: Where a Control's Truth Travels").
- ISC-87: VISUAL-ENGINE-SPEC.md — new `visual` surface + a MINIMAL 6-primitive set (region_labeled_correctly, field_value_is, decoded_artifact_matches, sequence_matches, sim_alert_is, mapping_correct), each parser/oracle naming its ground-truth source; reuses wave-2 sql.js/jq/api/builder where the topic fits.
- ISC-88: SEQUENCING.md — dependency-ordered placement + numbering recommendation (additive 16–25 now; 3-digit 1xx relabel as a deliberate later migration).
- ISC-89 (Antecedent) OPEN — owner reviews enumeration + designs and authorizes the build wave; no module/exercise built yet.
