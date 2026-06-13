# Module 12 — OSCAL & Compliance-as-Code

*Original content. Tier 3 of the curriculum. Loop stages: **EVALUATE → EVIDENCE → MONITOR**. Conforms to the standard module anatomy. This module takes the crosswalk you hand-authored in Module 10 and gives it a schema — turning a table a human reads into a document a machine validates, exchanges, and links to the very policy code that enforces it. Third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a colleague who keeps their controls in a spreadsheet, what OSCAL actually is and why giving a control catalog a *schema* — not just a shared format — changes compliance documents from prose that humans re-key into data that machines validate, exchange, and diff.
2. **Describe** the four OSCAL layers a GRC engineer touches — catalog, profile, component-definition, and the assessment/POA&M models — and state what real-world artifact each one is the machine-readable version of.
3. **Map** the Module-10 crosswalk onto OSCAL structure: a spine catalog becomes a *catalog*, a framework profile becomes a *profile* that imports and selects from it, and a control-with-evidence becomes a control *implementation* inside a component-definition.
4. **Compose** a minimal but schema-valid OSCAL catalog and profile from the crosswalk using compliance-trestle, and **validate** it so a malformed document fails loudly instead of passing silently into an audit package.
5. **Diagnose** an OSCAL document that a validator rejects — a missing required field, a dangling control reference, a broken import — and state which downstream consumer (an auditor's tool, a FedRAMP pipeline, a sister team's importer) the defect would have broken.
6. **Produce** one control implementation expressed in OSCAL and *linked by control identifier to the Module-09 policy that enforces it* via Compliance-to-Policy, plus a validator that asserts the required fields exist and the link resolves — proving the document is machine-real, not machine-shaped prose.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Module 10 gave you a crosswalk the team owns; Module 09 gave you a policy that enforces a control in code; Modules 5–8 gave you evidence that the enforcement actually happened. Each of those is real and each is *trapped in its own format* — a CSV here, a Rego file there, a JSON evidence blob somewhere else — connected only by the fact that you, a human, know they are about the same control. This module is where that human knowledge becomes machine-checkable structure. OSCAL is the shared schema that lets a control catalog, the framework profile that selects from it, the implementation statement that claims a control is satisfied, and the policy that enforces it all reference *the same control by the same identifier*, in documents a machine can validate and exchange. That is why this module spans three loop stages at once: the OSCAL document is the EVALUATE verdict ("this control is implemented") frozen as data, carrying the EVIDENCE link to the artifact that proves it, in a form a MONITOR pipeline can re-read every day without a human re-keying anything. Without this layer, "we are compliant" is a stack of files a person has to mentally join. With it, the join is in the data, and the most consequential force in this field — an approaching mandate for machine-readable compliance packages in government cloud authorizations — stops being a future fire drill and becomes a format you already speak.

---

## 3. The Mental Model

Start with the question this module exists to answer: **why isn't a shared file format enough?**

You already have shared formats. The Module-10 crosswalk is a CSV; everyone can open it. The Module-09 evidence record is JSON; any tool can parse it. So why invent yet another thing? Because "everyone can open it" and "everyone agrees what's inside it" are completely different guarantees, and only the second one lets machines do the work. A CSV with a column called `control` tells a program nothing about whether that column holds `AC-2`, `Account Management`, or `the thing Sarah set up last March`. The format is shared; the *meaning* is not. Every team that consumes your spreadsheet has to write its own brittle code to guess what your columns mean, and every audit becomes a translation project. The thing missing is not a format — it's a **schema**: a published, enforceable contract that says *a control catalog has exactly these parts, named exactly these things, in exactly this shape, and a document that violates the contract is not a catalog at all.*

That is what OSCAL is. **OSCAL — the Open Security Controls Assessment Language — is a schema for the documents GRC already produces.** It does not invent new compliance concepts; it takes the ones you have been hand-maintaining as prose and spreadsheets — the control catalog, the framework baseline, the statement of how you implement each control, the assessment plan, the list of open findings — and gives each one a strict, machine-validatable structure. The word "language" is slightly misleading; think of it as a set of *forms with mandatory fields*. A document either fills the form correctly or it fails validation. The instant a compliance document can *fail validation*, it stops being prose someone hopes is complete and becomes data a machine can trust.

