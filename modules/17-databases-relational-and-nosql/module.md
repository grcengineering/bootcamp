# Module 17 — Same Question, Three Stores: Where Control-Truth Lives at Rest

*Loop stages: LOCATE · QUERY · EVALUATE · EVIDENCE. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. A control is a claim about a system — and this is the module where you learn to reach that claim where it sits still: as a row, a field in a document, or a value behind a key, and to read it in whichever store the data happens to live.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, the three data models — relational (rows in typed tables joined by keys), document (self-describing records with nested fields), and key-value (an opaque value reached only by its key) — and how each stores the SAME control-truth in a structurally different shape.
2. **Query** one control claim ("which users lack MFA?") against all three stores on a real engine — a relational `SELECT`, a per-field document read, a key scan — and read the answer in each, with the honest caveat that the answer is identical because the eight users are identical.
3. **Map** an access pattern onto the store suited to it (a reporting join → relational, a whole-record fetch → document, a single-key lookup → key-value) and name where each store lets you *prove completeness* of the evidence.
4. **Diagnose** SQL injection by running a concatenated query and a parameterized query against the real engine over the same input and reading the differing result sets — the over-broad set the injection returns versus the empty set the parameter binds.
5. **Locate** where data-at-rest control-truth lives — the encryption-at-rest setting plus its key reference, and the access-enforcement boundary — and tie each to SC-28, AC-3, and SOC 2 CC6.1.
6. **Produce** an evidence finding that names the answer, the store it came from, the value that breaks (or proves) the control, and the framework reference.

Each objective is checked by the Assessment in §7. If you can already produce the §7 evidence findings unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Every control you assess is a claim about a system, and a great many of those claims are claims about *data sitting still* — at rest, in a store, waiting to be read. "Every user has MFA." "Suspended accounts cannot authenticate." "Cardholder data is encrypted at rest." The truth of those claims does not live in a dashboard screenshot or a vendor's word. It lives in a store, as a value you can reach and read — and the first thing that store decides is *what shape that value has*.

The trap is believing the store changes the truth. It does not. The same eight users, the same single fact "MFA is off for this account," can sit in a relational row, inside a JSON document, or behind a key in a key-value map. The control question is the same in all three; what changes is *how you reach the answer* — a `WHERE` clause, a field path, a key lookup. An auditor who can only read one store is at the mercy of whoever chose it. An auditor who can read the claim in whichever store the data landed in can never be told "it's in our NoSQL thing, you wouldn't understand."

This is the module where **LOCATE** means "find the store and the field within it," **QUERY** means "ask the real engine, not the owner," and **EVALUATE** is reading the returned rows against the claim. It is also where you meet the most common way a query itself becomes the vulnerability: SQL injection, where untrusted text is glued into a query string and the store faithfully answers a question the application never meant to ask. The discipline is the GRC mindset in its purest at-rest form: the owner *claims*, the store *holds the truth*, the engine *answers honestly*, and the gap between the claim and the rows is your finding.

---

## 3. The Mental Model

Picture one fact about your company — "Bob has not turned on multi-factor authentication" — written down in three different filing systems, side by side.

The first is a **spreadsheet with strict columns** (the relational model): one row per person, a column for `email`, a column for `mfa_enabled` that may only ever be `0` or `1`. To find everyone without MFA you scan the `mfa_enabled` column and keep the rows that read `0`. The shape forces every row to have exactly the same fields, which is why you can ask a precise question across all of them at once — and why a *reporting* question ("how many, grouped by status?") is natural here.

The second is a **folder of index cards** (the document model): one self-describing card per person, each carrying its own little `{ "email": …, "mfa_enabled": false, "status": "active" }`. The card *describes itself* — you do not need a separate column definition to read it — and a card could carry extra fields another card lacks. To answer the same question you open each card and read its `mfa_enabled` field. The natural access here is "give me this whole person's record," not "join these two stacks of cards."

The third is a **coat-check counter** (the key-value model): you hand over a ticket (a key like `user:u_002`) and get back an opaque bundle (the value) — the counter neither knows nor cares what is inside the bundle. It is the fastest possible "give me exactly this one thing by its ticket," and useless for "show me every bundle whose contents mention MFA," because the counter cannot see inside. To answer the control question you must know each key, fetch each value, and read it yourself.

