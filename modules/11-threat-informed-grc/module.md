# Module 11 — Threat-informed GRC & Systems/Design Thinking

*Original content. Tier 2 of the curriculum. Loop stage: **EVALUATE**. Conforms to the standard module anatomy. This module makes manifesto principles 4 and 5 concrete: a control earns its place only by mitigating a threat someone actually faces, and a control survives only if the people who feed it can do so as a by-product of their real work. Third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a colleague who has only ever managed controls against a framework checklist, why "we have a control for that" and "that control reduces a threat we actually face" are different claims — and why only the second one is defensible.
2. **Map** an organization's top threats to its controls as a coverage matrix, reading the result as two distinct signals: which threats are *under-covered* (a control gap) and which controls are *load-bearing for nothing* (a control mitigating zero mapped threats).
3. **Diagnose** a control recommended for removal or downgrade — naming the threats it was assumed to mitigate, showing it maps to none of the prioritized threats, and stating the evidence that justifies killing or demoting it rather than keeping it "just in case."
4. **Compose** a stakeholder-as-customer interview that surfaces where a control's truth actually lives — who produces the evidence, what work they were already doing, and where the control forces them to do extra work that has nothing to do with the real task.
5. **Produce** a redesigned control flow in which the evidence is a *by-product of doing the work*, not a separate compliance chore — and explain why that redesign makes the control both cheaper to run and harder to fake.
6. **Build** a small, machine-checkable threat→control coverage map plus a validator that asserts every prioritized threat has at least one mapped control and flags every control that mitigates none of them — the artifact that turns "kill controls that mitigate nothing" from an opinion into a verdict.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Most control libraries grow by accretion. A framework asks for something, so a control is added. An auditor raises a finding, so a control is added. An incident happens at another company, so a control is added. Nothing is ever removed, because removing a control feels like *taking off armor*, and no one wants to be the person who removed the control the week before the breach. The result is a library of dozens or hundreds of controls, each costing real human effort to feed and evidence, where nobody can say which threats each control actually reduces — or whether some of them reduce anything at all. This module lives at the **EVALUATE** stage of the irreducible loop, but it evaluates a different thing than Module 08 did. Module 08 evaluated a *change* against a control. Here you evaluate the *control set itself* against the threats it exists to counter. The question is brutal and clarifying: for each control, *which real threat does this make less likely or less damaging?* A control that cannot answer is not a safety margin; it is unpriced toil that competes for the attention every genuinely load-bearing control needs. Threat-informed GRC is how a control library stops being a museum of past anxieties and becomes a portfolio you can defend control by control — and the redesign half of this module is how you make the controls that survive cheap enough to actually run, by building them so the evidence falls out of the work instead of being bolted onto it.

---

## 3. The Mental Model

Start with the question this whole module exists to force: **why does this control exist?**

Ask it of any real control and you get one of three answers. The good answer is a threat: "this control exists because an attacker could steal a developer's credentials and use them to reach production, and this control makes that path harder or noisier." The mediocre answer is a citation: "this control exists because ISO Annex A asks for it." The dangerous answer is a shrug: "this control exists because it's always been here." Notice that only the first answer connects the control to *reality* — to something an adversary would actually do. The second connects it to a document. The third connects it to nothing at all. Threat-informed GRC is the discipline of demanding the first kind of answer for every control, and treating controls that can only offer the second or third kind as suspects, not assets.

To demand that answer rigorously you need a shared vocabulary for "what an attacker would actually do," and the load-bearing idea is that adversary behavior is *enumerable and stable enough to be a list*. Attackers are creative about specifics but remarkably repetitive about categories: they get an initial foothold, they establish persistence, they escalate privilege, they move laterally, they collect and exfiltrate data. These categories — the *why* of each step — are **tactics**. The specific methods inside each category — phishing a credential, abusing a scheduled task, dumping memory for passwords — are **techniques**. A mature, public taxonomy already names these tactics and techniques from real-world observation, and the single most useful thing it gives a GRC engineer is a *stable identifier* for each technique, so that "the threat we're worried about" stops being a vague phrase and becomes a specific, addressable thing you can map a control to. You do not need to memorize the taxonomy. You need to internalize that threats have stable names, the same way controls do.

