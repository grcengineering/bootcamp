# Module 09 — Policy as Code

*Loop stage: EVALUATE. Tier 2. Original content. This is the deepest "compliance-as-code" skill in the curriculum — and the one with the loudest, most legitimate backlash. We teach the skill and the skepticism together, on purpose.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a colleague who has never seen a policy language, what "policy as code" actually moves out of human judgment and into a machine — and what it deliberately leaves behind.
2. **Compose** the same single control as an authorization-style policy in Cedar *and* as a rule in OPA's Rego, and **explain** why the two languages make you think differently about the same claim.
3. **Build** a CI gate that runs a policy against an input and **fails the build** on a violation, so a non-compliant change cannot merge.
4. **Produce** a structured, versioned pass/fail evidence record automatically as a by-product of that gate running — not as a separate manual step.
5. **Diagnose** policy-rot: identify when a policy has silently stopped meaning anything, name the ownership gap that let it rot, and state the fix.
6. **Map** a control to the right tool — and **decide, in writing, whether policy-as-code was the correct tool for *this* control at all**, defending the answer when "yes" and when "no."

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact — one control as policy in two languages, gated in CI, auto-emitting evidence, with a written tool-fit justification — unaided, this module is your placement test.

---

## 2. Why this matters for GRC

This is the **EVALUATE** stage of the loop, and it is the stage where most GRC programs quietly cheat. You have already learned to UNDERSTAND a control, LOCATE where its truth lives, and QUERY that truth (shell, API, SQL). Now you hold a fact about a system — a JSON blob, a config, a row — and you have to *judge* it: pass or fail, against policy. The cheat is to email the fact to a human who eyeballs it against a sentence in a Word document. Policy as code replaces that human-and-Word-document with an executable rule: the policy *is* a file, the judgment *is* a function, and the verdict *is* a value a machine emits. That makes the EVALUATE step reproducible, version-controlled, testable, and gateable — the same fact judged the same way every time, with a diff history of how the judgment itself changed. It is the hinge between "we located the truth" and "we can prove, continuously and automatically, what that truth means." But — and this module is unusually honest about this — encoding judgment is not always the right move, and a rule nobody owns is worse than no rule at all.

---

## 3. The Mental Model

Start with the thing a control actually is, stripped to its core: **a claim about the state of a system, plus a rule for deciding whether the current state honors the claim.** "S3 buckets must not be public" is two pieces — a fact you can fetch (is this bucket public?) and a verdict you apply to it (if public, fail). For decades, GRC kept the fact and the verdict in two different universes. The fact lived in the running system. The verdict lived in a human's head, anchored to a sentence in a policy document. A person looked at the fact, recalled the sentence, and pronounced judgment. That pronouncement was the control. It was also unreproducible, unversioned, untestable, and as reliable as the person's attention on the day.

Policy as code is one move, and it is smaller than the hype suggests: **take the verdict out of the human's head and write it down as an executable function.** That's it. A policy-as-code rule is a function. Its input is the fact you already learned to fetch in the earlier modules. Its output is a decision — at minimum allow/deny, often a decision plus a reason. The policy file is the source of truth for the *judgment*; the system is still the source of truth for the *fact*. You are not automating the fact-gathering here (you did that in QUERY) — you are automating the *judgment*, and that is a deeper and more dangerous thing to automate, because judgment is where meaning lives.

Why is that one move so powerful? Because the instant a verdict is a function, it inherits every property of code for free. It can be **version-controlled** — you can see, in a diff, the exact moment someone weakened the rule, and who approved it. It can be **tested** — you can feed it a known-bad input and assert it says "deny," so you know the rule still bites before you trust it. It can be **reviewed** as a pull request, so changing a control becomes a change-managed event instead of a quiet edit to a shared doc. It can be **run in a gate**, so a violation is caught at the moment of change instead of discovered nine months later in an audit. And it produces a **structured output** every time it runs, which is the raw material of automatic evidence. The function is the leverage point: everything good about policy-as-code follows from "the verdict is now a thing the computer can execute, store, diff, and test."

