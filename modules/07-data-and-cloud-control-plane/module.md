# Module 07 — Data & Cloud Control Plane

*Loop stages: QUERY-at-scale, EVALUATE. Tier 2 (Engineering). Original content. Conforms to the standard module anatomy. Third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Map** any cloud's control surface onto a portable four-part model — identity boundary, resource policy, audit log, posture service — and **explain** where the truth of an access or encryption control physically lives.
2. **Query** an evidence table with SQL to turn a pile of rows into a single risk metric, and **explain** why that query *is* the control result, not a step toward it.
3. **Diagnose** whether a control passes by reading a structured cloud record — a posture-service finding or an audit-log event — instead of reading a console screenshot.
4. **Compose** a reproducible evidence report from two sources at once: a posture-service finding for an encryption control and an audit-log query for an access control.
5. **Produce** a script that emits the same machine-readable verdict every time it runs against the same input, and **explain** why that determinism is what makes continuous monitoring possible.
6. **Describe**, to an auditor, why a query against the control plane is stronger evidence than a point-in-time export, using the difference between *state* and *events*.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Everything before this module taught you to interrogate *one machine* — a shell on a laptop, a file on a server, a single API call. But a real environment is hundreds of accounts, thousands of resources, and millions of events, and no human walks that by hand. This module is where LOCATE and QUERY scale: the truth of "access is least-privilege" and "data is encrypted" no longer sits in one file you can `cat` — it sits in a cloud's identity system, its resource configuration, its audit log, and its posture service, all reachable only as data. Learning the control plane and learning SQL are the same lesson from two directions: control-truth at scale is a *query*. You ask the cloud what its current state is (the posture service), you ask the audit log what *happened* (the events), and you ask your evidence store what it all *means* for risk (SQL). When those three queries are reproducible, EVALUATE and MONITOR stop being quarterly heroics and become a job a machine runs on a schedule.

---

## 3. The Mental Model

Start with the question that every cloud vendor's marketing tries to stop you from asking: **when you "secure the cloud," what are the actual moving parts?** Strip away the logos and the console tours, and every major cloud — and every minor one — is built from the same four pieces. Learn the four, and you have learned all of them; the vendors only disagree on names.

**Part one: the identity boundary.** Before anything in a cloud can act, the cloud must answer two questions about it — *who are you* (authentication) and *what are you allowed to do* (authorization). The thing that answers both is the identity boundary. It is the gate every request passes through. A request arrives carrying an identity — a human, a service, a machine — and the boundary decides, allow or deny, by consulting rules. This is not a feature bolted onto the cloud; it is the cloud's nervous system. Every access-control claim you will ever evidence ("only admins can delete the production bucket") is ultimately a claim about what this boundary will and won't permit. In AWS this boundary is called **IAM** (Identity and Access Management). Azure calls its version **Entra ID** plus role assignments; Google Cloud calls it **Cloud IAM**. Same gate, three names.

**Part two: the resource policy.** The identity boundary decides what an identity *may* do, but each resource also carries its own rules about what may be done *to* it — and crucially, *how it must be configured*. A storage bucket has a setting that says "encrypt everything written here." A database has a setting that says "do not allow connections from the public internet." These settings are the resource's policy: the declared, intended configuration of the thing itself. An encryption control is almost always a claim about a resource policy — "this resource is configured to encrypt at rest." The boundary governs *reach*; the resource policy governs *shape*. You need both, because a perfectly locked-down identity boundary on a bucket that stores plaintext is still a failed encryption control.

**Part three: the audit log.** The boundary and the resource policy describe *intended* state — what should be allowed, how things should be configured. But intent is not history. Someone with permission can still do something alarming, and a control often cares not about "could this happen" but "did this happen, when, and by whom." The audit log is the cloud's diary: every meaningful action — every API call, every permission change, every resource created or destroyed — written down as a timestamped, attributed record. (Treat its tamper-*evidence* as a property you must turn on, not a default: it holds only when log-file integrity validation is enabled — e.g. CloudTrail's log-file validation — so that altered or deleted records can be detected; without it the diary is merely a log, not a tamper-evident one.) This is the single most underused source of GRC truth, because it answers the questions a configuration snapshot never can: *who granted that role? when did this become public? has anyone disabled logging?* In AWS the audit log is **CloudTrail**. Azure calls it **Activity Log** (with Entra sign-in logs alongside); Google Cloud calls it **Cloud Audit Logs**. Same diary, three names.

