# GRC Engineering Curriculum — Original-Content Production & Maintenance Plan + Role Tracks

*How we create, own, and keep alive 100% original GRC Engineering training material — and the generalist + specialist tracks it feeds.*

> This document is the **operating model**. It is paired with one fully-worked proof module — `Module-Terminal-And-Command-Line-Basics.md` — authored from first principles to demonstrate that this model produces real, original, teachable content. **Per "plan means stop," I have not mass-authored the remaining modules. The approval gate is at the end of this document.**

---

## 1. The originality contract (what "100% original content" actually means)

We do not own facts. Nobody owns the fact that `cd` changes directory or that NIST 800-53 has 20 control families. We **own the explanation**. Concretely:

| Element | Must be original (ours) | May reference third party |
|---|---|---|
| The mental model & narrative | ✅ written in-house, in our voice | — |
| Worked examples | ✅ our scenarios, our data, GRC-framed | — |
| Guided labs / exercises | ✅ our environments, our tasks | — |
| Assessments / rubrics | ✅ ours, mapped to our objectives | — |
| Sequencing & pedagogy | ✅ our progression | — |
| Universal facts / syntax / standards | stated in our words | the canonical spec is cited |
| **Deeper / alternative treatments** | — | ✅ **only** under *Supplemental Learning Material* |

**Three hard rules, enforced (see §5 CI):**

1. **Supplemental quarantine.** Third-party material appears *only* under an explicit `## Supplemental Learning Material` heading, always framed as *optional deepening*, never load-bearing. A learner who reads zero supplemental links must still fully meet every objective from our content alone.
2. **No laundering.** We never paraphrase a third-party source and present it as original. If an idea's framing came from somewhere, it's cited in supplemental, not silently absorbed. (This is the same honest-sourcing discipline that flagged the dead `usnistgov/trestle` and archived `fedramp-automation` repos last iteration.)
3. **Originality earns its cost (BitterPill guardrail).** We originate where our explanation is *better for our team and our GRC framing* — not everywhere. We do **not** reinvent TCP/IP or re-derive Bloom's taxonomy. The test for every original paragraph: *"Is this clearer, more contextual, or more GRC-relevant than just linking out?"* If no — link out and move on. Originality is a tool, not a vanity.

**Restructure of the prior deliverable.** Iteration 1's curriculum used named third-party courses/books as the *spine*. That is now inverted: **original modules are the spine; every named resource from iteration 1 is demoted to Supplemental Learning Material** inside the relevant module. The iteration-1 document remains valid as the *resource appendix and sequencing skeleton* — it is the input to the production backlog, not the delivered curriculum.

---

## 2. Curriculum-as-code (the architecture decision that makes this coherent)

The curriculum is **itself GRC-engineered**. We do not buy an LMS and paste prose into it. We treat training material exactly the way the manifesto says to treat controls:

```
curriculum-repo/
  modules/
    01-terminal-and-command-line-basics/
      module.md            # the content (fixed anatomy, §3)
      meta.yaml            # owner, volatility tier, last_reviewed, review_due, objectives
      labs/                # original lab assets, dummy data, setup scripts
      assessment/          # original assessment + rubric + answer key
    02-.../
  tracks/                  # the 6 track definitions (§7) — which modules, what depth
  style/                   # voice & style guide, Vale rules, accessibility checklist
  .ci/                     # link-check, lab-repro smoke tests, originality lint
  dashboard/               # rot dashboard generator (reads every meta.yaml)
  CHANGELOG.md
```

Everything is **Markdown in git**, every change is a **pull request**, every PR runs **CI**, every module has an **owner and a review-due date**, and a **dashboard continuously monitors rot**. This is not an analogy — it is the same control→code→evidence→monitor→own loop the curriculum teaches, applied to the curriculum. The medium *is* the method: new engineers learn GRC Engineering partly by watching it run on their own training material (versioned policy = the module, evidence = CI green, continuous monitoring = the rot dashboard, ownership = `meta.yaml`).

Why this is the right call (ApertureOscillation — tactical vs strategic): authoring one great module is easy; *operating a living curriculum for years while tools, clouds, and frameworks change* is the actual hard problem. Curriculum-as-code is the only architecture where maintenance is a first-class, automated, visible activity instead of an afterthought that rots.

---

## 3. The module anatomy (fixed template — every original module looks like this)

Every module is the same shape so authors have a spec, reviewers have a checklist, and learners have a predictable rhythm:

| # | Section | What it is | Rot tier |
|---|---|---|---|
| 1 | **Learning Objectives** | 3–7 measurable, Bloom-aligned outcomes ("By the end you can *configure*… *explain*… *produce*…") | A (stable) |
| 2 | **Why this matters for GRC** | 1 short para tying the skill to the irreducible loop (control→locate→query→evaluate→evidence→monitor→own) | A |
| 3 | **The Mental Model** | Original first-principles narrative — the *idea* before the syntax | A |
| 4 | **Concepts** | Original explanation, concept by concept, each with a tiny inline example | A/B |
| 5 | **Worked Examples** | 2–4 original, GRC-framed end-to-end examples | B |
| 6 | **Guided Lab** | Original hands-on lab in our environment; step-by-step; produces an artifact | B |
| 7 | **Assessment** | Original competency check — an artifact + a rubric, *not* a quiz of trivia | A |
| 8 | **Supplemental Learning Material** | The *only* place third-party links live; each marked optional + why | C (volatile) |
| 9 | **Maintenance metadata** (`meta.yaml`) | owner, volatility tier, last_reviewed, review_due, objective IDs, changelog | — |

**Volatility tiering is structural, not advisory** (this is the SystemsThinking leverage point). Sections 1–4 and 7 are **Tier A** — fundamentals that barely change ("what a shell *is*" is the same in 2026 as 1986). Sections 5–6 are **Tier B** — semi-stable (a cloud console restyles). Section 8 is the **Tier-C blast zone** — all volatile, third-party, link-rot-prone content is *quarantined here* so decay is contained and CI-checkable. A module's maintenance cost is dominated by its smallest, most isolated section. That is the whole point.

**Objectives are Bloom-aligned and measurable.** Banned objective verbs: *understand, know, be familiar with, learn about* (unmeasurable). Required form: an observable capability the Assessment can falsify ("**produce** a ShellCheck-clean script that…", "**explain** to a non-engineer why a pipe…", "**diagnose** a non-zero exit code by…").

---

## 4. The production pipeline (how a module gets created)

Each module moves through gates; **each gate is a PR review** (curriculum-as-code), so production *is* the engineering discipline being taught.

```
Brief ─► Outline ─► Draft ─► ID review ─► Tech-accuracy ─► Editorial ─► A11y ─► Pilot ─► Publish ─► (enters §5 maintenance loop)
```

| Gate | Owner | Exit criterion (blocking) |
|---|---|---|
| **Brief** | Curriculum Owner | Module's objectives + which tracks consume it + rot tier agreed; entry in the backlog |
| **Outline** | SME Author | Bloom objectives written; section skeleton matches §3 anatomy |
| **Draft** | SME Author | All 9 sections present; 100% original prose in 1–7; supplemental quarantined in 8 |
| **Instructional-Design review** | Instructional Designer | Objectives ↔ content ↔ assessment are *aligned* (every objective is taught and tested); cognitive load paced |
| **Technical-accuracy review** | Technical Reviewer (a *different* engineer) | **Reviewer independently reproduces every command, lab step, and the assessment from a clean machine.** Any step that doesn't reproduce blocks the merge. |
| **Editorial** | Editor | Conforms to the voice/style guide; Vale lint clean |
| **Accessibility** | Editor | Alt text, no color-only meaning, plain-language pass, screen-reader-sane structure |
| **Pilot** | Facilitator | Run with 2–4 learners; capture confusion points + assessment pass-rate; revise |
| **Publish** | Curriculum Owner | Merge to `main`; `meta.yaml` has owner + review_due set; dashboard picks it up |

**Parallel authoring (the deferred delegation, activated on approval):** modules are independent units, so post-approval the backlog is built by **parallel SME authors** — one author per module, each producing a PR against the template, technical-accuracy review fanned out to different engineers. This is the production-scale version of the delegation intentionally not run during this planning step.

### RACI

| Role | Responsibility |
|---|---|
| **Curriculum Owner** (A) | Owns the backlog, tiering, the approval gate, the rot dashboard. One person accountable. |
| **SME Author** (R) | Writes one module's original content end-to-end. |
| **Technical Reviewer** (R) | Independently *reproduces* the module from scratch. Never the author. |
| **Instructional Designer** (C) | Objective↔content↔assessment alignment, pacing, Bloom discipline. |
| **Facilitator** (I) | Runs cohorts, feeds telemetry + confusion points back into the loop. |

---

## 5. The maintenance model (the part that actually matters)

Most curricula die not because they were authored badly but because **nobody owned them after launch**. Content-rot is the failure archetype: a reinforcing loop where more modules → more surface area → faster aggregate decay → learners hit broken steps → trust erodes → people revert to ad-hoc learning → the curriculum dies. The plan's job is to make the **balancing (anti-rot) loop structurally dominant**:

**Loop 1 — Scheduled review by volatility tier.** Every module's `meta.yaml` carries `volatility: A|B|C` and `review_due`:

