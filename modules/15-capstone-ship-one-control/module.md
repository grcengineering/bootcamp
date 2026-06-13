# Module 15 — Capstone: Ship One Control, Fully Engineered

*Loop stage: OWN (the whole loop). Tier 4 — GRC-as-Product. This is the synthesis module: it has almost no new facts to teach. Its job is to make you take everything from Modules 1–14 and converge it onto a single real control, end to end, then prove — with a measurable before/after of that same control — that the program changed how the work gets done.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Map** one real control onto all seven stages of the irreducible loop (UNDERSTAND → LOCATE → QUERY → EVALUATE → EVIDENCE → MONITOR → OWN), and **name** which concrete artifact discharges each stage — so that no stage is left implicit or assumed.
2. **Build** a single shippable control repository that integrates the threads from the whole program: threat-informed design, policy-as-code enforcement, automated evidence collection, continuous monitoring with drift alerting, and an OSCAL expression crosswalked to the standards spine.
3. **Produce** a control-as-product README that treats the control like a real product — naming its customers, its owner, its backlog, its UX rationale, and the metric by which its success is judged.
4. **Compose** a before/after writeup that places the *same* control's legacy state beside its engineered state, and **diagnose** the delta against the five legacy-GRC problems — turning "we improved it" into a defensible, evidence-backed claim.
5. **Diagnose** a capstone submission against a coverage rubric: given a repository and its manifest, **describe** exactly which loop stages are genuinely satisfied, which are merely claimed, and what would have to be true to close each gap.
6. **Explain**, to a stakeholder who has never read the manifesto, why this one shipped control is more trustworthy than its legacy predecessor — using the before/after and the live monitoring as the argument, not assertion.

Each objective is checked by the Assessment in §7. This module has no placement test: the capstone *is* the terminal assessment of the entire curriculum. If you can already produce the §7 artifact unaided, you have finished the program.

---

## 2. Why this matters for GRC

Every prior module taught one stage of the loop in isolation: the shell to QUERY, APIs to LOCATE and EVIDENCE, policy-as-code to EVALUATE, continuous monitoring to MONITOR, OSCAL to express, product thinking to OWN. A loop is not the sum of its stages, though — it is the property that they connect, that the output of one becomes the input of the next, and that the whole thing runs again tomorrow without a human re-typing anything. A control that is monitored but has no owner rots; a control that is owned but collects evidence by hand is toil wearing a product's clothing; a control expressed in OSCAL that nobody enforces is a document, not a control. The capstone exists because *integration is the actual skill* — and because the only honest proof that the program worked is to show the same control before and after and let the delta speak. That before/after is this module's reason to exist: it converts "we trained the team" from a claim into evidence.

---

## 3. The Mental Model

Start from the uncomfortable truth this whole curriculum has been circling: **a control is a promise, and most promises are unfalsifiable.** "Access is least-privilege." "Laptops are encrypted." "Production changes are reviewed." Said aloud in a meeting, these are vapor. The legacy way of making them feel solid was to write them down in a policy document, photograph the system once a year during an audit, and store the photograph. The promise was never actually kept *continuously* — it was kept *at the moment of the photograph*, and assumed to hold the rest of the year. GRC engineering is the discipline of making the promise falsifiable every single day, automatically, with the falsification itself producing the proof. The capstone is where you do that, once, all the way through, for one real thing.

Here is the mental shift that makes the capstone tractable rather than overwhelming. You are not building seven different things. You are building **one pipeline that a claim flows through**, and each stage of the loop is a transformation that the claim survives or fails. Picture the claim as a physical object moving down a conveyor belt. At UNDERSTAND, you pick the object up and read its label — *what is actually being promised, and to whom?* At LOCATE, you find where the truth of that promise physically lives — not where the policy says it should live, but the actual config setting, API field, log line, or database row that is the ground truth. At QUERY, you reach that truth with code, so a machine can fetch it instead of a person screenshotting it. At EVALUATE, you compare the fetched truth against the promise *expressed as code* — a policy that returns pass or fail, not a human squinting at a spreadsheet. At EVIDENCE, the result is written down durably and immutably, timestamped, versioned, so an auditor a year from now can see not just today's answer but the whole history. At MONITOR, the belt loops: the same fetch-and-evaluate runs on a schedule, and the moment the truth drifts away from the promise, an alert fires. At OWN, you step back and treat the whole belt as a product — it has customers who depend on it, an owner whose name is on it, a backlog of its known gaps, and a metric that says whether it's working.

