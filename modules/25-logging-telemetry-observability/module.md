# Module 25 — The Field That Proves It: Reading a Log Line as Continuous Evidence

*Loop stages: LOCATE · QUERY · EVALUATE · EVIDENCE · MONITOR. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. Every other module reads a control's truth where it sits still — in a file, a packet, a cert. This is the module where that truth becomes continuous: born once per event, in a single structured log line, at a fixed field you can point to. A control claim is only as true as the field that records it — and either you can read that field or you are trusting that someone logged it.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, why a log line is not prose but a structured record with named fields, decoding a real RFC 5424 line into its HEADER fields (PRI, VERSION, TIMESTAMP, HOSTNAME, APP-NAME, PROCID, MSGID) and reading the NILVALUE `-` as a real "this field is genuinely absent," not as the literal text "dash."
2. **Compute** the Facility and Severity from the single PRI byte by hand — PRIVAL = Facility × 8 + Severity — recovering Facility from the high bits (PRIVAL ÷ 8) and Severity from the low three (PRIVAL mod 8), and reading the Severity word that decides whether an alert ever fires.
3. **Locate** where each control claim's continuous evidence physically lives in the line — the auth outcome and severity for AC-7/IA-5, the actor/timestamp/outcome content for AU-3, the retention horizon implied by what the record carries for AU-11 — naming the field, not the dashboard.
4. **Trace** the log pipeline (source → collector → store → query → alert) as an ordered flow and state precisely where evidence is *born* (the source, once) versus where it is *queried* (the store, repeatedly), so you never mistake a query for the evidence.
5. **Diagnose**, across a noisy real stream, the single event that proves or breaks a control claim — distinguishing an audit record from an application record — and read the one field whose value is the proof or the gap.
6. **Produce** an evidence finding that names the field, its value, the control it evidences or breaks, and the framework reference (NIST 800-53 AU-3 / AU-11 / AC-7 / IA-5; SOC 2 CC7.2 / CC7.3).

Each objective is checked by the Assessment in §7. If you can already produce the §7 Log Evidence Finding unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Every other control you have read so far is a claim you read once, at a moment of your choosing: you open the config, you peel the packet, you decode the cert. But the most important property of a control is not that it was true the moment you looked — it is that it *stays* true, and that the system itself keeps a record every time it acts. That record is the log line. "Failed logins are alerted." "Privileged access is recorded." "Records are retained for a year." None of those claims live in a config; they live in whether the right field was written, with the right value, every single time the event happened. The dashboard on top is a query. The alert is a query. The truth is the field underneath them both.

This is the module where **EVIDENCE** stops meaning "I produced a screenshot" and starts meaning "the system produced a record, and I can read the field that proves the control fired." Where **MONITOR** stops being a vague aspiration and becomes a concrete claim about a field's value over a stream of real events. An auditor who can read a log line knows the difference between a control that *is* enforced and a control that merely has a dashboard pointed at it — because they know exactly which field would carry the proof, and they have read it.

The discipline this builds closes the loop the whole band has been walking: the owner *claims* a control is continuously enforced, the log stream is the *ground truth* of every time it acted, and the gap between them — a severity quietly downgraded below the alert threshold, an actor field left blank, an event that never appears at all — is your finding. A log line is where continuous control-evidence is born, and reading one is the last skill the auditor needs to never again take "trust me, it's monitored" at face value.

---

## 3. The Mental Model

Picture the receiving dock of a warehouse. Every time a truck arrives, the clerk fills out the same pre-printed form: a stamp in the top corner with a priority code, the date and time, which dock, which crew, which job ticket, and a short note about what came in. Nobody writes a paragraph. The form has *slots*, and the value in each slot means something fixed: the priority stamp decides whether the night manager gets paged; the crew slot decides who is accountable; a slot left with a dash means "not applicable to this delivery," which is itself information. A year of those forms, filed in order, is the only honest answer to "did we actually receive what we were supposed to, and did anyone get alerted when something was wrong?" The forms are the evidence. The clipboard summary the manager reads each morning is just a count of the forms — and if a form was filled out wrong, the summary inherits the error and hides it.