**Part four: the posture service.** You could, in principle, evaluate every control yourself by reading the identity boundary, every resource policy, and the whole audit log. At scale, you cannot — there are too many resources and the rules are too intricate. So every serious cloud now ships a service whose entire job is to *continuously evaluate the other three parts against rules and emit verdicts*. It watches the resources, checks them against a ruleset ("is this bucket encrypted? is this database public?"), and produces a stream of **findings** — structured records that each say, in effect, "resource X, rule Y, status PASS or FAIL." This is the cloud doing the EVALUATE stage of our loop for you, on a schedule, and handing you the result as data. In AWS this is **Config** (records and evaluates configuration) feeding **Security Hub** (aggregates findings against standards). Azure calls its version **Defender for Cloud** with **Azure Policy**; Google Cloud calls it **Security Command Center**. Same evaluator, three names.

Now hold all four at once, because the whole module lives in how they relate: **the identity boundary and the resource policy are *state* (how things are right now). The audit log is *events* (what happened over time). The posture service is *judgment* (state evaluated against rules).** A GRC engineer reaches for the right one depending on the control. "Is this resource encrypted?" is a state question — ask the posture service or read the resource policy. "Who turned off encryption last month, and when?" is an event question — only the audit log knows. Confusing these two is the most common mistake in cloud evidence: a posture service can tell you a bucket is *currently* public but cannot, by itself, tell you it was *briefly* public during the incident last Tuesday. State and events are different kinds of truth, and mature evidence uses both.

There is a fifth part, and it is not in the cloud at all — it is yours. Once you have pulled findings and events out of the four cloud parts, you have *rows*: a finding per resource, an event per action. Rows are where risk lives, and the language of rows is **SQL**. SQL is not a cloud thing; it is the universal grammar for asking questions of tabular data, and it is the same whether your rows came from AWS, Azure, GCP, or a CSV someone emailed you. The reason SQL belongs in this module and not its own is that *the output of the control plane is a table, and a risk metric is a query over that table*. "How many resources fail the encryption control?" is `COUNT(*) WHERE status = 'FAIL'`. "What fraction of admin grants happened outside business hours?" is a `GROUP BY` over audit events. The control plane gives you the rows; SQL turns the rows into the number an executive or an auditor actually asked for. Four cloud parts produce evidence; one query language turns evidence into risk. That is the entire mental model, and it is portable across every cloud you will ever touch.

---

## 4. Concepts

### 4.1 The control plane is data, not a dashboard

A cloud console is a website drawn on top of an API. Every panel you click is a query someone wrote for you, with the result rendered as colored boxes. The instant you treat the console as the source of truth, your evidence becomes a screenshot — un-reproducible, un-queryable, stale the moment it's taken. The GRC engineer's reframe: behind every dashboard tile is a structured record you can fetch directly. Ask for the record, not the picture. A bucket's encryption status is a field in a JSON object; a posture finding is a row with a `compliance` field; an audit event is a JSON line. Inline example — the same fact, two ways:

```
Console:  a green shield icon next to "encryption-bucket"   (a screenshot; rots instantly)
Record:   { "resourceId": "encryption-bucket", "rule": "encrypted-at-rest", "status": "PASS" }
```

Only the second can be saved, diffed next quarter, and counted by the thousand.

### 4.2 State vs. events — the two kinds of cloud truth

This is the distinction that separates competent cloud GRC from cargo-culted screenshots. **State** is the configuration *right now*: read it from the resource policy or the posture service. **Events** are what *happened over time*: read them only from the audit log. A control question is always one or the other, and reaching for the wrong source produces evidence that doesn't actually support the claim.

