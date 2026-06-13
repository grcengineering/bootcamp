# Module 19 — Four Counters, One Question: REST / SOAP / GraphQL / gRPC and Where the Control Lives

*Loop stages: UNDERSTAND · QUERY · EVALUATE · EVIDENCE. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. The same control question — "list every user and whether MFA is on" — takes four wire shapes. This is the module where you learn to read that question off each paradigm's contract, decode it down to the literal bytes, and name the control surface each shape invites.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, why the SAME control question looks structurally different in four paradigms, and that each paradigm's contract artifact (OpenAPI / WSDL / GraphQL SDL / .proto) is the first place a GRC engineer LOCATEs a control's truth-field.
2. **Map** each of the four real wire payloads to its contract artifact AND its dominant control/security surface, reading the surface off the contract rather than from memory.
3. **Describe** where the credential lives per paradigm — a bearer/JWT header shared by REST/GraphQL/gRPC versus SOAP's in-message WS-Security UsernameToken with nonce+created replay protection — and verify the WS-Security PasswordDigest by recomputing Base64(SHA-1(nonce+created+password)).
4. **Compose** the precise GraphQL selection set that returns exactly `{ email mfaEnabled }` and contrast it against the REST fixed-schema response, explaining why precision is both an efficiency feature and the mechanism behind query-depth/batching DoS.
5. **Diagnose**, in real artifacts, the four paradigm-specific attack/recon classes and map each to its OWASP API Security Top 10 2023 item.
6. **Produce** an auditor's evidence determination stating, per paradigm, how completeness is proven and which runtime feature must be proven OFF versus which static contract is itself collectible evidence.

Each objective is checked by the Assessment in §7. If you can already produce the §7 determination grid unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

You have learned to read a control claim where it sits still — a row in a table, a field in a JSON document, a byte on the wire. But the moment two systems talk to each other over an API, the same claim wears a different costume depending on which paradigm carries it. "List every user and whether MFA is on" is one question. Ask it of a REST endpoint and the answer is a fixed JSON schema you over-fetch. Ask it of a SOAP service and the answer is buried in an XML envelope with its credentials *inside the message*. Ask it of GraphQL and you name exactly the two fields you want — a precision that is also a weapon. Ask it of gRPC and the answer comes back as opaque, length-prefixed binary you cannot read without decoding the protobuf yourself.

An auditor who only knows one paradigm is an auditor who can be told "the data's protected" in three accents they don't recognize. This module inoculates that. The first place a control's truth lives is the **contract** — OpenAPI, WSDL, SDL, .proto are machine-readable, collectible, and they tell you where the `mfa_enabled` field is before you ever touch a live endpoint. The second place is the **wire payload**, and for gRPC that means decoding protobuf down to the literal bytes (`mfa_enabled = false` is `0x10 0x00`, and you will prove it). The third thing each paradigm gives you is a **control surface** — REST leaks fields, SOAP replays stale messages, GraphQL gets walked to death by depth, gRPC hides reflection in prod — and each maps to a specific OWASP API Security Top 10 2023 item.

The discipline this builds is paradigm-agnostic reading: the question never changes, only the shape — and you can find the truth-field in any of the four, decode it yourself, and name exactly which runtime feature must be OFF for the control to hold.

---

## 3. The Mental Model

Imagine four counters at a government office, all answering the same question — "who works here, and which of them has their security badge enabled?" — but each with a completely different way of taking your request and handing back the answer.

The **REST** counter has a fixed form. You ask for "users," and you get back the whole personnel file for everyone: name, email, badge status, salary, home address, the works. The *verb* you used (GET) carries your intent, and the answer's *shape* is fixed by the form — so you over-fetch, getting fields you never asked for. (REST can offer a "sparse fieldset" option — `?fields[users]=email,mfa_enabled` — but it's opt-in, and the default is the full file.)