Now the part the hype skips. A function that returns the wrong verdict, confidently and automatically, every time, is *worse* than no function — because the green checkmark manufactures false trust at machine speed. And a function that nobody owns slowly drifts away from the real-world risk it was supposed to encode: the threat changes, the systems change, the business changes, but the rule sits there frozen, still passing, still green, now meaningless. This failure has a name in this curriculum — **policy-rot** — and it is the dominant cause of policy-as-code disappointment in the field. So the mental model has two halves, and you must hold both: *encoding a verdict as a function is the most powerful thing you can do to a control* **and** *an unowned, untested, or mis-fitted encoded verdict is a liability that compounds silently.* A GRC engineer who only learns the first half is exactly the person the backlash essays are warning about.

One more frame before the syntax, because it dissolves the "which policy language do I learn?" anxiety. **Every policy-as-code tool is the same shape: a language for writing the verdict-function, plus an engine that runs it against an input and returns a decision.** They differ in two dimensions only — *what the language is good at expressing*, and *where the engine plugs in*. Cedar's language is purpose-built for "is this principal allowed to do this action on this resource?" and is designed to be analyzable — a machine can reason about the policy itself, not just run it. Rego (the language of OPA, the Open Policy Agent) is a general-purpose query language that can express almost any judgment over almost any JSON, which is its strength and its difficulty. Kyverno doesn't introduce a new language at all — you write the verdict in Kubernetes' own YAML, which is why it dominates K8s admission control. Cloud Custodian expresses the verdict as YAML filters over cloud resources and *acts* on them. Same shape every time: write the function, point an engine at the input, read the decision. Learn the shape once and every tool becomes "where does the function live and how do I feed it the input?"

We teach Cedar first deliberately. Not because it is the industry default — it is not; that is Rego. We teach Cedar first because its constrained, analyzable design lets you build correct intuition about *what a policy is* before you fight the much harder, much more general Rego syntax. Build the mental model in the gentle language, then carry it into the hard one. Reversing that order is how people conclude "policy as code is just impossibly hard" — they met Rego first, bounced off the syntax, and never separated "this idea is hard" from "this language is hard." The idea is simple. One of the languages is hard.

---

## 4. Concepts

### 4.1 A policy is a function: input → decision

Hold this and the rest follows. A policy takes a structured fact and returns a verdict. In the abstract:

```
decision = policy( input )
# input:    { "bucket": "logs-prod", "public": true }
# decision: "deny"  (because the rule says public buckets are not allowed)
```

The input is the control-truth you already know how to fetch. The decision is what a human used to pronounce. Everything else in this module — the languages, the engines, the gates — is machinery for writing that function well, running it reliably, and keeping it honest.

### 4.2 Cedar — the analyzable verdict (learn this first)

Cedar is built around one question shape: *may this **principal** perform this **action** on this **resource**, in this **context**?* You write `permit` and `forbid` statements, and Cedar evaluates them against a request. Its defining feature is that `forbid` always wins over `permit` — so you can layer a blanket allow with targeted, non-overridable denials. A tiny rule that forbids granting a legacy admin role:

```cedar
forbid(
  principal,
  action == Action::"grantRole",
  resource
)
when { resource.role == "legacy-admin" };
```

Read it in English: *forbid anyone from the `grantRole` action when the role being granted is `legacy-admin`.* No request that matches will ever be allowed, no matter what other policies say. The reason Cedar is the right *first* language: it is small, the `permit`/`forbid` structure forces you to think in explicit allow/deny rather than tangled boolean soup, and because the language is constrained, tools can *analyze* a policy set — answer "do these two policies contradict?" without running every possible input. That analyzability is a real GRC asset: you can reason about your authorization model, not just test samples of it.

### 4.3 Rego / OPA — the general verdict (the industry default, and the hard one)