A real syslog line is exactly that pre-printed form. The format the world standardized on (RFC 5424) gives every line the same slots in the same order: a **PRI** stamp in angle brackets, a **VERSION**, then **TIMESTAMP**, **HOSTNAME**, **APP-NAME**, **PROCID**, and **MSGID** — the HEADER — followed by optional **STRUCTURED-DATA** in brackets and finally the free-text **MSG**. Each slot is at a known position, and a lone `-` in a slot is the NILVALUE: the standard's way of writing "this field is genuinely absent here," which you must read as absence, not as the character "dash."

The cleverest slot is the very first one, the **PRI**, because it is bit-packed: one small number, `<34>`, carries *two* facts. The whole number is the **PRIVAL**, and the rule is **PRIVAL = Facility × 8 + Severity**. So to read it you do the arithmetic the writer did in reverse: the Facility is the high bits (PRIVAL ÷ 8, integer), the Severity is the low three bits (PRIVAL mod 8). `<34>` → 34 ÷ 8 = 4 (Facility 4, the security/authorization subsystem) and 34 mod 8 = 2 (Severity 2, Critical). That Severity number is the slot the alerting rule reads: a "page me on Critical-or-worse" rule fires on Severity 2 and ignores Severity 7 (Debug). Change the PRIVAL and you change whether anyone is ever told — which is precisely how a logged-but-silent control failure hides in plain sight.

This is the same move the whole band has been teaching — find the layer, the field, the byte — applied to a log line instead of a packet. The OSI poster taught you to point at a layer; here you point at a *slot*. And as before, there is no answer key: every value in this module is what a real RFC 5424 parser computes from the real characters of a real line. The line is the answer key. Your job is to read the slot.

---

## 4. Concepts

### 4.1 A log line is a structured record, and the slots have fixed positions

A well-formed syslog line is not a sentence; it is a record with named fields in a fixed order, exactly like the dock form. RFC 5424 defines the grammar: `SYSLOG-MSG = HEADER SP STRUCTURED-DATA [SP MSG]`, and `HEADER = PRI VERSION SP TIMESTAMP SP HOSTNAME SP APP-NAME SP PROCID SP MSGID`. Because the slots are positional and space-delimited, a parser can walk the line once and hand you each field by name — PROCID is the fifth space-delimited token after the version, not "wherever the number is." Reading a log line is therefore the same act as peeling a packet: you locate a field by its position in the grammar, and you read the value the writer put there. The reason this matters for control evidence is that a *structured* record is queryable and provable; a free-text blob is neither. "Did this control fire?" is answerable only when the outcome lives in a known field.

### 4.2 NILVALUE `-` is a real absence, not the text "dash"

Several slots are allowed to be empty, and the standard writes empty as a single hyphen: the **NILVALUE** `-`. This is one of the most common misreads in log analysis, and it is a control-relevant one. A PROCID of `-` does not mean a process named "dash" wrote the line; it means the writer had no process id to record. STRUCTURED-DATA of `-` means there is none. The honest reading is *absence*, and absence is sometimes the finding: an audit record whose actor field is NILVALUE cannot attribute the action, so a control that claims "privileged actions are attributable to a user" is broken by a `-` where a username should be. A parser that silently treats `-` as a string is hiding a gap; a parser that reports it as absent is showing you one.

### 4.3 The PRI byte is bit-packed: one number, two facts

The first slot is the **PRI**, written `<PRIVAL>`, and it is the densest field in the line because it packs two independent codes into one small integer. The rule is fixed by RFC 5424 §6.2.1: **PRIVAL = Facility × 8 + Severity**. To recover the two facts you reverse the arithmetic — Facility is `PRIVAL ÷ 8` (integer division, the high bits), Severity is `PRIVAL mod 8` (the low three bits). Facility names *which subsystem* spoke (Facility 4 = security/authorization, the source of auth events; Facility 20 = local use 4, a common application channel). Severity names *how loud* the event is, on a scale from 0 Emergency to 7 Debug. Two worked examples the RFC itself states: `<34>` → Facility 4, Severity 2 (Critical); `<165>` → 165 ÷ 8 = 20 (local4), 165 mod 8 = 5 (Notice). The arithmetic is the oracle; there is nothing to memorize beyond the formula.

### 4.4 Severity is the field the alert reads — so it is where a control silently dies