The **SOAP** counter takes a sealed, notarized envelope. Your intent is written *inside* the envelope (the operation name in the XML body), and your credentials are *inside the envelope too* — a WS-Security UsernameToken with a one-time nonce, a timestamp, and a password *digest* (not the password — `Base64(SHA-1(nonce + created + password))`). The envelope protects itself end-to-end; the notary stamp (the digest) proves you knew the password without sending it. But a stale timestamp is a replay, and a digest that no longer matches the timestamp is the tell.

The **GraphQL** counter lets you write your own form. You name *exactly* the fields you want — `{ email mfaEnabled }` — and you get back exactly those, nothing more. That precision is wonderful and dangerous: name a field that references itself, nest it twelve levels deep, and you've written a query that walks the whole org chart and melts the server (depth DoS); alias the same login twenty times in one request and you've defeated per-request rate limiting; ask `{ __schema { types { name } } }` and the counter hands you the entire blueprint of every form it accepts (introspection).

The **gRPC** counter speaks only in a compressed code. Your intent is the `:path` (`/userservice.UserService/ListUsers`), not a verb; the answer comes back as a length-prefixed binary frame — `[compressed-flag:1 byte][length:4 bytes big-endian][protobuf bytes]` — that is unreadable until you decode it. And decode it you will: protobuf packs each field as a *tag* byte computed `tag = (field_number << 3) | wire_type`, so field 2 (`mfa_enabled`, a bool) as a VARINT is tag `(2 << 3) | 0 = 0x10`, and a false bool is the single byte `0x00`. `mfa_enabled = false` is literally `0x10 0x00`. You will calibrate this on the protobuf.dev examples (`a = 150 → 08 96 01`) and then read the seeded user's badge status off the raw bytes.

Four counters, one question. The contract tells you where the answer's truth-field is *before* you ask. The wire payload is where it physically arrives. And the control surface — what each counter is uniquely bad at — is the finding you write. The decoder is the oracle: every byte you read in this module is the real parser's output over the real artifact, never an answer key.

---

## 4. Concepts

### 4.1 The contract is the first place a control's truth lives

Every API paradigm has a machine-readable contract, and a GRC engineer reads it *first*, before touching a live endpoint, because the contract is collectible static evidence. **REST** has **OpenAPI 3.1** (JSON/YAML): the MFA truth-field is `paths./users.get.responses.200.content.schema.User.properties.mfa_enabled`, declared `type: boolean`. **SOAP** has a **WSDL** (XML) with an embedded **WS-SecurityPolicy**: the `wsdl:portType` operation `ListUsers` carries the intent, and the `sp:SignedParts` assertion proves the message Body MUST be signed (the integrity control SOAP invites). **GraphQL** has its **SDL**: `type User { … mfaEnabled: Boolean! … }`. **gRPC** has a **.proto**: `bool mfa_enabled = 2;` — and the `= 2` is the *field tag*, the load-bearing number the wire encodes. Four contracts, one `User` model, four ways to name the same field — and you LOCATE each by reading the contract, not from memory.

### 4.2 The same question, four wire shapes

Stack the four real payloads side by side over the SAME eight users and the abstraction becomes byte-for-byte concrete. REST returns a fixed JSON schema and *over-fetches* — the full personnel record per user when you only needed two fields. (The published JSON:API sparse-fieldset example measures ~22.7KB full vs ~2.5KB sparse; our committed fixture measures its own bytes, which the surface reads directly.) SOAP returns a single XML envelope, intent in the body. GraphQL returns *exactly* the fields you named — the selection set IS the response shape. gRPC returns an opaque length-prefixed binary frame. The question — "list users + MFA" — never changed; only the contract decided the shape.

### 4.3 Where the credential lives is a paradigm fact

