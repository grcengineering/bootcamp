# Module 20 — Whose Control Is It? Reading the Responsibility Boundary

*Loop stages: UNDERSTAND · LOCATE · OWN. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. A control is a claim about a system — and in the cloud the first question is not "is it true?" but "who is even able to make it true?" This is the module where LOCATE stops meaning "find the byte" and starts meaning "find the party": you, or the provider. Get that wrong and every downstream finding is aimed at the wrong door.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, the shared responsibility model as the split between *security OF the cloud* (the provider's — the physical substrate it runs) and *security IN the cloud* (yours — the data you put there and who reaches it), and why that split decides who can produce a control's evidence at all.
2. **Map** a control claim to the party structurally capable of producing its truth — you or the provider — and watch that boundary move as the service model shifts from IaaS to PaaS to SaaS, with the customer surface shrinking as the provider's managed surface grows.
3. **Place** a cloud action on the *control plane* (the management API — creating an IAM role, editing a security group, rotating a key) versus the *data plane* (the workload's live request traffic and the bytes it moves), and say why they are structurally different objects with different owners and different evidence.
4. **Locate**, for the claim "encrypted at rest," who owns the evidence under IaaS versus SaaS — you *produce* it when you hold the storage setting and the key, you *inherit* it through a complementary user-entity control (CUEC) when the provider operates the store.
5. **Diagnose** a misattributed control: a claim a SaaS customer says they *enforce* that the provider actually owns, and rewrite it so the ownership and the evidence line up.
6. **Produce** an ownership note that states, per control, who is responsible and what evidence that party produces — splitting a two-part claim across the two parties and mapping each half to its NIST 800-53 control family.

Each objective is checked by the Assessment in §7. If you can already produce the §7 ownership note and catch the misattribution trap unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

In the on-premises world there was exactly one party who could answer any control question, because you owned the whole stack — the building, the disks, the network, the code. Move that workload to the cloud and the stack splits in two, along a line you do not get to draw. The provider now owns the floor below some height, and you own everything above it — but *where* that line sits depends entirely on which service model you bought. Buy raw compute (IaaS) and the line is low: almost everything is yours. Buy a finished application (SaaS) and the line is high: almost everything is theirs. The single most expensive mistake in cloud GRC is asserting a control on the wrong side of that line — claiming you enforce something the provider actually owns, or assuming the provider handles something that was always yours.

This is the module where **UNDERSTAND** is the realization that "the cloud is just someone else's computer" is precisely the point: it is *someone else's*, so for any control claim you must first ask who is even capable of touching the thing the control is about. Where **LOCATE** stops being "find the field" and becomes "find the party" — because you cannot produce evidence for a control you do not operate; at best you can inherit the provider's attestation. And where **OWN** is the deliverable: a per-control ownership note that says, in writing, who is responsible and what evidence each party produces, so an auditor never asks you for a screenshot of a disk you cannot see.

The discipline this builds is the cloud version of the GRC mindset: the boundary is a movable line, evidence can only be produced by the party on the right side of it, and the gap between "we enforce this" and "we inherit this" is your finding.

---

## 3. The Mental Model

Picture a self-storage facility. The company owns the building, the gates, the cameras, the fire suppression, the slab the units sit on — that is *their* security: of the facility. What you put in your unit, and who you hand a key to, is *your* security: in the unit. Nobody at the front desk knows or cares what is in your boxes, and you cannot rewire the building's fire alarm. Now imagine three rental tiers. In the cheapest, you get a bare concrete bay and bring your own shelving, your own lock, your own inventory system — almost everything is on you. In the most expensive, the company provides a fully managed, climate-controlled, inventoried, staffed unit and just hands you a receipt — almost everything is on them. The *building* security never changed hands; what moved is everything *inside*, tier by tier.

That is the **shared responsibility model**, and the two halves have names worth keeping straight. **Security OF the cloud** is the provider's: the data centers, the hardware, the host hypervisor, the physical and environmental controls. You will never produce evidence for those — you inherit the provider's audit report. **Security IN the cloud** is yours: your data, your identities, the access you grant, the configuration you set. No service model ever takes those off your plate, because the provider does not know what your data is or who should read it. Between those two poles sits a band of controls that *migrate*: who patches the operating system, who ships the application code, who configures the firewall, who turns on encryption at rest. As you move from IaaS toward SaaS, the provider absorbs more of that band, and your surface shrinks.

The migration is the whole lesson, and one card carries it best: **encryption at rest**. Under IaaS, *you* enable it, *you* choose and hold the key, *you* produce the evidence. Under SaaS, the *provider* operates the store, attests the encryption in their SOC 2 report, and you no longer touch it — you *inherit* the control through a **complementary user-entity control (CUEC)**, the line in their report that says "the customer is responsible for X; we are responsible for Y." Same claim, two different owners, two completely different ways to evidence it. Read the boundary and you know which auditor question you can even answer.

There is a second line that has nothing to do with the service model, and conflating it with the first is a common error: the split between the **control plane** and the **data plane**. The control plane is the management API — the place you *change* things: create an IAM role, edit a security group, rotate a key. The data plane is where the workload actually *runs*: the request traffic hitting your service, the objects being read and written. A firewall-rule change is a control-plane action; the traffic that rule then filters is data-plane. They produce different evidence, and an auditor who asks the data plane to prove a control-plane action is looking in the wrong place. Audit logging is the one control that lives in *both* planes at once — management events and data-access events are both evidence.

Nothing in this module is read off a wire, because the responsibility model is not a wire — it is a published contract. What is real is the *cited matrix*: the AWS Shared Responsibility Model, the CSA questionnaire, the NIST control families. Every placement you make is scored against that cited matrix, and a wrong placement names itself without revealing the answer. The matrix is the answer key, and it is someone's published, auditable commitment — not our invention.

---

## 4. Concepts

### 4.1 Security OF the cloud vs security IN the cloud

The model has exactly two halves, and the first thing to do with any control claim is decide which half it falls in. **Security OF the cloud** is everything the provider runs so that the cloud can exist: the regions, the data centers, the hardware, the host hypervisor, the physical and environmental controls. You have no way to produce evidence for these — you read the provider's third-party audit report and inherit it. **Security IN the cloud** is everything you do with what the cloud gives you: your data, your identities and access grants, your configuration, your code. No provider can own these for you, because the provider does not know what your data is or who is allowed to see it. Get a claim onto the right half and you know, before anything else, whether the evidence is yours to produce or theirs to attest.

### 4.2 The boundary is a movable line: IaaS → PaaS → SaaS

Between the two fixed poles sits a band of controls whose owner depends on the service model. Under **IaaS** (raw compute) your surface is widest: the provider abstracts only the physical and the hypervisor, and you own the guest OS, the patching, the application code, the network configuration, and the encryption settings. Under **PaaS** the provider absorbs the OS and the runtime, so OS patching becomes theirs while your code and configuration stay yours. Under **SaaS** the provider operates the entire application, and the only things left on your side are your data and the access you grant. The same control card slides from YOU to PROVIDER as you move up the stack — the customer surface shrinks while the provider's managed surface grows. The boundary is not fixed; it is a function of what you bought.

### 4.3 Control plane vs data plane: a different line entirely

There is a second division that is *not* about the service model, and conflating it with the responsibility boundary is a frequent error. The **control plane** is the management API — the surface where configuration is *changed*: creating an IAM role, editing a security-group rule, rotating an encryption key. The **data plane** is where the workload *runs*: the request traffic hitting your service, the objects an application reads and writes. A firewall-rule edit is a control-plane action; the packets that rule then permits or drops are data-plane. They are structurally different objects with different owners, different telemetry, and different audit evidence — and an auditor who asks the data plane to prove a control-plane change is asking the wrong system. **Audit logging** is the exception that proves the rule: it spans both planes, because management-API actions and data-access events are *both* evidence (think management events plus data events in one audit trail).

### 4.4 "Encrypted at rest" is the card that migrates

The two-part auditor classic — "is data encrypted at rest and in transit?" — has an at-rest half whose owner depends entirely on the service model, and it is the clearest demonstration of the movable line. Under **IaaS**, you enable storage encryption, you choose and custody the key, and you produce the evidence directly (the setting plus the key reference; SC-12/SC-28). Under **SaaS**, the provider operates the store, encrypts it as part of their service, and attests it in their SOC 2 report; you do not touch the disk and cannot screenshot the setting — you *inherit* the control. Same claim, opposite owners. Reading where the at-rest card sits for *your* service model tells you whether "show me the encryption" is a request you fulfill or one you forward to the provider's attestation.

### 4.5 Inherited controls and the CUEC: how you evidence what you don't operate

When the provider owns a control, you do not get to ignore it — you *inherit* it, and inheritance has a precise mechanism. A provider's SOC 2 (or equivalent) report lists **complementary user-entity controls (CUECs)**: the explicit statement of what the customer must do for the provider's controls to actually protect them. The provider's report says "we encrypt customer data at rest"; the CUEC says "the customer is responsible for classifying their data and managing who has access." Your evidence for the inherited half is not a disk screenshot — it is the provider's report plus your own evidence for the CUEC you were handed. This is why a claim must split: the provider attests their half, you evidence yours, and the note names both.

### 4.6 The misattribution trap

The single most common cloud finding is a control asserted on the wrong side of the line. A SaaS customer writes "we enforce encryption at rest" — but under SaaS they operate nothing; the provider enforces it and the customer inherits it. The claim is not *false*, exactly — the data probably is encrypted — but it is *misattributed*: it claims an enforcement the customer cannot perform and cannot evidence. The fix is not to delete the claim; it is to rewrite it so ownership and evidence align: "the provider enforces encryption at rest and attests it in their SOC 2; we inherit this control via the CUEC and are responsible for classifying our data and governing access." Misattribution is a wording bug with audit consequences, and catching it is exactly the skill the assessment tests.

### 4.7 An ownership note is the deliverable, and the boundary is the map

Pull the threads together. For any cloud control claim: first decide the half (OF vs IN). If it is in the migrating band, read the boundary for *your* service model. If the provider owns it, find the CUEC and evidence your half. Split any two-part claim across the two parties, and write, per control, who is responsible and what evidence that party produces. That note *is* the OWN-stage artifact — the cloud analogue of the wire evidence finding: an owner makes a claim, the responsibility boundary says who can prove it, and the gap between "we enforce" and "we inherit" is your finding. This is also the bridge to everything downstream: a continuous-monitoring control, an inherited-controls register, a vendor-risk assessment are all just this same boundary, read on a schedule.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using the cited shared-responsibility matrix (AWS Shared Responsibility Model + CSA CAIQ + NIST 800-53) as the key. No value here is invented — each placement is the published model's, re-derived per service model. (Worked examples are Tier-C content — reviewed when a provider's matrix or a service-model boundary shifts.)

### 5.1 UNDERSTAND + LOCATE: place the anchors, then watch the band move

Start with the two cards that never move. *Physical facilities, hardware, and the host hypervisor* → **PROVIDER** at every model (security OF the cloud). *Customer data: what it is and who may read it* → **YOU** at every model (security IN the cloud). Now the migrating band, read at IaaS: guest-OS patching, application code, network/firewall configuration, and encryption at rest are all **YOU**, because IaaS hands you bare compute. Move the slider to SaaS and the same four cards slide to **PROVIDER** — except the encryption-at-rest card, which is the one to watch: it does not just "become the provider's," it becomes a control you *inherit via a CUEC*. The card moved; the way you evidence it changed with it.

### 5.2 LOCATE: control plane vs data plane

Sort six cloud actions onto the right plane. *Creating an IAM role / changing a resource policy*, *editing a security-group rule*, and *rotating a KMS key* are **control-plane** — they are management-API changes (AC-3, CM-7, SC-12 administration). *An application reading/writing objects in a bucket* and *user request traffic hitting the workload* are **data-plane** — the live traffic and bytes (NIST 800-204). *Audit logging that evidences both planes* is the THROUGHOUT card: it belongs in **both** zones, because a complete audit trail captures management events and data-access events alike. Conflating the planes is how a logging claim quietly covers only half of what it must prove.

### 5.3 DIAGNOSE: the misattributed claim

A SaaS HR platform's control register reads: *"We enforce encryption of employee data at rest (SC-28)."* Read the boundary for SaaS: the customer operates none of the storage; the provider enforces and attests at-rest encryption. The claim is misattributed — it asserts an enforcement the customer cannot perform. The corrected wording: *"Our SaaS HR provider enforces encryption at rest and attests it in their SOC 2 Type II report (SC-28). We inherit this control via the CUEC and are responsible for classifying employee data and governing who may access it (AC-2/AC-3)."* The data did not change; the ownership and the evidence now line up.

### 5.4 OWN: the per-control ownership note

The deliverable for the two-part claim "employee data is encrypted at rest" under SaaS: **At rest** → provider responsible (SC-28); evidence = the provider's SOC 2 Type II report covering storage encryption. **The CUEC you inherit** → you responsible (AC-2/AC-3); evidence = your data-classification policy and your access-grant records. The note names both parties, both evidence sources, and the framework family for each half — and anyone can check it against the provider's published responsibility matrix. That is the OWN artifact: not a screenshot of a disk you cannot see, but a written statement of who proves what.

---

## 6. Guided Lab

> Original lab. ~30–45 minutes. Tier-C content (provider matrices and service-model boundaries drift). This lab runs entirely in your browser on the bootcamp site (Module 20 → Interactive lab) — no install, no cloud account needed.

**Scenario.** You are handed the cited shared-responsibility matrix and asked to read, for a stated service model, who owns each control — then to move the service-model slider and watch the boundary migrate, ending on the misattribution trap that breaks "encrypted at rest" under SaaS.

> **Interactive lab.** The lab is the MAP surface: control cards you place on a YOU / PROVIDER board, a second board that sorts cloud actions onto the control plane vs the data plane, and an IaaS → PaaS → SaaS slider. As you move the slider, the cited matrix re-derives each card's correct side, so a model-dependent card visibly migrates across the boundary while the invariant cards stay put. Every placement is scored against the cited matrix (AWS / CSA / NIST) — a wrong placement names the misplaced card without revealing the answer.

**Tasks (performed on the surface).**

1. With the slider on **IaaS**, place the two anchors: the physical/hardware/hypervisor card on **PROVIDER** (security OF the cloud) and the customer-data card on **YOU** (security IN the cloud). *(Objectives 1, 2)*
2. Still on IaaS, place the three operating cards — guest-OS patching, application code, network/firewall configuration — on **YOU**, since IaaS hands you the bare compute. Hold the encryption-at-rest card for the final task. *(Objective 2)*
3. On the plane board, sort the management-API actions (IAM role, security-group edit, KMS rotation) onto the **control plane** and the workload actions (object read/write, request traffic) onto the **data plane**. *(Objective 3)*
4. Place the THROUGHOUT card — audit logging — in **both** plane zones, because management events and data-access events are both evidence. *(Objective 3)*
5. Move the slider to **SaaS**. Watch the three operating cards light up as misplaced, re-place them on **PROVIDER**, and place the held encryption-at-rest card on **PROVIDER** too — the card you now *inherit via a CUEC* rather than produce. *(Objectives 4, 5)*
6. Write the ownership note for a SaaS HR platform's "encrypted at rest" claim, naming both parties, both evidence sources, the misattribution trap, and the NIST families. *(Objective 6)*

**Deliverable.** A short written ownership note: per control, who is responsible and what evidence that party produces — splitting the two-part claim across the two parties and naming the CUEC that corrects the misattribution.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a stated service model (a SaaS HR platform) and a list of control claims provided at assessment time, the learner must, unaided:

- **Map** each control claim to its responsible party — you or the provider — for the stated service model, verified against the cited shared-responsibility matrix (`mapping_correct`); and show the boundary shift by re-deriving the migrating cards at a second service model.
- **Place** each cloud action on the control plane or the data plane, including the audit-logging card that spans both, verified against the cited control-plane/data-plane key (`mapping_correct`).
- **Diagnose** the deliberately misattributed claim (the SaaS customer who says they *enforce* a control the provider owns) and produce an **ownership note**: per control, who is responsible and what evidence each party produces — for "encrypted at rest," that the provider attests and you inherit via a CUEC under SaaS, versus that you own and produce it under IaaS — mapping each half to its NIST 800-53 family.

Every placement is scored against the cited matrix (AWS Shared Responsibility Model / CSA CAIQ / NIST 800-53), not an authored answer key — a wrong placement names the misplaced card and routes the learner back to the specific concept section, not the whole module. A single misattribution caught wins the trap; a single one missed routes back to §4.6.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **AWS Shared Responsibility Model** — the canonical vendor statement of the OF/IN split and how it shifts across service models. https://aws.amazon.com/compliance/shared-responsibility-model/ — *use to see the published matrix this module's key is cited from, and to compare the IaaS-vs-SaaS boundary in the vendor's own words.*
- **Cloud Security Alliance — Shared Responsibility Model & Cloud Controls Matrix** — the vendor-neutral treatment, with the CAIQ shared-responsibility columns. https://cloudsecurityalliance.org/research/cloud-controls-matrix and https://cloudsecurityalliance.org/blog/2020/08/26/shared-responsibility-model-explained — *use for a provider-independent second voice on who owns what.*
- **NIST SP 800-145 (The NIST Definition of Cloud Computing)** — the authoritative IaaS / PaaS / SaaS service-model definitions behind §4.2. https://csrc.nist.gov/pubs/sp/800/145/final — *use as the reference when you want the precise, vendor-neutral definition of each service model.*
- **AICPA SOC 2 — Complementary User-Entity Controls (CUEC)** — the mechanism behind inherited controls in §4.5. https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2 — *use for a deeper treatment of how a customer evidences a control the provider operates.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