Now hold two lists side by side. On the left, the threats you actually prioritize — not every technique in existence, but the handful most relevant to *your* environment, your data, your attack surface, the adversaries who would plausibly target an organization like yours. On the right, the controls you actually run. The **coverage map** is the set of lines drawn between them: *this control mitigates that threat.* And the instant you draw those lines, two defects light up that were invisible while you only looked at the lists separately.

The first defect is a **coverage gap**: a prioritized threat with no line to any control — a thing an attacker would plausibly do, against which you have nothing. This is the defect everyone expects to find and the one frameworks are decent at preventing, because frameworks push you to *add*. The second defect is the one this module cares about more, because almost no one looks for it: a **control mitigating zero mapped threats** — a control sitting on your right-hand list with no line reaching any prioritized threat on the left. The framework-driven instinct is to assume such a control must be useful somehow ("it's defense in depth"). The threat-informed instinct is the opposite: a control that maps to none of your prioritized threats is a candidate for *removal or downgrade*, and the burden of proof is on whoever wants to keep it. Maybe the threat it mitigates is real but was never prioritized — then fix the threat list. Maybe the control genuinely mitigates nothing you face — then it is pure toil wearing the costume of safety, and killing it frees capacity for controls that matter. Either way, the unmapped control is not background noise; it is a finding.

This is the part beginners resist, so be precise about it: **recommending a control for removal is a GRC engineering act, not a recklessness.** Every control has a running cost — someone collects its evidence, someone reviews it, someone re-collects it next quarter, someone explains it to an auditor. That cost is paid whether or not the control reduces any threat. A control library where every control is justified by a threat is *smaller, cheaper, and more honest* than one padded with controls no one can connect to anything — and a smaller library is one a human can actually keep operating well. The discipline is identical to the one Module 10 taught for crosswalks: let the machine catch what machines can catch (which threats have no control, which controls have no threat), and force the human to make the judgment only a human can make (is an unmapped control a real gap in the threat list, or genuinely dead weight?).

That is the *threat-informed* half. The *design* half answers a different failure mode, and you need both because a control can be perfectly threat-justified and still rot. Picture the most common shape of a control: a real threat, a genuine mitigation, and then a *separate compliance chore* bolted on to prove the mitigation is working — a quarterly attestation someone fills in by hand, a screenshot someone remembers to take, a spreadsheet someone updates the night before the audit. The threat justification is sound. The control is still fragile, because the *evidence* depends on a human doing extra work that has nothing to do with their actual job, and humans under deadline pressure skip, fake, or back-date extra work. The evidence drifts from reality not because anyone is malicious but because the system that produces it was designed as an afterthought.

The fix comes from treating the control's stakeholders as *customers* and the evidence as a *by-product*. Find the person who actually produces the control's truth — the engineer whose pull request is the access change, the system whose log already records the deployment — and look at the work they were *already doing*. The redesign principle: **arrange the control so that doing the real work correctly emits the evidence automatically.** If the access review is a thing engineers do in a tool that already records who approved what, the evidence is the tool's record, not a separate attestation. If the control is "deployments are reviewed," the evidence is the merge record the deploy already required, not a screenshot someone takes afterward. When evidence is a by-product of the work, two things improve at once: the control gets *cheaper* (no extra chore to nag people about) and *harder to fake* (you can't back-date a system record the way you can back-date a spreadsheet). A threat-informed control that mitigates a real threat, run through a design that makes its evidence a by-product of real work — that is a control worth keeping, and the rest of the curriculum is about industrializing exactly that shape.

Hold the whole model in one sentence: **list the threats you actually face, map your controls to them, kill or downgrade any control that mitigates none of them, and redesign the survivors so the evidence falls out of the work instead of being bolted on.** Everything in §4 is the vocabulary needed to do that, and everything in §6 is you doing it against a committed coverage map.

