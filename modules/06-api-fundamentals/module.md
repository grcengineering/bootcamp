# Module 06 — API Fundamentals

*Loop stages: LOCATE · QUERY · EVIDENCE. Tier-1 capstone of the Common Core. Original content; third-party material is confined to §8. This is the module where shell, Python, and JSON converge: the first time the truth of a control lives not on a disk you can `ls`, but behind a network endpoint you have to ask — correctly, completely, and with proof.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, what an API is by analogy to a service counter — a contract for asking a system questions — and why HTTP methods and status codes are the verbs and verdicts of that conversation.
2. **Map** a control claim ("every workforce user has MFA") to the specific API endpoint, fields, and pagination behavior that hold its truth, before writing a line of code.
3. **Describe** the authentication ladder — API key, bearer token, OAuth2 client-credentials, least-privilege scopes — and **diagnose** which rung a given vendor requires from its `401`/`403` responses and its docs.
4. **Compose** a paginated pull that follows cursors or pages until the API signals "no more," and **explain** why a pull that stops early produces evidence that is quietly, dangerously incomplete.
5. **Diagnose** a `429` rate-limit response and respond to it correctly (honor the retry signal, back off) rather than hammering the endpoint or silently dropping records.
6. **Produce** a Git-versioned script that authenticates to a SaaS API, paginates every result, parses the JSON, computes a control metric, and emits an audit-ready report mapped to a named control — exiting with a machine-readable verdict.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move to Tier 2.

---

## 2. Why this matters for GRC

In every prior Tier-1 module the truth of a control sat somewhere you could reach by hand: a config file, a process, a log on a disk you control. The modern reality is that most of your controls now live inside someone else's system — your identity provider, your code host, your cloud, your HR platform — and the only door into that system is its API. This module is where **LOCATE** stops meaning "find the file" and starts meaning "find the endpoint and the field," where **QUERY** stops being a shell pipe and becomes an authenticated, paginated, rate-limit-respecting network call, and where **EVIDENCE** becomes a report you can regenerate on a schedule without a human ever logging into a vendor console to take a screenshot. An API pull is the single most common shape of automated evidence collection in real GRC engineering — and the most common place it goes wrong is silent incompleteness, which is why "did I get *all* of it?" is a first-class concern here, not a footnote.

---

## 3. The Mental Model

Forget, for a moment, the acronym. Start with a question: when two programs that have never met need to work together, how does one ask the other for something without either one breaking the instant the other changes inside?

The answer humans invented for the same problem is the **service counter**. Walk up to a passport office. You do not get to walk into the back room, open their filing cabinets, and rummage. There is a counter. At the counter there are a small number of things you are allowed to ask for, each with a defined form: "renew this," "check the status of that," "submit this." You hand over a request in the expected shape; a clerk does whatever happens in the back — you neither see nor care — and hands back a response in a predictable shape, or tells you exactly why they can't. The counter is a deliberate, stable, narrow surface in front of an interior that is free to change. The whole point is the separation: the back office can reorganize its entire filing system tomorrow and your request still works, because you were never touching the files — you were touching the *counter*.

An **API** — Application Programming Interface — is exactly that counter, for programs instead of people. It is a published agreement: *here are the questions you may ask me, here is the shape of the request each one takes, here is the shape of the answer you'll get back.* The system behind it can be rewritten from scratch and your code keeps working as long as the counter — the interface — holds. That stability is the entire value, and it is why an API is the right place to anchor a control: you are promising to re-ask the same question quarter after quarter, and you need the question to keep meaning the same thing.

Now, what does the conversation at this counter actually look like? On the web, almost universally, it runs over a protocol called **HTTP**, and HTTP is built from a tiny, almost suspiciously simple vocabulary. Every request is one **verb** aimed at one **address**. The address — a URL — names the thing you're talking about: *the list of users*, *user number 7*, *the audit log*. The verb says what you want to do to it. There are only a handful that matter, and they map onto plain intentions: **GET** means "show me," **POST** means "create this," **PUT**/**PATCH** mean "change this," **DELETE** means "remove this." A GRC evidence pull is almost always **GET** and nothing else — you are a reader of truth, not a mutator of it, and that restraint is itself a small safety property worth noticing.

