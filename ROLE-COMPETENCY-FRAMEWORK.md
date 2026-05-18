# GRC Engineering — Role Competency Framework

*Original synthesis. UNIQUE per-role definitions of Jobs-to-be-Done → Responsibilities → Skills/Knowledge for the five GRC Engineering role types. Grounded in: the grc.engineering manifesto, the GitLab Security Assurance job-family handbook (the only public, durable, level-by-level real-world spec that splits into these same five specialties), real 2025–2026 postings (Anthropic, ID.me, Ro, GitLab, Vercel, FAIR Institute), and a strict-gated LinkedIn corpus harvested for this project.*

> **Method (Science framing):** the iteration-2 role definitions were *hypotheses*; the research + LinkedIn corpus were the *test*. Where reality refined a hypothesis it is noted inline. Definitions are written to be **role-distinct** — each is defined by *the object it engineers*, not by overlapping buzzwords.

---

## 0. What is common to all five (the shared base — do not re-teach per role)

Every real GRC-Engineering posting, across all five specialties, requires this baseline. It is the curriculum's foundational trunk, validated bottom-up by the corpus:

- **Mindset:** systems thinking + design thinking + the inversion thesis (start from running systems, let reality drive policy). Manifesto-core; non-negotiable in every posting.
- **≥2 control frameworks** (SOC 2 / ISO 27001 / NIST) — depth scales with seniority.
- **A scripting language** (Python dominant; Go/PowerShell acceptable) + **APIs + Git/CI-CD**.
- **Cloud fluency** (AWS/GCP/Azure: IAM, audit logs, posture).
- **A GRC/automation platform** (Vanta, Drata, ServiceNow GRC, LogicGate…).
- **GRC-as-Code orientation**: automate early, measurable outcomes over checkbox.
- **Exceptional written + stakeholder communication** (listed in *every* role).
- **Emerging universal (2025–2026):** AI governance + AI-assisted GRC (NIST AI RMF, ISO 42001, agentic evidence collection). Treat as a required thread, not an elective.

**Two hard caveats from the evidence:** (1) there is **no entry-level "GRC Engineer"** in the market — it is a set of practices layered on prior security/IT/GRC experience; teach the practices, gate the *titles* to mid/senior. (2) At sub-scale orgs the five roles **collapse into 1–2 people**; teach them as functions with explicit instruction on how they compress (this is what the Generalist track is for).

---

## 1. GRC Engineer — Generalist

**The object it engineers:** the whole control loop, end-to-end, across all four specialist domains — the connective tissue.

**Jobs-to-be-Done**
- Convert manual GRC toil into engineered systems so assurance is continuous, not point-in-time.
- Be the integration layer: make control/risk/evidence data flow across cloud, IdP, HRIS, ticketing, CI/CD.
- Translate between engineers, auditors, and leadership.

**Responsibilities** (from Anthropic "GRC Automation Lead", ID.me, Ro postings + corpus *Senior GRC Engineer*, *Security GRC Senior Lead*)
- Build data pipelines aggregating risk/control/asset data across the stack.
- Translate written policy into policy-as-code; own the GRC platform.
- Stand up continuous monitoring + automated evidence collection.
- Build & maintain shared GRC tooling/libraries; mentor specialists; build-vs-buy decisions.

**Skills/Knowledge (the spike beyond the base):** breadth across all four specialist spines + **integration/data-pipeline engineering** (schema mapping, ETL, normalization, dashboards). SQL + BI. Working depth in PaC, evidence automation, risk basics, framework crosswalks.

---

## 2. Governance Engineer

**The object it engineers:** the **policy & control architecture** — the organization's single, versioned, machine-readable source of truth for controls.

**Jobs-to-be-Done**
- Make the control framework *code*: adding/changing a framework is a reviewed diff, not a project.
- Keep policy, standards, and cross-framework crosswalks authoritative and current.
- Automate governance/exec/board reporting from the catalog.

**Responsibilities** (GitLab *Security Governance* specialty, verbatim-grounded + corpus *Security Governance, Risk, and Compliance Engineer*, *Principal Engineer (Governance, Risk, Compliance & Control)*)
- Own the control catalog as code; author/maintain policies & standards; controlled-document lifecycle.
- Build & maintain framework crosswalks; author OSCAL catalogs/profiles/SSPs.
- Lead "Governance-as-Code": policy → automated, enforceable workflows; AI-assisted policy compliance.
- Define governance metrics; automate the reporting.

**Skills/Knowledge (spike):** deep multi-framework architecture (NIST 800-53 as the spine; ISO 27001/27002, CSF, COBIT, ISO 42001 as crosswalking profiles) · **policy-as-code** (Cedar/OPA-Rego/Kyverno) · **OSCAL + Trestle** (`oscal-compass/compliance-trestle`) · data modeling for control catalogs · exceptional **technical writing**.

---

## 3. Risk Engineer (first-party + third-party)

**The object it engineers:** the **risk models and the risk/vendor data pipeline** — risk made quantified, current, and decision-grade.

**Jobs-to-be-Done**
- Replace qualitative heatmaps with quantified, continuously-updated, $-denominated risk.
- Make third-party/vendor risk a continuous monitoring *pipeline*, not an annual questionnaire.
- Produce decision-support for remediation arbitration (not audit evidence).

**Responsibilities** (GitLab *Security Risk* specialty + FAIR Institute hiring guidance + corpus *Cyber Risk Specialist – Risk & Resilience*, *Information Security Risk Oversight Lead*, *Senior Technical Risk & Compliance Engineer*)
- Build/maintain quantitative risk models (FAIR, Monte Carlo); risk register as code.
- Control-effectiveness telemetry feeding loss models; KRI dashboards; treatment plans.
- **Third-party:** vendor inventory automation, continuous vendor monitoring, automated questionnaire intake/scoring, SBOM/supply-chain, concentration risk.