---

## 4. Concepts

### 4.1 Tactics and techniques: giving threats stable names

A control library only stays honest if a "threat" is a specific, addressable thing rather than a mood. The discipline that makes this possible separates *what an adversary is trying to achieve at a step* — a **tactic**, like "get an initial foothold" or "move to another host" — from *how they do it* — a **technique**, like "send a phishing link" or "abuse a valid account." A technique carries a **stable identifier** that does not change between conversations, so the threat you mean today is provably the same threat you meant last quarter. This matters for the same reason a scanner's rule ID mattered in Module 08 and a control ID mattered in Module 10: you cannot build a checkable map out of vague phrases. "We're worried about phishing" is a feeling; "we prioritize the credential-phishing technique with identifier T-xxxx as one of our top five threats" is a row in a table you can map a control to and validate. You do not memorize the catalog of techniques; you adopt the habit of naming each prioritized threat by a stable identifier so it can anchor a coverage line.

### 4.2 Threat prioritization: your top threats, not every threat

The public threat taxonomy lists hundreds of techniques. Mapping every one of them to controls is neither possible nor useful — most are irrelevant to any given organization. The first real act of threat-informed GRC is **prioritization**: selecting the handful of techniques that genuinely matter for *your* environment, based on your data, your attack surface, and the adversaries who would plausibly target an organization shaped like yours. A payments company prioritizes differently than a hospital. The output is a short, deliberate, *owned* list — your **top threats** — each named by a stable identifier and each with a one-line rationale for *why it made the cut*. This list is the left-hand column of every coverage map you build, and like the standards spine in Module 10, it is an artifact you own and revise as your environment changes — not a list a vendor hands you. A coverage map is only as honest as the threat list it maps against, so the prioritization rationale is part of the artifact, not a throwaway.

### 4.3 The coverage map: lines between threats and controls

A **coverage map** is a table whose atomic unit is one line: *this control mitigates this threat.* In the simplest honest form, a row names a threat (by stable identifier), names a control (by your own control ID), and — like a crosswalk relationship label — carries a **mitigation strength** so the line is honest rather than aspirational. A control rarely *eliminates* a threat; more often it *reduces likelihood* (makes the technique harder to pull off) or *reduces impact* (makes it less damaging when it succeeds) or merely *detects* it (so you find out faster). Recording the strength — say `prevents` / `detects` / `partial` — stops the map from claiming a flimsy control fully neutralizes a serious threat. A row reads:

```
threat_id,threat_name,control_id,mitigation
T-1566,Phishing for credentials,CTRL-MFA-01,partial
```

Read it as a sentence: "the phishing-for-credentials threat is *partially* mitigated by our MFA control" — partial, because MFA raises the cost of a stolen password but does not stop a determined phishing kit that also captures the second factor. The mitigation label is the same honesty discipline as Module 10's relationship label: a map where every line silently claims `prevents` is the false-confidence defect industrialized.

### 4.4 The two defects: coverage gaps and zero-threat controls

Draw the lines and two defects become mechanically detectable. A **coverage gap** is a prioritized threat (a left-column entry) with no line reaching any control — something you decided matters, against which you run nothing. The fix is to add or strengthen a control, and frameworks are reasonably good at preventing this defect because they push you to add. The **zero-threat control** is the mirror image and the one this module exists to surface: a control (on your control list) that no line connects to any prioritized threat. Frameworks are *blind* to this defect because they never ask you to remove anything. The validator you build in §6 catches both mechanically — for every prioritized threat, assert at least one mapped control; for every control in scope, assert it appears on at least one line to a prioritized threat — and a zero-threat control fails the build until a human resolves it. "Resolve" does not mean "delete on sight": it means a human decides whether the threat it mitigates was wrongly left off the priority list (fix the list) or the control genuinely mitigates nothing you face (kill or downgrade it).

### 4.5 Kill, downgrade, or keep: deciding what a zero-threat control deserves

