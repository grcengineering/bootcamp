# IT Foundations Expansion — Topic Enumeration (Tier-1 / "100 series")

> Wave 3 of the GRC Engineering Bootcamp. The owner asked to add IT-foundations modules to the
> foundations tier: SQL/NoSQL databases, web application architectures, REST/SOAP/GraphQL/gRPC
> APIs, and networking — and to enumerate what *else* should be accounted for, then design
> highly-interactive (simulation-first, visual-puzzle-for-abstractions) activities for each.

## The non-negotiable framing (or this contradicts the curriculum's own thesis)

The manifesto thesis the whole bootcamp operationalizes: **GRC Engineering is a mindset, not a
stack.** Every tool is taught *only* as instrumentation for the irreducible loop —
**UNDERSTAND → LOCATE → QUERY → EVALUATE → EVIDENCE → MONITOR → OWN.** An "IT foundations"
expansion is the single most dangerous place to drift into stack-checklist teaching. So every
topic below is framed by the loop question it answers, never "learn this technology." The
recurring spine: *a control is a claim about a system; these modules teach where that claim's
truth physically lives, how it travels, how to reach it, and how to read it.*

## Deconfliction with existing modules (what already exists, at what depth)

| Existing | Covers | The gap this wave fills |
|---|---|---|
| **06 — API fundamentals** | HTTP verbs/status, the auth *ladder* (key→bearer→OAuth2-cc), pagination, rate limits, pulling evidence from one SaaS REST API | The four API *paradigms* (REST/SOAP/GraphQL/gRPC) and their differing contracts + control/security surfaces — a comparison module, not a how-to-pull module |
| **07 — Data & cloud control plane** | SQL (SQLBolt depth) to query an evidence table; the 4-part cloud control-surface model | *Database foundations* — relational vs NoSQL data models, where control-truth lives at rest, schema/indexes/transactions, the security-relevant bits (injection, access, encryption-at-rest) |
| **02/03/04 — OS modules** | shell, processes, filesystem, endpoint evidence | OS internals are covered; **networking between machines is not** |
| **06 (auth ladder only)** | API-level auth (401/403, scopes) | **Identity protocols** (OAuth2 deep, OIDC, SAML, SSO, MFA, JWT, sessions, federation) — none of this exists |
| nowhere | — | **Networking, applied crypto/PKI, the request lifecycle, logging/observability, cloud model, containers** — all absent |

Verified by grep: no OSI/TCP/DNS/TLS-handshake/packet topic; no SAML/OIDC/SSO/JWT; no
asymmetric-crypto/PKI/cert-chain content anywhere (only incidental SSH-key + keychain mentions).

---

## The enumeration

### A. The owner's four (deconflicted, loop-mapped)

| # | Topic | Loop stage(s) | Net-new vs existing | Signature visual / simulation |
|---|---|---|---|---|
| N1 | **Networking fundamentals** | LOCATE, QUERY | fully new | Inspect a real packet capture of a Google search across OSI L1–7 — peel each layer in a context the learner knows |
| N2 | **Databases: relational & NoSQL** | LOCATE, QUERY | extends 07 (SQL) with data models, NoSQL, data-at-rest, DB security | Same control question answered against a relational schema vs a document store vs a KV store — see where the truth lives and how you reach it |
| N3 | **Web application architecture** | UNDERSTAND, LOCATE | fully new | Trace one request through client → CDN → load balancer → app tier → DB; drag each control onto the tier where it actually lives |
| N4 | **API paradigms: REST / SOAP / GraphQL / gRPC** | UNDERSTAND, QUERY | complements 06 (REST pulls) with the 4-paradigm contrast | The *same* "list all users + MFA status" request expressed four ways side-by-side; match each to its contract (OpenAPI/WSDL/SDL/proto) and its control surface |

### B. Recommended additions (ranked by control-relevance) — the gaps that matter most