Here is the whole point: **the fact never changed.** Bob's missing MFA is the same truth in the spreadsheet cell, the card field, and the coat-check bundle. The control question — "which users lack MFA?" — has one true answer over these eight people, and a real engine returns that same answer from each store. What differs is the *reach*: a column predicate, a field path, a key-then-read. The store is a choice about access patterns and proof-of-completeness, not a choice about what is true. And when you build the question by *gluing untrusted text into it* instead of *binding it as a value*, you hand the store a different question than you meant — that is injection, and it is a property of how the query was assembled, not of which store you used.

Everything in this module you read off a real database engine — the same SQLite that ships in your phone and your browser — running over real rows. There is no answer key. The engine's result set is the answer key.

---

## 4. Concepts

### 4.1 The relational model: rows, types, and a predicate over a column

A relational store holds **typed tables**: a fixed set of named, typed columns, and zero or more rows that each fill exactly those columns. The eight users become eight rows of a `users` table with `id`, `email`, `mfa_enabled` (an integer `0`/`1`), and `status`. The control claim "every user has MFA" is a **predicate over a column**: `mfa_enabled = 0` selects exactly the violators. The relational engine is built to evaluate such predicates across every row at once and to *aggregate* (`COUNT`, `GROUP BY`) — which is why the relational store is the natural home of a completeness question like "how many users, and how many lack MFA?" The rigid schema is the feature: because every row has the same shape, one query reaches all of them and you can prove you looked at the whole set.

### 4.2 The document model: self-describing records read by field path

A document store holds **self-describing records** — here, one JSON object per user. The record carries its own field names, so `{ "email": "bob@acme.example", "mfa_enabled": false, "status": "active" }` is readable without a separate schema definition, and records may differ in which optional fields they carry. You reach the control-truth by **field path**: read the `mfa_enabled` field of each document. On a real SQLite engine you can store the document in a text column and read into it with `json_extract(doc, '$.mfa_enabled')` — the engine parses the real JSON and returns the real field value, so the document is queryable the same honest way a row is. The natural access pattern is "fetch this whole record," which is why document stores back things like a user profile or a config blob; the cost is that a cross-record reporting question takes more work than a single column scan.

### 4.3 The key-value model: an opaque value reached only by its key

A key-value store is the simplest model: a flat map from a **key** to an **opaque value**. Here `user:u_002` → `bob@acme.example|mfa=0|active`. The store's whole contract is "give me the value for this key" and "store this value under this key" — extremely fast, trivially scalable, and *deliberately blind to the value's contents*. That blindness is the trade: to answer "which users lack MFA?" the store cannot help you filter, because it cannot see inside the values; you must enumerate the keys, fetch each value, and parse it yourself. For GRC this matters because *completeness* in a key-value store depends on knowing you have every key — there is no schema enumerating the fields and no column to scan, so "did I check every record?" is a question you answer by the key list, not by the store.

### 4.4 The same answer, three reaches — and why that is the lesson

Lay the three stores beside each other over the SAME eight users and the control question "which users lack MFA?" returns the **same answer** from each: the accounts whose MFA is off. That identity is the lesson. The store did not change the truth; it changed the *reach*. Relational: a `WHERE mfa_enabled = 0` predicate over a column. Document: `json_extract(doc, '$.mfa_enabled')` read as a field path. Key-value: a scan of every key, fetching and parsing each value. When an owner says "the answer is different in our document database," they are confusing the *shape of the reach* with the *truth of the data*. Your job is to read the claim in whichever store it lives, and to know which reach proves you saw every record.

### 4.5 SQL injection: when the query becomes the vulnerability

A query is a question. **SQL injection** is what happens when an application builds that question by gluing untrusted user input directly into the query *string* instead of passing it as a bound *value*. The classic input is `' OR '1'='1`. Concatenated into `SELECT email FROM users WHERE email = '<input>'`, it closes the string early and adds an always-true clause, so the store faithfully returns *every* row — the application asked for one user and got the whole table. Run the same input through a **parameterized** query, where the input is bound to a `?` placeholder as a value, and the engine treats the entire string as one literal email address that matches nobody: the result set is empty, exactly correct. The vulnerability is not in the store and not in the data; it is in *how the query was assembled*. Reading the two differing result sets off the real engine is how you prove the control (parameterization, NIST SI-10 / OWASP A03) is present or absent — the engine answers both questions honestly, and the over-broad set is the evidence of the break.

### 4.6 Data-at-rest control-truth: encryption setting, key reference, and access boundary

