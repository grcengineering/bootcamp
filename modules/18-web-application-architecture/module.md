# Module 18 — Where the Claim Can Be True: Tracing a Request Through the Tiers

*Loop stages: UNDERSTAND · LOCATE · EVALUATE · EVIDENCE · MONITOR/OWN. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. A control truth is produced by a system and can only be read where that system produces it. This is the module where you learn to point at the exact tier — and the exact header that tier writes — that holds each control claim, and to find the hop where defense-in-depth quietly fails.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, why a web app is split into tiers (client / presentation / application / data) and what each request-path hop does — so each hop becomes a place a specific control claim could live.
2. **Map** a stated control claim onto the SPECIFIC tier/hop structurally capable of producing its truth, and name the NIST 800-53 / SOC 2 control it satisfies.
3. **Trace** a real HTTP request through the tiers by ordering the request-path participants and reading the proxy-injected provenance bytes (X-Forwarded-For, X-Forwarded-Proto, RFC 7239 Forwarded).
4. **Describe** stateless vs stateful state management by classifying a real Set-Cookie session (RFC 6265) against a real Bearer/JWT request (RFC 7519) and naming which tier holds the state.
5. **Diagnose** a defense-in-depth gap in a real request trace: locate the hop where a control asserted at one tier is unverifiable or broken.
6. **Produce** an evidence artifact — a per-tier control-ownership note plus a structured finding whose fields (the client protocol, the session-cookie gap, a cached sensitive response) are read back to the control claim and the owning team.

Each objective is checked by the Assessment in §7. If you can already produce the §7 tier-ownership note and Diff-the-Trace findings unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

You have learned to read a control claim where it sits still — a row in a table, a field in a JSON document, a byte on the wire. A web application is the place those still things move *together*, through a chain of machines that each do one job and hand the request on. And the single most expensive mistake a GRC engineer can make about a web app is to treat it as one box. It is not one box. It is a client, a presentation edge, an application tier, and a data tier — and a control claim is only true at the tier that can *produce* its truth.

That is the whole discipline of this module. "Is data encrypted in transit?" is not one question with one answer; it is a question about *every hop*, and TLS terminated at the load balancer says nothing about the load-balancer-to-app leg. "Is the session protected?" is answered by two attributes on a cookie the application tier writes — not by the edge, which never sees them. "Is this sensitive response cached?" is answered at the edge cache, not in the application code. Ask the right question at the wrong tier and you will get a confident "yes" that is structurally meaningless, because that tier *cannot* produce that truth. The auditor who knows the tiers knows where to point.

There is a second, quieter failure this module inoculates: **defense-in-depth that isn't.** A WAF "blocks the OWASP Top 10" — but only for traffic that actually reaches the edge; a request that bypasses the edge never meets the WAF, and the control is unverifiable for that path. A control asserted at one tier is only as strong as the guarantee that *all* traffic crosses that tier. Finding the hop where that guarantee breaks is the finding. The discipline this builds is architectural reading: the diagram is the control-evidence map, every hop is a candidate owner, and your finding is the tier where the claim cannot be true.

---

## 3. The Mental Model

Picture a request as a sealed envelope handed down a relay of clerks, each clerk stamping it before passing it on. The first clerk is the **edge** — a CDN and a web application firewall sitting at the front door. The edge sees the raw internet, decides whether the request even gets in, and — because it terminates the encrypted connection — it is the *last* place anyone reads the client's real protocol before the inside of the building takes over on its own plain wiring. So the edge stamps the envelope with a note: "this came in over HTTPS, from this client IP." That note is the **X-Forwarded-Proto / X-Forwarded-For** header (or the RFC 7239 `Forwarded:` header that standardizes them), and it is the only way the tiers behind the edge can know what the client actually did, because they never saw the client's connection.

The second clerk is the **presentation tier** — the load balancer and reverse proxy that route the request to a healthy application server. They add their own stamps (`by=`, `for=`) and, critically, they may re-encrypt or *not* re-encrypt the leg to the app. This is where "encrypted in transit" splits into a per-hop question: TLS at the front door is not TLS to the app.