| # | Topic | Loop stage(s) | Why it's essential for a GRC engineer | Signature visual / simulation |
|---|---|---|---|---|
| **R1** | **Identity, AuthN & AuthZ protocols** (OAuth2/OIDC, SAML, SSO, MFA, JWT, sessions, federation) | EVALUATE, LOCATE | **Highest control relevance of anything here.** Access control is the #1 control family (SOC 2 CC6, 800-53 AC/IA). The bootcamp teaches API-auth in passing and never the protocols auditors live in. | Assemble the OAuth/OIDC "valet-key" dance as a sequence puzzle; decode a JWT (header.payload.signature) and catch the tampered/expired claim; trace a SAML SSO redirect chain |
| **R2** | **Applied cryptography & PKI** (hashing vs encryption vs encoding; symmetric/asymmetric; TLS certs & chain of trust; signatures; at-rest vs in-transit; key mgmt) | UNDERSTAND, LOCATE, EVALUATE | "Is data encrypted at rest and in transit?" is the most-asked auditor question; "hash vs encrypt vs encode" is the most-common practitioner confusion. *Applied* only — never roll crypto. | Sort strings into hash/encrypt/encode buckets by inspection; step through a TLS handshake; walk a real certificate chain from the browser padlock to the root CA and spot the expired/wrong-host cert |
| **R3** | **How the Internet works — the request lifecycle** (DNS → TCP → TLS → HTTP → render, integrated) | UNDERSTAND → LOCATE → QUERY (integrative) | The integrative spine that ties N1+R2+N3 together via the owner's exact "Google search" example. Best home for the end-to-end packet journey. | The full journey of `google.com`: type it → DNS resolution treasure-hunt (root→TLD→authoritative) → TCP handshake → TLS → HTTP request/response → render — every hop inspectable |
| **R4** | **Logging, telemetry & observability** (syslog/structured logs, audit vs app logs, levels, retention, SIEM concept) | EVIDENCE, MONITOR | Where *continuous* evidence is born — the foundation modules 07/13 silently assume. Audit logging is its own family (800-53 AU, CC7). | Assemble a log pipeline (source→collector→store→query→alert); parse a structured log line and map its fields to a control claim; find the one event that proves (or breaks) a control across a noisy stream |
| **R5** | **Cloud computing & the shared responsibility model** (IaaS/PaaS/SaaS, control plane vs data plane, regions/AZs) | UNDERSTAND | The framing for *all* cloud GRC; module 07 dives into cloud APIs but never establishes who-owns-which-control. | Drag each control to "you" vs "provider" across IaaS/PaaS/SaaS and watch the boundary shift; place a control on the control-plane vs data-plane |
| **R6** | **Containers & virtualization** (VMs vs containers, images/layers/registries, orchestration basics) | LOCATE, QUERY | The modern workload surface module 08 (IaC) assumes; container config *is* control-truth. | Peel a container image's layers to find the baked-in secret; spot the misconfigured container (runs as root, exposed port, no resource limit) |

### C. Fold-ins (taught as segments inside the above, not standalone modules)

- **Data formats & serialization** (JSON/XML/YAML/Protobuf, schema validation) → inside N4 (paradigm contracts) + N2 (document stores).
- **DNS/email-domain security** (SPF/DKIM/DMARC, CAA) → inside R3 (DNS) + R1 (domain-as-identity).
- **Caching, CDNs, sessions/state** → inside N3 (web architecture).
- **SDLC / change management** → already in modules 05 (git) + 08 (CI).
- **Character encoding / Unicode** → too low-level for this tier; cite only.

## Recommended scope decision

- **Build all four (A) + R1, R2, R3 as full modules** (the highest-leverage, most control-relevant, and the ones with the strongest visual-puzzle payoff — they directly answer auditor questions and have zero current coverage).
- **R4, R5, R6 as full modules in the same wave if appetite allows** (they're essential too; R5 is light/conceptual, R4 and R6 are medium).
- That is **10 new foundations modules**. They cluster as an "IT & Internet Foundations" band inside Tier 1, sequenced after the terminal/programming base (which they assume) and before/with the OS + API + data modules they enrich.

## Numbering (a build-time, reversible decision — flagged, not blocking)

The repo uses flat `NN-name` dirs (00–15); the owner's "100 series" language implies a series
scheme. Two options, decided at BUILD time (the activity *designs* below are numbering-agnostic):
1. **Additive (recommended, low-risk):** new dirs `16+`, with learning order fixed in the
   curriculum doc + track map (order is defined there, not by dir number). No renumber, no
   tooling churn.
2. **3-digit relabel (matches "100 series" literally):** renumber to `000` mindset / `1xx`
   foundations / `2xx` engineering / `3xx` GRC-as-code / `4xx` product. Cleaner labels, but
   touches every gate, spec, fixture path, and the content sync — a mechanical migration to run
   deliberately if the owner wants the literal labels.

## What gets produced for each module (the deliverable shape)

Per topic: (1) a research dossier (current, cited, 2026-accurate — versions, standards, the
control/security angle), and (2) an interactive-activity design that conforms to the existing
exercise-spec contract (`style/EXERCISE-SPEC.md`) so it is build-ready — naming the engine/surface
(reusing the wave-2 engines: terminal, console, builder, api, plus a new **visual-puzzle** surface
for the abstract-concept modules), the simulation/puzzle mechanic, the seeded state, the
machine-verifiable tasks, the hint ladder, and the honesty source for every shown output.
