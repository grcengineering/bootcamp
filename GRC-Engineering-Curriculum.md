# The GRC Engineering Curriculum

*A progressive, mindset-first program to take a whole team from zero technical fluency to the full GRC Engineering canon — built for Justin's team at Vanta.*

> **Disambiguation:** the grc.engineering manifesto is co-authored by nine practitioners, one of whom is named *Justin Pagano*. That is **not** the Justin this curriculum is for. Different person; manifesto author only.

---

## 0. How to use this

**Audience.** Built for a mixed team: some members have never opened a terminal; some already script. It assumes the lower baseline and builds up — but **nobody re-learns what they already know** (see *Placement* below).

**The one idea that makes this work.** The grc.engineering manifesto is emphatic that GRC Engineering is *"a mindset and a capability, not a job title or a required tech stack"* — Ayoub Fandi's *"You Still Work in GRC"* essay explicitly says Python/Kubernetes/cloud are *"nice to have, not required."* A curriculum sold as *"learn this stack to become a GRC Engineer"* would directly contradict the thing it's teaching. So this curriculum's spine is **not** a tool checklist. It is the irreducible loop every GRC engineer runs, and every tool is taught only as instrumentation for that loop.

### The spine — the irreducible GRC Engineering loop

A control is just **a claim about the state of a system** ("access is least-privilege," "laptops are encrypted," "prod changes are reviewed"). *Engineering* a control means running this loop:

```
1. UNDERSTAND   read the control; know what claim it makes
2. LOCATE       find where the truth of that claim physically lives
                (a config file, an API response, a log, a DB row, a cloud setting)
3. QUERY        reach that truth programmatically (shell, API, SQL)
4. EVALUATE     judge it against policy expressed as code (not a spreadsheet)
5. EVIDENCE     emit durable, versioned, audit-ready proof automatically
6. MONITOR      re-run continuously; alert on drift (continuous controls monitoring)
7. OWN          treat the whole thing as a product: backlog, owner, UX, iteration
```

Every module below maps explicitly to one or more loop stages. When a learner asks *"why am I learning bash / Python / OPA?"* the answer is always a loop stage, never "because the stack says so."

### The four tiers

| Tier | Name | Loop stages | What you can do at the end |
|---|---|---|---|
| **1** | **Foundations** | UNDERSTAND, LOCATE, QUERY | Reach and read the truth of a control by hand and by script, on any OS, via any API |
| **2** | **Engineering** | QUERY, EVALUATE | Pull control truth at scale from cloud/SQL; enforce policy as code in CI |
| **3** | **GRC-as-Code** | EVALUATE, EVIDENCE, MONITOR | Express controls in OSCAL, auto-collect evidence, run continuous controls monitoring |
| **4** | **GRC-as-Product** | OWN (whole loop) | Run a control like a product: threat-informed, designed-left, owned, measured |

### Placement (the fast-path — read before anyone starts)

Nobody starts at module 1 by default. Each Tier-1 module's *proof-of-competence artifact* is also its **placement test**. On day one each person attempts the Tier-1 artifacts cold:

- Produces the artifact unaided → **test out**, skip the module, move on.
- Struggles → start that module.

This means an engineer who already lives in a shell spends week one on APIs or Tier 2, not on `cd` and `ls`. The assumption "team is mostly non-technical" is therefore *self-correcting* — placement, not lockstep.

### Reading the modules

Every module has the same shape so it can be dropped into any LMS or run as a reading list:

> **Loop stage · Resources (named, verified, free-first) · Sequence · Time · Proof-of-competence artifact**

---

## Part I — What GRC Engineering actually is (everyone, week 0, ~3 hrs)

Before any tooling. Read the source, not a summary of it.

**Read:** the full manifesto at **https://grc.engineering** and the **https://cheatsheet.grc.engineering** "Legacy GRC vs GRC Engineering at a glance" comparison.

The canonical definition you are being measured against:

**The inversion thesis.** Legacy GRC flows top-down: *framework → controls → implementation → evidence → audit*. GRC Engineering **inverts it**: start from running systems and real control behavior, and let reality drive policy. This is the single defining intellectual move; the entire curriculum exists to make the team capable of running it.