The reason a control "fully engineered" feels different from a control "implemented" is that engineering means **the promise is checked by the system, not by a person remembering to check.** A human will forget, get busy, leave the company, or quietly decide the check isn't worth the friction this quarter. The pipeline does not forget. That difference — between a check that depends on human diligence and one that runs whether or not anyone is watching — is the entire value proposition, and it is exactly what your before/after has to make visible.

Now the part that separates a real capstone from a demo. A demo shows the happy path once and takes a bow. A shipped control has to answer the questions a demo never faces: *Who fixes it when it breaks? Where do its known gaps live so they aren't forgotten? What does "working" mean in a number? Who is it actually for?* These are product questions, and they are not decoration on top of the engineering — they are the thing that keeps the engineering alive past the day you built it. A control without an owner is a control that will rot, and a rotting control is *worse* than no control because it produces evidence that everyone trusts right up until the moment it's quietly wrong. So the capstone is not "make the pipeline run." It is "make the pipeline run, and make it the kind of thing that *keeps* running because someone owns it and can prove it's worth owning."

Finally, the before/after. It is tempting to treat it as a write-up you bolt on at the end to satisfy the rubric. Resist that. The before/after is the **experiment** the whole program was running, and your capstone is the result. Back in week zero you wrote down where one real control sat against the five legacy problems — the manual toil, the transactional stakeholder relationship, the shallow whack-a-mole fix, the closed-framework fixation, the commoditized checkbox. The engineered version of that *same* control is the treatment. Laying them side by side and measuring the delta is not paperwork; it is the falsifiable claim that GRC engineering does something. If the after isn't measurably better than the before on at least the dimensions you targeted, you have learned something real and important — and you should say so, because honest negative results are how a program improves. The capstone's deepest lesson is that the discipline you spent the program learning is itself subject to the discipline: state the claim, instrument it, measure it, own the answer.

---

## 4. Concepts

### 4.1 The seven stages as a coverage checklist, not a vibe

The loop is the rubric. The single most common failure mode in a capstone is to do five stages beautifully and gesture vaguely at the other two. So make coverage explicit and mechanical: for each of the seven stages, write down the *one artifact in your repo that discharges it*. UNDERSTAND is the control statement and the threat it addresses, written in your own words. LOCATE is the named place the truth lives (e.g., "the `BlockPublicAcls` field of each S3 bucket's public-access-block config"). QUERY is the code that fetches it. EVALUATE is the policy-as-code rule that judges it. EVIDENCE is the durable, versioned record the run emits. MONITOR is the scheduler config plus the drift alert. OWN is the product README. A stage with no artifact next to it is a gap, full stop — and naming the gap honestly beats pretending it's covered.

```
UNDERSTAND  ->  control-statement.md + threat mapping
LOCATE      ->  the documented ground-truth location of the claim
QUERY       ->  collect.(sh|py)  — fetches the live state
EVALUATE    ->  policy.(rego|cedar) — returns pass/fail
EVIDENCE    ->  evidence/run-<ts>.json — durable, versioned
MONITOR     ->  schedule + alert-on-drift
OWN         ->  README.md (customers, owner, backlog, metric, UX)
```

### 4.2 The capstone manifest — making coverage machine-checkable

Claiming coverage in prose is not enough; the curriculum is GRC-engineered, so the capstone proves its own coverage the same way a control proves its own compliance. The device is a small **manifest** file checked into the repo that maps each loop stage to the artifact that satisfies it, plus a pointer to the before/after writeup. A validator reads the manifest and asserts that all seven stages are present and the before/after exists — exactly the way a control check reads a snapshot and asserts the claim. This is deliberately recursive: you are practicing continuous assurance *on your own capstone*. A tiny example of the shape (full schema in the lab):

```yaml
control: "S3 buckets block public access (SOC 2 CC6.1)"
loop_coverage:
  UNDERSTAND: control-statement.md
  LOCATE:     control-statement.md#ground-truth
  QUERY:      collect.sh
  EVALUATE:   policy/public_access.rego
  EVIDENCE:   evidence/
  MONITOR:    .github/workflows/ccm.yml
  OWN:        README.md
before_after: before-after.md
```

### 4.3 Integration is where the seams are — and seams are where controls fail

Each prior module's artifact worked in isolation. The capstone's real difficulty is the *seams* between them: the QUERY step's output must be exactly the input the EVALUATE step expects; the EVALUATE verdict must be what the EVIDENCE step records; the MONITOR schedule must invoke the same code path the manual run did, or you are monitoring a different thing than you tested. A control that "works when I run the steps by hand" but breaks when the scheduler runs them is not shipped — it is a pile of parts. Treat the seams as first-class: the test that matters is the whole pipeline running unattended, start to finish, and producing the same verdict it produced by hand. If the hand-run and the scheduled run disagree, the scheduled run is the truth, because that's the one that will actually run in production.