Severity is not decoration; it is a control parameter. Alerting rules are written as predicates over the Severity number: "page on Severity ≤ 2" fires on Emergency, Alert, and Critical and stays silent on everything else. This makes the Severity slot the single most consequential field for a "failures are alerted" control, and the easiest place for that control to fail without anyone noticing. Take a real auth-failure line stamped `<34>` (Severity 2, Critical) — an alert fires. Change only the PRIVAL to `<39>` and the same event, same Facility 4, is now Severity 7 (Debug). The event is still logged — a naive "we log all auth failures" check passes — but it now slips silently under the Critical-or-worse alert threshold and no one is ever paged. The break is one number, and it is invisible to anyone who reads the message text instead of computing the Severity from the PRI.

### 4.5 STRUCTURED-DATA is where machine-readable control evidence lives

Free-text MSG is for humans; **STRUCTURED-DATA** (the bracketed `[SD-ELEMENT]` blocks) is for machines, and it is where modern control evidence increasingly lives. Each element has an **SD-ID** (like `exampleSDID@32473`, enterprise-namespaced so vendors do not collide) and a list of `name="value"` **SD-PARAMs**. Because these are key-value pairs at known names, a query can ask "show every event where `eventID` is the lockout code" without parsing English. For GRC this is the difference between evidence you can prove completeness over and evidence you have to read by eye: a control claim mapped to a named SD-PARAM is continuously and automatically verifiable; the same claim buried in MSG text is not. The skill is to peel the element to its SD-ID and parameters and read the control-relevant value off the named slot.

### 4.6 Evidence is born at the source and queried at the store — and they are different places