Beyond reading the data, two control claims live *about* the store, not in its rows. **Encryption at rest** (SC-28, CC6.1) is true when the storage layer encrypts the bytes on disk and a named key protects them — so its truth lives in a *setting* (encryption enabled?) plus a *key reference* (which KMS key, which rotation policy), not in any user row. **Access enforcement** (AC-3) is true when the store only returns rows to a principal authorized for them — its truth lives in the access-control boundary (roles, grants, row-level policy), again not in the data itself. The auditor's move is to LOCATE each: for "encrypted at rest," point to the encryption setting and the key reference; for "access enforced," point to the grant or policy that gates the query. A returned row proves the *data* claim; the setting and the policy prove the *at-rest* and *access* claims. Conflating them — "the data looks fine, so it must be encrypted" — is the classic at-rest mistake.

### 4.7 A control is a query plus a place — which is why a result set is evidence

Pull the threads together. The claim "every user has MFA" is a predicate (`mfa_enabled = 0` returns nobody) evaluated against a place (the `users` table, the documents, or the keys). The claim "this query is injection-safe" is a property of how the question was assembled (bound value, not glued string), proven by the empty result set the parameterized form returns. The claim "data is encrypted at rest" is a setting plus a key reference. Each control names a query (or a setting) and a place; the evidence is the real engine's answer over real data. That is the whole game at rest: an owner makes a claim, the store holds the truth, the engine answers, and your finding is the row — or the absence of a row, or the over-broad set — where the claim and the data disagree. This is the bridge to EVIDENCE: a scheduled query is exactly this, re-run on a cadence, producing the same honest result set nobody had to screenshot.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using the same eight `acme.example` users the API module pulled, loaded three ways into a real SQLite engine. The result sets shown are the real engine's output over the real rows. (Worked examples are Tier-B content — reviewed when the seed data or engine conventions shift.)

### 5.1 LOCATE + QUERY: the relational store answers the completeness question

The eight users sit in a `users` table. "Which users lack MFA?" is a predicate over the `mfa_enabled` column:

```sql
SELECT email FROM users WHERE mfa_enabled = 0 ORDER BY email;
```

```
email
bob@acme.example
dave@acme.example
frank@acme.example
heidi@acme.example
```

Four of the eight lack MFA. The relational store also answers the completeness framing in one shot — `SELECT COUNT(*) FROM users` returns `8`, so you can prove you evaluated every account, not a sample. The engine, not you, produced these rows.

### 5.2 QUERY: the document store returns the same answer by field path

The same eight users, one JSON document each, in a `users_doc` table. The reach is a field path, not a column:

```sql
SELECT json_extract(doc, '$.email') AS email
FROM users_doc
WHERE json_extract(doc, '$.mfa_enabled') = 0
ORDER BY email;
```

The result set is byte-for-byte the same four addresses. That is the point of §4.4: the store changed the *reach* (`json_extract` into a self-describing record) but not the *truth*. The document model would shine if you asked "give me Bob's whole record" — one fetch returns every field — but for the MFA completeness question it returns exactly what the relational store did.

### 5.3 EVALUATE: the key-value store makes you enumerate

In `users_kv`, each user is one row of `(key, value)` like `('user:u_002', 'bob@acme.example|mfa=0|active')`. The store cannot filter on the value's contents, so the honest answer requires reading each value. Selecting the keys whose value encodes `mfa=0` returns the same four users — but notice the work: you had to know the value's internal format and parse it yourself, and you can only claim completeness because you scanned every key. That is the key-value trade-off made concrete.

### 5.4 DIAGNOSE: injection is in the assembly, not the store

A lookup-by-email feature is meant to return one user. Built by concatenation:

```sql
SELECT email FROM users WHERE email = '' OR '1'='1';
```

with the input `' OR '1'='1`, the engine returns **all eight rows** — the application asked for one and got the table. Bind the same input as a value instead (`WHERE email = ?` with the literal `' OR '1'='1`) and the engine matches nobody: the result set is **empty**, exactly correct, because the whole string is treated as one email address. The two result sets are the evidence. The over-broad set is the SI-10 finding; the empty set is the control working. Neither is your opinion — the engine answered both.

### 5.5 LOCATE: the at-rest claims live in settings, not rows