A control that maps to none of your prioritized threats gets one of three verdicts, and naming them is the skill. **Kill** — remove the control entirely — when it mitigates nothing you face and its running cost buys nothing; the gain is the toil you stop paying. **Downgrade** — keep the control but stop treating it as load-bearing — when it offers marginal value (a little defense in depth, a low-cost log you'd glance at) but does not deserve the evidence-collection effort of a top control; you move it to a cheaper, lower-ceremony tier. **Keep, and fix the threat list** — when the control actually mitigates a real threat that simply wasn't prioritized; here the control was fine and the *map* was wrong, so you add the threat to §4.2's list and draw the line. The verdict must be *evidence-based*: you name the threats the control was assumed to mitigate, show it maps to none of the prioritized ones, and state which of the three verdicts follows and why. "We've always had it" is not evidence; "it maps to zero prioritized threats and costs four hours of quarterly attestation for marginal log value, so we downgrade it" is.

### 4.6 Stakeholder-as-customer: finding where a control's truth lives

The threat-informed half decides *which* controls survive. The design half decides whether the survivors are runnable. It starts by treating the people who feed a control as its **customers** and interviewing them to find where the control's *truth* actually lives. The questions are concrete: *Who actually produces the evidence for this control? What work were they already doing when they produce it? Where does the control make them do something extra — something that isn't part of their real task — purely to prove the control works?* The answers almost always reveal that the control's truth lives in a system the work already touches (a code review tool, a deployment log, an identity provider) while the *evidence* is being collected somewhere else entirely (a manual attestation, a screenshot, a spreadsheet) by someone doing extra work. That gap — between where the truth lives and where the evidence is gathered — is the design defect. The interview's job is to locate it precisely, in the customer's own words, rather than guessing from the control's documentation.

### 4.7 Evidence as a by-product: the control UX redesign

Once you know where a control's truth lives, the redesign principle is simple to state and hard to resist over-engineering: **make doing the real work correctly emit the evidence automatically, so producing evidence costs no extra human effort.** If the truth of "access changes are reviewed" lives in the pull request that makes the change, the evidence is the PR's recorded approval — not a separate quarterly attestation. If the truth of "deployments are tested" lives in the pipeline that ran the tests, the evidence is the pipeline's record — not a screenshot. The redesign turns a *separate compliance chore* into a *by-product of the work*, and that single move improves the control on two axes at once. It gets **cheaper**: no one is nagged to do extra work, so the evidence stops depending on a busy human remembering a chore. And it gets **harder to fake**: a system-generated record of work that actually happened cannot be back-dated the way a manually-maintained spreadsheet can, so the evidence is more trustworthy precisely because no human hand-produced it. A redesigned control flow is described as a small before/after: here is the toil-laden flow the interview exposed, here is the flow where evidence is a by-product, and here is the threat it still mitigates — because a control redesigned for cheap evidence still has to earn its place by mitigating something real.

### 4.8 Why the coverage map and the redesign are one artifact

These two halves are not separate exercises that happen to be in the same module; they are the front and back of the same control-portfolio decision. The coverage map tells you *which* controls deserve to exist (the ones mapped to prioritized threats). The redesign tells you *how* the survivors should be built (so their evidence is a by-product). Run them together and you get a portfolio that is small (no zero-threat controls), defensible (every control names its threat), and *operable* (every surviving control emits evidence as a by-product of real work). That combined artifact — a threat→control coverage map with at least one evidence-based removal recommendation, plus one redesigned stakeholder-facing control flow — is what the capstone in Module 15 demands for the single control each engineer ships: threat-informed *and* designed-left. You are hand-authoring, in its simplest form, the reasoning the capstone later expects you to apply to a real control end-to-end.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Threat identifiers, control IDs, and data are ours and simplified for teaching; a real coverage map has more rows and uses the official current technique numbering. (Worked examples are Tier-B content — reviewed when the threat taxonomy revises.)

### 5.1 Four controls, five threats, and the map that exposes both defects

Your team prioritized five threats for a SaaS environment and runs four controls. Here is the coverage map, one line per *real* mitigation the team could defend:

```
threat_id,threat_name,control_id,mitigation
T-1566,Phishing for credentials,CTRL-MFA-01,partial
T-1078,Abuse of valid accounts,CTRL-MFA-01,partial
T-1078,Abuse of valid accounts,CTRL-ACCESS-REVIEW-02,detects
T-1530,Data theft from cloud storage,CTRL-BUCKET-ENC-03,partial
T-1486,Data encrypted for ransom,,
T-1110,Brute-force of credentials,CTRL-MFA-01,prevents
```

Now read the two defects straight off the map. There is a **coverage gap** on `T-1486` (data encrypted for ransom): the threat is prioritized but its `control_id` is empty — no control reaches it. And there is a **zero-threat control**: `CTRL-DLP-AGENT-04`, which the team runs and pays to operate, appears on *no line at all* — it maps to none of the five prioritized threats. The first defect frameworks would have caught (add a backup/recovery control for `T-1486`). The second defect is the one only a threat-informed pass surfaces: a control consuming effort while connected to nothing the team decided it faces. Note also the honest mitigation labels — `CTRL-MFA-01` is `partial` against phishing (a kit can capture the second factor) but `prevents` against blind brute-force (no password guess survives a second factor). One control, two threats, two different honest strengths.

### 5.2 The verdict on the zero-threat control, made evidence-based

`CTRL-DLP-AGENT-04` maps to zero prioritized threats. The framework instinct says "keep it, it's defense in depth." The threat-informed pass forces a documented verdict instead:

```
control_id: CTRL-DLP-AGENT-04
assumed_to_mitigate: "data exfiltration generally"
maps_to_prioritized_threats: 0
running_cost: endpoint agent on every laptop; weekly false-positive triage (~3 hrs/wk)
verdict: DOWNGRADE
rationale: The exfiltration threat we actually prioritized is T-1530 (cloud-storage theft),
  which the agent does not touch — it watches endpoints, not the cloud data path. It mitigates
  no prioritized threat. It is not killed outright because it produces low-value telemetry we
  occasionally consult, so it moves to a best-effort, no-attestation tier rather than a
  load-bearing control. Capacity freed from weekly triage is redirected to T-1486 coverage.
```

Read what makes this defensible. It *names* the threat the control was assumed to mitigate, *shows* the prioritized threat it was confused with (`T-1530`, which lives on a different data path), *quantifies* the running cost, and *chooses* downgrade over kill with a stated reason. That is a GRC engineering decision, not a hunch — and crucially, the freed capacity is pointed at the real gap (`T-1486`). The map didn't just trim toil; it reallocated effort toward an actual exposure.

### 5.3 The stakeholder interview that locates a control's design defect

Take `CTRL-ACCESS-REVIEW-02` — "production access is reviewed quarterly," mitigating `T-1078` (abuse of valid accounts). It maps to a real threat, so it survives §5.2. But is it runnable? You interview its customer — the engineering lead who signs off the review:

> *Who produces the evidence?* "I do. Every quarter I get a spreadsheet of who has prod access, I go down it, and I sign a PDF saying I reviewed it."
> *What were you already doing?* "Honestly? Access changes happen in our access-request tool — someone requests, I approve or deny, it's all in there with timestamps. The quarterly thing is separate. I'm re-reviewing in a spreadsheet what I already approved one at a time in the tool."
> *Where's the extra work?* "The whole spreadsheet-and-PDF is extra. The real decisions already happened in the tool. The quarterly review is me re-typing the tool's truth into a format the auditor likes."

The interview located the defect exactly: the control's *truth* lives in the access-request tool (timestamped approvals), but the *evidence* is a hand-built spreadsheet and a signed PDF — extra work that re-states truth the tool already holds. The control mitigates a real threat; its *UX* makes the evidence a chore, which means it drifts (skipped quarters, back-dated PDFs) under deadline pressure.

### 5.4 The redesign: evidence as a by-product, same threat mitigated

You redesign `CTRL-ACCESS-REVIEW-02` so the evidence falls out of the work the engineering lead already does:

```
BEFORE (toil-laden):
  Work:     Lead approves/denies access requests in the access tool (real work).
  Evidence: Lead separately fills a quarterly spreadsheet and signs a PDF (extra chore).
  Failure:  Under deadline, the quarterly chore is skipped or back-dated; evidence drifts.

AFTER (evidence as by-product):
  Work:     Lead approves/denies access requests in the access tool (UNCHANGED real work).
  Evidence: A scheduled export of the tool's approval log IS the review record — every grant
            has an approver, a timestamp, and a justification, generated by the tool.
  Why better (cheaper): No quarterly chore exists; the evidence is produced by the work itself.
  Why better (harder to fake): A system approval log can't be back-dated the way a hand-built
            spreadsheet can — the evidence is trustworthy precisely because no human typed it.
  Still mitigates: T-1078 (abuse of valid accounts) — unchanged; the threat justification holds.
```

The threat justification did not change — the control still earns its place by mitigating `T-1078`. What changed is the *UX*: the evidence is now a by-product of the approvals the lead was always making, so the control is cheaper to run and harder to fake at the same time. This is the shape every surviving control should be bent into, and it is exactly what the capstone means by "designed-left."

---

## 6. Guided Lab

> Original lab. ~60–90 minutes. Tier-B content (the threat taxonomy revises periodically). You need a Unix-like shell and either `bun` or the bundled fallback; no network, cloud, or external account required. The fixtures are committed. The bundled `labs/happy-path.sh` proves the **coverage-map evaluation logic** offline against committed fixtures, so the core control reasoning is reproducible on any clean machine with bash + coreutils + awk.

**Scenario.** You inherit a control library that grew by accretion. You will map a committed set of prioritized threats to the controls actually in place, run a validator that surfaces both defects — a threat with no control (coverage gap) and a control mitigating no prioritized threat (zero-threat control) — recommend the zero-threat control for removal or downgrade with evidence, and redesign one surviving control so its evidence becomes a by-product of real work.

**Setup.** From this module's `labs/` directory, run `bash setup.sh ./work` to stage the fixtures: `prioritized-threats.txt` (the team's owned top-threat list, one stable threat ID per line), `coverage-map.csv` (a seed map with honest mitigation labels, containing one deliberate coverage gap and engineered so one in-scope control maps to nothing), `controls-in-scope.txt` (the controls the team runs, so the validator knows which controls *should* appear on the map), and the validator `validate-coverage.ts`.

