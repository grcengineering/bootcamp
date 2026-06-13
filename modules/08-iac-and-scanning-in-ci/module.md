# Module 08 — Infrastructure as Code & Scanning in CI

*Original content. Tier 2 of the curriculum. Loop stage: **EVALUATE**. Conforms to the standard module anatomy. This module takes the control check you learned to run by hand and moves it **left** — into the pipeline that builds infrastructure — so a violation is caught and blocked before anything is ever created.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a colleague who has never written Terraform, what "infrastructure as code" actually is and why declaring infrastructure in a text file changes a control from a thing you *inspect after the fact* into a thing you can *check before it exists*.
2. **Describe** how a scanner reads that infrastructure code, decides a resource violates a rule, and reports each violation with a severity and a stable rule identifier.
3. **Map** a scanner finding to the specific control it enforces, so a raw rule ID like `CKV_AWS_19` becomes a named, owned control ("encryption at rest, SC-28") that an auditor recognises.
4. **Compose** a CI gate that consumes a scan result, applies a severity floor, and **fails the build** exactly when a violating change would otherwise merge — turning the scanner's opinion into a non-negotiable decision.
5. **Diagnose** a blocked build from the gate's output: which finding blocked it, which control that finding maps to, and what the author must change in the code to clear the block.
6. **Produce** a single re-runnable evidence record from a passing gate that states, in machine- and auditor-readable form, which controls were evaluated and that they passed — the proof that the control was enforced, not merely intended.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Module 01 taught you to ask a live system a question and keep the answer as evidence. That is the **EVALUATE** loop stage performed *after* the system exists — you find the misconfigured bucket once it is already public. This module performs the same evaluation one step earlier and far cheaper: against the *code that will create the bucket*, before a single resource is provisioned. When infrastructure is declared as text, the text is reviewable, diffable, and — most importantly — *checkable by a machine on every change*. Wiring a scanner into the build means the control is no longer a sentence in a policy document that someone hopes engineers honour; it is a gate that physically refuses to let a non-compliant change through. That is the entire promise of GRC engineering compressed into one mechanism: the control moves left, the violation is caught at the cheapest possible moment, the finding is mapped to the control it enforces, and the passing result is emitted as durable evidence. EVALUATE stops being an audit activity and becomes a property of the pipeline.

---

## 3. The Mental Model

Start with the question this module exists to answer: **where, exactly, does a control fail?**