### 4.4 A control is a product: customers, owner, backlog, metric, UX

"Own it as a product" is the manifesto principle that most people nod at and least often do. Made concrete, it is five named things. **Customers:** who depends on this control's output? The auditor who needs the evidence, the engineer whose pipeline it gates, the executive who reports the posture. **Owner:** one name, accountable, not a team alias — the person a red dashboard tile escalates to. **Backlog:** the known gaps and next improvements, written down where they won't be forgotten (the control you couldn't fully automate yet, the edge case the policy doesn't cover). **Metric:** the single number that says whether it's working — e.g., mean time to detect drift, percentage of evidence collected with zero manual touch, or false-positive rate of the alert. **UX:** the rationale for why the evidence is a *by-product of doing the work* rather than extra work bolted on — the design-thinking move that makes the control something stakeholders cooperate with instead of route around. A README that names these five is the difference between a control that survives its author's departure and one that doesn't.

### 4.5 The before/after is a controlled comparison, not a brag

The week-0 analysis is your baseline measurement; the capstone is the treatment. To make the comparison defensible, hold the *control* constant (literally the same control) and vary only the *engineering*, then measure the same dimensions on both sides. Good before/after dimensions are concrete and, ideally, numeric: how long evidence collection took (hours of human time → minutes of machine time), how often the control was actually checked (once a year at audit → continuously), how drift was detected (never, until the next audit → within minutes, via alert), and where the control sits on each of the five legacy problems. The honest version names what did *not* improve, too. A before/after that is all upside with no residual gaps is not credible; a reviewer should be able to find the seams you're still working on in your own backlog.

### 4.6 "Done" is falsifiable, and the rubric is the falsifier

The hardest discipline in a synthesis module is knowing when you're finished, because there is always one more polish. Borrow the definition of done you've used all program: done is when the artifact *survives the test*. Here the test is the §7 rubric, and crucially, a *different person* runs it against your repo from a clean checkout. If their independent reproduction of your pipeline produces the verdict your evidence claims, and your manifest's coverage assertions hold, and your before/after measures the same control on the same dimensions — you are done. If any of those fail, you are not, regardless of how polished the parts look in isolation. This is the curriculum's final lesson restated in its own terms: a claim you make about your own work is not evidence; a claim a second party can independently reproduce is.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. The control, the data, and the manifest shape are ours; your capstone control will differ. Representative output is shown — your exact files and numbers will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 Mapping one real control onto all seven stages

Take a concrete control: *"All S3 buckets block public access"* (mapped to SOC 2 CC6.1). Before writing any code, fill the coverage table — this is the UNDERSTAND-to-OWN scaffold the rest of the capstone hangs on.

```
Stage        Artifact that discharges it
----------   ----------------------------------------------------------
UNDERSTAND   control-statement.md — the claim + the threat (public data
             exposure) it mitigates, in our words
LOCATE       the four public-access-block fields on each bucket's config
             (BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls,
             RestrictPublicBuckets) — documented in control-statement.md
QUERY        collect.sh — pulls each bucket's public-access-block config
EVALUATE     policy/public_access.rego — passes only if all four true
EVIDENCE     evidence/run-<timestamp>.json — verdict + the raw state
MONITOR      a scheduled job that re-runs collect+evaluate and alerts
             when any bucket fails
OWN          README.md — customers, owner, backlog, metric, UX
```

The value of doing this *first* is that the gaps announce themselves. If you can't name the LOCATE artifact, you don't yet understand where the truth lives — and no amount of clever EVALUATE code will save a control that fetches the wrong field.

### 5.2 The capstone manifest and its self-check

You commit a `capstone-manifest.yaml` that makes the coverage table machine-readable, and a validator that asserts it — the curriculum eating its own dog food.

```yaml
# capstone-manifest.yaml
control: "S3 buckets block public access (SOC 2 CC6.1)"
owner: "a.engineer@example.com"
loop_coverage:
  UNDERSTAND: control-statement.md
  LOCATE:     control-statement.md
  QUERY:      collect.sh
  EVALUATE:   policy/public_access.rego
  EVIDENCE:   evidence/
  MONITOR:    .github/workflows/ccm.yml
  OWN:        README.md
before_after: before-after.md
```

Running the validator against it:

```
$ ./validate-capstone.sh capstone-manifest.yaml
checking loop coverage...
  UNDERSTAND  ok  -> control-statement.md
  LOCATE      ok  -> control-statement.md
  QUERY       ok  -> collect.sh
  EVALUATE    ok  -> policy/public_access.rego
  EVIDENCE    ok  -> evidence/
  MONITOR     ok  -> .github/workflows/ccm.yml
  OWN         ok  -> README.md
checking before/after... ok -> before-after.md
PASS: all 7 loop stages covered; before/after present
```

The verdict line *is* the gate. If a stage were missing, the validator would name it and exit non-zero — the same pattern as every control check in the program, now pointed at your own deliverable.

### 5.3 The before/after, made measurable

The week-0 analysis said this control was checked once a year by a human pulling the bucket list and eyeballing it — roughly four hours of toil, no detection of mid-year drift, and squarely in legacy problems #1 (manual toil) and #5 (commoditized checkbox). The engineered version is laid beside it on the same dimensions:

```
Dimension                  Before (legacy)         After (engineered)
-------------------------  ----------------------  --------------------------
Evidence collection effort  ~4 hrs human, annual    ~seconds, machine, on every run
Check frequency             once/year at audit      every 6 hours + on change
Drift detection             none until next audit   alert within one schedule cycle
Evidence durability         a screenshot in a drive versioned JSON, full history
Legacy problem #1 (toil)    high                    eliminated for this control
Legacy problem #5 (checkbox)checkbox                meaningful, continuous outcome
Residual gap (honest)       —                       new buckets covered only at next
                                                    run; backlog item to hook creation
```

Notice the last row. The honest before/after names the seam that's still open — newly created buckets aren't caught until the next scheduled run — and points to where that gap lives in the backlog. A reviewer trusts this comparison *more* because it admits a limitation, not less.

### 5.4 Diagnosing a weak capstone (reading a submission critically)

A peer's capstone claims all seven stages, but reading it against the rubric surfaces a classic failure: their MONITOR is a scheduled job that runs `collect.sh` and stores the output, but nothing *evaluates* the output on the schedule and nothing *alerts* on drift. The pipeline collects forever and notices nothing.

```
Stage        Claimed   Actually satisfied?
----------   -------   -------------------------------------------------
EVALUATE     yes       yes — policy runs in the manual path
MONITOR      yes       NO — schedule collects but never evaluates/alerts;
                       this is logging, not monitoring (see §4.3 seams)
```

The diagnosis is precise and routable: the seam between the scheduled QUERY and the EVALUATE step was never connected, so drift is collected but never judged. The fix isn't more code in the parts — it's wiring the existing EVALUATE into the scheduled path so the verdict, not just the raw state, is what monitoring produces. This is exactly the §5 diagnosis skill the assessment checks: distinguishing a stage that is *done* from one that is merely *claimed*.

---

## 6. Guided Lab

> Original lab. This is the capstone, so the "lab" is mostly orchestration of work you've already learned to do — the new skill is integration, coverage, and the before/after. Budget the bulk of the capstone for your real control in your real environment; this guided portion stands up the *coverage scaffold and self-check* that the full capstone hangs on. Tier-B content (environment-dependent for the real control; the scaffold itself is environment-free).

**Scenario.** You are shipping one real control end to end and proving it covers all seven loop stages, with a measurable before/after of the same control. You will build the manifest-and-validator scaffold that makes your coverage machine-checkable, then attach your real artifacts to it.

> **Interactive lab.** This lab runs in your browser on the bootcamp site (Module 15 → Interactive lab) as a capstone-repo simulation: the repo it seeds is byte-identical to what `labs/setup.sh` writes, and every coverage verdict comes from a port of `validate-capstone.sh` that CI verifies byte-for-byte against real `bash` runs of that script — the same manifest on a real machine produces the same per-stage transcript and exit code.