**Tasks.**

1. Open `prioritized-threats.txt`, `controls-in-scope.txt`, and `coverage-map.csv`. In one sentence each, state what the threat list *is* (the left column — the threats the team decided it faces), what the in-scope control list *is* (the right column — the controls actually run), and what a coverage-map row *is* (one threat → one control + an honest mitigation strength). *(Objective 2)*
2. Run the validator unresolved: `bun validate-coverage.ts work/coverage-map.csv work/prioritized-threats.txt work/controls-in-scope.txt` (or the provided fallback). Confirm it exits non-zero and reports *both* defects by name: the prioritized threat with no mapped control, and the in-scope control that maps to zero prioritized threats. Capture the output into `validation-before.txt`. *(Objectives 2, 6)*
3. For the **coverage gap** (the prioritized threat with no control), decide whether to add or strengthen a control, and add a row mapping it to the right control with an honest mitigation label (`prevents` / `detects` / `partial`). Explain in one sentence why you chose that label rather than a stronger one. *(Objective 2)*
4. For the **zero-threat control**, write a documented verdict (`kill` / `downgrade` / `keep-and-fix-threat-list`) into `removal-recommendation.md`. It must: name the threat the control was *assumed* to mitigate, show it maps to none of the prioritized threats, state the running cost, and justify the verdict with evidence — not "we've always had it." If your verdict is `keep-and-fix-threat-list`, add the missing threat to `prioritized-threats.txt` and draw the line instead. *(Objective 3)*
5. Re-run the validator on your edited map. Confirm it now exits `0` — every prioritized threat has a control, and every in-scope control maps to at least one prioritized threat (or has been removed from scope by your `kill` verdict). Capture the output into `validation-after.txt`. *(Objective 6)*
6. Pick one *surviving* control (one mapped to a real threat). Conduct a stakeholder-as-customer interview using the four questions from §4.6 — improvise the customer's answers if you have no real stakeholder handy, but make them concrete — and write them into `interview-notes.md`, ending with one sentence naming where the control's *truth* lives versus where its *evidence* is currently gathered. *(Objective 4)*
7. Redesign that control as a before/after in `redesigned-control-flow.md`, following §5.4's shape: the toil-laden flow, the flow where evidence is a by-product of real work, one sentence on why it's cheaper, one sentence on why it's harder to fake, and the threat it still mitigates. *(Objective 5)*

