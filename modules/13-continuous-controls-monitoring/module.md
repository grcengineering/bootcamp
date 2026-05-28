# Module 13 — Continuous Controls Monitoring

*Original content. Tier 3 of the curriculum. Loop stage: **MONITOR**. Conforms to the standard module anatomy. This module takes a control you can already check on demand and turns it into one that checks **itself** — on a schedule, forever — so the gap between "we passed an audit" and "we are compliant right now" closes to nothing. Third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a colleague who thinks an annual audit means they are compliant, why a point-in-time pass says nothing about the time between audits — using the difference between a *snapshot* and a *monitor*, not jargon.
2. **Describe** the five mechanical parts of a continuous-controls-monitoring loop — a control, an automated check, evidence emission, a dashboard fed by a history store, and a drift alert — and trace one control's state through all five.
3. **Compose** an automated check that captures a system's state, evaluates one control against it, returns a machine-readable verdict by exit code, and emits a dated evidence record on **every** run, pass or fail.
4. **Build** a versioned, append-only evidence store and a dashboard tile that reads it to show a control's current state plus its trailing-30-day history — so a reviewer sees not just "green now" but "green the whole quarter."
5. **Diagnose** an induced control drift from the loop's own output: read the alert, name the resource that drifted, point to the evidence record that caught it, and state the exact moment compliance was lost.
6. **Evaluate** the build-vs-buy landscape for CCM honestly — cloud-native services, open-source platforms, and commercial suites — and state which loop stages you would own and which you would rent, treating vendor growth claims as marketing rather than evidence.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Every earlier stage of the loop produces a verdict at a *moment*: you LOCATE a system, QUERY its state, EVALUATE a control against that state, and emit EVIDENCE that, on that date, the control held. The quiet lie buried in that sequence is the word "date." An audit is a photograph. It is true about the instant the shutter clicked and says nothing about the three hundred and sixty-four other days of the year, during which someone disabled encryption to debug a problem at 2 a.m., meant to turn it back on, and forgot. **MONITOR** is the stage that refuses to accept a photograph as proof of an ongoing fact. It re-runs the evaluation on a schedule, keeps every result as durable history, and — the part with teeth — *tells someone the moment a control stops holding*, instead of letting the next auditor discover it eleven months later. This is the difference between a control that was *verified once* and a control that is *continuously assured*, and that difference is the entire reason GRC engineering exists rather than GRC paperwork. Continuous controls monitoring is where the loop stops being a thing you run and becomes a thing that runs itself, watching the controls you already built and shouting only when reality drifts away from what your policy says should be true.

---

## 3. The Mental Model

Start with the uncomfortable question this module exists to answer: **how do you know a control is holding right now — not last quarter, right now — and how would you find out the instant it stopped?**

In the world this module replaces, the answer is "we wait for an auditor." A control — "no storage bucket is publicly readable," "every laptop is encrypted," "every production access grant was reviewed this quarter" — gets checked once, during the audit window, by a human pulling a report. The report is true the day it is pulled. Then the system keeps living. People deploy changes, fix incidents, click consoles, grant temporary access "just for today," and roll back configurations under pressure. Any one of those can silently break a control. The control is still written down. It is still agreed to. It simply isn't being *watched*, so the gap between "compliant" and "not compliant" can open the morning after the audit and stay open until the next one. The organization believes it is compliant for an entire year on the strength of a single old photograph. That belief is the risk this module attacks.

To fix it you have to internalize one shift, and it is the whole module: **stop treating a control check as an event and start treating it as a loop.** A check you run by hand, once, is an event — it happens and it's over. A check that runs itself on a schedule, keeps its results, and alerts on a bad one is a *loop* — it never ends, and at any moment you can ask it "is the control holding?" and get a current answer plus a history. Continuous controls monitoring, abbreviated **CCM**, is just that loop made concrete. Strip away every vendor's branding and the loop has exactly five mechanical parts, and once you can name all five you can build CCM on anything, rent it from anyone, or judge whether a tool that costs six figures is actually doing more than these five things.

**Part one is the control.** Not a paragraph in a policy document — a single, sharply-stated claim about the system that is either true or false at any given instant. "Every S3 bucket has public access fully blocked." The sharper and more binary the claim, the more checkable it is. A control you cannot phrase as a true-or-false statement about observable state cannot be monitored; it can only be discussed. So the first discipline of CCM is brutal precision about *what, exactly, must be true.*