Every response comes back stamped with a three-digit **status code**, which is the counter clerk's verdict before you even read what they handed you. You do not need to memorize the table; you need the shape of it. The `2xx` family means "fine, here's your answer." The `3xx` family means "what you want is somewhere else, go there." The `4xx` family means "*you* made a mistake" — you asked for something that doesn't exist (`404`), or you didn't prove who you are (`401`), or you proved it but you're not allowed (`403`), or you're asking too fast (`429`). The `5xx` family means "*I* broke" — the clerk fell over, not you. This split is doing real work: `4xx` tells you to fix your request; `5xx` tells you to wait and retry because the problem is theirs. A script that treats every non-`2xx` the same is a script that retries its own bugs forever and gives up on transient outages — exactly backwards.

The answer the clerk hands back is, overwhelmingly, **JSON** — the same structured text you met as `jq`'s raw material in the CLI module. It is not a new thing to learn; it is the *return shape* of the counter conversation. The skill that was "parse this JSON file with `jq`" is now "parse this JSON *response* with code" — same data, arriving over a wire instead of from a disk.

So the full picture: your script is a person at a counter. It states who it is (authentication), asks one allowed question with one verb at one address (the request), reads the clerk's verdict (the status code), and parses the structured answer (the JSON). Four moves. Two more facts make this real rather than toy, and each earns its own concept below: the counter will not serve you until you prove who you are *and* that you're allowed to ask this particular question — the **auth ladder** — and the counter will hand you a long answer **one tray at a time**, which means a single question is often many requests, and getting *all* the trays is the difference between evidence and a misleading fragment.

---

## 4. Concepts

### 4.1 The request is a small, structured thing

A request is four parts: a verb, an address, some headers, and (sometimes) a body. The verb and address you've met. **Headers** are labeled side-notes attached to the request — "here's my credential," "I can accept JSON back," "here's who I am" — written as `Name: value` lines. The **body** carries data you're sending *up* (a new record to create); a `GET` for evidence usually has no body at all. Inline shape:

```
GET /api/v2/users?per_page=100 HTTP/1.1
Host: vendor.example
Authorization: Bearer abc123...
Accept: application/json
```

That is the entire anatomy. Everything fancier is more headers or a richer body.

### 4.2 Status codes are the verdict; read them before the payload

The single most common evidence-collection bug is code that grabs the response body and starts parsing without first checking the status code. If the status was `401`, the "body" you're parsing is an error message, not your users — and your control will happily report "0 users without MFA" because there were 0 users in an error payload. **Check the code first.** A robust rule of thumb: `2xx` → parse the body; `401`/`403` → stop, this is an auth problem, fix the credential or scope; `404` → you asked the wrong address; `429` → you're rate-limited, slow down and retry (§4.5); `5xx` → the vendor is having a problem, wait and retry a bounded number of times. Inline: a `403` on a `GET /users` almost always means your token authenticated fine but lacks the scope to read users — an authorization problem, not an authentication one, and §4.3 is why those are different.

### 4.3 The authentication ladder — proving who you are, then what you may do

Two different questions hide inside "auth," and conflating them is a classic source of wasted hours. *Authentication* is "who are you?" *Authorization* is "what are you allowed to do?" The counter asks both. APIs answer them with an escalating ladder of mechanisms, each solving a weakness in the one below.

- **API key.** A single long secret string you send on every request, usually in a header. Simple, and that simplicity is the problem: it rarely expires, it often grants broad access, and if it leaks it's a master key. Inline: `Authorization: Api-Key 9f8c...`. Fine for low-stakes reads; a liability at scale.
- **Bearer token.** Still a string in a header (`Authorization: Bearer <token>`), but the token is typically *issued*, *scoped*, and *short-lived* rather than a permanent master key. "Bearer" is literal and worth respecting: whoever bears the token is treated as the owner, so it is exactly as sensitive as a key while it lives — the safety comes from it dying soon.
- **OAuth2 client-credentials flow.** The rung you'll actually use for server-to-server evidence collection. Instead of holding a long-lived secret, your script holds a `client_id` and `client_secret`, sends *those* to a token endpoint, and gets back a short-lived bearer token it then uses for the real calls. When that token expires, you ask for another. The win: the credential that lives in your config is exchangeable and the thing that actually rides on every request is ephemeral. (OAuth2 has other flows for *user* login — authorization-code — but machine-to-machine evidence pulls live on client-credentials.)
- **Least-privilege scopes.** Independent of which rung you're on, the credential should be able to do *only* the one thing your control needs. A token that can read users and nothing else cannot, if leaked, delete them. Scopes are how you request that narrowing — and a GRC engineer treats "this evidence token is read-only and scoped to exactly one resource" as a control in its own right, not a convenience.