**Deliverables:** the edited `coverage-map.csv` (validator-clean), `validation-before.txt` and `validation-after.txt` showing both defects caught then resolved, `removal-recommendation.md` (the evidence-based kill/downgrade verdict), `interview-notes.md`, and `redesigned-control-flow.md`.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* control library and threat list provided at assessment time (a prioritized threat list drawn from the real taxonomy, an in-scope control list, and a partially-filled coverage map with at least one coverage gap and at least one control engineered to map to nothing), the learner must, unaided and within 60 minutes, deliver:

- A **completed threat→control coverage map** (CSV or JSON) in which every prioritized threat maps to at least one control with an honest mitigation label, validated by a run showing the map first **failing** on both defects (a coverage gap and a zero-threat control) and then **passing** once resolved — with exit code as the verdict.
- An **evidence-based removal recommendation** for at least one control: naming the threats it was assumed to mitigate, showing it maps to none of the prioritized threats, stating its running cost, and choosing `kill` / `downgrade` / `keep-and-fix-threat-list` with a defensible rationale.
- A **redesigned stakeholder-facing control flow** for one surviving control, presented as a before/after, in which the evidence is a by-product of doing the real work — with a stated reason why the redesign makes the control both cheaper to run and harder to fake, and a statement of the threat the control still mitigates.
- A short **walkthrough** that correctly: explains the difference between "we have a control for that" and "that control mitigates a threat we face"; reads two coverage-map rows and justifies their mitigation labels; and identifies which control the assessor planted as a zero-threat control and the verdict it deserves.