Now the structure, because OSCAL's power is that its layers map one-to-one onto artifacts you already understand from Module 10. There are four you will touch, and each is the machine-readable version of something concrete:

A **catalog** is a list of controls — your spine. The thing you called "NIST 800-53 as the superset" in Module 10 is, in OSCAL, a *catalog*: every control as a structured object with a stable ID, a title, and its statement text. A **profile** is a *selection over a catalog* — it imports a catalog and says "for this framework, these controls apply, possibly with these parameter values set." The Module-10 idea that "a framework is a subset of the spine" *is* an OSCAL profile, mechanically: a profile literally `import`s the catalog and lists which control IDs it includes. A **component-definition** is where a control stops being abstract and gets *implemented*: it says "this component — this service, this policy, this configuration — satisfies control AC-2, and here is the statement of how." That is the machine-readable version of "we actually do this control, and here's the proof it's wired up." And the **assessment and POA&M models** are the machine-readable versions of "we checked it" and "here's what's still broken and when we'll fix it" — the assessment results and the plan-of-action-and-milestones an auditor would otherwise receive as a Word document.

Hold the chain in one line: a **catalog** holds the controls, a **profile** selects the ones a framework needs, a **component-definition** claims and shows how specific controls are implemented, and the **assessment/POA&M** layer records what was checked and what's outstanding. Module 10's crosswalk was the hand-drawn sketch of the catalog-and-profile relationship; OSCAL is that sketch promoted to a schema a machine enforces.

Authoring these by hand, raw, is miserable — the schemas are large and unforgiving, which is the point. So you don't hand-author them; you use a tool. **compliance-trestle** (often just "trestle") is an open-source toolkit that treats OSCAL documents the way Module 08 treated infrastructure: as files you generate, validate, and assemble with commands, in version control, in CI. Trestle is the thing that turns "I have a crosswalk and I need a valid OSCAL profile" into a command instead of a week of fighting JSON. Note carefully: the *living* trestle is `oscal-compass/compliance-trestle`. There was an older NIST-hosted `usnistgov/trestle` repository, and it is dead — pointing your toolchain at it is the same class of mistake as citing an archived standard. Use the maintained one; this is the kind of supply-chain hygiene the curriculum drills everywhere.

The last move is the one that closes a loop the curriculum opened three modules ago, and it is the whole reason this module is more than "convert a spreadsheet to JSON." An OSCAL implementation statement says "control AC-2 is implemented." A Module-09 policy is the *code that enforces* AC-2 and emits evidence on every run. For years those two lived in separate worlds — the compliance document *claimed* the control was implemented; the policy engine *actually enforced* it; nothing connected the claim to the enforcement except a human's memory. **Compliance-to-Policy (C2P)** is the bridge that connects them: it maps OSCAL control IDs to the policy-as-code rules that implement them, in both directions. C2P is what lets an OSCAL document say not just "AC-2 is implemented" but "AC-2 is implemented *by this specific policy, which produces this evidence*," with the link expressed as data a machine can follow. That is the difference between a compliance package that *asserts* a control is enforced and one where the assertion is *wired to the enforcement* — the same "evidence is a byproduct, not a separate document" principle from Module 08, now spanning the entire stack from catalog to running policy.

So the full picture, smallest to largest: a **schema** (OSCAL) defines strict forms for compliance documents; a **catalog** is your control spine as data; a **profile** selects the framework's subset by importing the catalog; a **component-definition** states how specific controls are implemented; **C2P** links each implemented control by ID to the policy code that enforces it and the evidence that policy emits; and a **validator** refuses to bless any document that breaks the schema or the links. Six parts. The compliance package stops being a stack of files a human mentally joins and becomes one connected, validatable graph — and the FedRAMP world is about to require exactly that.

---

## 4. Concepts

### 4.1 Schema vs. format: the distinction the whole module rests on