**Skills/Knowledge (spike):** **FAIR** + quantitative methods (probability, loss-exposure modeling, *How to Measure Anything in Cyber Risk*) · ISO 31000 / NIST 800-39 · Python data analysis + statistics/visualization · vendor-data API ingestion + pipelines · supply-chain/SBOM. **Explicitly distinct from Compliance** — Fandi's warning: do not make risk a compliance control.

---

## 4. Compliance Engineer

**The object it engineers:** **evidence & audit-readiness** — proof that controls operate, produced automatically and continuously.

**Jobs-to-be-Done**
- Make the org continuously audit-ready with zero manual evidence collection.
- Detect control gaps before auditors do; turn audits into exports, not fire drills.

**Responsibilities** (GitLab *Security Compliance* specialty + Vercel/SOC2 postings + corpus *Security Compliance Engineer*, *Senior Security Compliance Engineer (Americas)*, *Staff Security and Compliance Engineer, Federal*)
- Control design + operating-effectiveness testing; remediation to deadline.
- Evidence-as-code pipelines; continuous controls monitoring (control→check→evidence→drift alert).
- Embed compliance checks into CI/CD and IaC; automated framework-mapping execution; auditor-ready exports.

**Skills/Knowledge (spike):** deep certification frameworks (SOC 2, ISO 2700x, FedRAMP, PCI-DSS, HIPAA, C5) · **evidence-as-code** + CCM design · API evidence collection at scale · cloud audit logs · IaC scanning (Checkov/Trivy/Prowler) · OSCAL · data-integrity/retention.

---

## 5. Customer Trust & Assurance Engineer

**The object it engineers:** the **customer-facing trust surface** — the security program externalized for revenue. (The manifesto's "stakeholder-as-customer" value made literal; Ayoub Fandi's own title family — "Security Assurance Automation".)

**Jobs-to-be-Done**
- Make security posture self-serve and instantly verifiable for prospects/auditors.
- Take security questionnaires/audits off the deal critical-path; position the company as a security leader.

**Responsibilities** (GitLab *Field Security / Customer Assurance* specialty + corpus *Staff Security Assurance Engineer*, *Zero Trust Compliance Officer (Info Assurance)*)
- Run/automate the Trust Center + Customer Assurance Package + self-service resources.
- Security-questionnaire/RFP automation (answer engine over a maintained response DB).
- Customer-audit support tooling; gated attestation/report distribution; contractual/SLA evidence; sales enablement.

**Skills/Knowledge (spike):** questionnaire automation (SIG/CAIQ; Conveyor/Whistic/SafeBase trust centers) · response-DB / RAG tooling · CRM + procurement-portal integration · **outward technical communication** (translate the internal control story into trust-building artifacts) · access-control & data-privacy for shared evidence · sales-cycle fluency.

---

## 6. Reverse-engineering map (skills → coursework)

Each role's **spike skills** become its Role Spine; the **common base** is the shared Foundational trunk. Strands emerge empirically from the skill clusters above (resolving the earlier strand-count question bottom-up):

| Competency strand (from the skills) | Generalist | Governance | Risk | Compliance | Trust & Assurance |
|---|:--:|:--:|:--:|:--:|:--:|
| Foundational base (mindset + CLI/Linux/prog/API/cloud) | D | D | D | D | D |
| Policy-as-Code & control architecture | W | **D** | W | W | A |
| Frameworks & standards (NIST spine + crosswalks) | W | **D** | W | D | W |
| OSCAL / compliance-as-code | W | **D** | A | D | W |
| Quantitative + third-party risk (FAIR) | W | A | **D** | W | A |
| Evidence-as-code & continuous controls monitoring | D | W | W | **D** | D |
| Customer trust surface / questionnaire automation | A | A | A | W | **D** |
| Integration/data-pipeline engineering | **D** | W | D | D | W |

D = Deep/author · W = Working/operate · A = Awareness/converse

---

## 7. Honest provenance & limits

- **Strongest evidence:** the GitLab Security-Assurance job-family handbook (public, level-by-level, splits into these exact five) + named real 2025–2026 postings + the manifesto.
- **LinkedIn corpus (118 posts, JD-gated, local-only):** real-world title/JD texture that **corroborated** — did not change — the role split. The harvest was *not* exhaustive and stopped at a hard structural wall: LinkedIn's job-view SPA ceased exposing JD bodies to read-only automation mid-harvest (every read primitive — `read`/`text`/`find`/screenshot — returns chrome only; empirically confirmed, not asserted). Per-role corpus depth is therefore uneven: Generalist/GRC-Engineer ~68 · Risk, 1st+3rd-party ~30 · Compliance ~10 · Governance ~6 · Customer Trust & Assurance ~0 (114 query-tagged + 4 untagged early generalist runs). **Honest read: Generalist and Risk are corpus-validated; Compliance moderately so; Governance is thin and Customer Trust & Assurance has no corpus depth — those last two rest entirely on the GitLab handbook + named 2025–2026 postings, not the corpus.** The research, not the corpus, is the load-bearing source.
- **Designed, not lifted:** the *engineering* specialization taxonomy is synthesized and manifesto-aligned. grc.engineering's official career ladder is still TBD; the market still mostly uses analyst/officer titles. Treat this framework as a deliberate design, validated against reality, not a transcribed standard.
- This document is original analysis (no raw scraped postings); the raw corpus stays local-only/gitignored.