For **REST, GraphQL, and gRPC**, the credential rides in an HTTP header — `Authorization: Bearer <JWT>` — validated at the edge and *discarded*; gRPC may additionally use **mTLS** (a client certificate) at the transport. For **SOAP**, the credential lives *inside the message*: a WS-Security UsernameToken whose `PasswordDigest` is `Base64(SHA-1(nonce + created + password))` — the message protects itself end-to-end, independent of the transport. You verify a SOAP digest by recomputing it: feed the real Nonce, Created, and the (cited) password through the transform and confirm it reproduces the envelope's stated digest. When the timestamp is stale and the recomputed digest no longer matches, that disagreement — computed, not asserted — is the replay finding.

### 4.4 GraphQL precision is a feature and a weapon

A GraphQL selection set returns *exactly* what you name, which is precision (no over-fetch). The same mechanism is the attack surface: a **circular/deeply-nested query** past the server's depth cap is a denial-of-service (a real depth-limit validation error stops it — OWASP API4); an **aliased batch** (`{ a: login b: login c: login … }`) runs N operations under ONE HTTP request, defeating per-request rate limiting (OWASP API4 Scenario #2); an **introspection query** (`{ __schema { types { name } } }`) dumps the entire schema unless the `NoIntrospection` rule is enabled (OWASP API9). The control is not "GraphQL is bad" — it is "prove the depth limiter is ON, the cost limiter is ON, and introspection is OFF in production." You will run the real limiter and watch each verdict.

### 4.5 Protobuf is readable once you know the tag math

gRPC's body is protobuf, and protobuf is not magic — it is `tag = (field_number << 3) | wire_type`. Wire type 0 is VARINT (ints, bools); wire type 2 is LEN (strings, bytes, sub-messages, preceded by a length VARINT). Calibrate on the protobuf.dev verified examples: `a = 150` (field 1, int32) encodes as `08 96 01` (tag `0x08`, then the two-byte VARINT for 150); `b = "testing"` (field 2, string) encodes as `12 07 74 65 73 74 69 6e 67` (tag `0x12`, length `07`, then the ASCII). So `mfa_enabled` (field 2, bool) as a VARINT is tag `(2 << 3) | 0 = 0x10`, and a `false` bool is the single byte `0x00` — `mfa_enabled = false` is `0x10 0x00`. The gRPC message frame wraps it: `[compressed-flag:1B][length:4B big-endian][protobuf]`. Decode the frame, decode the tags, and the binary is as readable as JSON.

### 4.6 Each paradigm fails differently — map it to OWASP API 2023

The four control surfaces map cleanly to the OWASP API Security Top 10 2023:

- **REST** leaks a *field* — returning `salary`/`ssn` the caller had no authorization to see is **API3:2023 Broken Object Property Level Authorization (BOPLA)**.
- **GraphQL** fails by *shape + discoverability* — depth/cost DoS is **API4:2023 (Unrestricted Resource Consumption)**; introspection-on-in-prod is **API9:2023 (Improper Inventory Management)**.
- **SOAP** fails by *time + integrity* — a stale `wsu:Created` whose digest no longer matches is a replay, **API2:2023 (Broken Authentication)**.
- **gRPC** fails by *discoverability + auth* — server reflection advertised in prod is **API9:2023**; an `alg:none` JWT that defeats signature verification is **API2:2023**.

The completeness-proof method differs too: REST proves completeness by paginating to `next_cursor == null`; GraphQL by the selection set returning the named fields for the full collection; gRPC by the `grpc-status: 0` trailer and the decoded repeated `users`; SOAP by the signed Body covering the full response.

---

## 5. Worked Examples

The four control surfaces in practice. A GRC engineer's job is not to memorize four protocols — it is to know, for each, *which runtime feature must be proven OFF or ON*, and *which static artifact is itself evidence*.