**Part two is the automated check.** This is the same idea you met in Module 01 — ask the system a question, get a text answer, derive a verdict — except now it is a program, not a person at a keyboard. The check captures the current state (the configuration of the buckets, say), evaluates the control's claim against that captured state, and returns a verdict a machine can act on: a `PASS`/`FAIL` line on standard output for humans, and an **exit code** for machines — zero means the control holds, non-zero means it drifted. That exit code is the hinge the entire loop turns on, exactly as it was in Module 01. The check must also be *deterministic*: the same captured state must always produce the same verdict, or your history is noise.

**Part three is evidence emission, and here is the rule that separates CCM from mere alerting:** the check emits a durable, dated evidence record on **every single run — pass or fail.** This is counterintuitive at first. Why keep a record of a *passing* check? Because the value of CCM is not catching the one failure; it is being able to prove, to an auditor, that the control held *continuously* across a window — and you can only prove "continuously" if you have a record for every interval, including the boring green ones. An alert-only system that stays silent when things are fine can tell you the control broke, but it can never prove the control *didn't* break. The passing records are the proof of the negative. So evidence is emitted always, and it is generated by the same code that did the evaluating, which means it physically cannot disagree with what was checked.

**Part four is the history store and the dashboard it feeds.** The per-run evidence records pile up somewhere durable and **append-only** — you can add a record but never quietly rewrite one, because evidence you can edit after the fact is not evidence. That append-only pile *is* the control's history. A dashboard tile is then nothing more exotic than a query over that history: "what is the latest verdict (current state), and what were the verdicts over the trailing thirty days (the trend)?" The tile turns a directory full of records into a single human-legible answer — green now, and here is the unbroken line of green behind it, or here is the red gap on the 14th where it briefly drifted. The dashboard is not the system; it is a *view* of the history store, and confusing the two is how teams end up trusting a pretty chart that no longer reflects reality.

**Part five is the drift alert.** When a scheduled run returns a non-zero exit — a `FAIL` — the loop does not wait for someone to glance at the dashboard. It fires an alert that names the control, names the specific resource that drifted, and timestamps the moment. Crucially, the alert fires **only** on drift; a passing run is silent. Silence *is* the signal that the control is holding, and noise is reserved for the thing a human actually needs to act on. The alert is what converts the dashboard from a thing someone has to remember to look at into a system that reaches out the moment it matters. Without it, CCM is just a well-organized archive of failures nobody noticed in time.

So the full picture, smallest to largest: a sharply-stated **control** becomes an **automated check** that returns a verdict by exit code; the check **emits a dated evidence record on every run**; those records accumulate in an **append-only history store that a dashboard tile reads** for current-state-plus-trend; and a non-zero run **fires a drift alert** naming what broke and when. Five parts, run on a **schedule**, forever. That schedule — the thing that re-runs the loop without a human asking — is what makes the word "continuous" literal instead of aspirational. Build those five parts around one real control and you have done CCM; everything a vendor sells is some packaging of exactly this.

---

## 4. Concepts

### 4.1 The control as a binary claim about observable state

A monitorable control is a single sentence that is true or false at every instant, phrased entirely in terms of state you can actually observe: *"every S3 bucket has all four public-access-block flags enabled."* Notice what makes it monitorable. It names the population (every bucket), it names the observable property (the four public-access-block flags), and it admits exactly two answers (all enabled → pass; any disabled → fail). A control phrased as "data is appropriately protected" is unmonitorable — "appropriately" is not observable and not binary. The first move in any CCM effort is to translate a fuzzy policy aspiration into one or more sharp, binary, observable claims. You are not weakening the policy; you are making the part of it that a machine can watch explicit, and surfacing the part that still needs human judgment so it doesn't hide.

### 4.2 The captured state snapshot: separating "what is true" from "is it allowed"

A CCM check has two distinct jobs that are worth keeping mechanically separate. The first is **capture**: go to the system and record its current state as data — for our control, the configuration of every bucket. The second is **evaluation**: read that captured state and decide whether the control's claim holds. Separating them matters for three reasons. It makes the evaluation **deterministic and testable** — you can run it against a saved snapshot offline, with no cloud access, and get the same verdict every time. It makes the snapshot itself a piece of evidence — the raw state you judged, preserved. And it lets you re-evaluate old snapshots when a control's definition changes, asking "would last month have passed under the new rule?" In this module's lab the snapshot is a committed JSON file standing in for a live cloud configuration export; in production it is whatever your environment hands you, but the shape — capture to data, then evaluate the data — does not change.