The ladder is a least-privilege progression: each rung shrinks the blast radius of a leaked credential. Choose the lowest-risk rung the vendor supports, and the narrowest scope the control allows.

### 4.4 Pagination — why one question is often many requests

When you ask for "all users" and the vendor has fifty thousand, it does not hand you fifty thousand in one response. It hands you a **page** — say the first 100 — and a marker telling you how to get the next page. This is pagination, and it is the concept this module most needs you to internalize, because **getting it wrong does not throw an error — it silently under-reports**, and under-reported evidence is worse than no evidence: it looks complete and isn't.

There are two common shapes. **Offset/page-number**: you ask for `?page=1`, then `?page=2`, until a page comes back empty or short. **Cursor**: the response includes a `next_cursor` (an opaque token); you pass it on the next request to get the following page, and you stop when the cursor comes back `null`. Inline, a cursor page looks like:

```json
{ "data": [ ...records... ],
  "pagination": { "total": 8, "next_cursor": "eyJwYWdlIjoyfQ==" } }
```

The discipline: **loop until the API says stop** — empty page, exhausted page count, or null cursor — and *accumulate* every page's records into one combined list before you compute anything. Then, where the API tells you the grand `total`, **check that what you accumulated matches it**. That completeness check is the cheapest insurance you will ever write, and it turns "I think I got everyone" into "I can prove I got everyone." A control metric computed over a truncated pull is a confidently wrong number, and confidently wrong is the worst failure mode in assurance.

### 4.5 Rate limits — the counter has a pace, and `429` is it saying "slow down"

A vendor protects itself by capping how fast you may ask. Exceed the cap and you get a `429 Too Many Requests` — not because your request was wrong, but because it was too soon. The response usually carries a hint, often a `Retry-After` header telling you how many seconds to wait. The correct response is to **wait that long and retry the same request**, ideally backing off further if it happens again. Why this is a GRC concern and not just politeness: rate limits and pagination collide directly. A complete pull of a large dataset is *many* sequential requests, which is exactly the pattern that trips a rate limiter — so the same evidence pull that needs pagination to be complete needs rate-limit handling to *finish at all*. A script that drops records on `429` instead of waiting produces the same silent incompleteness as broken pagination, by a different route.

### 4.6 Webhooks — the API calling you (event-driven evidence)

Everything above is **pull**: you ask, on your schedule. A **webhook** inverts it — you register a URL with the vendor, and the vendor sends *you* an HTTP `POST` the instant something happens ("a user was created," "MFA was disabled"). Inline: instead of polling "who lost MFA?" every hour, you receive a `POST` the moment anyone does. For GRC this is the seed of *continuous* rather than *periodic* monitoring: drift announces itself instead of waiting to be discovered at the next scheduled pull. You won't build a webhook receiver in this module — it needs an internet-reachable endpoint — but you must be able to explain the difference, because it's the conceptual bridge from this module's scheduled pulls to Tier-3 continuous controls monitoring.

### 4.7 Reading vendor API docs is the actual skill

No two vendors are identical, and you will never memorize them. The durable competence is reading an unfamiliar API's documentation and answering five questions fast: *Which auth rung does it use, and how do I get a token? What is the exact endpoint and field that holds my control's truth? How does it paginate — page numbers or cursors, and what's the stop signal? What are its rate limits? What does an error look like?* A GRC engineer who can answer those five from cold docs can pull evidence from a vendor they'd never seen an hour earlier — and that, not familiarity with any one product, is what this module is really teaching.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using our own simulated vendor (`acme.example`) and our own data. Representative output is shown; a real vendor's field names and exact JSON will differ. (Worked examples are Tier-B content — reviewed when vendor API conventions shift.)

### 5.1 LOCATE: turning a control claim into an endpoint-and-field plan

Control claim: *"Every workforce user has MFA enabled."* Before any code, read the docs and write the plan down:

- **Truth lives at:** `GET /api/v2/users` — each user record has a boolean `mfa_enabled` field. *That field is the truth of the control.*
- **Auth:** OAuth2 client-credentials; exchange `client_id`/`client_secret` at `/oauth/token` for a bearer token; scope `users:read`.
- **Pagination:** cursor-based; each response has `pagination.next_cursor`; stop when it's `null`. Response also advertises `pagination.total`.
- **Rate limit:** documented at 600 requests/minute; `429` returns `Retry-After` in seconds.
- **Error shape:** non-`2xx` returns `{ "error": "...", "message": "..." }`.