- **REST**: the OpenAPI doc is collectible evidence of the declared schema; the finding is the runtime response returning *more* than the contract declares (BOPLA). Prove the response shape matches the contract; prove pagination reaches `null`.
- **SOAP**: the WSDL + WS-SecurityPolicy is evidence that the Body is required to be signed; the finding is a stale `Created` + a digest that no longer recomputes. Prove freshness (nonce + created within the window) and integrity (recomputed digest matches).
- **GraphQL**: the SDL is evidence of the schema; the findings are runtime — depth limit, cost limit, and `NoIntrospection` must all be ON in prod. Prove the limiter rejects the circular query and the introspection query.
- **gRPC**: the .proto is collectible evidence of the service surface; the findings are server reflection ON in prod (API9) and `alg:none` tokens accepted (API2). Prove reflection is disabled and tokens are signature-verified.

---

## 6. Guided Lab

The exercise (`exercises/exercise.yaml`) drives the **visual** Inspect-&-Assemble surface across four mechanics over the SAME eight-user `acme.example` seed:

1. **PEEL the four contracts** — select the MFA truth-field node in each (OpenAPI `mfa_enabled`, WSDL `sp:SignedParts`, SDL `mfaEnabled`, .proto `mfa_enabled = 2`), read off four real ported parser oracles.
2. **PEEL the gRPC frame to the byte** — the `:path`, the 1-byte compressed-flag, the 4-byte big-endian length, and the protobuf bytes decoded to `mfa_enabled = false` (`0x10 0x00`) after calibrating on `a = 150 → 08 96 01`.
3. **Where does the credential live + recompute the WS-Security digest** — confirm `Base64(SHA-1(nonce + created + password))` reproduces the envelope's PasswordDigest (the transform is the oracle).
4. **Build-and-break the GraphQL limiter** — the precise query is accepted; the 12-deep circular query trips the real depth error; introspection is refused once `NoIntrospection` is enabled.
5. **Diff-the-Trace** — four clean/broken pairs, one control failure per paradigm, clicked against the real parser trees (the Assessment).

Every value shown is the real parser/decoder/transform over the real artifact — fidelity-checked against protobuf.dev's verified byte examples and the RFC/spec grammars. There is no answer key. The decoder is the oracle.

---

## 7. Assessment

Forensic **Diff-the-Trace determination** (EVALUATE/EVIDENCE). Four REAL captures of the same "list users + MFA status" exchange — one per paradigm — each paired with a near-twin carrying ONE real control failure, plus the four contract artifacts. Unaided, you:

1. click the exact failing field/byte in each bad capture — the REST response's extra `salary`/`ssn` property (API3), the GraphQL 12-deep circular selection set + introspection (API4+API9), the SOAP stale `wsu:Created` whose recomputed digest no longer matches (API2), the gRPC reflection-in-prod `:path` + `alg:none` JWT (API9+API2);
2. produce a one-screen evidence determination grid stating, per paradigm, the completeness-proof method, the runtime feature that must be OFF, and the OWASP API 2023 mapping.

`region_labeled_correctly` gates each clicked field against the real parser tree; `decoded_artifact_matches` gates the recomputed SOAP digest disagreeing with the stale envelope; `mapping_correct` gates the OWASP-to-paradigm grid (cited to OWASP API Security Top 10 2023); `validator_passes` gates the determination artifact's structure. Pass threshold: 0.80 on every objective. Every capture is real bytes; the discriminating field is each oracle's computed divergence.

---

## 8. Supplemental Learning Material

- OpenAPI Specification 3.1.0 — spec.openapis.org/oas/v3.1.0
- WSDL 1.1 — w3.org/TR/wsdl; WS-SecurityPolicy 1.2 (OASIS); WSS UsernameTokenProfile 1.0 (OASIS)
- GraphQL Specification — spec.graphql.org; OWASP GraphQL Cheat Sheet
- Protocol Buffers — protobuf.dev "Encoding"; gRPC PROTOCOL-HTTP2.md
- RFC 7519 (JWT); RFC 7239 (Forwarded); RFC 6265 (Set-Cookie); RFC 9111 (Cache-Control)
- OWASP API Security Top 10 2023 — owasp.org/API-Security