### 4.3 The verdict: a PASS/FAIL line for humans, an exit code for machines

The check's output has two audiences, exactly as in Module 01. Humans get a readable line: `PASS control=… evaluated=3 noncompliant=0`, or on failure a `FAIL` line followed by the names of the resources that drifted. Machines get the **exit code**: zero for pass, non-zero for fail. The two must always agree, because the exit code is what every later part of the loop branches on — the scheduler decides whether to alert, the dashboard records green or red, the evidence record stamps `exit_code=0` or `exit_code=1`. A check that prints `FAIL` but exits zero is worse than no check, because it lies to the only consumer that acts automatically. Treat the exit code as the real result and the printed line as its human-readable caption.

### 4.4 Evidence on every run — proving the negative

Here is the concept that most distinguishes CCM from ordinary alerting, so it gets its own section. The check writes a durable, dated evidence record **every time it runs, whether it passed or failed.** A passing record looks deliberately boring: control ID, the timestamp of the captured state, the `PASS` verdict, `exit_code=0`, and which snapshot it judged. It feels redundant — why store proof that nothing was wrong? Because the question an auditor asks is not "did the control ever fail?" but "can you show me it held the entire period?" The only way to answer that is an unbroken sequence of records across the period, and the green ones are most of that sequence. The passing evidence is how you **prove the negative** — that no undetected gap existed — which is precisely the proof a point-in-time audit can never give you. An alert-only system that emits nothing when healthy throws this proof away.

### 4.5 The append-only history store

The evidence records accumulate in a store with one non-negotiable property: it is **append-only.** New records are added; existing records are never silently rewritten or deleted. This is not a storage-technology choice — it is an integrity property, and you can satisfy it with a versioned git repository, an object store with versioning and object-lock, or an append-only log; the lab uses a simple append-only ledger file plus one immutable record per run. The reason is the same reason a financial ledger is append-only: evidence you can edit after the fact proves nothing, because anyone could have made it say anything. The append-only store is what lets the history be *trusted* rather than merely *stored*. When this module's table becomes the input to a real audit, it is the append-only property — not the prettiness of the dashboard — that makes the history admissible.

### 4.6 The dashboard tile: current state + 30-day history as a query