A **format** says how bytes are arranged — JSON, YAML, XML. A **schema** says what a *valid document of a particular kind* must contain — which fields are required, what type each holds, which references must resolve. OSCAL is a schema layered on top of ordinary formats (it serializes to JSON, YAML, or XML — same data, your choice of encoding). The reason this matters for GRC: a format lets a machine *read* your file; a schema lets a machine *judge* it. "This catalog is missing the required `uuid` on a control" is a verdict only a schema can produce. Every guarantee in this module — validation, exchange, linking — descends from having a contract a document can violate. A shared format without a schema is a shared misunderstanding waiting to happen.

### 4.2 The catalog: your spine, as data

An OSCAL **catalog** is the structured form of a control list — the Module-10 spine, promoted from a column of IDs to a document of control objects. Minimally, a catalog carries `metadata` (title, version, last-modified, a UUID identifying *this document*) and a set of `controls`, each with a stable `id` (e.g. `ac-2`), a `title`, and one or more `parts` holding the control's statement text. A tiny catalog reads, in plain terms, as: *here is a document titled "Acme Spine," version 1.0, containing one control whose id is `ac-2`, titled "Account Management," whose statement says the organization manages information-system accounts.* The schema's job is to insist every one of those pieces is present and well-typed. Absence is the violation — a control with no `id` is not a "slightly incomplete control," it is an invalid catalog the validator rejects, because a control you can't reference by ID is useless to a profile, an implementation, or a policy link.

### 4.3 The profile: a framework as a selection over the catalog

A **profile** is the OSCAL form of "a framework is a subset of the spine." It does not copy controls; it `import`s a catalog (by reference) and declares which control IDs are *in scope* for this framework, optionally setting parameter values. This is the Module-10 crosswalk's "profile" column made mechanical: where the crosswalk said "SOC 2 cares about these spine controls," an OSCAL profile *is* that statement — an import of the catalog plus an include-list of control IDs. The discipline from Module 10 carries straight over: a profile that includes a control ID the imported catalog doesn't define is the OSCAL equivalent of a crosswalk orphan, and a validator that resolves the import will catch it. The profile is small on purpose — its entire job is to point at a catalog and say "this slice."

### 4.4 The component-definition: where a control gets implemented

A catalog says a control *exists*; a profile says it's *in scope*; neither says you actually *do* it. The **component-definition** is where implementation lives. It describes a `component` (a service, a policy, a piece of infrastructure) and, inside it, `implemented-requirements` — each one naming a `control-id` and a `description` of how this component satisfies that control. This is the machine-readable version of the sentence a GRC engineer writes a hundred times: "we satisfy AC-2 by doing X." The leverage is that `control-id` is the *same* identifier the catalog defined and the profile selected — so a machine can now answer "is every in-scope control implemented?" by joining the profile's include-list against the component-definition's implemented-requirements. The join that used to live in a human's head is now in the data.

### 4.5 Links and back-matter: how OSCAL points at things outside itself

OSCAL documents rarely stand alone — an implementation statement needs to point at the evidence, the policy, the runbook that backs it. OSCAL handles this with `links` (a `rel` describing the relationship and an `href` pointing at the target) and `back-matter` `resources` (named, UUID-addressed pointers to external artifacts). This is the structural hook the whole compliance graph hangs from: an implemented-requirement for `ac-2` can carry a link whose `rel` says "this is implemented by policy" and whose `href` points at a policy identifier. Without links, OSCAL would be an island of self-referential claims; with them, the catalog connects to the profile connects to the implementation connects — via the next concept — to the running enforcement.

### 4.6 Compliance-to-Policy (C2P): linking the OSCAL claim to the enforcing code

The Module-09 policy that denies `legacy-admin` grants and emits an evidence record is the *enforcement* of an access-control claim. The OSCAL component-definition that says "we implement AC-2" is the *documentation* of it. **C2P** is the bridge that links the two by control identifier, in both directions: OSCAL-to-policy ("this control should be enforced by these rules — generate or check them") and policy-to-OSCAL ("these policy results prove these controls — fold them back into the assessment"). For this module the load-bearing direction is the link itself: a control implementation in OSCAL that carries, as data, the identifier of the Module-09 policy that enforces it. That single link is what turns "we claim AC-2 is implemented" into "AC-2 is implemented by policy `ac-2-account-management`, which runs in CI and emits evidence." The claim is now wired to the enforcement, and the wiring is a field a machine can follow — not a sentence in a binder.