| Tier | Examples | Review cadence |
|---|---|---|
| **A — stable** | what a shell is; the irreducible loop; risk-quantification fundamentals | every 12 months |
| **B — semi-stable** | cloud console walkthroughs; tool UIs in worked examples | every 6 months |
| **C — volatile** | specific SaaS API behavior, vendor features, supplemental links | every 3 months + triggered |

**Loop 2 — Triggered review.** Certain upstream events auto-open a review task against the affected module(s), regardless of schedule: a framework revision (e.g., NIST 800-53 Rev N+1), a major version of a tool we teach, a cloud-console redesign, or a supplemental link going dead. The trigger list lives in `.ci/triggers.yaml`; a weekly job opens the tasks.

**Loop 3 — Telemetry-driven revision (the strongest signal).** Every cohort emits structured data: per-objective assessment pass-rate, time-on-module, and tagged confusion points from the facilitator. **An objective with a pass-rate below threshold automatically flags its module for revision** — the content, not the learner, is treated as the defect. This is the highest-leverage loop because it measures *whether the content actually teaches*, not whether it's merely current.

**Loop 4 — CI on every PR and on a schedule** (see §6).

**The rot dashboard.** `dashboard/` reads every `meta.yaml` and renders the curriculum's own compliance state: green (reviewed within cadence), amber (review due < 30 days), **red (overdue)**. A red module is treated exactly like an overdue control — visible, owned, escalated. This is continuous controls monitoring pointed at the curriculum itself. If the team can't keep their own training green, they have a live, honest lesson in why controls rot.

**Deprecation policy.** Dead supplemental links are *removed*, not left rotting (carry-forward of the iteration-1 lesson). When a tool we teach is sunset, the module's Tier-C section is rewritten or the module is formally retired with a tombstone in `CHANGELOG.md` — never silently abandoned.

---

## 6. Automated quality gates (CI — `.ci/`)

Runs on every PR and nightly on `main`:

1. **Link checker** — every URL in every `## Supplemental Learning Material` section; dead link = red build → triggers Loop 2.
2. **Lab-reproduction smoke test** — labs ship with a scripted "happy path"; CI spins a clean container and runs it. A lab that no longer reproduces fails the build. (The curriculum has *tests*.)
3. **Originality / attribution lint** — flags (a) any third-party URL outside a Supplemental section, (b) large verbatim blocks matching known sources, (c) missing attribution in supplemental entries.
4. **Style lint** — Vale against `style/` (voice, banned unmeasurable objective verbs, plain-language rules).
5. **Anatomy lint** — fails if a module is missing any of the 9 required sections or `meta.yaml` lacks `owner`/`review_due`.

Green CI is the curriculum's *evidence*. The build status is literally the assurance artifact.

---

## 7. Learning tracks — generalist + specialists

The skill matrix from iteration 1 is the raw material; tracks decide **who learns what, to what depth**. Structure for every track:

```
Common Core  ─►  Role Spine  ─►  Role Capstone  ─►  Cross-track electives
(everyone,       (modules this   (engineer one      (depth in an
 placement-       role goes       artifact specific   adjacent role)
 gated)           deep on)        to the role)
```

**Common Core (everyone, placement-gated):** Part I — *What GRC Engineering is* (the manifesto, the inversion thesis) + the irreducible loop + Tier-1 Foundations (Terminal & CLI → Linux → endpoint OS by fleet → programming+Git → APIs). Placement test = the module assessments; demonstrated competence skips the module. Nobody re-learns the shell needlessly; nobody skips the mindset.

Each **specialist track is defined by the object it engineers** — not a vague blurb. *(Honest flag: this is a designed, manifesto-aligned taxonomy. The official grc.engineering career-architecture ladder is published as **TBD**; the generic GRC labor market still mostly uses analyst/officer titles. We are defining the **engineering** specializations deliberately, not lifting them from a standard. Generic market context: research.com, cybersn.com, learn.org — see sources.)*