That five-line plan *is* the LOCATE stage. Notice no code was written, yet the hard thinking is done — the rest is mechanics.

### 5.2 QUERY: one authenticated, paginated call sequence (narrated)

Following the plan, the conversation with the counter looks like this — three requests for one logical question:

```
POST /oauth/token            -> 200  { "access_token": "...", "expires_in": 3600 }
GET  /api/v2/users           -> 200  { "data": [5 users], "pagination": { "total": 8, "next_cursor": "eyJwYWdlIjoyfQ==" } }
GET  /api/v2/users?cursor=eyJwYWdlIjoyfQ==  -> 200  { "data": [3 users], "pagination": { "total": 8, "next_cursor": null } }
```

Read it as the model from §3: prove identity (token), ask the question (page 1), the answer says "there's more — here's the cursor," ask again, the answer says "no more — cursor is null." Stop. You accumulated `5 + 3 = 8` records. The first page alone would have told you about *five* users and you'd never have known three were missing — that is the silent-incompleteness trap, avoided only because you looped until `next_cursor` was `null`.

### 5.3 EVALUATE + EVIDENCE: aggregate across pages and compute the metric

Now combine both pages' `data` arrays and ask the control question of the *whole* set. Our lab harness does exactly this and emits the audit-ready record (representative output, real values from the bundled fixtures):

```json
{
  "control": "MFA enforced for all workforce users",
  "framework_ref": "SOC 2 CC6.1 / CIS Control 6.5",
  "pages_aggregated": 2,
  "total_users": 8,
  "users_without_mfa": 4,
  "active_users_without_mfa": 3,
  "offending_users": [
    { "id": "u_002", "email": "bob@acme.example",   "status": "active" },
    { "id": "u_004", "email": "dave@acme.example",  "status": "suspended" },
    { "id": "u_006", "email": "frank@acme.example", "status": "active" },
    { "id": "u_008", "email": "heidi@acme.example", "status": "active" }
  ],
  "control_result": "FAIL"
}
```

Two GRC subtleties surface here. First, `total_users` is `8`, matching the `total` the API advertised — a *completeness check passed*, so this number is trustworthy. Second, the report distinguishes `users_without_mfa` (4) from `active_users_without_mfa` (3): the suspended user `u_004` technically lacks MFA but may be out of the control's scope. A good evidence record surfaces both and lets the control definition decide — it does not silently pick one and hide the other.

### 5.4 DIAGNOSE: the verdict, and the failure that *looks* like success

The harness exits with a machine-readable verdict, mirroring the exit-code discipline from the CLI module: `0` when the control passes (no users without MFA), a distinct non-zero (`3`) when it fails, and `1` only for a tooling error. The dangerous case is the one that doesn't error at all:

```
# Truncated pull — page 2 silently dropped:
GET /api/v2/users  -> 200  { "data": [5 users], "pagination": { "total": 8, "next_cursor": "..." } }
# (loop forgotten; cursor never followed)
```

With the cursor ignored, you'd aggregate 5 users, find 2 without MFA, and confidently report a *wrong* number — no error, no `4xx`, no `5xx`, just a quietly false control result. The only thing standing between you and that lie is the completeness check: aggregated count (5) ≠ advertised total (8) → **refuse to report**, fail loud. Our harness does exactly that, and proving it does is one of the lab's assertions.

---

## 6. Guided Lab

> Original lab. ~60–90 minutes. Tier-B content (vendor conventions drift). You need `bun` and a shell; the core-logic portion runs fully offline against bundled fixtures. The optional live-API extension needs a real SaaS API token of your choosing — but every objective is met by the offline core.

**Scenario.** You are asked to produce audit-ready evidence for the control *"every workforce user has MFA enabled,"* pulled from a paginated SaaS user-list API, and to make it re-runnable and provably complete.

**Setup.** From the module's `labs/` directory, run `bash setup.sh` to (re)generate the two-page fixture (`fixtures/users-page-1.json`, `fixtures/users-page-2.json`). These simulate a real cursor-paginated API response: page 1 carries a non-null `next_cursor`, page 2 carries `next_cursor: null`, and both advertise the same `total`.

**Tasks.**