**Rubric:** score against `assessment/rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the named concept section, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below the `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are the canonical sources behind the threat taxonomy this module models, for learners who want the primary references. None of it is load-bearing — a learner who clicks zero links still meets every objective.*

- **MITRE ATT&CK®** — the public knowledge base of adversary tactics and techniques (with their stable IDs) that §4.1 models. https://attack.mitre.org/ — *use to see the real tactic/technique structure and to look up the stable identifiers your prioritized-threat list should reference.*
- **MITRE ATT&CK® Navigator** — the open-source web tool for building layered, color-coded views of the ATT&CK matrix — exactly the visual coverage-map this module teaches you to reason about. https://github.com/mitre-attack/attack-navigator — *use to render your prioritized-threat list as a layer and overlay control coverage on top of the real matrix; a live instance is linked from the repository.*
- **MITRE Center for Threat-Informed Defense** — the MITRE-operated R&D consortium (formerly under MITRE Engenuity) that publishes threat-informed-defense research, including mappings from controls to ATT&CK techniques. https://ctid.mitre.org/ — *use for published control-to-technique mappings that sanity-check your own §4.3 coverage lines, and for the research framing behind "map controls to the threats they actually mitigate."*
- **MITRE D3FEND™** — a knowledge base of defensive countermeasure techniques and their relationships to offensive ATT&CK techniques. https://d3fend.mitre.org/ — *use for the complementary defensive angle: it names countermeasures and ties them back to the attacker techniques they counter, which is §4.3's threat→control line done at catalog scale.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