**The 5 problems with legacy GRC** the manifesto names: (1) complacency with manual toil and trivial outputs; (2) transactional, GRC-centric stakeholder relationships; (3) shallow & narrow "whack-a-mole" problem-solving; (4) excessive focus on closed-source frameworks & standards; (5) commoditization of compliance — automating ineffective practice just produces *"low-value outcomes faster."*

**The 8 core values** (verbatim "X over Y"): automate early & often › manual processes · GRC-as-Code › tool-specific constructs · measurable & meaningful risk outcomes › checkbox compliance · evidence, logic, math & reason › fear and doubt · in-depth continuous assurance › shallow periodic monitoring · stakeholder-centric UX › GRC-team convenience · shared-fate partnerships › transactional relationships · open-source practitioner solutions › closed vendor paradigms.

**The 5 principles:** (1) shift, and *start*, GRC left; (2) practitioners can build better solutions than vendors/agencies; (3) GRC as a product; (4) threat-informed GRC; (5) systems thinking + design thinking.

**Week-0 exercise (everyone, including managers).** Take **one real control we own at Vanta**. Write one page: where does it sit today on each of the 5 legacy problems? What would the *inverted* version look like (reality → policy instead of policy → reality)? This document is revisited at the capstone — it is the before/after of the entire program.

**Community as continuing education (subscribe now, consume throughout):** the **GRC Engineer** newsletter & podcast — https://grcengineer.com (Ayoub Fandi) · **blog.grc.engineering** · the grc.engineering Discord & LinkedIn group · **awesome-grc-engineering** — https://github.com/ethanolivertroy/awesome-grc-engineering · the grc.engineering **Learning Hub** — https://grc.engineering/learning-hub/. *(Note: a dedicated r/grcengineering subreddit could not be confirmed as an active primary hub — the newsletter/podcast/Discord are the verified channels.)*

---

## Part II — Tier 1: Foundations

*Loop stages: UNDERSTAND, LOCATE, QUERY. Goal: reach and read the truth of a control by hand and by code, on any OS, via any API.*

**Dependency order (do not reorder):**

```
        ┌─────────────┐
        │ 1. CLI/Shell │  ← substrate; everything assumes it
        └──────┬───────┘
        ┌──────┴───────┐
        ▼              ▼
┌──────────────┐  ┌───────────────────────────┐
│ 2. Linux     │  │ 5. Programming + Git       │  (start ~wk2, runs parallel)
│  system      │  └──────────────┬────────────┘
└──────┬───────┘                 │
       ▼                          ▼
┌──────────────────────┐  ┌───────────────┐
│ 3/4. macOS / Windows │  │ 6. APIs        │  ← capstone of Tier 1
│  (role-split)        │  └───────────────┘     (needs shell+Python+JSON)
└──────────────────────┘
```

### Module 1 — Command line, shell & Bash scripting

*Loop stage: QUERY (the universal one). The single highest-leverage skill here — Linux, endpoint forensics, Git, and API scripting all assume terminal fluency.*