A dashboard tile sounds like a visualization problem and is really a query problem. The tile answers two questions by reading the history store: *what is the latest verdict* (current state — the most recent record's pass/fail), and *what was the verdict over the trailing thirty days* (the trend — every record in the window). The first tells a viewer whether the control holds now; the second tells them whether it has held *consistently*, which is the question that actually matters. A single green light can hide a control that flapped red for three days last week; the thirty-day trend cannot hide it, because every interval has a record. The discipline here is to remember the tile is a **view over the append-only store**, computed fresh from the records, never a separately-maintained status someone updates by hand — the instant the displayed state and the underlying records can disagree, the dashboard becomes a liability that tells comfortable lies.

### 4.7 The drift alert: silence means healthy, noise means act

When a scheduled run returns non-zero, the loop fires a **drift alert**. A good alert is specific enough to act on without further investigation: it names the control, names the specific resource that drifted (not just "something failed"), and carries the timestamp of the state that failed — so the responder knows *what* broke, *where*, and *when* compliance was lost. The defining rule is that the alert fires **only on failure.** A passing run produces an evidence record and nothing else — no notification, no noise. This is deliberate: an alert that fires on every run, healthy or not, trains people to ignore it, and an ignored alert is identical to no alert. By making silence the signal of health, you reserve every notification for a real, actionable drift. The alert is the component that turns the whole archive from passive (someone must look) into active (it reaches out), and it is the literal mechanism by which MONITOR catches in minutes what an annual audit catches in months.

### 4.8 The schedule, and build-vs-buy as a stage-by-stage decision

The word "continuous" comes from one unglamorous component: a **scheduler** that re-runs the check on an interval without a human asking — hourly, daily, on every config change, whatever the control's risk justifies. Pick the interval by asking "how long are we willing to be silently non-compliant?" — that window is your maximum acceptable detection gap, and the schedule must be at least that frequent. Now, the honest part: you do not have to build all five components plus the scheduler yourself. The market offers cloud-native configuration-monitoring services that handle capture, scheduling, and basic evaluation; open-source platforms that organize controls, evidence, and framework mappings; and commercial suites that package the whole loop with a polished dashboard. The GRC-engineering judgment is **not** "build everything" or "buy everything" — it is to decide, *stage by stage*, which parts you own and which you rent. A useful default: own the parts that encode *your* policy and *your* evidence definitions (the control claims, the evaluation logic, the evidence schema), because those are your durable asset and your audit's source of truth; rent the undifferentiated heavy lifting (capture, scheduling, storage, notification plumbing) where a vendor does it cheaper and you lose nothing by not owning it. And treat every vendor's "category leader" and "300% growth" claim as marketing, not evidence — the durable skill is the five-part loop, which lets you evaluate any tool by asking which stages it actually does and which it leaves to you.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. State snapshots and check output are shown in their representative shape; your exact cloud export and tool wording will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 The control, the captured state, and a passing run

The control area is storage exposure. The binary claim: *"every S3 bucket has all four public-access-block flags enabled — `block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets`."* The check captures the current configuration as a snapshot — here, three buckets, all locked down:

```json
{
  "control_id": "CC6.1-s3-public-access-block",
  "captured_at": "2026-05-20T09:00:00Z",
  "buckets": [
    { "name": "acme-evidence-store", "block_public_acls": true, "block_public_policy": true, "ignore_public_acls": true, "restrict_public_buckets": true },
    { "name": "acme-audit-logs",     "block_public_acls": true, "block_public_policy": true, "ignore_public_acls": true, "restrict_public_buckets": true },
    { "name": "acme-public-website", "block_public_acls": true, "block_public_policy": true, "ignore_public_acls": true, "restrict_public_buckets": true }
  ]
}
```

The evaluation reads the snapshot, finds all four flags true on all three buckets, and emits a verdict — a human line plus the all-important exit code:

```
PASS control=CC6.1-s3-public-access-block evaluated=3 noncompliant=0
exit_code: 0
```

Exit zero. The control holds. Notice the evaluation ran entirely against the *captured data* — no live cloud call was needed to decide pass or fail, which is exactly what makes the verdict deterministic and re-runnable. This is the boring case, and the boring case is most of CCM's value.

### 5.2 Evidence emitted on the passing run — the proof of the negative

The same passing run writes a durable record and appends one row to the history ledger. The record is deliberately unremarkable:

```
control_id=CC6.1-s3-public-access-block
captured_at=2026-05-20T09:00:00Z
verdict=PASS control=CC6.1-s3-public-access-block evaluated=3 noncompliant=0
exit_code=0
source_state=state-compliant.json
```

```
2026-05-20T09:00:00Z run-20260520090000 rc=0 PASS control=CC6.1-s3-public-access-block evaluated=3 noncompliant=0
```

No alert fires — silence is the signal that the control is holding. It is tempting to skip storing this; resist. A year of these boring green rows is precisely the artifact that lets you answer "show me the control held all year" with an unbroken ledger instead of a shrug. The passing record is not redundant; it is the evidence a point-in-time audit structurally cannot produce.

### 5.3 Inducing drift: the failing run names what broke and when

Now someone, mid-quarter, flips the public-access settings off on one bucket to make a static website work — and forgets to restore them. The next scheduled capture reflects reality:

```json
{ "name": "acme-public-website", "block_public_acls": false, "block_public_policy": false, "ignore_public_acls": false, "restrict_public_buckets": false }
```

The very same check — unchanged — now evaluates the new snapshot and returns a different verdict:

```
FAIL control=CC6.1-s3-public-access-block evaluated=3 noncompliant=1
NONCOMPLIANT acme-public-website
exit_code: 1
```

Exit one. And because the run failed, the loop does two things a passing run did not. It still writes an evidence record (every run does), *and* it fires a drift alert that is specific enough to act on without investigation:

```
ALERT control=CC6.1-s3-public-access-block captured_at=2026-05-21T09:00:00Z
FAIL control=CC6.1-s3-public-access-block evaluated=3 noncompliant=1
drifted_resource=acme-public-website
```

Read it as a responder: the alert names the control, names the exact resource that drifted (`acme-public-website` — not a vague "a control failed"), and timestamps the captured state. You know *what*, *where*, and *when* without opening a single console. The annual-audit version of this story is "an assessor found a public bucket eleven months after it went public." The CCM version is "a notification arrived the morning after the change." Same control, same finding — the only difference is the loop, and the loop is the difference between a breach and a fix.

### 5.4 The dashboard tile and the build-vs-buy read

The tile is just a query over the append-only ledger. Current state is the latest row; the trend is the window:

```
CC6.1 — S3 public access block        CURRENT: 🔴 FAIL (acme-public-website)
30-day history:  🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🔴
                 held green for 30 days, drifted on the 31st
```

The single red square is the whole point: a bare status light would have shown only "red now," but the thirty-day trend proves the control held continuously *until* a specific day — which is exactly what turns the dashboard into evidence rather than decoration. Now the build-vs-buy read, done honestly against the five parts. The *control claim*, the *evaluation logic*, and the *evidence record's shape* are yours — they encode your policy and they are your audit's source of truth, so you own them. The *capture* of cloud state, the *scheduler* that re-runs the check, the durable *storage*, and the *notification plumbing* are undifferentiated heavy lifting a cloud-native service or a commercial suite will do cheaply and well — rent those where renting loses you nothing. A vendor demo that dazzles with a dashboard is selling you part four; ask what it does for parts one, three, and five, and whether you still own your policy and evidence when the contract ends. The growth-rate slide is marketing; the five-part loop is the ruler you measure every tool against.

---

## 6. Guided Lab

> Original lab. ~90–120 minutes. Tier-B content (environment-dependent). The full lab wires the loop to a real scheduler and a live cloud snapshot; the bundled `labs/happy-path.sh` proves the **CCM core logic** offline against committed state fixtures, so the control evaluation, evidence emission, history ledger, and drift alert are reproducible on any clean machine with bash + coreutils + awk — no cloud, no network, no credentials.

**Scenario.** You own one control: *every S3 bucket has all four public-access-block flags enabled.* You will stand up the five-part CCM loop around it — an automated check that returns a verdict by exit code, an evidence record on every run, an append-only history ledger, a dashboard tile reading that ledger, and a drift alert — then induce a drift and watch the loop catch it.

**Setup.** Run `bash labs/setup.sh ./ccm-lab`. This generates `ccm-check.sh` (the check function library — pure bash + awk, with a `bun`-based JSON parse where available, vendor-neutral) and an empty `evidence/` store. The committed fixtures `labs/fixtures/state-compliant.json` and `labs/fixtures/state-drifted.json` are your two captured-state snapshots (compliant first, then a drifted version where `acme-public-website` has all four flags off). Two further fixtures harden the check against the failure modes that make a monitor lie: `state-drifted-pretty.json` is the *same* drift expressed in **pretty-printed, multi-line JSON** — the shape real cloud exports and `jq` actually emit — and must still be caught, not silently passed; `state-empty.json` carries **zero buckets** and must make the check **fail closed** (refuse to emit a green verdict when it evaluated nothing) rather than report a vacuous pass. No scanner, cloud, or network is needed for the offline core; the optional steps marked *(real environment)* require your own tooling.

**Tasks.**

1. Open `state-compliant.json` and, *before running anything*, write down — in words — the binary control claim and which observable fields decide it. Then read `ccm-check.sh` and find the line where a bucket is judged compliant only if all four flags are true. Reconcile your stated claim with the code's logic. *(Objectives 1, 2)*
2. Source the library (`source ./ccm-lab/ccm-check.sh`) and run `evaluate_control labs/fixtures/state-compliant.json`; inspect `$?`. State, in one sentence, what the exit code means and why the loop branches on it rather than on the printed text. *(Objectives 2, 3)*
3. Run `emit_evidence labs/fixtures/state-compliant.json ./ccm-lab/evidence`. Open the resulting `run-*.evidence` record and the new row in `ledger.log`. Confirm **no** `alert-*.txt` file was created. Explain in one sentence why storing a *passing* record is not redundant — what audit question does it, and only it, answer? *(Objectives 3, 4)*
4. Now induce drift: run `emit_evidence labs/fixtures/state-drifted.json ./ccm-lab/evidence`. Inspect `$?`, the new evidence record, the second `ledger.log` row, and the `alert-*.txt` that now exists. From the alert alone — without re-reading the JSON — name the control, the drifted resource, and the moment compliance was lost. *(Objectives 3, 5)*
5. Build the dashboard tile as a query over the ledger: write one or two lines (using `tail`, `awk`, or `grep` on `ledger.log`) that print the **current** verdict (latest row) and a **30-day** strip of pass/fail markers. Confirm the tile shows the drift as a single red interval after a run of green, and explain why that strip is evidence the bare "current state" is not. *(Objective 4)*
6. Re-run task 4's drifted evaluation a second time and confirm the verdict line is byte-identical to the first. State in one sentence why a non-deterministic check would make the entire history store untrustworthy. *(Objectives 2, 3)*
7. Write a 5–7 sentence build-vs-buy memo for this control: for each of the five loop parts (control claim, check/evaluation, evidence emission, history store + dashboard, drift alert) plus the scheduler, state whether you would **own** or **rent** it and why — and name one vendor claim you would refuse to treat as evidence. *(Objective 6)*
8. *(Real environment, optional but recommended.)* Replace the static fixture with a real capture (e.g. an actual cloud configuration export of your buckets) and wire `emit_evidence` to a scheduler (a cron entry, a CI schedule, or a cloud scheduled job) so it runs unattended on an interval, with the alert routed to a real channel. Induce a genuine drift in a sandbox account and confirm the scheduled loop catches it and notifies you. *(Objectives 2, 5, 6)*

**Deliverables:** the populated `evidence/` store (at least one passing and one failing `run-*.evidence`, a two-row `ledger.log`, and one `alert-*.txt`), your dashboard-tile command and its output showing the 30-day strip with the drift, and the build-vs-buy memo. Plus a 4–6 sentence written explanation covering: why a passing record is kept; what the exit code drives; how the alert localizes the drift; and which loop stages you chose to own and why.

---

## 7. Assessment

**Competency artifact (not a quiz).** Given a *fresh, unseen* control claim and a pair of captured-state snapshots provided at assessment time (one compliant, one drifted in a way the learner has not seen), the learner must, unaided and within 60 minutes, deliver:

- A **working CCM loop** for the given control: an automated check that captures/reads state, evaluates the control, returns a `PASS`/`FAIL` line plus a correct exit code (zero on pass, non-zero on drift), and emits a dated evidence record on **every** run.
- A **populated append-only history store** containing a record for both the compliant and the drifted run, and a **dashboard tile** (a query over that store) that shows current state plus a trailing-30-day trend — demonstrably distinguishing "green now" from "green the whole window."
- A **drift alert** that fired only on the drifted run and names the control, the specific drifted resource, and the timestamp — plus a **written walkthrough** that correctly: explains why a point-in-time pass is not continuous assurance; states what the exit code drives and why; explains why passing evidence is kept (the proof-of-the-negative argument); reads the trend tile as evidence the bare status light is not; and states, stage by stage, which parts of this loop the learner would own versus rent and why.

**Rubric:** score against `assessment/rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the named concept section, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below the `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are open-source platforms and a commercial reference for learners who want to stand up a full CCM environment or see the loop industrialized. None of it is load-bearing — a learner who clicks zero links still meets every objective. The five-part loop in §3 is the durable skill; every tool below is some packaging of it, and you evaluate each by asking which of the five stages it actually performs.*

- **CISO Assistant (intuitem)** — open-source GRC platform with 30+ pre-mapped frameworks; the most complete free environment to stand up controls, evidence, and assessments locally. https://github.com/intuitem/ciso-assistant-community — *use to see parts one (controls) and four (evidence + dashboards) organized at scale, against many frameworks at once.*
- **GovReady-Q** — open-source compliance-as-a-service server oriented around questionnaire-driven control implementation and evidence. https://github.com/GovReady/govready-q — *use for a different posture on the same loop: control implementation tracking feeding evidence, with a government/ATO lineage.*
- **OpenGRC (Lee Mangold)** — a lightweight open-source GRC application for managing controls, risks, and audits. https://github.com/leemangold/OpenGRC — *use as a smaller, more readable codebase to trace how a control's state and evidence are modeled end-to-end.*
- **Eramba** — long-running open-source/community GRC platform covering control monitoring, risk, and compliance workflows. https://www.eramba.org/ — *use to see continuous-control review and monitoring workflows in a mature, opinionated tool.*
- **RegScale** — a commercial continuous-controls-monitoring / "GRC-as-code" suite that packages the whole loop with OSCAL support. https://regscale.com/ — *use as the build-vs-buy reference point in §4.8 and the §6 memo: study which of the five loop stages it performs for you, and read its growth/category claims as marketing, not evidence.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