- *State question:* "Is the audit-logs bucket encrypted?" → a posture finding. One record, one verdict.
- *Event question:* "Did anyone disable encryption on it in the last 90 days?" → an audit-log query. Many records, scanned for the action.

A posture service that reports "encrypted: true" right now says nothing about a window last month when it was false. If your control cares about that window, only the log can answer it. Carry this everywhere: *snapshots prove the present; logs prove the past.*

### 4.3 The four parts, concretely (AWS as the worked example)

We teach one cloud in detail so the model has flesh, then name the parallels so it stays portable. AWS is the example because its four parts are cleanly separated and the most widely documented; the *shape* is identical everywhere.

| Portable part | Question it answers | AWS | Azure | GCP |
|---|---|---|---|---|
| Identity boundary | Who may do what? | IAM | Entra ID + roles | Cloud IAM |
| Resource policy | How is this thing configured? | resource/bucket policy, Config item | resource config | resource config |
| Audit log | What happened, when, by whom? | CloudTrail | Activity Log | Cloud Audit Logs |
| Posture service | Does it pass the rules right now? | Config + Security Hub | Defender for Cloud + Azure Policy | Security Command Center |

Inline example — a Security Hub / Config finding for an encryption control is a structured record shaped like this (fields trimmed for clarity):

```json
{ "resourceId": "arn:...:bucket/audit-logs", "controlId": "S3.4",
  "title": "S3 buckets should have encryption enabled", "compliance": { "status": "FAILED" } }
```

You don't read that off a screen; you fetch it, and now it's a row.

### 4.4 An audit-log event is just a typed row

A CloudTrail event (and its Azure/GCP equivalents) is a JSON object recording one action. The fields you care about for access control are always the same shape: *what* happened, *who* did it, *when*, and *to what*. Inline example:

```json
{ "eventTime": "2026-05-20T02:14:00Z", "eventName": "AttachUserPolicy",
  "userIdentity": { "arn": "arn:...:user/contractor-7" },
  "requestParameters": { "policyArn": "arn:...:policy/AdministratorAccess" } }
```

Read it as a sentence: at 2:14 a.m., `contractor-7` was granted `AdministratorAccess`. The control "privileged access is granted only through approved channels during business hours" is evaluated by *filtering* these events — keep the privilege-granting actions, check the time, attribute the actor. The log is a table you query; this module's lab does exactly that filtering against committed sample events. (One distinction worth noting: a permission change like `AttachUserPolicy` is a **control-plane** event — it alters the configuration of the cloud — whereas an action like `GetObject`, which reads data without changing config, is a **data-plane** event. Both can be logged, but they often live in separate streams and the data-plane stream is frequently off by default; know which plane your control cares about before you go looking for its events. The lab fixture includes a `GetObject` row precisely so the filter has to *ignore* a data-plane event and keep only the privilege grants.)

### 4.5 SQL is the grammar of evidence

SQL has a small core, and that core is almost the entire job. You are nearly always doing four things: choosing rows (`WHERE`), choosing columns (`SELECT`), bucketing rows together (`GROUP BY`), and summarizing a bucket (`COUNT`, `SUM`, `AVG`). A risk metric is a summary of filtered rows. Inline example — given an `evidence` table with one row per resource and a `status` column, the encryption control's failure count *is* a query:

```sql
SELECT COUNT(*) AS failing FROM evidence WHERE control = 'encryption' AND status = 'FAIL';
```

That single number is the control result and a risk input at the same time. Push it one step further and you get a *rate*, which is what risk people actually want — the fraction of in-scope resources that fail:

```sql
SELECT control,
       ROUND(100.0 * SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) / COUNT(*), 1) AS fail_pct
FROM evidence GROUP BY control;
```