**Resources (free-first):**
- **"The Linux Command Line" — William Shotts** — https://linuxcommand.org/tlcl.php — free PDF; the definitive beginner→competent text. The spine of this module.
- **MIT "The Missing Semester of Your CS Education"** — https://missing.csail.mit.edu/ — free; the practical shell/data-wrangling/tooling lectures formal CS skips.
- **OverTheWire: Bandit** — https://overthewire.org/wargames/bandit/ — free; 34 SSH-into-a-real-box levels. The assessment *and* security intuition.
- **explainshell.com** + **ShellCheck** (https://www.shellcheck.net/) + **jq** (https://jqplay.org/) — working tools used daily from day one; `jq` is the bridge to Module 6.

**Sequence:** Shotts Pt 1–2 → Missing Semester L1–2 (shell + scripting) → Shotts Pt 3–4 (grep/sed/awk text processing) → Bandit 0–20 in parallel as graded practice → Shotts Pt 5 (full scripting: flow control, functions, args) with ShellCheck on every script → `jq` against a real JSON file.

**Time:** ~25–35 hrs over 3–4 weeks part-time.

**Proof-of-competence artifact (also the placement test):** a ShellCheck-clean Bash script that ingests a directory of log files, extracts all failed-auth events with `grep`/`awk`/`sed`, dedupes and counts by source, and emits a clean CSV evidence summary from a single argument — **plus** Bandit completed through level 20. (Shell *scripting* is assessed here as a distinct outcome, not just interactive CLI use.)

### Module 2 — Linux system fundamentals

*Loop stage: LOCATE — the OS is where server/endpoint control-truth physically lives.*

**Resources:** **Linux Foundation LFS101 (edX)** — https://www.edx.org/learn/linux/the-linux-foundation-introduction-to-linux (free audit; authoritative structured backbone) · **"How Linux Works, 3rd Ed." — Brian Ward** — https://nostarch.com/howlinuxworks3 (the *why*: boot, processes, systemd, networking, logging) · **Linux Journey** — https://linuxjourney.com/ (free interactive on-ramp) · **KodeKloud Linux Basics** — https://kodekloud.com/courses/the-linux-basics-course/ (browser terminals, no local VM).

**Sequence:** Linux Journey Grasshopper+Journeyman → LFS101 modules 1–10 → *How Linux Works* (processes, filesystem, systemd/boot, logging, networking) alongside → KodeKloud labs for systemd & package mgmt → SSH focus: key-based auth, `journalctl`/`/var/log` auth events.

**Time:** ~30–40 hrs over 4–5 weeks.

**Artifact:** on a fresh Linux instance — create a sudo non-root user, lock SSH to key-only, install+enable a systemd service, then produce a one-page compliance-evidence writeup proving each control using `id`, `ls -l`, `systemctl status`, `sshd_config`, and `journalctl` as the evidence artifacts.

### Module 3 — macOS fundamentals (role-split: see Track Map)

*Loop stage: LOCATE — endpoint evidence (FileVault, screen lock, MDM) is collected from exactly these subsystems; most SaaS workforces are Mac-heavy.*

**Resources:** **Apple Platform Security Guide** — https://support.apple.com/guide/security/welcome/web (the document auditors should cite) · **Apple Platform Deployment Guide** — https://support.apple.com/guide/deployment/welcome/web + **MacAdmins.org** — https://www.macadmins.org/ (Slack + monthly = continuing ed) · **scriptingosx.com — Armin Briegel** — https://scriptingosx.com/ (launchd, defaults, profiles for non-engineers) · **drduh/macOS-Security-and-Privacy-Guide** — https://github.com/drduh/macOS-Security-and-Privacy-Guide.

Anchor concepts (compliance lens): SIP · Gatekeeper + notarization · TCC · Keychain · FileVault · launchd · configuration profiles/MDM · the `defaults`, `profiles`, `system_profiler`, `log show` CLI.

**Sequence:** Apple Security Guide (hardware/system + app security) → scriptingosx (launchd, `defaults`, profiles) → Apple Deployment Guide (MDM/profiles/ABM) → drduh hands-on (keychain, TCC, FileVault) → one MacAdmin Monthly recording.

**Time:** ~20–30 hrs over 3–4 weeks.

**Artifact:** an endpoint compliance-evidence packet built entirely from the CLI — prove FileVault (`fdesetup status`), SIP (`csrutil status`), Gatekeeper (`spctl --status`), screen-lock policy, and MDM enrollment + a deployed profile (`profiles status`, `system_profiler SPConfigurationProfileDataType`), each command labeled to the control it evidences.

### Module 4 — Windows fundamentals (role-split: see Track Map)

*Loop stage: LOCATE — the other half of endpoint evidence. PowerShell is both the admin language and the evidence-collection tool.*

**Resources:** **"Learn PowerShell in a Month of Lunches, 4th Ed."** — https://www.manning.com/books/learn-powershell-in-a-month-of-lunches-fourth-edition (the universally-recommended non-programmer on-ramp) · **Microsoft Learn — Get started with Windows PowerShell** — https://learn.microsoft.com/training/paths/get-started-windows-powershell/ (free, hands-on) · **Microsoft Learn — SC-900 Security, Compliance & Identity Fundamentals** — https://learn.microsoft.com/training/paths/describe-concepts-of-security-compliance-identity/ (Entra ID, conditional access, Purview — the GRC-critical identity layer) · **John Savill's PowerShell Master Class (YouTube)** + MS Learn "Maintain system administration tasks" path.

Anchor concepts: PowerShell pipeline & `Get-*` · `Get-WinEvent`/Security log/audit policy · Registry policy keys · Group Policy (`gpresult`) · AD vs Entra ID · conditional access/MFA · BitLocker · Defender.

**Sequence:** Month of Lunches ch.1–12 (one lunch/day) → MS Learn PowerShell path in parallel → SC-900 modules on Entra ID/identity/conditional access/Purview → Month of Lunches remoting+scripting chapters → MS Learn sysadmin path (`Get-WinEvent`, registry, `gpresult`).

**Time:** ~30–40 hrs over 5–6 weeks.

**Artifact:** a PowerShell script that collects a Windows endpoint compliance bundle — BitLocker (`Get-BitLockerVolume`), Defender (`Get-MpComputerStatus`), screen-lock GPO, last 20 failed logons (`Get-WinEvent`), local-admin membership — exported to JSON/CSV with each control labeled to a framework requirement (e.g., SOC 2 CC6).

### Module 5 — Programming fundamentals + Git (the centerpiece)

*Loop stages: QUERY + EVIDENCE. Python is the lowest-friction evidence-automation language; Git is itself a compliance control (change management + audit trail).*

**Python resources:** **"Automate the Boring Stuff with Python, 3rd Ed." — Al Sweigart** — https://automatetheboringstuff.com/ (free; *the* non-engineer automation book — primary text) · **"Python Crash Course, 3rd Ed." — Eric Matthes** — https://nostarch.com/python-crash-course-3rd-edition (stronger on data structures, classes, **testing**; the structured spine) · **Exercism Python track** — https://exercism.org/tracks/python (free, mentored deliberate practice).

**Git resources:** **GitHub Skills** — https://skills.github.com/ (interactive, the workflow they'll actually use) · **"Pro Git" — Chacon & Straub** — https://git-scm.com/book/en/v2 (free, ch.1–3 conceptual backstop) · **Learn Git Branching** — https://learngitbranching.js.org/ (makes branching/merge/rebase *click*).

*Go is a deliberate **secondary**, deferred to Tier 2 tooling work — awareness only now via Tour of Go (https://go.dev/tour/) + Go by Example (https://gobyexample.com/), ~10 hrs read-only.*

**Sequence:** ATBS ch.1–6 → GitHub Skills "Intro to GitHub" + Learn Git Branching, version-control all practice code from day one → Python Crash Course (data structures, classes, files/exceptions, **testing**) → ATBS ch.7–12 (regex, files, Excel/CSV/PDF — directly evidence-applicable) → Exercism ~15–20 mentored exercises → Pro Git ch.1–3, practice branch→commit→PR.

**Time:** ~50–70 hrs over 6–8 weeks (largest module — this is the centerpiece).

**Artifact:** a Git-versioned Python tool on GitHub with a clean history and ≥1 merged feature-branch PR: reads a directory of raw evidence files, validates them against a control checklist, handles malformed input gracefully, writes a structured compliance report, and ships **`pytest` tests with meaningful assertions on real behavior** (not coverage padding — assertion-free "coverage" tests are explicitly disallowed).

### Module 6 — API fundamentals (Tier-1 capstone)

*Loop stages: LOCATE + QUERY + EVIDENCE. Where shell + Python + JSON converge into automated evidence collection from SaaS — the actual GRC day job.*

**Resources:** **Postman Academy "API Beginner" path** — https://academy.postman.com/path/api-beginner (industry-standard interactive; "API Fundamentals Student Expert" credential) · **MDN HTTP** — https://developer.mozilla.org/docs/Web/HTTP (authoritative neutral reference) · **Hoppscotch** — https://hoppscotch.io/ + **HTTPie** — https://httpie.io/ (zero-install client + human-friendly CLI tying back to Module 1) · **OAuth 2.0 Simplified — Aaron Parecki** — https://www.oauth.com/ (the clearest explanation of the most compliance-relevant API topic — auth *is* access control).

Anchor concepts: HTTP methods + status codes · JSON (back to `jq`) · auth ladder (API keys → bearer tokens → OAuth2 flows → least-privilege scopes) · pagination + rate limits (critical for *complete* evidence pulls) · webhooks (event-driven evidence) · reading vendor API docs unaided.

**Sequence:** Postman Academy API Beginner → MDN HTTP overview → Postman API Fundamentals Student Expert (auth, variables, chaining) → OAuth 2.0 Simplified (auth-code + client-credentials flows) → HTTPie/curl + `jq` against a real public API (auth, paginate, parse) → read one real SaaS vendor's API docs cold and make authenticated calls.

**Time:** ~25–35 hrs over 3–4 weeks.

**Artifact (Tier-1 keystone):** a Git-versioned Python script that authenticates to a real SaaS API via token/OAuth2, **paginates all results respecting rate limits**, extracts a defined evidence dataset (e.g., all users + MFA status, or all devices + encryption status), parses the JSON, and outputs an audit-ready report mapped to a control. This single deliverable proves the entire foundational tier hangs together.

**Tier-1 total:** ≈180–250 focused hours, ~12–16 weeks part-time. Output is a portfolio of compliance-evidence artifacts.

---

## Part III — Tier 2: Engineering

*Loop stages: QUERY at scale, EVALUATE as code. Goal: pull control-truth from cloud/SQL at scale and enforce policy as code in CI.*

### Module 7 — Data & cloud control plane (SQL + IAM + audit logs)

*The intermediate hinge: most control-truth at scale lives in cloud APIs, audit logs, and queryable data.*

- **SQL:** SQLBolt (https://sqlbolt.com/, free interactive) → Mode SQL Tutorial (https://mode.com/sql-tutorial/) → Select Star SQL (https://selectstarsql.com/). ~15 hrs. *Why:* evidence and risk reporting are SQL queries.
- **Cloud IAM & audit (AWS as worked example; GCP/Azure as parallels):** AWS Skill Builder IAM + CloudTrail + **AWS Config** + **Security Hub**; **AWS Cloud Quest / Well-Architected Security pillar**. Parallels: **Azure Policy** + Microsoft Purview; **GCP Security Command Center**. Free tiers + the org's own cloud sandbox.
- **The portable mental model (teach this, not one vendor):** identity boundary → resource policy → audit log → posture service. Every cloud has all four; the names differ.

**Time:** ~35–45 hrs. **Artifact:** a script that queries cloud audit logs + posture service (AWS Config/Security Hub or equivalent) and emits a continuously-reproducible evidence report for one access-control and one encryption control, plus a SQL query that produces a risk metric from an evidence table.

### Module 8 — Infrastructure as Code + scanning in CI

*Loop stage: EVALUATE. Controls move left into the pipeline.*

- **Terraform:** HashiCorp Learn (https://developer.hashicorp.com/terraform/tutorials) + "Terraform: Up & Running" (Brikman). CloudFormation awareness for AWS shops.
- **IaC/cloud scanners (all repos verified live):** **Checkov** — https://github.com/bridgecrewio/checkov (IaC SAST) · **Trivy** — https://github.com/aquasecurity/trivy (containers/IaC/code/SBOM/secrets) · **Prowler** — https://github.com/prowler-cloud/prowler (cloud compliance, 40+ frameworks) · Grype+Syft, Semgrep for completeness.
- CI: wire Checkov+Trivy+Prowler into GitHub Actions so a violation **fails the build**.

**Time:** ~30–40 hrs. **Artifact:** a repo where a deliberately non-compliant Terraform change is **blocked by CI**, with the scanner finding mapped to the control it enforces and the pass result emitted as evidence.

### Module 9 — Policy as Code

*Loop stage: EVALUATE — the deepest "compliance as code" skill. Teaching order is deliberate.*

- **Cedar first** — https://www.cedarpolicy.com/ — gentler syntax, formally verifiable, ~40–60× faster than Rego. Best *first* PaC language so learners build intuition before fighting syntax.
- **OPA / Rego** — https://github.com/open-policy-agent/opa (+ Gatekeeper for K8s) — the industry default; learners must know it even though it's hard.
- **Kyverno** — https://github.com/kyverno/kyverno — K8s-native YAML, no new language; the pragmatic option.
- **Cloud Custodian** — https://github.com/cloud-custodian/cloud-custodian — multi-cloud rules-as-YAML.

**Read the backlash here, not later** (see §VI): assign grcengineer.com's *"Why the Policy-as-Code revolution didn't happen"* and *"Compliance-as-Cope."* Teach **when *not* to PaC** and assign explicit ownership against policy-rot.

**Time:** ~30–40 hrs. **Artifact:** one real control expressed as policy in Cedar **and** Rego, enforced in a CI gate, auto-emitting a pass/fail evidence record — with a one-paragraph written justification of whether PaC was the right tool for *this* control.

### Module 10 — The standards spine

*Runs alongside Modules 7–9, ~10 hrs. The conceptual model that makes everything crosswalk.*

Teach **NIST SP 800-53 Rev 5 as the superset/spine** (20 control families). Then **SOC 2 (TSC)**, **ISO/IEC 27001+27002**, **NIST CSF 2.0**, **CIS Controls v8 / Benchmarks**, **FedRAMP / PCI-DSS v4 / HIPAA / GDPR** as profiles/subsets that **crosswalk into the 800-53 spine**. Deliverable: one shared crosswalk table the team owns (later machine-converted to OSCAL in Tier 3).

### Module 11 — Threat-informed GRC + systems/design thinking (operationalized)

*Principles 4 & 5 of the manifesto, made concrete — not just cited.*

- **Threat-informed:** MITRE ATT&CK Navigator + MITRE Engenuity — map our top 5 threats to the controls that actually mitigate them; **kill or downgrade controls that mitigate nothing.**
- **Systems + design thinking:** one structured exercise — interview a control's *stakeholders as customers*, map the system that produces the control's truth, redesign the control's UX so the evidence is a by-product of doing the work, not extra work.

**Time:** ~15 hrs. **Artifact:** a threat→control coverage map for our environment with at least one control recommended for removal (evidence-based), and one redesigned stakeholder-facing control flow.

---

## Part IV — Tier 3: GRC-as-Code

*Loop stages: EVALUATE, EVIDENCE, MONITOR. Goal: express controls in machine-readable form, auto-collect evidence, run continuous controls monitoring.*

### Module 12 — OSCAL & compliance-as-code

- **OSCAL (NIST):** https://github.com/usnistgov/OSCAL + https://pages.nist.gov/OSCAL/ — the machine-readable layer tying controls/SSPs/SAPs/POA&Ms together. *(Monitor: a FedRAMP OSCAL mandate is approaching ~Sept 2026 — track it.)*
- **Trestle:** **`oscal-compass/compliance-trestle`** — https://github.com/oscal-compass/compliance-trestle. ⚠️ **Do not use the old `usnistgov/trestle` — that repo is dead.**
- **Compliance-to-Policy (C2P):** https://github.com/oscal-compass/compliance-to-policy — bridges OSCAL ↔ policy-as-code (closes Module 9 → Module 12).
- **Comply (strongDM):** https://github.com/strongdm/comply · **OpenControl / Compliance Masonry:** https://github.com/opencontrol/compliance-masonry.
- ⚠️ **`GSA/fedramp-automation`** — https://github.com/GSA/fedramp-automation — **archived read-only since 2025-07-01**; templates still authoritative, cite with the archive caveat.

**Time:** ~25–35 hrs. **Artifact:** the Module-10 crosswalk converted into a valid OSCAL catalog/profile via `oscal-compass/compliance-trestle`, with one control's implementation expressed in OSCAL and linked to its Module-9 policy via C2P.

### Module 13 — Continuous Controls Monitoring (CCM)

*Loop stage: MONITOR — the difference between "we passed an audit" and "we are continuously compliant."*

Teach CCM as a **practice**, vendor-neutral: the concrete loop **control → automated check → evidence emission → SQL/BI dashboard → drift alert**. Survey tooling honestly: cloud-native (AWS Config rules + Security Hub), open-source orchestration, and commercial CCM (RegScale and the compliance-automation platforms) — treat vendor "category leader / 300% growth" claims as PR; CCM as a discipline is the durable skill.

**Open-source lab platforms (stand these up locally — the best hands-on Tier-3 environment):** **CISO Assistant** — https://github.com/intuitem/ciso-assistant-community (30+ pre-mapped frameworks) · **GovReady-Q** — https://github.com/GovReady/govready-q · **OpenGRC** (LeeMangold/OpenGRC) · **Eramba** · plus **GRC Playground** (Ashley Pearce) and **GRC Portfolio Labs** (AJ Yawn) on GitHub.

**Time:** ~25–35 hrs. **Artifact:** a working CCM loop for one real control — automated check on a schedule, evidence written to a versioned store, a dashboard tile showing current state + 30-day history, and an alert that fires on induced drift.

---

## Part V — Tier 4: GRC-as-Product (capstone)

*Loop stage: OWN — the whole loop, run like a product. This is what separates a GRC engineer from someone who can script.*

### Module 14 — Product thinking, ownership & build-vs-buy

- **Product thinking for GRC:** a control has *customers* (engineers, auditors, the business), a *backlog*, a *UX*, an *owner*, and *metrics*. Reading: *"GRC as a product"* (manifesto principle 3) + Marty Cagan *Inspired* (selected chapters) + the Cloud Security Guy "GRC Engineering Masterclass" (cloudsecurityguy.substack.com).
- **Risk quantification (so outcomes are measurable, not checkbox):** *How to Measure Anything in Cybersecurity Risk* — Hubbard & Seiersen; *Measuring and Managing Information Risk: A FAIR Approach* — Jones & Freund; "From Heatmaps to Histograms" — Tony Martin-Vegue.
- **Build-vs-buy (Vanta team note — do this honestly):** structured evaluation of the continuous-compliance platform market — **Vanta, Drata, Secureframe, RegScale** — against the loop: which stages do you build, which do you buy, where does owning the policy/evidence library beat a vendor abstraction? A Vanta team is uniquely positioned to reason about this from the inside; the exercise is to be rigorous, not promotional.

**Time:** ~20–30 hrs. **Artifact:** a build-vs-buy decision memo for one control area, scored against the 7-stage loop, with an explicit owned-vs-vendor boundary and risk-quantified justification.

### Module 15 — Capstone: ship one control, fully engineered

Each engineer takes **one real Vanta control** and ships it end-to-end:

1. **Designed-left** — the control is defined where the work happens, not bolted on after.
2. **Threat-informed** — mapped to a real threat it actually mitigates (Module 11).
3. **Policy-as-code enforced** — a CI gate blocks violations (Modules 8–9).
4. **Evidence auto-collected** — versioned, audit-ready, zero manual toil (Modules 5–6, 12).
5. **Continuously monitored** — CCM loop with drift alerting (Module 13).
6. **OSCAL-expressed** — machine-readable, crosswalked to the standards spine (Modules 10, 12).
7. **Owned as a product** — README with customers, backlog, owner, metrics, UX rationale (Module 14).
8. **Before/after** — paired with the week-0 legacy-vs-engineered analysis of the *same* control. The delta is the proof the program worked.

Capstones are demoed to the team and the best are **promoted into a shared, owned, reusable internal policy/evidence library** — the program's compounding asset.

---

## Part VI — Track map, rollout, rituals, and the honest tensions

### Role-differentiated track map

Not everyone needs every module at the same depth. Three tracks share Tier 1 (placement-gated) and Part I, then specialize, then reconverge at the Tier-4 capstone:

| Track | For | Deep on | Awareness-only on |
|---|---|---|---|
| **Endpoint-Evidence** | endpoint/IT-compliance-focused | Modules 3 **or** 4 (by fleet), 5, 6, 13 | 8, 9 |
| **Cloud-Controls** | cloud/infra-compliance-focused | Modules 6, 7, 8, 9, 13 | 3/4 |
| **GRC-Platform** | controls-architecture/program-focused | Modules 9, 10, 12, 13, 14 | low-level OS internals |

**macOS vs Windows is fleet-split:** each person goes deep on the org's dominant platform and takes the other at awareness level only. Nobody does both deeply unless their role demands it.

### Phased team rollout (≈2–3 quarters, part-time)

| Phase | Weeks | Content | Exit criteria (gate to next phase) |
|---|---|---|---|
| **0 — Mindset** | 1 | Part I (everyone) + placement tests | Every person has a week-0 legacy-vs-engineered analysis of one real control; placement assigned |
| **1 — Foundations** | 2–14 | Tier 1 (placement-skipped per person) | Tier-1 keystone API artifact produced; portfolio repo exists |
| **2 — Engineering** | 15–22 | Tier 2 (by track) | CI gate blocking a non-compliant change, with evidence emitted |
| **3 — GRC-as-Code** | 23–30 | Tier 3 | A working CCM loop with drift alerting on one real control |
| **4 — Product + Capstone** | 31–38 | Tier 4 | Capstone demoed; ≥1 artifact promoted to the shared library |

Run as cohorts, not solo — pair learners, weekly sync, shared repo from week 1.

### Ongoing rituals (start week 1, never stop)

- **Weekly:** 30-min "newsletter + one tool" — someone presents that week's GRC Engineer newsletter item and demos one tool live.
- **Monthly:** a MacAdmin Monthly / GRC Engineer podcast watch-along.
- **Quarterly:** ladder review — re-place everyone, retire mastered modules, add new ones as the field moves (the grc.engineering official career ladder page is still TBD — we maintain ours).
- **Always:** the **owned reusable policy/evidence library** grows every capstone. Assigned owners per policy = the explicit counter-loop against policy-rot. This is the program's compounding return.

### The honest tensions (teach these — do not hide them)

A curriculum that pretends GRC Engineering is frictionless is propaganda. Bake these in:

1. **The policy-as-code backlash is real.** grcengineer.com's own *"Why the Policy-as-Code revolution didn't happen"* and *"Compliance-as-Cope"* report that Rego is widely seen as hard, policies rot when unowned, and teams too often automated *evidence* instead of *risk decisions*. Module 9 teaches *when not to PaC* and assigns ownership; this is doctrine, not an aside.
2. **"You still work in GRC."** The movement insists this is a mindset, not a stack, and not a new job title — Python/cloud are *"nice to have, not required."* This curriculum is therefore explicitly **not** "learn this stack to become a GRC Engineer." The stack is instrumentation for the loop; the loop is the point. If a learner finishes able to run the loop with *fewer* tools, that is success, not failure.
3. **Certifications are de-emphasized — on purpose.** No certification *is* GRC Engineering. They are sequenced **after** hands-on capability and treated as governance fluency, not proof of engineering skill:

| When | Cert | Role |
|---|---|---|
| Entry (optional) | Security+, ISO 27001 Lead Implementer | vocabulary |
| After Tier 1–2 | OCEG **GRCP** | governance fluency |
| After Tier 3 | **CISA / CRISC / CISM** | audit/risk depth |
| Advanced (optional) | **CISSP** | breadth signal |

The movement de-emphasizes credentials; we honor that — capability portfolio first, paper second.

### Master resource appendix (consolidated, all verified live)

Books: *GRC Engineering for AWS* — AJ Yawn (https://ajyawn.gumroad.com/l/grcengineeringbook) · *How to Measure Anything in Cybersecurity Risk* — Hubbard & Seiersen · *Measuring and Managing Information Risk (FAIR)* — Jones & Freund · *Inspired* — Cagan · the Tier-1 books above. **Newsletters/podcasts:** GRC Engineer (grcengineer.com), blog.grc.engineering, Cloud Security Guy (cloudsecurityguy.substack.com), Resilient Cyber. **Courses:** LinkedIn Learning — *GRC for the Cloud-Native Revolution* (Fandi), *Cybersecurity Foundations: GRC* (AJ Yawn), *Leveraging AI for GRC* (Cooke). **Hubs/labs:** grc.engineering Learning Hub · awesome-grc-engineering · GRC Playground · GRC Portfolio Labs · CISO Assistant · GovReady-Q. Every link in this document was verified live at authoring; dead/archived repos are flagged inline (`usnistgov/trestle` = dead → use `oscal-compass/compliance-trestle`; `GSA/fedramp-automation` = archived read-only 2025-07-01).

---

*Curriculum spine = the irreducible loop, not the stack. Tools serve the loop. The team learns to think like GRC engineers; the stack falls out of it.*