The third clerk is the **application tier** — the code that actually decides who you are and what you may do. This is the only clerk that can read the session. A web app remembers you in one of two ways, and they are spatially different. The **stateful** way: the server keeps a box with your session in it and hands you a claim ticket — an opaque `Set-Cookie: SID=…` cookie that points *at* the server's box. The state lives on the server; the cookie is just a pointer, and its `Secure` and `HttpOnly` attributes are what keep that pointer off plaintext HTTP and out of JavaScript's hands. The **stateless** way: there is no server box. The server hands you a signed, self-describing token — a JWT — that *is* the state. You carry it; the app verifies its signature on every call. An opaque ID points at state; a JWT carries it.

The fourth clerk is the **data tier** — the database on a private subnet, the only clerk that touches the disk where data rests. "Encrypted at rest" is its question and nobody else's; the edge has no idea what the disk does.

Now the trick that makes this a *control* model and not just an architecture diagram: **a control truth is produced by exactly one of these clerks, and you can only read it from that clerk.** Ask the edge about disk encryption and it shrugs — it never touched the disk. Ask the database whether the client used HTTPS and it shrugs — it never saw the client. The diagram is the control-evidence map. Every value you read in this module is the real header parser's output over a real RFC-literal header (or a real JWT decoded from its real bytes) — never an answer key. The header the owning tier wrote is the evidence.

---

## 4. Concepts

### 4.1 The tiers, and what each hop can produce

A request crosses four tiers, and each is a candidate owner for a different control claim. The **client** (browser) holds nothing trustworthy — it is the adversary's machine. The **presentation/edge tier** (CDN, WAF, load balancer, reverse proxy) is the first to see traffic; it filters, terminates TLS, and rewrites the request as it routes. The **application tier** (the app servers, on a private subnet) authenticates, authorizes, and holds or verifies session state. The **data tier** (the database, on a deeper private subnet) is the only tier that touches data at rest. Each hop *does one job*, and that job is what makes it the only place a particular control truth can be produced. Reading the architecture is reading which clerk can answer which question.

### 4.2 A control claim lives at the tier that can produce its truth

This is the load-bearing idea. "WAF blocks OWASP Top 10" lives at the **edge/reverse-proxy** (SC-7 boundary protection, SOC 2 CC6.6) — it is the only tier that inspects request content at the front door. "AuthN / authZ" lives at the **application tier** (AC-3, IA-2) — the edge does not know who you are. "Encrypted in transit" lives at **every hop** (SC-8) — it is a per-leg claim, not a single fact. "Encrypted at rest" lives at the **data tier** (SC-28) — only the database touches the disk. "Audit logging" is a THROUGHOUT control (AU-2 / AU-3) — every tier must produce its own log line, because each sees a different slice of the request. Drop a claim onto the wrong tier and the honest answer is "this tier cannot produce that truth." The mapping is the control-ownership map, and it is the first artifact an auditor builds.

### 4.3 The claim splits: "encrypted in transit AND at rest" is two controls

The single most common collapse is treating "is the data encrypted?" as one question. It is two, owned by two tiers. **In transit** (SC-8) is a per-hop claim: TLS terminated at the load balancer protects client→LB, and says *nothing* about LB→app — if that internal leg rides plain HTTP, the in-transit control is broken on a hop the edge cert can't speak for. **At rest** (SC-28) is the data tier's claim alone: the storage-encryption setting and the key reference on the database, which the edge and app cannot read. One auditor question, two answers, two locations — collapse them and you will certify a system half-protected.

### 4.4 Proxy-injected provenance: how the app learns what the client did