The `GROUP BY` produces one row per control; the expression turns raw counts into a percentage. The `CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END` is the portable way to count matching rows — it runs unchanged on PostgreSQL, SQL Server, Oracle, SQLite, and MySQL. (PostgreSQL also offers `COUNT(*) FILTER (WHERE status = 'FAIL')` for the same result.) Avoid the tempting shorthand `SUM(status = 'FAIL')`: it works on SQLite and MySQL, where a boolean coerces to 1/0, but is a type error on PostgreSQL, SQL Server, and Oracle — and portability is the whole point. No spreadsheet, no manual tally — the metric is the query, and the query is reproducible against next quarter's evidence table without changing a character.

### 4.6 Deterministic evidence — same input, same verdict, every time

A check is only useful for MONITOR if running it twice on identical input yields identical output. That property has a name: the evaluation is **deterministic** — more precisely, it is a *referentially transparent* (pure) function of its input, with no hidden dependence on the clock, the environment, or row order. It sounds obvious and is constantly violated — by checks that embed today's date in the verdict, depend on the order rows come back, or call a live API whose answer drifts between runs. The discipline: separate *collection* (which is allowed to vary — the cloud changes) from *evaluation* (which must not — the same evidence must always produce the same verdict). Inline example of the failure mode and the fix:

```
NOT deterministic:  verdict = "PASS as of " + now()      # output changes every run
Deterministic:      verdict = evaluate(evidence_file)    # output is a pure function of the input
```

This is why the lab's happy path can re-run a script against a committed fixture and assert a fixed answer: the evaluation logic is a pure function of its input. If your check isn't, a monitoring alert can't tell drift in the *world* from noise in your *code*.

### 4.7 Why a query beats an export

An auditor who accepts a CSV export is accepting a claim: "this is what the system looked like when someone clicked Export." A query against the control plane is a stronger claim: "this is what the system looks like, generated by code anyone can re-run, against records the cloud itself attests to." The difference is reproducibility and provenance. A query can be run again in front of the auditor; an export cannot be reproduced, only re-trusted. This is the whole inversion the curriculum teaches, applied to evidence: don't *describe* the state and attach a picture — *query* the state and ship the code that did it.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Records are real in shape but simplified; field names match the four-part model from §3–4. (Worked examples are Tier-B content — reviewed when cloud services restyle.)

### 5.1 Evaluating an encryption control from a posture finding

Claim to verify: *"the bucket holding our audit logs is encrypted at rest."* This is a **state** question, so we ask the posture service, not the log. Suppose `posture-findings.json` is the pulled Config/Security Hub output, one finding per resource:

```json
[ { "resourceId": "audit-logs",  "control": "encryption", "status": "PASS" },
  { "resourceId": "scratch-tmp", "control": "encryption", "status": "FAIL" },
  { "resourceId": "exports-q2",  "control": "encryption", "status": "PASS" } ]
```

The evaluation is a filter, not a judgment call: find the resource in scope, read its `status`. For `audit-logs` the finding says `PASS` — the control is met, and the *evidence* is the finding itself, kept verbatim. Notice what we did **not** do: we didn't open a console, didn't eyeball a shield icon, didn't trust a human's recollection. We asked the part of the cloud whose job is judgment, and saved its verdict as a row. That row is re-checkable next quarter against a fresh pull, and the verdict for `scratch-tmp` (`FAIL`) is exactly the kind of thing a screenshot of the "good" bucket would have hidden.

### 5.2 Evaluating an access control from audit events

Claim to verify: *"no privileged role was granted outside business hours."* This is an **event** question — a posture snapshot cannot answer it, so we query the audit log. Suppose `audit-events.json` holds CloudTrail-shaped records and we keep only privilege-granting actions:

```json
[ { "eventTime": "2026-05-20T14:02:00Z", "eventName": "AttachUserPolicy", "actor": "alice",        "policy": "AdministratorAccess" },
  { "eventTime": "2026-05-20T02:14:00Z", "eventName": "AttachUserPolicy", "actor": "contractor-7", "policy": "AdministratorAccess" } ]
```