"Cardholder data is encrypted at rest" is not provable by any `SELECT` over the user rows — a row reads the same whether or not the disk is encrypted. Its truth lives in the storage encryption setting and the key reference (SC-28 / CC6.1). "Suspended users cannot read other users' data" is not in the rows either; it is in the access policy (AC-3). The finding here is a *pointer* — to the setting, the key, the grant — paired with the data answer, never the data answer alone.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (seed data and engine conventions drift). This lab runs entirely in your browser on the bootcamp site (Module 17 → Interactive lab) — no install, no database to stand up.

**Scenario.** You are handed the same eight `acme.example` users loaded three ways into a real SQLite engine — a relational `users` table, a `users_doc` table of JSON documents, and a `users_kv` key-value table — and asked to answer one control question, "which users lack MFA?", in each store, then to diagnose a SQL-injection break by running a concatenated query against a parameterized one.

> **Interactive lab.** The lab is a real SQLite console (the same WASM SQLite that runs in your browser) seeded with the three stores over identical data. You type SQL; the engine returns real result sets, which are checked against the engine's own output — there is no authored answer key. The injection task runs a concatenated query (returning the over-broad set) and then a parameterized one (returning the empty set), both real engine runs.

**Tasks (performed on the console).**

1. Run `SELECT email FROM users WHERE mfa_enabled = 0 ORDER BY email;` on the relational store and read the four users who lack MFA. *(Objectives 1, 2)*
2. Run `SELECT COUNT(*) AS n FROM users;` and confirm you can prove you evaluated all eight accounts — the completeness the relational store gives you. *(Objectives 2, 3)*
3. Answer the SAME question against the document store with `json_extract(doc, '$.mfa_enabled')` and confirm the result set is identical to the relational answer. *(Objectives 1, 2)*
4. Answer it against the key-value store by scanning the keys whose opaque value encodes `mfa=0`, and note that you had to parse the value yourself. *(Objectives 2, 3)*
5. Run the **concatenated** injection query with the input `' OR '1'='1` and read the over-broad result set (all eight rows). *(Objective 4)*
6. Run the **parameterized** form of the same lookup with the same input and read the empty result set — the control working. *(Objective 4)*

**Deliverable.** A short written evidence finding: the four users lacking MFA, the store you read them from, the injection result (over-broad vs empty), and the framework reference (SC-28 / AC-3 / CC6.1 for at-rest, SI-10 for injection).

---

## 7. Assessment

**Competency artifact (not a quiz).** From the three real stores provided at assessment time, the learner must, unaided:

- **Query** the control claim "which users lack MFA?" against the relational store and read the result set off the real engine (`engine_result_equals`), and prove completeness with a `COUNT(*)` over all eight accounts.
- **Query** the SAME claim against the document store via `json_extract` and confirm the result set is identical (`engine_result_equals`) — demonstrating that the store changed the reach, not the truth.
- **Diagnose** SQL injection by running the concatenated query (over-broad result set, all rows) and the parameterized query (empty result set) over the same `' OR '1'='1` input, reading both off the real engine (`engine_result_equals`), and naming the control (SI-10) the over-broad set breaks.
- **Produce** an evidence finding naming the answer, its store, the injection result, and the at-rest and access controls it maps to (SC-28 / AC-3 / CC6.1; SI-10).

Every shown value is the real SQLite engine's result set over the real rows; the engine is the oracle. A query that returns the wrong rows, or a control mapped to the wrong store, routes the learner back to the specific concept section — not the whole module.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **SQLite documentation — `SELECT` and the JSON functions** — the reference for the relational queries and the `json_extract` reads used in §5. https://www.sqlite.org/lang_select.html and https://www.sqlite.org/json1.html — *use to confirm any query syntax against the same engine the lab runs.*
- **OWASP — SQL Injection and the Query Parameterization Cheat Sheet** — the canonical treatment of §4.5's concatenation-vs-binding distinction. https://owasp.org/www-community/attacks/SQL_Injection and https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html — *use for a second voice on why binding a value is structurally safe and gluing a string is not.*
- **NIST SP 800-53 Rev.5 — SC-28 (Protection of Information at Rest), AC-3 (Access Enforcement), SI-10 (Information Input Validation)** — the authoritative control text behind §4.6 and the injection mapping. https://csrc.nist.gov/projects/risk-management/sp800-53-controls/release-search — *use as the lookup when you want to confirm a control's exact wording from the source.*
- **MongoDB and Redis documentation** — real-world document and key-value stores to compare against the models in §4.2 and §4.3. https://www.mongodb.com/docs/ and https://redis.io/docs/latest/ — *use to see how a production document store and a production key-value store frame the same access-pattern trade-offs.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