### 4.7 The validator: making the schema bite

A schema that nobody enforces is back to being a suggestion. The **validator** is the program that reads an OSCAL document and either blesses it or rejects it with a reason — exactly the gate pattern from Module 08, pointed at a governance document instead of infrastructure. A real OSCAL validator checks the full schema; the one you build in §6 checks the *load-bearing minimum* for this module's artifact: that the catalog has its required metadata and at least one control with an `id`, that the profile imports the catalog and includes only controls the catalog defines, that the component-definition's implemented-requirements name real control IDs, and that at least one control implementation carries a resolvable link to a policy identifier. Its verdict is an exit code, because the consumer is a CI pipeline, not a human. A passing exit is the EVALUATE-stage proof that the document is machine-real; a failing exit names the field or link that broke and the downstream consumer it would have broken — which is the difference between catching a malformed audit package in CI and shipping it to an assessor.

### 4.8 The volatility you are insulating against: an approaching mandate and a dead repo

Two facts make this module Tier-C volatile, and naming them is part of the skill. First, the standards landscape is moving toward *requiring* machine-readable compliance: a FedRAMP OSCAL mandate is approaching (tracked for around September 2026), after which submitting authorization packages as machine-readable OSCAL stops being a nice-to-have and becomes the format. Building the skill now means the mandate is a deadline you've already met, not a scramble. Second, tooling provenance is a live hazard: the maintained trestle is `oscal-compass/compliance-trestle`; the older NIST-hosted `usnistgov/trestle` is dead, and a related FedRAMP automation repository went archived/read-only in mid-2025 — its templates remain authoritative but must be cited with the archive caveat. The general lesson is the supply-chain discipline this curriculum repeats: a tool's *current* home and *current* status are part of its correctness, and pointing a compliance toolchain at a dead repository is a defect, not a footnote.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. The OSCAL shown is minimized for teaching — real OSCAL carries more required fields and UUIDs — and identifiers are ours. Your exact tool output and the current schema will differ in detail. (Worked examples are Tier-B content — reviewed when the OSCAL schema or the tooling shifts.)

### 5.1 The crosswalk row, promoted to a catalog control

In Module 10 your spine held an access-review control as a crosswalk target: the bare ID `AC-2`. As an OSCAL catalog control, that same idea carries the structure a machine needs to reference it. A real spine holds more than one control, so the catalog below carries two — `ac-2` and `sc-28`:

```json
{
  "catalog": {
    "uuid": "11111111-1111-4111-8111-111111111111",
    "metadata": {
      "title": "Acme Internal Control Spine",
      "version": "1.0.0",
      "oscal-version": "1.1.2"
    },
    "controls": [
      {
        "id": "ac-2",
        "title": "Account Management",
        "parts": [
          { "name": "statement",
            "prose": "The organization manages information system accounts, including periodic review of who holds access." }
        ]
      },
      {
        "id": "sc-28",
        "title": "Protection of Information at Rest",
        "parts": [
          { "name": "statement",
            "prose": "The organization protects the confidentiality and integrity of information at rest." }
        ]
      }
    ]
  }
}
```

Read it against §4.2: a document UUID identifies *this catalog*; `metadata` names and versions it; each `control` has a stable `id` (`ac-2`, `sc-28`) a profile and an implementation can later point at. The Module-10 crosswalk's lonely cell `AC-2` is now an addressable object. Nothing here is decoration — strip the `id` and a validator rejects the whole catalog, because every later link depends on that handle.

### 5.2 The framework profile, as a selection over the catalog

Module 10 said "SOC 2 is a subset of the spine." Here is that subset as an OSCAL profile that imports the catalog and selects exactly one control:

```json
{
  "profile": {
    "uuid": "22222222-2222-4222-8222-222222222222",
    "metadata": {
      "title": "SOC 2 Security — Acme Profile",
      "version": "1.0.0",
      "oscal-version": "1.1.2"
    },
    "imports": [
      {
        "href": "acme-catalog.json",
        "include-controls": [ { "with-ids": [ "ac-2" ] } ]
      }
    ]
  }
}
```

The profile copies *nothing*. It points at the catalog (`href`) and lists the control IDs in scope (`with-ids`). This is the crosswalk's "profile selects a subset of the spine," now mechanical: change the include-list, change the framework's scope, in a diffable file. And the orphan discipline from Module 10 is now machine-enforceable — list `with-ids: ["ac-9"]` when the catalog defines no `ac-9` and a resolving validator flags a dangling reference, the OSCAL form of a crosswalk orphan.

### 5.3 The control implementation, linked to the enforcing policy via C2P

Now the move that makes this more than format conversion. A component-definition states that a component implements `ac-2`, and carries a **link to the Module-09 policy** that enforces it:

```json
{
  "component-definition": {
    "uuid": "33333333-3333-4333-8333-333333333333",
    "metadata": {
      "title": "Acme IAM Service — Control Implementation",
      "version": "1.0.0",
      "oscal-version": "1.1.2"
    },
    "components": [
      {
        "uuid": "44444444-4444-4444-8444-444444444444",
        "type": "service",
        "title": "IAM Service",
        "control-implementations": [
          {
            "uuid": "55555555-5555-4555-8555-555555555555",
            "source": "acme-profile.json",
            "implemented-requirements": [
              {
                "uuid": "66666666-6666-4666-8666-666666666666",
                "control-id": "ac-2",
                "description": "Account management is enforced in CI: any change granting the legacy-admin role is denied by policy, and an evidence record is emitted on every run.",
                "links": [
                  { "rel": "policy", "href": "#policy-ac-2-account-management" }
                ]
              }
            ]
          }
        ]
      }
    ],
    "back-matter": {
      "resources": [
        {
          "uuid": "77777777-7777-4777-8777-777777777777",
          "title": "Policy: ac-2-account-management (Module 09)",
          "props": [ { "name": "policy-id", "value": "ac-2-account-management" } ]
        }
      ]
    }
  }
}
```

Trace the join. The `control-id` is `ac-2` — the *same* identifier the catalog defined (§5.1) and the profile selected (§5.2). The `links` entry has `rel: "policy"` and an `href` pointing into `back-matter`, where a resource records the policy identifier `ac-2-account-management` — the Module-09 policy. A machine can now follow a single chain: profile says `ac-2` is in scope → component-definition says `ac-2` is implemented → the implementation links to the policy that enforces it → that policy (Module 09) emits evidence on every run. The compliance *claim* is wired to the running *enforcement*, as data. This is C2P's whole point: the document doesn't just say "implemented," it says "implemented by *this*, provably."

### 5.4 The validator's verdict, the way a machine reports it

You want a verdict a CI gate can act on, not prose a human reads. Run the §6 validator over a well-formed set and it exits clean:

```
$ bun validate-oscal.ts acme-catalog.json acme-profile.json acme-component.json
catalog: "Acme Internal Control Spine" | controls: 2 (ac-2, sc-28)
profile: imports acme-catalog.json | in-scope: 1 (ac-2) | dangling: 0
component: implemented-requirements: 1 | policy-linked: 1
  ac-2 -> policy "ac-2-account-management"  [link resolves]
PASS: required fields present, profile references resolve, control is implemented and policy-linked
exit: 0
```

Now corrupt one thing — blank the catalog control's `id` — and the same validator refuses to bless it, naming the broken field *and the consumer it would have broken*:

```
$ bun validate-oscal.ts acme-catalog-broken.json acme-profile.json acme-component.json
FAIL: catalog control missing required "id"
  -> a control with no id cannot be referenced by a profile or a policy link;
     this would break any importer (an auditor's tool, a FedRAMP pipeline) downstream.
exit: 1
```

Exit code `1`, the defect named, the downstream blast radius stated — no human reading required to know the document isn't audit-ready. That exit code is the same machine-readable verdict idea from Module 01, now pointed at a compliance package the way the §6 gate is pointed at a governance artifact.