1. Open `fixtures/users-page-1.json`. Identify, in writing, the field that holds the control's truth and the field that tells you whether more pages exist. State the control claim and which field decides it. *(Objective 2)*
2. Read page 1 alone and compute "users without MFA" from it. Write the number down. Now read page 2 and recompute over *both* pages combined. Explain in one sentence why the page-1-only number was wrong and how the API told you it would be. *(Objectives 4)*
3. Run the provided aggregator over both pages: `bun aggregate-mfa.ts fixtures/users-page-1.json fixtures/users-page-2.json`. Confirm `total_users` matches the `total` the fixtures advertise, and identify which check in the tool makes that match load-bearing. *(Objectives 4)*
4. Inspect the emitted report. Explain why it reports both `users_without_mfa` and `active_users_without_mfa` separately, and decide — citing the control claim — which number you would put in front of an auditor and why. *(Objective 2)*
5. Run the aggregator over **only page 1** and observe it refuse to produce a report. State, in one sentence, why failing loud on an incomplete pull is *better* GRC behavior than emitting a smaller number. *(Objectives 4)*
6. Inspect the tool's exit code after a failing-control run (`echo $?`) and after the all-pass scenario. State which exit code corresponds to a control PASS, which to a control FAIL, and which to a tooling error — and why FAIL and tooling-error must be *different* codes. *(Objectives 5, 6)*
7. Map the auth plan: read §5.1's plan and, for a real vendor of your choice (or the simulated one), write the five-question docs summary from §4.7 — auth rung, endpoint+field, pagination shape+stop signal, rate limit, error shape. Commit it as `LOCATE-plan.md` next to the script. *(Objectives 2, 3)*
8. Put it under version control: `git init`, commit the fixtures, the aggregator, your `LOCATE-plan.md`, and a short `README.md` stating the control and how to re-run. Run the aggregator twice and confirm byte-identical reports. Write one sentence connecting "identical evidence on re-run + it's in Git" to continuous, audit-ready assurance. *(Objective 6)*

**Deliverables:** the Git repo containing the aggregator, the fixtures, `LOCATE-plan.md`, `README.md`, and a 5–7 sentence written explanation covering: the control-truth field; why the page-1-only count was wrong; what the completeness check guarantees; why the two no-MFA numbers are reported separately; and the meaning of each exit code.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* paginated API fixture provided at assessment time (a different page count, different `total`, and a different correct answer), the learner must, unaided and within 45 minutes, deliver:

- A **Git-versioned script** that aggregates the `data` arrays across **all** provided pages, **verifies completeness** against the advertised `total` (and refuses to report on a mismatch), computes the control metric "users without MFA," distinguishes active from non-active offenders, and emits an **audit-ready JSON report mapped to a named control** — exiting `0` on control PASS, a distinct non-zero on control FAIL, and `1` only on a tooling error.
- A **LOCATE plan** answering the five docs questions (auth rung, endpoint+field, pagination shape and stop signal, rate limit, error shape) for the assessed API.
- A **written or spoken walkthrough** that correctly: maps the control claim to its truth-field; traces one request through verb→address→auth→status→JSON; explains the auth rung chosen and why; explains how the script knows it got *every* page; and states the meaning of each exit code.

**Rubric** — see `assessment/rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the specific concept section named there, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **Postman Academy — "API Beginner" path** — interactive, industry-standard walkthrough of making and inspecting real API calls; carries the "API Fundamentals Student Expert" credential. https://academy.postman.com/path/api-beginner — *use if you want hands-on, click-through reinforcement of §3–§4 against live endpoints before writing code.*
- **MDN Web Docs — HTTP** — the authoritative, vendor-neutral reference for HTTP methods, status codes, and headers. https://developer.mozilla.org/docs/Web/HTTP — *use as the lookup reference for §4.1–§4.2 whenever you hit a status code or header you don't recognize.*
- **Hoppscotch** (zero-install browser API client) and **HTTPie** (human-friendly CLI client) — https://hoppscotch.io/ and https://httpie.io/ — *use either to practice §5.2's authenticated, paginated call sequence interactively; HTTPie ties this module back to the command line of Module 01.*
- **OAuth 2.0 Simplified — Aaron Parecki** — the clearest plain-language treatment of OAuth2 flows, including the client-credentials flow this module's evidence pulls rely on. https://www.oauth.com/ — *use for a deeper, second treatment of §4.3 if the auth ladder still feels abstract.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