Evaluation in words: keep events whose name grants privilege, extract the hour from `eventTime`, flag any outside business hours — defined here as the half-open window `[09:00, 18:00)` UTC, so 09:00 is in-hours and 18:00 is the first out-of-hours hour (the lab's filter is exactly `hour < 9 || hour >= 18`). The first grant (14:02) is in-hours — fine. The second (02:14) is a 2 a.m. grant of `AdministratorAccess` to a contractor — a **FAIL**, and a finding no configuration snapshot could ever surface, because by the time you snapshot the config the grant is just "contractor-7 has admin," with the suspicious *timing* erased. The control result is "1 violation," and the evidence is the offending event, kept whole, with its timestamp and actor intact for the auditor.

### 5.3 Turning two evidence files into one risk number with SQL

Now combine. You ran 5.1 across many buckets and 5.2 across many grants, and loaded the verdicts into one `evidence` table — one row per evaluated control instance, columns `control` and `status`:

```
control     | status
------------+-------
encryption  | PASS
encryption  | FAIL
encryption  | PASS
access      | PASS
access      | FAIL
```

The risk metric an executive asked for — "what percentage of our cloud controls are currently failing, by control type?" — is one query:

```sql
SELECT control,
       SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END)              AS failing,
       COUNT(*)                                                      AS total,
       ROUND(100.0 * SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) / COUNT(*), 1) AS fail_pct
FROM evidence
GROUP BY control;
```

Representative output:

```
control     | failing | total | fail_pct
------------+---------+-------+---------
access      |       1 |     2 |     50.0
encryption  |       1 |     3 |     33.3
```

That table *is* the risk report. It came from the control plane (findings + events), it's reproducible (re-run the query next quarter against new rows), and it's the same SQL whether the rows originated in AWS, Azure, or GCP. Four cloud parts in; one defensible number out.

### 5.4 Why the same script must give the same answer twice

You wrap 5.1–5.3 into one script, `control-evidence.sh`, that reads the two committed evidence files and prints a verdict block. Run it twice:

```
$ ./control-evidence.sh
encryption: PASS=2 FAIL=1
access:     PASS=1 FAIL=1
$ ./control-evidence.sh
encryption: PASS=2 FAIL=1
access:     PASS=1 FAIL=1
```

Byte-for-byte identical, because the evaluation is a pure function of its input (§4.6). *That* is what makes a monitoring schedule meaningful: when the output changes, it changed because the *cloud* changed — drift — not because your code is flaky. A non-deterministic check can't tell you that, and a monitoring alert you can't trust is worse than no alert at all.

---

## 6. Guided Lab

> Original lab. ~50–70 minutes. Tier-B content (environment-dependent). The *real* version of this lab runs against your org's actual cloud sandbox; the committed fixtures let you build and prove the **evaluation logic** with no cloud access, exactly as CI does.

**Scenario.** You are asked to produce one reproducible evidence report covering two controls — one **encryption** (state) and one **access** (event) — plus a single SQL-derived risk metric, and to make the whole thing re-runnable so it can later go on a monitoring schedule.

**Setup.** Run `bash labs/setup.sh` to generate the fixtures into `labs/fixtures/`: a posture-findings file (`posture-findings.json`), an audit-events file (`audit-events.json`), and an evidence table (`evidence.csv`). These stand in for what you'd pull from your cloud's posture service and audit log; in the real lab you'd replace the setup step with authenticated pulls.

**Tasks.**

1. Open `posture-findings.json` and, in one sentence, classify the encryption control question as *state* or *event* and say which of the four cloud parts produced this file. *(Objectives 1, 3)*
2. Evaluate the encryption control for the in-scope resource by reading its `status` field from the posture finding. Record the verdict and keep the finding verbatim as evidence. State why you did **not** use a console for this. *(Objectives 3, 4)*
3. Open `audit-events.json`, classify the access control question as *state* or *event*, and explain in one sentence why a posture snapshot could not answer it. *(Objectives 1, 6)*
4. Evaluate the access control: keep only privilege-granting events, extract the hour, and flag any grant outside 09:00–18:00 UTC. Record the count of violations and keep each offending event whole. *(Objectives 3, 4)*
5. Load the evidence table `evidence.csv` and write a SQL query (via `bun:sqlite`, `sqlite3`, or an equivalent) that produces a per-control failure percentage. Confirm the number matches a hand count of the rows. *(Objective 2)*
6. Wrap tasks 2, 4, and 5 into a single script `control-evidence.sh` that reads the fixtures and prints a verdict block plus the risk metric. Run it **twice**; confirm the output is byte-for-byte identical and explain, in one sentence, why that determinism is the precondition for monitoring. *(Objectives 5, 6)*
7. Write a 4–6 sentence report mapping each verdict to its control, naming the cloud part each piece of evidence came from, and stating how you'd swap the `setup.sh` fixtures for real authenticated pulls without changing the evaluation logic. *(Objectives 1, 4, 6)*

**Deliverables:** the two evidence verdicts (encryption PASS/FAIL; access violation count) with the source records kept verbatim, the SQL risk-metric query and its output, the re-runnable `control-evidence.sh`, and the written report. The happy-path script (`labs/happy-path.sh`) is the CI proof that your evaluation logic reproduces from clean — run it to check your own work.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* set of control-plane records provided at assessment time — a posture-findings file and an audit-events file with different resources and a different offending event, plus an evidence table whose answer differs — the learner must, unaided and within 45 minutes, deliver:

- A re-runnable script that evaluates **one encryption control from a posture finding (state)** and **one access control from audit events (event)**, emitting a machine-readable verdict for each, with the source records preserved verbatim as evidence, and whose evaluation is **deterministic** (two runs, byte-identical output).
- A **SQL query** that produces a per-control risk metric (a failure rate, not just a count) from the supplied evidence table, with the result reconciled against a hand count.
- A short written or spoken walkthrough that correctly: maps each control to its cloud part using the four-part model; classifies each question as *state* or *event* and justifies the source chosen; explains why the query is stronger evidence than an export; and states why deterministic evaluation is required for monitoring.

**Rubric:** see `assessment/rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner back to the specific concept section named in the rubric — not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.

| Criterion | Objective | Pass means |
|---|---|---|
| Four-part mapping | O1 | Maps each control to identity/resource/log/posture correctly, unprompted |
| Risk metric in SQL | O2 | Writes a query producing a per-control failure rate; reconciles it to a hand count |
| Reading the record | O3 | Reads the verdict from a structured finding/event, not a console screenshot |
| Two-source report | O4 | Combines a posture finding and an audit query into one evidence report |
| Deterministic verdict | O5 | Script gives byte-identical output across two runs; explains why that enables monitoring |
| State vs. events | O6 | Classifies each question correctly and justifies query-over-export to an auditor |

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are for learners who want a different voice, more SQL reps, or a vendor-specific deep dive. None of this is load-bearing — a learner who clicks zero links still meets every objective.*

- **SQLBolt — interactive SQL lessons** — in-browser, no setup; drills exactly the `SELECT`/`WHERE`/`GROUP BY`/aggregate core from §4.5. https://sqlbolt.com/ — *use if §4.5 went too fast and you want guided reps before the lab.*
- **Mode SQL Tutorial** — practical, analyst-oriented SQL with realistic datasets and an emphasis on aggregation and reporting. https://mode.com/sql-tutorial/ — *use for the "turn rows into a metric" angle on §4.5 and §5.3.*
- **Select Star SQL** — a free book that teaches SQL by reasoning about real questions, good for building the query-as-thinking habit. https://selectstarsql.com/ — *use if you want depth on why a query is the right shape, not just its syntax.*
- **AWS Skill Builder** — vendor courses on IAM, CloudTrail, Config, and Security Hub — the concrete AWS instances of the four-part model in §3. https://skillbuilder.aws/ — *use to put hands on the real AWS services after you've internalized the portable model; do not let the vendor framing replace the four-part mental model.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