---

## 6. Guided Lab

> Original lab. ~75–120 minutes. Tier-B content (the OSCAL schema and trestle's CLI shift between releases). The full lab uses real `compliance-trestle` to author and validate OSCAL; the bundled `labs/happy-path.sh` proves the **core compliance-as-code logic** offline against a committed minimal OSCAL fixture, so the control-linking is reproducible on any clean machine with bash + coreutils (and `bun` for the validator). No network, cloud, FedRAMP account, or trestle install is required for the offline core.

**Scenario.** You are converting the Module-10 access-review crosswalk into machine-readable OSCAL and proving that a control implementation is wired to the policy that enforces it. By the end you have a schema-valid catalog, a profile that selects from it, a component-definition implementing `ac-2`, and a link from that implementation to the Module-09 policy `ac-2-account-management` — validated by a gate that fails loudly on a broken document.

> **Interactive lab.** This lab runs in your browser on the bootcamp site (Module 12 → Interactive lab) as a CI-workspace simulation: the validator it runs is a port of the committed `validate-oscal.ts`, CI-verified byte-for-byte against real `bun` runs of that script — the same documents on a real machine produce the same verdict and exit code.

**Setup.** Run `bash labs/setup.sh ./lab12`. This stages, in `./lab12/`: a minimal OSCAL catalog (`acme-catalog.json`), a profile (`acme-profile.json`), a component-definition linking `ac-2` to the policy (`acme-component.json`), a deliberately broken catalog (`acme-catalog-broken.json`), and the validator (`validate-oscal.ts`). No trestle, schema download, or network is needed for the offline core; steps marked *(real environment)* require your own `compliance-trestle` install.

**Tasks.**

1. Open `acme-catalog.json` and, *before running anything*, write down the three pieces the schema requires for the document to be a valid catalog (hint: a document UUID, metadata, and at least one control with an `id`). Then state, in one sentence, why a control with no `id` is not merely "incomplete" but *invalid*. *(Objectives 1, 2)*
2. Open `acme-profile.json`. Identify the catalog it imports and the control IDs it includes. In one sentence, explain why this profile is the OSCAL form of Module 10's "a framework is a subset of the spine," and what it would mean if it included a control ID the catalog doesn't define. *(Objectives 2, 3)*
3. Open `acme-component.json`. Find the `control-id`, the `links` entry, and the `back-matter` resource that names the policy. Trace the chain out loud: profile selects `ac-2` → component implements `ac-2` → implementation links to policy `ac-2-account-management`. State which Module-09 artifact that policy id refers to. *(Objectives 3, 6)*
4. Run the validator on the well-formed set: `bun lab12/validate-oscal.ts lab12/acme-catalog.json lab12/acme-profile.json lab12/acme-component.json`. Inspect `$?`. Confirm it reports the catalog control, that the profile's references resolve with zero dangling, and that `ac-2` is policy-linked. Capture the output into `lab12/oscal-validation-pass.txt`. *(Objectives 4, 6)*
5. Run the validator on the **broken** catalog: `bun lab12/validate-oscal.ts lab12/acme-catalog-broken.json lab12/acme-profile.json lab12/acme-component.json`. Confirm it exits non-zero and names the missing field *and* the downstream consumer the defect would break. In one sentence, state which kind of consumer (an auditor's importer, a FedRAMP pipeline, a sister team) a missing control `id` actually breaks and why. *(Objective 5)*
6. Break a *different* thing yourself: edit `acme-profile.json` to include a control ID the catalog does not define (e.g. `ac-9`), re-run the validator, and confirm it flags a dangling reference. Restore the file. Explain in one sentence why this is the OSCAL equivalent of a Module-10 crosswalk orphan. *(Objectives 4, 5)*
7. *(Real environment, optional but recommended.)* Install `compliance-trestle`, import the bundled catalog, and use trestle to validate it against the actual OSCAL schema. Then author or assemble a profile with trestle and confirm trestle's validator agrees with the offline gate's verdict on the broken document. Note any field the real schema requires that the minimal fixture omitted — that delta is exactly the Tier-C volatility this module warns about. *(Objectives 2, 4)*

**Deliverables:** `oscal-validation-pass.txt` (the captured clean run), a short written trace of the `ac-2` chain from profile to policy (task 3), a one-sentence diagnosis of the broken-catalog consumer impact (task 5), and a one-sentence explanation of the dangling-reference / orphan equivalence (task 6).

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* mini-crosswalk (a spine control or two plus one framework's selection) and a named policy identifier provided at assessment time, the learner must, unaided and within 60 minutes, deliver:

- A **schema-valid minimal OSCAL set**: a catalog containing the provided control(s) with required metadata and stable IDs, a profile that imports the catalog and selects the in-scope control(s), and a component-definition with at least one `implemented-requirement` naming a real control ID.
- A **control-to-policy link**: the implemented control must carry a resolvable link (via `links`/`back-matter`) to the provided policy identifier — the C2P linkage that ties the OSCAL claim to the enforcing code.
- A **validator run** (the learner's own or the provided one) showing the set first **failing** on an introduced defect (a missing required field *or* a dangling profile reference) and then **passing** once resolved — with exit code as the verdict — plus a written walkthrough that correctly: explains what a *schema* gives you that a shared *format* does not; names what each OSCAL layer is the machine-readable version of; traces the `control-id` join from profile to implementation to policy; and states which downstream consumer the introduced defect would have broken.

**Rubric:** score against `assessment/rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the named concept section, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below the `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are the canonical specifications and tools for learners who want the primary sources behind the schema this module teaches. None of it is load-bearing — a learner who clicks zero links still meets every objective. Note the live status caveats: tooling provenance is itself a GRC concern.*

- **OSCAL (NIST)** — the schema itself, with documentation, examples, and the layer model from §3. https://pages.nist.gov/OSCAL/ and the source/models repository https://github.com/usnistgov/OSCAL — *use to see the real required fields behind §4.2–§4.5 and the catalog/profile/component/assessment/POA&M layers in full. Monitor: a FedRAMP OSCAL mandate is approaching (~Sept 2026) — track it, per §4.8.*
- **compliance-trestle (oscal-compass)** — the maintained OSCAL authoring/validation toolkit the §6 real-environment steps use. https://github.com/oscal-compass/compliance-trestle — *use to author and validate real OSCAL against the actual schema. ⚠️ Do **not** use the dead `usnistgov/trestle` repo (§4.8) — this is the maintained home.*
- **Compliance-to-Policy / C2P (oscal-compass)** — the bridge from §4.6 that links OSCAL control IDs to policy-as-code. https://github.com/oscal-compass/compliance-to-policy — *use to see the OSCAL↔policy mapping that closes the Module 09 → Module 12 loop in real tooling.*
- **Comply (strongDM)** — an open-source SOC 2 compliance toolkit that treats policy and evidence as code. https://github.com/strongdm/comply — *use for an alternative, lighter-weight take on compliance-as-code than the full OSCAL stack.*
- **OpenControl / Compliance Masonry** — an earlier compliance-as-code data model and tooling, instructive as the conceptual predecessor to OSCAL's catalog/component split. https://github.com/opencontrol/compliance-masonry — *use to see the lineage of the §4.4 component-definition idea; note it predates OSCAL and is less actively maintained.*
- **FedRAMP (program home)** — the authoritative source for the FedRAMP OSCAL direction §4.8 tracks (the approaching machine-readable-package mandate). https://www.fedramp.gov/ — *use to follow current FedRAMP automation guidance. ⚠️ Provenance caveat: FedRAMP's old OSCAL templates lived in the `GSA/fedramp-automation` GitHub repository, which went archived/read-only in mid-2025 — still browsable, but frozen and no longer maintained. Its templates were authoritative but must be located via current FedRAMP guidance, not the archived/read-only repo. This is the §4.8 lesson made literal: a tool's current home is part of its correctness.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot. The `usnistgov/trestle` and archived-`fedramp-automation` caveats above are themselves the lesson: a tool's current status is part of its correctness.)*

---