**Setup.** Run `bash labs/setup.sh "$PWD/capstone-lab"`. It writes a starter capstone repo: a `capstone-manifest.yaml`, placeholder artifacts for each loop stage, a `before-after.md` skeleton, and the `validate-capstone.sh` self-check. (The fixture proves the *coverage logic*; in your real capstone these placeholders are replaced by your actual control's artifacts.)

**Tasks.**

1. Open `capstone-manifest.yaml`. For the control you are shipping, rewrite the `control:` line and, for each of the seven loop stages, name the *real* artifact in your repo that discharges it. Do not leave a placeholder; if you can't name an artifact, that stage is a gap to close before proceeding. *(Objectives 1, 2)*
2. Run `./validate-capstone.sh capstone-manifest.yaml`. Read its per-stage output. If it reports a missing stage, do not edit the validator to pass — create the missing artifact and re-run. The validator is your control check; making it green by gaming it is the exact anti-pattern the program teaches against. *(Objectives 1, 5)*
3. Write `control-statement.md`: the control's claim in your own words, the threat it mitigates (cite the Module-11 mapping), and the named ground-truth location the claim is checked against. This single file discharges UNDERSTAND and LOCATE — make the ground-truth location specific enough that someone else could fetch it. *(Objective 1)*
4. Confirm the seam: run your QUERY artifact and feed its output to your EVALUATE artifact by hand, then confirm the EVIDENCE artifact records the same verdict. Then confirm the MONITOR path invokes the *same* code, not a parallel copy. Write one sentence in `before-after.md` stating you verified the hand-run and the scheduled path agree. *(Objective 2)*
5. Write the `README.md` product section: name the control's customers, its single accountable owner, three backlog items (including at least one honest known gap), the one metric that says it's working, and one sentence of UX rationale (why the evidence is a by-product of the work, not extra work). *(Objective 3)*
6. Complete `before-after.md`: lay your control's week-0 legacy state beside its engineered state on at least four concrete dimensions (effort, frequency, drift detection, durability), score each side against the five legacy problems, and include at least one residual gap that did *not* improve, cross-referenced to a backlog item. *(Objectives 4, 6)*
7. Re-run `./validate-capstone.sh capstone-manifest.yaml` and confirm it reports all seven stages covered and the before/after present, exiting `0`. Run it a second time and confirm an identical verdict — your coverage proof is itself reproducible. *(Objectives 5)*

**Deliverables:** a `capstone-manifest.yaml` mapping all seven stages to real artifacts; `control-statement.md`, `README.md` (with the five product elements), and `before-after.md` (with the dimensioned comparison and an honest residual gap); and a green `validate-capstone.sh` run. Together these are the shipped control's spine — the engineering artifacts (collect/policy/evidence/monitor) are produced from your real environment per Modules 5–6, 8–9, 12–13.

---

## 7. Assessment

**Competency artifact (not a quiz).** The capstone is the terminal assessment of the entire curriculum. The learner submits a **shipped control repository** for one real control, plus a **before/after writeup** of that same control, such that a *different* reviewer can, from a clean checkout and within the assessment window, independently confirm the following — unaided by the author:

- A `capstone-manifest.yaml` mapping each of the seven loop stages to a real artifact in the repo, and a validator the reviewer runs that asserts all seven stages are covered and the before/after is present, exiting `0`.
- A pipeline that runs end to end: the scheduled/monitored path invokes the same QUERY → EVALUATE → EVIDENCE code the manual run does, and produces the verdict the evidence claims (the seam holds).
- A `README.md` that treats the control as a product, naming its customers, a single accountable owner, a backlog with at least one honest known gap, a success metric, and a UX rationale.
- A `before-after.md` comparing the *same* control's legacy and engineered states on at least four concrete dimensions, scored against the five legacy problems, including at least one residual gap that did not improve.
- A spoken or written walkthrough that correctly maps the control to all seven stages, explains why the engineered version is more trustworthy than the legacy one using the before/after and live monitoring as the argument, and diagnoses honestly where the control's coverage is still thin.

**Rubric** (`assessment/rubric.md`) — each row Pass / Not-yet; all must be Pass. Every row maps to an objective and, on a miss, routes to a specific concept section. A "Not-yet" on any row routes the learner back to that section, not the whole module; per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above and synthesized from Modules 1–14; nothing here is load-bearing. This module is intentionally light on third-party links — its content is the integration of the rest of the curriculum, which is internal.*

- **grc.engineering manifesto** — the source for "GRC as a product" (principle 3), "shift and start GRC left" (principle 1), and "threat-informed GRC" (principle 4) that the capstone operationalizes. https://grc.engineering — *use if you want to re-read the principles your capstone is the proof of, in the original words.*
- **grc.engineering "Legacy GRC vs GRC Engineering at a glance" cheat sheet** — the side-by-side framing your before/after mirrors. https://cheatsheet.grc.engineering — *use as a template for the dimensions of your before/after comparison in §5.3.*
- **The GRC Engineer newsletter & podcast** — Ayoub Fandi; the continuing-education channel for keeping a shipped control current after the capstone. https://grcengineer.com — *use after the capstone, as the ongoing input to your control's backlog.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