In the old world, a control failed *in production*, and you found out *later*. Someone created a storage bucket through a web console, ticked the wrong box (or didn't tick the right one), and the bucket went live holding customer data with no encryption and a public read setting. The control — "data at rest is encrypted," "storage is not publicly readable" — was real, written down, agreed to. It simply had no teeth at the moment that mattered. Months later an auditor, or an attacker, found the gap. The control existed; it just wasn't *enforced* anywhere a machine could refuse the mistake.

To fix this you have to understand one shift that changes everything: **infrastructure stopped being something you click and became something you write.** Instead of opening a console and clicking "create bucket," an engineer writes a short block of text that *declares* the bucket — its name, whether it is encrypted, who can read it. A tool reads that declaration and makes reality match it. This is **infrastructure as code**. The word "declarative" is the load-bearing one: you do not write the steps to build the bucket, you write *what the bucket should be*, and the tool figures out the steps. The most common dialect for writing these declarations is **Terraform**, and a declaration looks like nothing more than a labelled block: *here is a resource, of this type, with these settings.*

Now hold that thought and notice what it gives you for free. The bucket-that-will-exist is now **a text file you can read before the bucket exists.** And a control question — "is this bucket encrypted?" — is now answerable by *reading the text*, not by querying a live cloud account. You can ask the question at the speed of opening a file. That is the whole opening.

A **scanner** is the program that asks those questions for you, at scale, automatically. Point it at the infrastructure code and it walks every declared resource, and for each one it runs a library of small rules: *does this storage resource declare encryption? does it declare public access? does it declare versioning?* Each rule has a stable name — an identifier that does not change between runs — and each violation it reports carries a **severity**: how bad it is that this rule was broken. The scanner does not fix anything and does not know what your controls are called. It produces a verdict: a list of which rules passed and which failed, by identifier and severity. That verdict is just structured text — exactly the kind of text-in / text-out artifact Module 01 taught you to treat as evidence.

Here is the move that makes this *GRC* rather than merely *security tooling*. A scanner finding is `CKV_AWS_19: encryption at rest, HIGH`. That is the tool's language, not the auditor's. Your control catalogue speaks a different language: "SC-28, Protection of Information at Rest." The bridge between them is a **control map** — a small, owned table that says *this rule identifier enforces that control*. The instant you have that map, a scanner finding stops being a developer's lint warning and becomes a *control evaluation*: "control SC-28 was checked, against this exact change, and it failed." The map is the thing a GRC engineer owns; the scanner is just the sensor.

The last piece is the one with teeth. A scan result sitting in a log is information; it changes nothing on its own. To turn it into enforcement you put a **gate** between "a change was proposed" and "the change is accepted." The gate is a tiny program that reads the scan result, applies your rule — *any finding at or above this severity blocks* — and returns a verdict the build system obeys: pass means the change proceeds, fail means the change is rejected and cannot merge. This is the EVALUATE step from Module 01, with one upgrade: it runs automatically, on every proposed change, and its exit code is wired to *stop the change*. The control is now enforced by physics, not by good intentions.

So the full picture, smallest to largest: an engineer **declares** infrastructure as text; a **scanner** reads that text and emits findings by rule-ID and severity; a **control map** translates each finding into the named control it enforces; a **gate** turns the findings into a pass/fail verdict and *blocks the build on a fail*; and a passing gate **emits an evidence record** proving the control was evaluated and held. Five parts. The bucket is never created wrong, because the wrongness was caught while it was still only text.

---

## 4. Concepts

### 4.1 Declarative infrastructure: you write the destination, not the route

A Terraform file declares *what should exist*, not the procedure to make it exist. A minimal storage bucket is a labelled block — a resource type, a local name, and a body of settings:

```hcl
resource "aws_s3_bucket" "evidence" {
  bucket = "grc-evidence-store"
}
```

Read it as a sentence: "there should be a resource of type `aws_s3_bucket`, which I will refer to as `evidence`, named `grc-evidence-store`." You never wrote *how* to create it. Because it is text, it lives in version control, it diffs on every change, and — the part this module cares about — it can be **read and checked before it is ever applied**. The settings the bucket is *missing* (encryption, a private access rule) are exactly what a control check looks for. Absence in the declaration is the violation.

### 4.2 A scanner is a rule engine over your code

A scanner loads every declared resource and runs a catalogue of rules against each. For our bucket, three rules matter:

- *Is encryption at rest declared?*
- *Is public read access disallowed?*
- *Is versioning enabled?*

Each rule has a **stable identifier** (so a result is comparable across runs and across time) and each violation carries a **severity** (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`). The scanner emits a structured result — a list of passed checks and a list of failed checks. A single failed entry looks, in plain terms, like: *rule `CKV_AWS_19`, "encryption at rest," severity `HIGH`, on resource `aws_s3_bucket.evidence`.* The scanner has no idea this maps to one of your controls; it only knows its own rule fired.

### 4.3 The control map: from tool language to auditor language

A scanner finding is unintelligible to an auditor and unowned by anyone until you translate it. The translation is a tiny table you own — one row per rule identifier:

```
check_id,control_id,control_title,fail_severity_floor
CKV_AWS_19,SC-28,Protection of Information at Rest,HIGH
CKV_AWS_20,AC-3,Access Enforcement,HIGH
CKV_AWS_21,CP-9,System Backup,HIGH
```

Now `CKV_AWS_19` *means* "SC-28, encryption at rest." This table is the single most GRC-specific artifact in the module: it is where a security tool's output becomes a *control evaluation* with a named owner. When the catalogue changes — a new control, a re-mapped rule — you change this file, in version control, with a reviewer. The map is policy-as-data, and it is yours, not the vendor's.

### 4.4 The severity floor: deciding what is allowed to block

Not every finding should stop the world. A gate needs a **policy**: *findings at or above this severity block the build; findings below it are recorded but do not block.* That threshold is the **severity floor**. Set the floor at `HIGH` and a `HIGH` encryption finding blocks while a `MEDIUM` versioning finding is logged as a known, non-blocking gap. The floor is a deliberate, written-down risk decision — *which violations are we unwilling to ship?* — encoded as one value the gate reads. Lower the floor and more findings block; raise it and fewer do. Making this explicit is what stops a gate from being either uselessly permissive or so strict that engineers route around it.

### 4.5 The gate: turning a verdict into enforcement

The gate is a small program wired into the build between "change proposed" and "change accepted." It reads the scan result, applies the floor, looks each finding up in the control map, and returns one verdict:

- At least one finding at or above the floor → **FAIL** → the build is blocked, the change cannot merge.
- No finding at or above the floor → **PASS** → the build proceeds.

The mechanism is the exit code from Module 01, scaled up: the gate exits non-zero to fail and zero to pass, and the build system treats a non-zero exit as a hard stop. This is the difference between *detecting* a misconfiguration and *preventing* it. A detection sits in a report; a gated failure refuses to let the bad change exist. Inline, the contract is exactly: "any blocking finding ⇒ non-zero exit ⇒ no merge."

### 4.6 The evidence record: proving the control was enforced

A blocked build proves the control caught something. A *passed* build must also leave proof — otherwise "we enforce encryption in CI" is just another unverifiable claim. So the gate, on success, emits an **evidence record**: a small, dated, human- and machine-readable statement of *which controls were evaluated, against which change, and that they passed*. This record is the EVALUATE stage's output handed forward to the EVIDENCE stage. Because it is generated by the same gate that did the enforcing, it cannot drift from reality — the proof is a byproduct of the enforcement, not a separate document someone maintains. That is the whole point: the evidence is generated by the control, not asserted about it.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Scan results are shown in their representative shape; your exact tool output and rule wording will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 The non-compliant change, as the scanner sees it

An engineer proposes this Terraform — a bucket meant to hold evidence, declared with a public-read access rule and no encryption block:

```hcl
resource "aws_s3_bucket" "evidence" {
  bucket = "grc-evidence-store"
}

resource "aws_s3_bucket_acl" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  acl    = "public-read"
}
```

The scanner reads it and emits a structured result. Trimmed to the failures, it reports three:

```
CKV_AWS_19  HIGH    Ensure all data stored in the S3 bucket is securely encrypted at rest
CKV_AWS_20  HIGH    Ensure the S3 bucket does not allow public read access
CKV_AWS_21  MEDIUM  Ensure the S3 bucket has versioning enabled
```

Notice what the scanner did *not* do: it did not name your controls, did not decide whether the build should fail, and did not fix anything. It produced a verdict by rule-ID and severity. Everything that makes this a *control* evaluation happens next.

### 5.2 The gate decision: a blocked build, mapped to controls

The gate reads that result, looks each finding up in the control map (§4.3), applies a `HIGH` severity floor (§4.4), and prints a record that an auditor and a build system can both read:

```
=== GRC IaC Gate — evidence record ===
severity_floor: HIGH
---
FAILED  CKV_AWS_19  [HIGH]    -> SC-28 (Protection of Information at Rest)  : BLOCK
        Ensure all data stored in the S3 bucket is securely encrypted at rest
FAILED  CKV_AWS_20  [HIGH]    -> AC-3 (Access Enforcement)  : BLOCK
        Ensure the S3 bucket does not allow public read access
FAILED  CKV_AWS_21  [MEDIUM]  -> CP-9 (System Backup)  : below-floor (not blocking)
        Ensure the S3 bucket has versioning enabled
---
blocking_at_or_above_HIGH: 2
GATE_DECISION: FAIL  (build blocked — 2 control(s) violated at/above HIGH)
```

The gate exits non-zero. In a real pipeline that non-zero exit is the entire enforcement: the change cannot merge. Read the record as a GRC engineer: two HIGH findings, mapped to **SC-28** and **AC-3**, blocked the build; the MEDIUM versioning gap was *recorded against CP-9 but did not block*, because the floor is HIGH. The control catalogue's language ("SC-28") and the build system's language (a failing exit code) met in one artifact. Nothing was created in the cloud, because the wrongness was caught while it was still text.

### 5.3 The remediation: the same gate now passes and emits evidence

The engineer fixes the code — private ACL, a server-side encryption block, versioning enabled, access logging — re-runs the scanner, and the new result has no failed checks. The same gate now prints:

```
=== GRC IaC Gate — evidence record ===
severity_floor: HIGH
---
failed_checks_evaluated: 0
blocking_at_or_above_HIGH: 0
GATE_DECISION: PASS  (no violations at/above HIGH — build proceeds, evidence emitted)
```

The gate exits zero; the build proceeds; the change merges. Crucially, this PASS record *is the evidence* that SC-28 and AC-3 were enforced on this change — generated by the same gate that did the enforcing, so it cannot lie about what happened. The remediation didn't just satisfy a reviewer; it produced an auditable artifact that the control was evaluated and held.

### 5.4 Tuning the floor is a risk decision, made visible

Suppose policy tightens: versioning gaps are no longer acceptable to ship. You don't change the scanner or the code — you lower the **floor** to `MEDIUM`. Re-run the gate on the original non-compliant result:

```
blocking_at_or_above_MEDIUM: 3
GATE_DECISION: FAIL  (build blocked — 3 control(s) violated at/above MEDIUM)
```

Now the MEDIUM versioning finding (CP-9) also blocks. One value, in one owned file, changed which risks the pipeline is willing to accept — and the change is itself a reviewable diff in version control. That is risk appetite expressed as code, not as a meeting.

---

## 6. Guided Lab

> Original lab. ~60–90 minutes. Tier-B content (environment-dependent). The full lab uses a real scanner and a real CI runner; the bundled `labs/happy-path.sh` proves the **gate decision logic** offline against committed scan-result fixtures, so the core control evaluation is reproducible on any clean machine with bash + coreutils + awk.

**Scenario.** You own one control area: storage must be encrypted at rest and never publicly readable. You will wire a gate into a build so that a deliberately non-compliant Terraform change is **blocked**, the blocking finding is **mapped to the control it enforces**, and a passing change **emits evidence**.

> **Interactive lab.** This lab runs in your browser on the bootcamp site (Module 08 → Interactive lab) as a CI-workspace simulation: the gate decision it runs is a port of the committed `gate.sh`, CI-verified byte-for-byte against real `bash` runs of that script — the same inputs on a real machine produce the same record and exit code.

**Setup.** Run `bash labs/setup.sh ./lab08`. This stages, in `./lab08/`: two scan-result fixtures (`checkov-noncompliant.json`, `checkov-compliant.json`), the two Terraform snippets they correspond to (`main-noncompliant.tf`, `main-compliant.tf`), the control map (`control-map.csv`), and the gate (`gate.sh`). No scanner, cloud, or network is required for the offline core; the optional steps marked *(real environment)* require your own tooling.

**Tasks.**

1. Read `main-noncompliant.tf` and, *before running anything*, write down which of the three control questions (encryption / public access / versioning) you expect the resource to fail, and why. Then read `checkov-noncompliant.json` and reconcile your prediction with the scanner's failed checks. *(Objectives 1, 2)*
2. Run the gate on the non-compliant result at a `HIGH` floor: `bash lab08/gate.sh lab08/checkov-noncompliant.json lab08/control-map.csv HIGH`. Inspect `$?`. State, in one sentence, what the non-zero exit code means for a build system and why that is *enforcement* rather than *detection*. *(Objectives 4, 5)*
3. From the gate's output, name the control that each blocking finding enforces. Open `control-map.csv` and explain, in your own words, why this file — not the scanner — is the artifact a GRC engineer owns. *(Objective 3)*
4. Read `main-compliant.tf`. For each blocking finding in task 2, point to the exact lines in the compliant file that remediate it. Run the gate on `checkov-compliant.json` and confirm it exits `0`. Capture the PASS record into `lab08/evidence-storage-controls.txt`. *(Objectives 5, 6)*
5. Re-run the gate on the *non-compliant* result with the floor lowered to `MEDIUM`. Explain what changed in the decision and why, and state where in your owned files a real organisation would record that risk-appetite change. *(Objective 4)*
6. *(Real environment, optional but recommended.)* Initialise a git repo containing `main-noncompliant.tf`, install a real IaC scanner, and add a CI workflow that runs the scanner, then runs the gate against the scanner's output, failing the build on a non-zero gate exit. Open a change that introduces the non-compliant bucket and confirm the build is **blocked**. Then push the remediation and confirm the build **passes** and the evidence record is produced. *(Objectives 2, 4, 6)*

**Deliverables:** `evidence-storage-controls.txt` (the captured PASS record), a short written mapping of each blocking finding to its control and to the remediating lines in `main-compliant.tf`, and a 4–6 sentence explanation covering: why the non-compliant change was blocked; why mapping the finding to a control matters; what the severity floor decided; and why a gate-emitted evidence record cannot drift from reality.

---

## 7. Assessment

**Competency artifact (not a quiz).** Given a *fresh, unseen* pair of scan-result fixtures (one non-compliant, one compliant) and a partial control map, the learner must, unaided and within 45 minutes, deliver:

- A **working gate invocation** that, run against the non-compliant result, **blocks** (exits non-zero) and, run against the compliant result, **passes** (exits zero) — with a stated, defensible severity floor.
- A **completed control map** row for at least the blocking findings, translating each scanner rule identifier into the named control it enforces.
- A **captured evidence record** from the passing run, plus a written walkthrough that correctly: explains what infrastructure-as-code makes checkable and when; names the control each blocking finding maps to; states what the severity floor decided and why; and explains why the gate-emitted evidence record cannot drift from what actually happened.

**Rubric** (each row Pass / Not-yet; all must be Pass):

| Criterion | Objective | Pass means |
|---|---|---|
| IaC framing (Obj 1) | O1 | Explains, without jargon, what declaring infrastructure as text makes checkable *before* anything is created |
| Reading findings (Obj 2) | O2 | Correctly reads a scan result: which rules failed, their identifiers, and their severities |
| Control mapping (Obj 3) | O3 | Maps each blocking finding to the correct named control; articulates why the map is the owned artifact |
| Gate composition (Obj 4) | O4 | Gate blocks the non-compliant result and passes the compliant one; severity floor stated and justified |
| Diagnosing a block (Obj 5) | O5 | From gate output, names the blocking finding, its control, and the code change that clears it |
| Evidence emission (Obj 6) | O6 | Produces the PASS evidence record and explains why it cannot drift from reality |

A "Not-yet" on any row routes the learner back to the specific concept section, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3).

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are for learners who want a different voice, the official tool documentation, or more breadth. None of this is load-bearing — a learner who clicks zero links still meets every objective.*

- **HashiCorp Terraform tutorials (HashiCorp Learn)** — the official, hands-on introduction to writing and applying Terraform. https://developer.hashicorp.com/terraform/tutorials — *use if you want guided, vendor-authored practice writing the declarative resources from §4.1 against a real provider.*
- **"Terraform: Up & Running" — Yevgeniy Brikman** — a full book-length treatment of Terraform in production, including module structure and state. *use for depth beyond §4.1 once the mental model is solid; the book is the long-form version of "you write the destination, not the route."* (See the publisher or your library; ISBN search "Terraform Up and Running Brikman".)
- **Checkov** — the IaC static-analysis scanner whose finding shape (`CKV_AWS_*` rule IDs, pass/fail checks, severities) the worked examples model. https://github.com/bridgecrewio/checkov — *use to run a real scan in §6 task 6 and see genuine findings on your own Terraform.*
- **Trivy** — a broad scanner covering IaC misconfigurations as well as container images, SBOMs, and secrets. https://github.com/aquasecurity/trivy — *use if you want one tool spanning more of the supply chain than IaC alone; its misconfiguration output can feed the same gate after normalising to the result shape in §4.2.*
- **Prowler** — a cloud-posture scanner mapping checks to 40+ compliance frameworks. https://github.com/prowler-cloud/prowler — *use for the complementary angle: scanning the live cloud account (post-deploy EVALUATE) rather than the code, and to see framework-mapping done at scale, which is §4.3 industrialised.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