| Track | Engineers… (the object) | Role Spine (deep) | Role Capstone |
|---|---|---|---|
| **GRC Engineer — Generalist** *(default track)* | the whole loop, breadth across all objects | Common Core + working-depth across all four spines below | Ship **one real control end-to-end across all loop stages** (designed-left, PaC-enforced, evidence auto-collected, monitored, owned) — the synthesis capstone |
| **Governance Engineer** | **policy & control architecture** — the system of record for controls | Policy-as-Code (Cedar→OPA→Kyverno) · the standards spine (NIST 800-53 superset + crosswalks) · OSCAL authoring + Trestle · control-catalog versioning · governance/exec reporting automation | Convert our control catalog into a versioned, crosswalked OSCAL source of truth with one control's policy enforced as code and exec-reporting auto-generated from it |
| **Risk Engineer (1st + 3rd party)** | **risk models & the risk/vendor data pipeline** | Quantitative risk (FAIR, "measure anything") · risk-register-as-code · control-effectiveness telemetry · **third-party/vendor risk**: vendor inventory automation, continuous vendor monitoring, automated questionnaire intake, SBOM/supply-chain, concentration risk | Build a continuously-updated quantified risk model for one first-party risk **and** one automated continuous-monitoring pipeline for a third-party vendor, both emitting a loss-exposure metric |
| **Compliance Engineer** | **evidence & audit-readiness** | Evidence-as-code pipelines · continuous controls monitoring · API evidence collection at scale · framework-mapping execution · automated gap detection · audit-prep automation | Stand up a continuous-controls-monitoring loop for one framework area: automated checks → versioned evidence store → drift alert → auditor-ready export, with zero manual evidence toil |
| **Customer Trust & Assurance Engineer** | **the customer-facing trust surface** *(the manifesto's "stakeholder-as-customer" value, made literal)* | Trust Center automation · security-questionnaire/RFP automation · customer-audit support tooling · attestation/report distribution + access control · contractual-control / SLA evidence · public posture | Automate the customer trust loop: a self-serve Trust Center fed by the same evidence pipeline Compliance builds, with gated report distribution and a questionnaire-answer engine — measured by reduction in manual questionnaire turnaround |

**Coverage matrix** (D = Deep / author-level · W = Working / can operate · A = Awareness / can converse). Modules use iteration-1 numbering; each is being rebuilt as an original module per §3.

| Module / competency | Generalist | Governance | Risk (1st+3rd) | Compliance | Cust. Trust & Assurance |
|---|:--:|:--:|:--:|:--:|:--:|
| Common Core (Part I + the loop) | D | D | D | D | D |
| Terminal/CLI · Linux · endpoint OS | D | W | W | D | W |
| Programming + Git · APIs | D | W | D | D | D |
| SQL + cloud IAM/audit logs | D | W | D | D | W |
| IaC + scanning in CI | W | D | W | D | A |
| Policy-as-Code | W | **D** | W | W | A |
| Standards spine + crosswalks | W | **D** | W | D | W |
| Threat-informed GRC | W | W | **D** | W | W |
| OSCAL + compliance-as-code | W | **D** | A | D | W |
| Continuous Controls Monitoring | D | W | W | **D** | D |
| Quantitative + 3rd-party risk | W | A | **D** | W | W |
| GRC-as-Product / build-vs-buy | D | W | W | W | **D** |
| Customer trust surface / Trust Center | A | A | A | W | **D** |
| Role Capstone | D | D | D | D | D |

Tracks **diverge after the Common Core and reconverge at a shared capstone showcase** where every track demos its capstone to the others — so a Risk Engineer still understands what a Governance Engineer ships, preserving the generalist DNA the manifesto insists on (*mindset, not silo*).

---

## 8. Build order (the backlog, on approval)

1. **Common Core first** — Terminal/CLI (proof module already drafted), then the rest of Tier-1, then Part I. Highest leverage: every track depends on it.
2. **Then the four Role Spines in parallel** (parallel SME authors), Governance and Compliance first (most shared modules), Risk and Trust & Assurance next.
3. **Capstones + the coverage matrix wiring** last.
4. The **maintenance loop + dashboard + CI go live with module #1**, not at the end — the anti-rot system must exist before there is rot.

---

## 9. Approval gate — STOP

Per "plan means stop," this iteration delivers: the originality contract, the curriculum-as-code architecture, the module template, the production pipeline + RACI, the maintenance/anti-rot model, the CI gates, the six-track architecture with coverage matrix, and **one fully-worked proof module** (`Module-Terminal-And-Command-Line-Basics.md`).

**I have not authored the remaining modules.** On your go-ahead I will, in order: (a) confirm the team baseline + dominant endpoint fleet + which tracks are in scope, (b) stand up the curriculum-as-code repo skeleton + CI + dashboard, (c) author the Common Core modules as original content via the pipeline, (d) build out the four Role Spines.

**Decisions I need from you to proceed:** (1) approve the original-content + curriculum-as-code model? (2) all six tracks in scope, or a subset first? (3) who is the Curriculum Owner (the single accountable role)?

---

### Sources (generic GRC role-market context only; the *engineering* taxonomy above is our design)

[research.com — GRC careers 2026](https://research.com/advice/governance-risk-and-compliance-careers-skills-education-salary-job-outlook) · [cybersn.com — GRC analyst role](https://cybersn.com/role/governance-risk-and-compliance-analyst/) · [learn.org — GRC career path](https://learn.org/articles/governance_risk_compliance_cybersecurity.html) · [concertium.com — GRC roles 2025](https://concertium.com/governance-risk-and-compliance-jobs-remote/)