OPA — the Open Policy Agent — is the de facto standard, and you will meet it everywhere: Kubernetes admission control, Terraform plan checks, API authorization, CI gates. Its language, Rego, is general-purpose: it can express a judgment over *any* JSON, not just principal-action-resource. That generality is exactly why it is hard — it reads like nothing else you know, it is built on logic-programming ideas (rules are true when their bodies are satisfiable), and the same control we just wrote in four readable Cedar lines becomes a different mental exercise:

```rego
package access

import rego.v1

deny contains msg if {
    input.action == "grantRole"
    input.resource.role == "legacy-admin"
    msg := "granting the legacy-admin role is forbidden"
}
```

Read it: *`deny` collects a message when the action is `grantRole` and the role is `legacy-admin`.* A request is rejected if `deny` is non-empty. The win over Cedar is reach — Rego will judge a Kubernetes pod spec, a cloud config, an API call, a CSV row, anything you can express as JSON. The cost is the learning curve and the ease of writing a rule that is subtly, silently wrong. **This is the single biggest source of the policy-as-code backlash:** teams adopt Rego, find it genuinely hard, write rules they cannot confidently verify, and either give up or — worse — keep the green checkmarks they don't trust. The defense is not avoiding Rego; it is *testing* every Rego rule against known-good and known-bad inputs so the rule's verdict is itself verified. A Rego policy without tests is a guess wearing a uniform.

### 4.4 Kyverno and Cloud Custodian — verdict-in-YAML, no new language

Two tools deliberately avoid inventing a language, because the language is the adoption tax. **Kyverno** expresses Kubernetes admission policies directly in Kubernetes YAML — if your control lives in the cluster ("no container may run as root," "every namespace must carry an owner label"), Kyverno lets you write the verdict in the same syntax your platform team already speaks, and it plugs straight into the admission webhook so violations are blocked at deploy time. **Cloud Custodian** expresses cloud-resource verdicts as YAML *filters* and can take *actions* — not just "this S3 bucket is public → fail," but "this S3 bucket is public → tag it, notify, or remediate." A Custodian rule reads as: pick a resource type, filter to the non-compliant ones, do something. The lesson is doctrinal: **the best policy language is sometimes no new language.** If a YAML-native tool fits the control and your team already lives in that YAML, choosing it over Rego is often the *more* engineering-mature decision, because adoption and maintainability beat expressive power for a control nobody wants to babysit.

### 4.5 The CI gate — where the verdict gets teeth

A policy that runs only when someone remembers to run it is a suggestion. A policy wired into CI is a control. The pattern is identical to the IaC-scanning gate from the previous module: on every pull request, the pipeline fetches the relevant input, runs the policy engine against it, and **exits non-zero on any deny** — which fails the build and blocks the merge. The non-compliant change physically cannot land on the main branch. This is what "shift left" means concretely for GRC: the control is evaluated at the moment of change, by the same mechanism that runs the tests, owned in the same repo, reviewed in the same PR. A control that only an auditor checks, twice a year, is a periodic hope. A control that fails the build is continuous and unbypassable. The gate is the difference.

### 4.6 The evidence record — proof as a by-product

Here is the move that separates a GRC engineer from a platform engineer who happens to write policies. When the gate runs, it already computed a verdict — so capture it. Emit a small, structured, versioned record every single time the policy evaluates: *which control, which policy version, which input, what verdict, when, in which pipeline run.* A minimal shape:

```json
{
  "control_id": "AC-6-legacy-admin",
  "policy_engine": "cedar",
  "decision": "deny",
  "passed": false,
  "input_ref": "access-export@a1b2c3",
  "evaluated_at": "2026-05-28T17:04:00Z",
  "run": "ci-1789"
}
```