Because the edge terminates TLS, every tier behind it is on a connection the client never opened. So the app cannot ask the socket "did this come in over HTTPS?" — the socket only knows about the *edge's* connection to the app. The edge solves this by writing the truth into a header: **X-Forwarded-Proto** (the client's scheme), **X-Forwarded-For** (the client's IP), or the RFC 7239 **`Forwarded:`** header that standardizes both into one (`for=…;proto=https;by=…`). The app recovers the real client IP for its audit log (AU-3) by reading `X-Forwarded-For` / `Forwarded for=`, and confirms the client used HTTPS by reading `proto=https`. The catch: these headers are *injected by a trusted hop* — a request that reaches the app *without* them is a request that bypassed the edge, and that absence is itself the finding (the WAF was never traversed).

### 4.5 Stateful vs stateless: where the session actually lives

A web app remembers a logged-in user one of two ways, and which tier holds the state is the whole distinction. **Stateful**: the server stores the session and gives the client an *opaque* identifier — `Set-Cookie: SID=31d4d96e407aad42`. The cookie is a pointer; the state lives in the application tier's store. The cookie's safety is its attributes: **`Secure`** keeps it off plaintext HTTP, **`HttpOnly`** keeps it away from `document.cookie` (and thus from XSS), and `SameSite` constrains cross-site sending. A session cookie missing `Secure` can leak over HTTP; missing `HttpOnly`, it is readable by injected JavaScript. **Stateless**: there is no server store — the server hands the client a *self-describing, signed* token (a JWT) that IS the state, and the app re-verifies its signature on every request. An opaque SID points AT state; a JWT carries it. The control question differs accordingly: for a cookie, "are `Secure` and `HttpOnly` set?"; for a JWT, "is it actually signed?" — because an `alg:none` token is unprotected, and a JWT is a *signed claim*, not an encrypted secret.

### 4.6 Sensitive responses must not be cached at the edge

The edge cache is a performance win and a confidentiality hazard. A response to `/account` carries personal data, and if the edge caches it, a later user can be served another user's data. The control truth lives in two RFC 9111 headers the application tier sets and the edge cache honors: a sensitive response must carry **`Cache-Control: private, no-store`** (do not store, and never in a shared cache). The break is visible on the wire: a `/account` response carrying `Cache-Control: public, max-age=300` — *and*, the tell, an **`Age:`** header proving a shared cache actually served it from store. `private, no-store` is the control; `public` + an `Age` value is the finding.

### 4.7 Defense-in-depth fails at the hop a control can't see

Pull the threads together. Every control in §4.2 protects only the traffic that *crosses the tier that enforces it*. The WAF inspects only what reaches the edge; the app's authZ guards only requests that reach the app; the LB→app TLS protects only that one leg. So a control is exactly as strong as the guarantee that all traffic traverses its tier — and the failure mode is a hop where that guarantee breaks: a request routed around the edge (no `Forwarded` provenance, WAF un-traversed), an internal leg that drops TLS, a cookie written without its safety attributes, a sensitive response the cache was allowed to store. Each of these is a real header (or a real absence) at a specific tier, and your finding names the tier, the header, the broken control, and the owning team. This is the bridge to MONITOR/OWN: the access log is just these same fields, recovered continuously, mapped to the team that owns the tier.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, reading real RFC-literal header values and a real JWT through the same parsers the lab uses. Every value shown is the parser's decode of the real header/token bytes, confirmed against the RFC grammar. (Worked examples are Tier-B content — reviewed when header conventions or RFC errata shift.)

### 5.1 LOCATE: which tier owns each claim

Take five control claims and point each at its tier:

- *"WAF blocks the OWASP Top 10."* → **edge / reverse proxy** (SC-7, CC6.6). The app can't inspect what the edge filtered.
- *"Access is authenticated and authorized."* → **application tier** (AC-3, IA-2). The edge doesn't know who you are.
- *"Encrypted in transit."* → **every hop** (SC-8). A per-leg claim, not a single fact.
- *"Encrypted at rest."* → **data tier** (SC-28). Only the database touches the disk.
- *"Everything is logged."* → **throughout** (AU-2 / AU-3). Each tier logs its own slice.

The trap: the encryption claim splits into SC-8 (every hop) and SC-28 (the DB) — two controls, two tiers. Drop "encrypted at rest" on the edge and the honest gap is "the edge never touches the disk."

### 5.2 TRACE: read the provenance the edge injected

The app server received this request header (the RFC 7239 literal shape):

```
Forwarded: for=192.0.2.43;proto=https;by=203.0.113.43
```

Parsed, it carries three parameters: `for=192.0.2.43` (the real client IP, for the AU-3 audit log), `proto=https` (the client used HTTPS — the only way the app can know, since TLS was terminated upstream), and `by=203.0.113.43` (the proxy that forwarded it). The app recovers `src_ip = 192.0.2.43` from `for=` and confirms the in-transit claim from `proto=https`. Now the broken twin — the app received instead:

```
Forwarded: for=192.0.2.60
```

No `proto=`. The app cannot confirm the client used HTTPS; worse, a request reaching the app *without* the edge's full provenance is a request that may have bypassed the edge entirely — the WAF was never traversed, so "WAF blocks the OWASP Top 10" is structurally unverifiable for this path. The absence is the finding.

### 5.3 EVALUATE: stateful cookie vs stateless token

Two real auth artifacts, two storage pictures.

```
Set-Cookie: SID=31d4d96e407aad42; Path=/; Secure; HttpOnly
```

This is **stateful**: `SID=31d4d96e407aad42` is an opaque pointer at the application tier's session store. Its safety is the two flag attributes — `Secure` (HTTPS-only) and `HttpOnly` (no `document.cookie`). The parser reports both present. The bad twin, `SID=31d4d96e407aad42; Path=/`, reports them *absent* — the session-control gap (SC-23): without `Secure` the SID can ride plaintext HTTP, without `HttpOnly` it is readable by injected JavaScript.

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi…
```

This is **stateless**: the JWT decodes to `{"alg":"HS256","typ":"JWT"}` and a payload whose `iss` claim names the issuer (`auth.acme.example`) and `sub` names the subject (`u-8842`) — there is no server store; the token IS the state, signature-verified by the app on every call. The control question is "is it signed?" The bad twin's header decodes to `{"alg":"none",…}` — an RFC 8725 §2.1 unprotected token, which a JWT is supposed never to be. A JWT is a *signed claim*, not an encrypted secret: the payload is readable by anyone (it is base64url, not ciphertext), so "scrambled" is not "protected."

### 5.4 DIAGNOSE: the cached sensitive response

Clean: a `/account` response carries `Cache-Control: private, no-store` — the data is personal, so it is never stored, never in a shared cache. Broken: the same response carries `Cache-Control: public, max-age=300` *and* an `Age: 142` header. The `public` directive let a shared edge cache store it; the `Age: 142` proves a cache actually *served* it from store (RFC 9111 §5.1) — 142 seconds after it was generated, to whoever asked next. The discriminating field is the `Age` header that should not exist on a private response. The finding: the edge cache (SC-8/SC-28-adjacent confidentiality) served `/account` from store; the fix is `Cache-Control: private, no-store`, and the owning team is the edge/CDN team — not the application developers, because the tier that produced the break is the cache.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (header conventions drift). This lab runs entirely in your browser on the bootcamp site (Module 18 → Interactive lab) — no install, no host capture needed.

**Scenario.** You are handed a real request as it crosses the three-tier path and a set of real HTTP-header artifacts, and asked to read each control claim off the header the owning tier produces — then to diagnose, in clean/broken header pairs, the single field where a control breaks at the tier that owns it.

> **Interactive lab.** The lab is the Inspect-&-Assemble surface: each real header (RFC 7239 `Forwarded`, RFC 6265 `Set-Cookie`, RFC 9111 `Cache-Control`) and the real JWT rendered as selectable, decoded regions. Selecting a region reveals the parser's real decode — the same value the RFC grammar produces from the same bytes. Every task is machine-verified against that parse tree.

**Tasks (performed on the surface).**

1. On the clean request, select the `Forwarded` header's `proto=` parameter and read the client's protocol the app recovered after upstream TLS termination. *(Objectives 3, 6)*
2. Select the `for=` parameter and read the real client IP the app recovers for its AU-3 audit log. *(Objectives 3, 6)*
3. On the session cookie, select `Secure` and `HttpOnly` and state which tier holds the session state they protect. *(Objectives 2, 4)*
4. Open the stateless JWT, read its `alg` and a payload claim (`iss`), and classify it stateless vs the cookie's stateful — naming which tier holds the state in each. *(Objective 4)*
5. **Diff-the-Trace (provenance).** Switch to the broken request and find the missing `Forwarded` parameter that makes the WAF/edge un-traversable — the defense-in-depth gap. *(Objective 5)*
6. **Diff-the-Trace (session).** On the bad-twin cookie, select the summary that names the missing safety attributes — the session-control gap (SC-23). *(Objectives 5, 6)*
7. **Diff-the-Trace (caching).** On the broken `/account` response, select the `Age` header proving a shared cache served a sensitive response, and the `alg:none` field on the unprotected token. *(Objectives 5, 6)*

**Deliverable.** A short written tier-ownership note + Diff finding: per claim, the owning tier, the header/field, the broken control, the framework reference (SC-8, SC-23, SC-28, AU-3, IA-2), and the owning team.

---

## 7. Assessment

**Competency artifact (not a quiz).** From real header artifacts provided at assessment time, the learner must, unaided:

- **Map** a set of control claims onto the tiers that can produce each truth, naming the NIST 800-53 / SOC 2 control — including the split of "encrypted in transit AND at rest" into SC-8 (every hop) and SC-28 (the DB), and the THROUGHOUT placement of logging (`mapping_correct` against the cited tier-ownership key, or `region_labeled_correctly` / `field_value_is` on the header that proves each).
- **Trace** the provenance the edge injected: recover the client's protocol from `Forwarded proto=` and the real client IP from `for=`, each verified against the RFC 7239 parser (`region_labeled_correctly`, `field_value_is`).
- **Classify** the stateful `Set-Cookie` session vs the stateless `Bearer` JWT, naming which tier holds the state (`field_value_is` / `decoded_artifact_matches`).
- **Diff-the-Trace**: given clean/broken header pairs, click the single field where the control breaks at its owning tier — the missing `Forwarded proto=` (WAF un-traversed), the cookie missing `Secure`/`HttpOnly` (SC-23), the `/account` response with `Age` proving a cached sensitive response (SC-8/SC-28-adjacent), the `alg:none` token (IA-2) — each gated by `region_labeled_correctly` / `field_value_is` / `decoded_artifact_matches` against the parser's computed divergence — then write a finding naming the tier, header, broken control, framework reference, and owning team.

Every shown value is the parser's decode of real RFC-literal header bytes or a real JWT. A single field read wrong, or a claim mapped to the wrong tier, routes the learner back to the specific concept section — not the whole module. Pass threshold: 0.80 on every objective.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **RFC 7239 (Forwarded), RFC 6265 (HTTP State Management / Set-Cookie), RFC 9111 (HTTP Caching), RFC 9110 (HTTP Semantics)** — the authoritative grammars this module reads from. https://www.rfc-editor.org/rfc/rfc7239 · https://www.rfc-editor.org/rfc/rfc6265 · https://www.rfc-editor.org/rfc/rfc9111 · https://www.rfc-editor.org/rfc/rfc9110 — *use to confirm a header's syntax and meaning from the source.*
- **RFC 7519 (JWT) and RFC 8725 (JWT Best Current Practices)** — the token format behind §4.5, including why `alg:none` is the unprotected-token attack. https://www.rfc-editor.org/rfc/rfc7519 · https://www.rfc-editor.org/rfc/rfc8725 — *use for a deeper treatment of stateless tokens and their failure modes.*
- **OWASP — Web Security Testing Guide and Session Management Cheat Sheet** — the practitioner's complement to the cookie-attribute and session-tier material in §4.5. https://owasp.org/www-project-web-security-testing-guide/ and https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html — *use to broaden the session-control discussion beyond the two attributes taught here.*
- **AWS — three-tier / multi-tier reference architectures** — a vendor reference for the public/private-subnet boundary model used as the tier scaffold. https://docs.aws.amazon.com/whitepapers/latest/serverless-multi-tier-architectures-api-gateway-lambda/three-tier-architecture-overview.html — *use to see one concrete instantiation of the tiers; the control-ownership idea is vendor-neutral.*
- **NIST SP 800-53 Rev. 5 and the SOC 2 Trust Services Criteria** — the cited control families (SC-7, SC-8, SC-28, AC-3, IA-2, AU-2/AU-3 / CC6.1, CC6.6, CC6.7). https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final — *use as the lookup when you map a claim to its control id.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