A log pipeline is an ordered flow: a **source** emits the line the instant the event happens; a **collector** ships it; a **store** indexes it for retrieval; a **query** pulls it back; an **alert** fires a predicate over it. The single most important thing to know about this flow is *where evidence is born*: at the **source**, exactly once, at the moment of the event — and nowhere else. Everything downstream is a copy or a question about that original. This is why "born vs queried" is the load-bearing distinction: the store is where you *query* evidence, but it is not where evidence is *true*. If the source never emitted the line (the control's instrumentation was off), no amount of querying the store will find it — the gap is upstream of every dashboard. Conversely, retention (AU-11) is a property of the store: how long the born evidence is kept queryable. Confusing the two is how teams "prove monitoring" by showing a query console while the actual evidence was never generated.

### 4.7 Audit logs and application logs answer different questions

Not every log line is control evidence. An **application log** records what the software did for its own debugging — a request served, a cache miss, a timing. An **audit log** records *who did what, when, and whether it was allowed* — exactly the security-relevant facts a control claim is about. The distinction is not the format (both can be RFC 5424); it is the *content and the field that carries the outcome*. AC-7 (unsuccessful logon attempts) and IA-5 (authenticator management) are evidenced by audit lines whose Severity and outcome field carry the auth result; AU-3 (content of audit records) is the claim that those lines carry *enough* — actor, timestamp, outcome, source. When you diagnose a stream, the first move is to separate the audit lines (the ones a control claim is even about) from the application noise, then read the deciding field on the right line. A control evidenced by an application log that lacks the audit content is a finding regardless of how much logging volume exists.

### 4.8 A control is a predicate over a field — which is why a log line is evidence

Pull the threads together. AC-7 ("unsuccessful logon attempts are recorded and alerted") is a predicate over the auth line's outcome field *and* its Severity (is it at or above the alert threshold?). AU-3 ("audit records contain who/what/when/outcome") is a predicate over the presence and non-NILVALUE of those fields. AU-11 ("records are retained N days") is a predicate over the store's retention horizon for born evidence. Each control names a field, an expected value, and a place in the pipeline. The evidence is a real log line whose field either satisfies the predicate or violates it. That is the whole game, now continuous: the owner claims a control is enforced over time, the log stream carries the truth of every time it acted, and your finding is the single field where a real event disagrees with the claim. This is MONITOR made concrete — a SIEM rule, a retention policy, an alert is each just this predicate, evaluated continuously, on fields nobody had to screenshot.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using the verbatim RFC 5424 §6.5 example lines and the PRIVAL arithmetic the RFC itself states. Every decoded value is what a real RFC 5424 parser computes from the real characters of the line, cross-checked against the RFC's own worked statements. (Worked examples are Tier-B content — reviewed when RFC errata or pipeline conventions shift.)

### 5.1 LOCATE + QUERY: peel one real line, slot by slot

Here is RFC 5424 Example 1, an authentication-failure record (the leading `﻿` before the MSG is the real UTF-8 BOM the RFC prints as "BOM"):

```
<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - ﻿'su root' failed for lonvick on /dev/pts/8
```

Walk it as the §3 dock-form model. `<34>` is the PRI stamp. `1` is the VERSION. Then the six space-delimited HEADER slots: TIMESTAMP `2003-10-11T22:14:15.003Z`, HOSTNAME `mymachine.example.com`, APP-NAME `su`, PROCID `-` (NILVALUE — *absent*, not "dash"), MSGID `ID47`. Then STRUCTURED-DATA `-` (NILVALUE — no machine fields here), and finally the MSG, the human note that `'su root' failed for lonvick`. Each slot is at a fixed position in the grammar, and the parser hands you each by name. Nothing is authored — the line is the answer key.

### 5.2 EVALUATE: compute the PRI and read the control parameter

The PRI is the slot that decides whether this auth failure ever pages anyone. Do the arithmetic: PRIVAL `34`, so Facility = 34 ÷ 8 = **4** (security/authorization — the right subsystem for an auth event), and Severity = 34 mod 8 = **2** (**Critical**). A "page on Critical-or-worse" rule fires. Now the trap: a second line is byte-for-byte identical except its PRI reads `<39>`. Same event, same Facility (39 ÷ 8 = 4), but Severity = 39 mod 8 = **7** (**Debug**). The event is still logged — "we log auth failures" still passes — but a Critical-threshold alert never fires on Debug. The control "auth failures are alerted" is broken by one number, and you can only see it if you compute the Severity from the PRI rather than reading the message text.

### 5.3 LOCATE the machine evidence: peel a STRUCTURED-DATA element

RFC 5424 Example 3 carries a structured element:

```
<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3" eventSource="Application" eventID="1011"] ﻿An application event log entry...
```

Peel the bracketed block: the SD-ID is `exampleSDID@32473` (enterprise-namespaced so vendors do not collide), and its SD-PARAMs are `iut="3"`, `eventSource="Application"`, `eventID="1011"`. A query can now ask "every event where `eventID` is the lockout code" by name, with no English parsing — which is why control evidence belongs in STRUCTURED-DATA, not buried in MSG. Compute this line's PRI too: PRIVAL 165 → Facility 20 (local4), Severity 5 (Notice) — the RFC's own worked example.

### 5.4 DIAGNOSE: the field where the claim breaks

Put the clean Critical line beside the real downgraded one and the finding is a single divergent field. Clean: PRI `<34>` → Severity 2 (Critical) → the alert fires. Broken: PRI `<39>` → Severity 7 (Debug) → the alert is silent. The discriminating value is not your opinion; it is the parser's arithmetic over the real PRI byte of two real lines (same Facility 4, only the Severity moved). Your Log Evidence Finding names the field (PRI → Severity), both values (Critical vs Debug), the broken control (AC-7 / AU-3 — auth failures recorded *and* alertable; SOC 2 CC7.2/CC7.3), and the framework reference — and anyone can re-derive it from the same characters with the PRIVAL formula.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (RFC errata + pipeline conventions drift). This lab runs entirely in your browser on the bootcamp site (Module 25 → Interactive lab) — no install, no log collector needed.

**Scenario.** You are handed the real RFC 5424 example log lines and asked to read their control-relevant truth directly off the slots — compute the Facility and Severity from the PRI byte, read a NILVALUE as absence, peel a STRUCTURED-DATA element — then trace where evidence is born versus queried, map each field to the control it evidences, and diagnose the single field where a real downgraded line breaks its control claim.

> **Interactive lab.** The lab is the Inspect-&-Assemble surface: the real log line rendered as nested, clickable named regions (the OSI move applied to a log). Selecting a region reveals the parser's real decode — the same value a reference RFC 5424 parser produces — including the PRI bit-unpack expanded into its Facility and Severity. The pipeline is an orderable born-vs-queried TRACE; the field→control map is a MAP board; every task is machine-verified against the parser's parse tree, the pipeline sim, and the cited control key. The line is the answer key.

**Tasks (performed on the surface).**

1. Select the **PRI** region on the clean auth-failure line and read the PRIVAL; then open the bit-unpack and read the **Facility** (PRIVAL ÷ 8) and **Severity** (PRIVAL mod 8). State which slot the alert rule reads. *(Objectives 1, 2)*
2. Select the **PROCID** slot and read it. State why a NILVALUE `-` here means the field is genuinely absent, not the text "dash" — and what a `-` in an actor field would do to an attributability control. *(Objectives 1, 3)*
3. Peel the **STRUCTURED-DATA** element on the structured line: read its SD-ID and a named SD-PARAM, and state why a control mapped to a named parameter is provable where the same fact in MSG text is not. *(Objectives 1, 3)*
4. **Trace** the pipeline (source → collector → store → query → alert). State where the evidence is *born* and where it is *queried*. *(Objective 4)*
5. **Map** the deciding fields onto the controls they evidence — Severity/outcome → AC-7/IA-5, audit content → AU-3, retention → AU-11 — and classify one line as audit and one as application. *(Objectives 3, 5)*
6. **Diff-the-Trace.** Switch to the broken line and compute the single field — the PRI's Severity — where the real downgraded line (`<39>` → Debug) contradicts the "auth failures are alerted" claim. *(Objective 5)*

**Deliverable.** A short written Log Evidence Finding for the Diff: the field, the clean value, the broken value, the control claim broken, and the framework reference (AU-3, AC-7, or AU-11).

---

## 7. Assessment

**Competency artifact (not a quiz).** From real log lines provided at assessment time, the learner must, unaided:

- **Peel** a real RFC 5424 line and read, off the slots at their grammar-fixed positions, the HEADER fields, the PROCID/STRUCTURED-DATA NILVALUEs as genuine absences, and — by reversing PRIVAL = Facility × 8 + Severity — the Facility and Severity from the single PRI byte, each verified against the parser's parse tree (`region_labeled_correctly`, `field_value_is`).
- **Trace** the pipeline (source → collector → store → query → alert) in order and state where evidence is born versus queried (`sequence_matches`), and **map** the deciding fields onto the controls they evidence — Severity/outcome → AC-7/IA-5, audit content → AU-3, retention → AU-11 — including the trap of an application log offered as audit evidence (`mapping_correct` against the cited NIST 800-53 / SOC 2 key).
- **Diff-the-Trace**: given a clean line and a real downgraded twin, compute the single field where the evidence contradicts the control claim (`field_value_is` against the parser's computed Severity divergence), then write a **Log Evidence Finding** naming the field, both values, the broken control, and the framework reference (NIST 800-53 AU-3 / AU-11 / AC-7 / IA-5; SOC 2 CC7.2 / CC7.3).

Every shown value is the RFC 5424 parser's output over real characters, fidelity-checked against the RFC's own worked decode. A single field read wrong, or a control mapped to the wrong slot, routes the learner back to the specific concept section — not the whole module.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **RFC 5424 — The Syslog Protocol** — the authoritative grammar this module reads from: the HEADER fields, the PRIVAL = Facility × 8 + Severity arithmetic, NILVALUE, STRUCTURED-DATA, and the §6.5 example lines. https://www.rfc-editor.org/rfc/rfc5424 — *use as the lookup when you want to confirm a slot's position and meaning, or the Facility/Severity tables, from the source.*
- **NIST SP 800-53 Rev. 5 — the AU (Audit and Accountability) control family** — the control language behind §4.7–§4.8: AU-2 (event logging), AU-3 (content of audit records), AU-11 (audit record retention), plus AC-7 and IA-5. https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final — *use for a second, formal treatment of exactly what an audit record must contain and how long it is kept.*
- **OWASP Logging Cheat Sheet** — a practitioner's view of what to log and what never to log (no secrets, no full session tokens) so a log line is evidence and not a liability. https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html — *use to connect the structured-record idea to the real-world choices about which fields belong in an audit line.*
- **OpenTelemetry Logs specification** — the modern, vendor-neutral data model that generalizes the "structured fields" idea this module teaches on syslog (severity number, attributes, resource) across logs, metrics, and traces. https://opentelemetry.io/docs/specs/otel/logs/ — *use to see how the same born-once-at-the-source, query-at-the-store model scales beyond a single log format.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