This record is the EVIDENCE stage falling out of the EVALUATE stage for free. You did not collect evidence as a separate chore; the act of judging *produced* the proof. Commit these records to a versioned store and you have an audit trail that is reproducible, tamper-evident (it's in git history), and continuous — exactly the "zero manual evidence toil" the curriculum is aiming at. A policy gate that fails the build but emits nothing is half a control; the evidence record is the other half.

### 4.7 Policy-rot — the failure mode the backlash is really about

Policy-rot is what happens to an encoded verdict that no human owns. The threat it was written for changes; the systems it judges drift; the business reorganizes — but the rule sits frozen, still executing, still green, now disconnected from any real risk. Worse than a noisy broken rule (which someone fixes) is a *quietly meaningless* one: it passes every run, so no alarm fires, and everyone trusts a checkmark that stopped meaning anything months ago. This is the heart of the documented backlash — the honest reports that the policy-as-code revolution underdelivered, that teams automated *evidence* instead of *risk decisions*, that Rego's difficulty left rules nobody could confidently maintain. The structural fix is not technical, it is ownership: **every policy has a named owner and a review cadence, exactly like every other control in this curriculum.** An unowned policy is a future incident with a green light on it. The §8 backlash essays are required, not optional — a GRC engineer who can write a Rego rule but cannot say when *not* to, and who is responsible for it afterward, is precisely the engineer the field is tired of.

### 4.8 Tool-fit — the decision that comes *before* the syntax

The most senior judgment in this module is *whether to encode this control as policy at all.* Policy as code is the right tool when the control is **objective** (the verdict is a clean function of fetchable facts, not a human risk call), **high-frequency** (it should be checked on every change, not once a quarter), and **stable enough to own** (someone will maintain it as reality shifts). It is the *wrong* tool when the verdict requires genuine human judgment that can't be reduced to a function without lying about it, when the control changes faster than anyone will update the rule, or when no one will own it — in which case a checkmark you don't trust is strictly worse than an honest manual review. Choosing *not* to PaC a control, with a written reason, is a senior move, not a failure. This is why the §7 artifact demands a one-paragraph tool-fit justification: the languages are learnable in a week; knowing when to reach for them — and when not to — is the actual skill.

---

## 5. Worked Examples

> These are ours, GRC-framed, end-to-end. Commands and records are shown with representative output; your exact output and tool versions will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 One control, two languages — and why they make you think differently

The control: *access changes must never grant the `legacy-admin` role.* The fetched fact is a request object the access system would process. In Cedar, you frame it as authorization — principal, action, resource:

```cedar
forbid(principal, action == Action::"grantRole", resource)
when { resource.role == "legacy-admin" };
```

In Rego, you frame it as a query that collects denials over arbitrary JSON:

```rego
package access
import rego.v1
deny contains msg if {
    input.action == "grantRole"
    input.resource.role == "legacy-admin"
    msg := "granting the legacy-admin role is forbidden"
}
```

Both encode the *same* verdict, but notice what each made you do. Cedar forced you to name a principal, an action, and a resource — it pushed you toward an authorization model and will let a tool *analyze* whether this `forbid` contradicts some other `permit`. Rego made you describe a condition over a JSON shape — more freedom, no enforced model, and it will judge inputs Cedar's grammar can't even describe. The lesson isn't "one is better." It's that the language *shapes the question*, and a GRC engineer picks the language whose shape matches the control. Authorization-flavored controls fit Cedar's grammar like a glove; "judge this arbitrary config" controls are Rego's whole reason to exist.

### 5.2 The gate failing a non-compliant change

A pull request adds a row granting `legacy-admin`. The CI job runs the policy engine against the changed access export and the gate speaks:

```
$ ./run-policy-gate.sh access-export.csv
EVAL  control=AC-6-legacy-admin engine=cedar input=access-export.csv
DENY  row 4: carol -> legacy-admin  (forbidden by AC-6)
GATE  result=FAIL  (1 violation)  exit=1
```

Exit code `1` fails the build; the PR cannot merge. Read it through the loop: the fact was fetched (the export), the verdict was applied as a function (the policy), the decision was deny, and the gate turned that decision into an unbypassable consequence at the moment of change. Nobody emailed anybody. The control enforced itself, left, where the change happened. Compare the legacy version of this exact control — an auditor, two quarters later, sampling the access list by hand and *hoping* to notice the bad row. Same control, completely different physics.

### 5.3 Evidence emitted as a by-product — pass and fail

The same gate run, regardless of verdict, drops a record into the versioned evidence store. The failing run above wrote:

```json
{ "control_id": "AC-6-legacy-admin", "policy_engine": "cedar",
  "decision": "deny", "passed": false, "violations": 1,
  "input_ref": "access-export@4f1c", "evaluated_at": "2026-05-28T17:04:00Z", "run": "ci-1789" }
```

After the offending row is removed and the PR re-runs, the *passing* record is just as automatic:

```json
{ "control_id": "AC-6-legacy-admin", "policy_engine": "cedar",
  "decision": "allow", "passed": true, "violations": 0,
  "input_ref": "access-export@9ab2", "evaluated_at": "2026-05-28T17:22:00Z", "run": "ci-1804" }
```

Two commits, two evidence records, a complete before/after audit trail — produced by the act of judging, not by anyone collecting it. An auditor asking "prove this control was enforced on every change last quarter" gets a query against the store, not a scramble. That is EVIDENCE and MONITOR emerging from EVALUATE at zero marginal toil.

### 5.4 Catching policy-rot — and deciding *not* to PaC

A different control: *vendor risk acceptances must be re-justified when the vendor's risk tier changes.* A team encoded it in Rego a year ago. It has passed every run since. Inspect it and the rot is visible: the rule checks that a `last_reviewed` date exists — but never that the review actually re-evaluated anything, and the field is auto-stamped by the ticketing system on *any* edit. The policy is green and meaningless; it tests that a date is present, not that a human made a risk decision. This is policy-rot in the wild: an unowned rule whose verdict drifted away from the control's intent while staying green. The fix has two parts. First, ownership — assign the control an owner and a review cadence so the drift gets caught by a human, not an audit. Second, and harder, the honest tool-fit call: *re-justifying a risk acceptance is a human judgment, not a clean function of fetchable facts.* Encoding it as PaC was the original mistake — it produced a checkmark that *replaced* the judgment instead of supporting it. The senior move here is to *retire the policy*, replace it with a lightweight reminder-and-review workflow owned by a named person, and write down why: this control was the wrong fit for code, and a green light we didn't trust was worse than the manual review it displaced. Choosing not to PaC, in writing, is the deliverable — and it is the most GRC-mature thing in this module.

---

## 6. Guided Lab

> Original lab. ~60–90 minutes. Tier-B content (tool versions shift). You need a Unix-like shell and `bash` + coreutils; the policy engines (Cedar CLI, OPA) are optional — the lab is built so you can complete the *core logic* with a tiny script if the engines aren't installed, and swap in the real engines where available. No prior policy-language experience assumed.

**Scenario.** You own the control *"access changes must never grant the `legacy-admin` role."* You will express it as policy in two languages, gate it in CI so a bad change can't merge, make the gate emit a structured evidence record on every run, and then write the judgment that matters most — whether policy-as-code was even the right tool for this control.

**Setup.** Run `bash labs/setup.sh ./lab09` to generate the fixtures: a *clean* access export (`access-clean.csv`), a *violating* export with a `legacy-admin` row (`access-violation.csv`), and a starter evidence-store directory.

**Tasks.**

1. Write the control as a Cedar `forbid` statement and as a Rego `deny` rule, in two files. For each, write one sentence: what did this language force you to specify that the other didn't? *(Objective 2)*
2. Implement the verdict-function as a small, engine-agnostic check script that takes an access export, applies the rule (deny any row whose role is `legacy-admin`), prints a `DENY` line per violation, and **exits non-zero if and only if there is at least one violation**. This is the function from §4.1 made real. *(Objectives 1, 3)*
3. Run your check against `access-clean.csv` (expect exit 0, no denials) and `access-violation.csv` (expect non-zero, one denial). Confirm the exit codes with `echo $?`. State, in one sentence, why "exit non-zero on violation" is what gives the gate teeth. *(Objective 3)*
4. Wrap the check in a `run-policy-gate.sh` that any CI system would call: it runs the check and, **on every run regardless of verdict**, appends a structured JSON evidence record (control id, engine, decision, passed, violations, input ref, timestamp, run id) to `lab09/evidence-store/`. *(Objectives 3, 4)*
5. Simulate a CI run on the violating input. Confirm the gate exited non-zero *and* that a `passed:false` evidence record was written. Then run on the clean input; confirm exit 0 *and* a `passed:true` record. You now have a before/after audit trail produced by the gate, not by you. *(Objective 4)*
6. **Policy-rot drill.** Open the provided `rotted-policy.txt` (a rule that checks only that a `last_reviewed` field is present). In 3–4 sentences: explain why it is green-but-meaningless, name the ownership gap that let it rot, and state the fix. *(Objective 5)*
7. **Tool-fit justification.** Write one paragraph deciding whether policy-as-code was the right tool for *this* `legacy-admin` control, defending the "yes." Then write one paragraph deciding whether PaC is the right tool for the *rotted* risk-acceptance control from task 6, defending the "no." *(Objective 6)*

**Deliverables:** the Cedar file, the Rego file, the check script, `run-policy-gate.sh`, at least two evidence records (one `passed:false`, one `passed:true`) in the store, and a short written document containing the rot diagnosis (task 6) and the two tool-fit justifications (task 7).

---

## 7. Assessment

**Competency artifact (not a quiz).** Given a *fresh, unseen* control statement and a sample input at assessment time, the learner must, unaided and within 60 minutes, deliver:

- The control expressed as policy in **two languages** (Cedar *and* Rego), each correctly encoding the same verdict.
- A **CI gate** (a runnable script a pipeline would call) that runs the policy against the input and **exits non-zero on a violation** so the change would be blocked.
- A **structured, versioned evidence record** emitted automatically by the gate on every run — both a `passed:false` (on a violating input) and a `passed:true` (on a clean input) record.
- A **written tool-fit justification**: one paragraph arguing whether policy-as-code was the right tool for *this* control, naming the owner and review cadence if yes, and the manual alternative if no — plus a correct diagnosis of a supplied rotted policy.

**Rubric** — see `assessment/rubric.md`. Every row is Pass / Not-yet; all rows must be Pass. A Not-yet routes the learner back to the specific concept section named in the rubric, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below the `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero of these still meets every objective. These are for a different voice, the official references, and the backlash you must engage with directly.*

- **Cedar — official site & language docs.** https://www.cedarpolicy.com/ — *use to go deeper than §4.2: the full `permit`/`forbid` grammar, the entity/schema model, and the analyzability tooling. The canonical reference for the language we teach first.*
- **Open Policy Agent (OPA) / Rego — source & ecosystem.** https://github.com/open-policy-agent/opa — *use after §4.3 when you need the real Rego language reference, the `opa test` workflow, and Gatekeeper for Kubernetes admission. This is the industry default; budget the most time here.*
- **Kyverno — Kubernetes-native policy.** https://github.com/kyverno/kyverno — *use if your controls live in a Kubernetes cluster; the verdict-in-YAML approach from §4.4, with admission-control examples.*
- **Cloud Custodian — multi-cloud rules-as-YAML.** https://github.com/cloud-custodian/cloud-custodian — *use for cloud-resource controls where you want filter-and-act (tag, notify, remediate), not just pass/fail; the other "no new language" option from §4.4.*
- **"Why the Policy-as-Code revolution didn't happen" — GRC Engineer (Ayoub Fandi).** https://grcengineer.com — *required reading for §4.7. The honest field report on why adoption underdelivered: Rego's difficulty, policy-rot, and automating evidence instead of risk decisions. Read it before you decide this module made PaC look too easy.*
- **"Compliance-as-Cope" — GRC Engineer.** https://grcengineer.com — *the companion critique for §4.8 and the tool-fit decision: when encoding a control as code is theater rather than assurance. The skeptic's case you must be able to answer.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
