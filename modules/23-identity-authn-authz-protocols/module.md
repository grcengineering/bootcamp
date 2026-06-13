# Module 23 — The Valet Key: Reading Who You Are and What You May Do

*Loop stages: UNDERSTAND · LOCATE · EVALUATE · EVIDENCE · MONITOR. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. A control is a claim about a system — and this is the module where the claim is "access is authenticated and authorized," and you learn to read that claim in the bytes the protocols carry: the JWT claims you can decode, the OAuth dance you can sequence, and the SAML assertion field whose staleness is the break.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, the difference between authentication (who you are) and authorization (what you may do), and why a JWT is a *signed claim* about identity you can read with no key, not an encrypted secret.
2. **Locate** the reserved claims in a real JWT — base64url-decode the `header` and `payload` and read `alg`, `exp`, `iat`, `iss`, `aud`, `sub` directly off the wire — and read the truth of an access claim from those field values.
3. **Compose** the OAuth2 authorization-code + OIDC dance as an ordered sequence between user-agent, client, authorization server, and resource server, and explain the valet-key separation: a credential is exchanged once for a short-lived scoped token that rides every subsequent call.
4. **Describe** a SAML SP-initiated SSO assertion by reading its `<AuthnStatement>`/`<AuthnContextClassRef>` (how the user authenticated) and `<Conditions NotOnOrAfter>` (the validity window) as the control-truth an SP must check.
5. **Diagnose** a broken auth control by reading real evidence — an `alg:none` tampered JWT, an `exp` claim already in the past, or an assertion past its `NotOnOrAfter` — and name the control each breaks (AC-3 / IA-2 / CC6.1).
6. **Produce** an evidence finding for an access claim ("access is authenticated and MFA-asserted") naming the field that holds the truth, both the clean and the broken value, and the framework reference.

Each objective is checked by the Assessment in §7. If you can already produce the §7 findings unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Almost every system you will ever assess gates on two questions before it does anything: *who is this?* and *are they allowed?* Authentication answers the first, authorization the second, and a great many of the highest-stakes controls — "MFA is enforced," "least privilege is applied," "sessions expire" — are claims about how those two questions get answered and whether the answer can be trusted. The trouble is that the answer is not a setting in a config file you can read at rest. It is a token in flight, a redirect chain between three parties, a signed XML document an identity provider hands a service provider for a few seconds. If you cannot read those artifacts, you are taking the integration's word for it.

This is the module where **LOCATE** means "find the claim inside the token," **EVALUATE** means "read the field that decides the control and compare it to the claim," and the segue to **EVIDENCE** and **MONITOR** is the realization that an access log, an IdP sign-in report, and a token-introspection endpoint are all just programs reading these same fields on a schedule. The most dangerous misconception in this whole domain is that a token *looks* scrambled and therefore must be protected. It is not. A JWT's claims are base64url — readable by anyone holding the token, with no key. The day you decode one by hand is the day you stop confusing encoding with encryption, and start asking the only question that matters: *which field decides this control, and does it say what the owner claims?*

The discipline this builds is the GRC mindset applied to identity: the integration *claims* access is authenticated and authorized, the token and the assertion are *ground truth*, and the field where they disagree is your finding.

---

## 3. The Mental Model

Think about handing your car to a valet. You do not give the valet your house key, your office badge, and your safe combination — you hand over a *valet key* that starts the car and opens nothing else, and only for as long as you are at dinner. Three ideas are hiding in that small act, and together they are the whole of this module.

First, *who you are* is not the same as *what you may do*. The valet knowing your name (authentication) is a different fact from the valet being allowed to drive your car into the garage (authorization). Systems keep these separate on purpose: a passport proves who you are; a building pass says which doors you may open. A control like "MFA is enforced" is an authentication claim; "auditors can read but not write" is an authorization claim. Conflating them is the most common framing error in an access review.

Second, the thing the valet holds is a *limited, short-lived token*, not your master credential. This is exactly what OAuth does: instead of giving an application your password, you prove yourself once to an identity provider, which hands the application a scoped token that expires. If the token leaks, the blast radius is small and brief; your password never traveled. Watching that separation — the credential goes to the authority once, a short-lived token rides every later call — is the single most important thing to *see* about modern auth, and the lab draws it as a sequence you assemble.

Third, the token is *readable*, and that is fine, because it is signed, not secret. A valet key is not encrypted — anyone can look at it — but it only works because it came from your car's system and it stops working after dinner. A JWT is the same: its header and payload are base64url-encoded JSON that decodes with no key at all, and what makes it trustworthy is the *signature* (it came from a trusted issuer and was not tampered with) and the `exp` claim (it stops working at a deadline). So "the JWT is scrambled, therefore the data in it is protected" is precisely backwards. The signature protects *integrity*, not *confidentiality*. Anything you put in a token's claims is plaintext to whoever holds it.

A SAML assertion is the enterprise cousin of the same idea: a signed XML document an identity provider sends a service provider that says *who* the user is, *how* they authenticated, and *until when* the statement may be trusted. You will not re-implement XML signature validation here — that is a deep, separate craft, and this module says so out loud. What you will do is read the load-bearing fields: the `AuthnContextClassRef` that records the authentication method, and the `<Conditions NotOnOrAfter>` that bounds validity. Past that instant, the assertion is stale and an honest service provider rejects it — and the staleness is a single field you can point to. There is no answer key. The decode is the answer key.

---

## 4. Concepts

### 4.1 Authentication vs authorization, and why a JWT is a claim, not a secret

**Authentication** establishes identity — *who you are*. **Authorization** establishes permission — *what you may do*. They are different objects with different evidence: an MFA prompt is authentication; a role assignment is authorization. A JSON Web Token (JWT) is a compact, signed statement of claims about an authenticated subject, and it is built from three dot-separated segments: `header.payload.signature`. The header and payload are base64url-encoded JSON (RFC 7515 §4, RFC 4648 §5); the signature is a MAC or digital signature over the first two segments. The decisive fact for an auditor: **the header and payload decode with no key.** Anyone holding the token can read every claim inside. The signature provides *integrity* (the token came from the issuer and was not altered), never *confidentiality*. Treating a JWT as if its contents were encrypted is the field's most common "it's protected" error.

### 4.2 The reserved claims are where the control-truth lives

RFC 7519 §4.1 defines reserved claims that carry the load: `iss` (issuer — who minted the token), `sub` (subject — the principal it is about), `aud` (audience — who it is for), `exp` (expiry, a NumericDate past which it is invalid), `iat` (issued-at), and `nbf` (not-before). A verifier that does its job pins the `iss` to a known issuer, confirms the `aud` matches itself, and checks `exp` against the current time before honoring anything. So "is this access token live and from a party we trust?" is answered by reading three fields. Each is plaintext base64url — you read them the same way an attacker who stole the token would, which is precisely why a stolen-but-unexpired token is dangerous and why `exp` windows are kept short.

### 4.3 OAuth2 and OIDC: the valet-key handoff is an ordered dance

The OAuth 2.0 authorization-code grant (RFC 6749 §4.1) separates the credential from the application. The order is the control: the **client** sends an `authorization_request` to the **authorization server**; the user authenticates *there* (not to the app) and the server returns a one-time `authorization_response` carrying a `code`; the client makes a back-channel `token_request` exchanging that code for a `token_response` carrying a short-lived `access_token` (and, with OpenID Connect, an `id_token` proving authentication); finally the client makes a `resource_request` to the **resource server** bearing that token. The valet-key insight is spatial: the long-lived credential goes to the authorization server **once**, and a short-lived scoped token rides every subsequent call. The order is not advisory — a conformant authorization server that receives a resource call before any token was exchanged returns the real `invalid_request` error (RFC 6749 §4.1.2.1 / §5.2), because the valet key was never issued.

### 4.4 SAML assertions: who, how, and until-when in signed XML

In SAML 2.0 SP-initiated SSO, the **service provider** (SP) redirects the user to the **identity provider** (IdP); the IdP authenticates the user and POSTs a signed `<Assertion>` back to the SP (OASIS saml-core-2.0-os §2.3). The fields that carry the control-truth: `<Issuer>` names the IdP; `<Subject>/<NameID>` names the user; `<AuthnStatement>` records *when* authentication happened and, via `<AuthnContextClassRef>`, *how* — e.g. `PasswordProtectedTransport` (password over TLS) versus a multi-factor class reference. The `<Conditions NotBefore NotOnOrAfter>` element bounds validity: per §2.5.1.2, `NotOnOrAfter` is **exclusive**, so the assertion is valid only while `now < NotOnOrAfter`. An SP that enforces "MFA was used" reads the `AuthnContextClassRef`; an SP guarding against replay reads `NotOnOrAfter`. (This module reads these fields and catches the stale-window tamper; it deliberately does **not** validate the XML signature — that is a separate craft, and the honesty is in saying so.)

### 4.5 alg:none is a broken authentication control you can read in one field

A JWT's protection comes entirely from its signature, so the attack is to make the verifier skip it. The `alg:none` token (RFC 8725 §2.1, the JWT BCP) declares in its header that there is *no* signature, and leaves the signature segment empty. A naive verifier that honors the header's `alg` will accept it as valid — meaning anyone can forge a token by setting whatever claims they like and declaring `alg:none`. The break is one field: `header.alg` reads `none`. It maps to broken authentication (OWASP API2) and to IA-2 / AC-3 / CC6.1, because a token whose signature is never checked authenticates nobody. You diagnose it exactly the way you read any other claim — decode the header — and the value the parser returns over the real tampered bytes is the finding.

### 4.6 A stale assertion is a predicate over one timestamp

Pull the threads together. A control claim about access reduces to a predicate over a field: "this token is live" is `exp > now`; "this assertion may be trusted" is `now < NotOnOrAfter`; "MFA was enforced" is `AuthnContextClassRef ∈ {the MFA classes}`; "the signature is real" is `alg ≠ none` (and the signature verifies). The evidence is a real token or a real assertion whose field either satisfies the predicate or violates it. The staleness break is the cleanest example: a clean assertion whose `NotOnOrAfter` is in the future and a real tampered twin whose `NotOnOrAfter` is in the past differ in exactly one field, and the verdict — `now >= NotOnOrAfter`, so reject — is the SP's computed comparison, not your opinion. That is the whole game, and the same predicate evaluated continuously is the bridge to MONITOR: a sign-in anomaly rule, a token-introspection check, an assertion-replay detector are all this predicate on a schedule.

### 4.7 Where the credential lives, and why that is a control surface

The four protocols carry the credential in structurally different places, and where it lives is itself a control surface. REST, GraphQL, and gRPC put a bearer token in a request header (`Authorization: Bearer …`) or a JWT in that header; OAuth's whole point is that this token is short-lived and scoped. SAML carries identity *inside the signed message* — the assertion is the credential, and its trust comes from the IdP's signature plus the `<Conditions>` window. Reading "where does the proof of identity live, and what bounds its lifetime?" tells you immediately what an attacker would target (a long-lived bearer token is a standing liability; a short window plus rotation shrinks it) and what evidence proves the control (the `exp`/`NotOnOrAfter` value, the `AuthnContextClassRef`, the issuer pin). The location of the credential is not trivia — it is the map of where the authentication control can be broken and where its evidence is born.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using the real three-segment JWT and the OASIS example SAML assertion that are this module's seeded artifacts. Every decoded value shown is the parser's real output over the real bytes, fidelity-checked against a base64url decode and the cited spec. (Worked examples are Tier-B content — reviewed when token/assertion conventions or spec errata shift.)

### 5.1 LOCATE + read: decode a real JWT, claim by claim

A real JWT is three base64url segments joined by dots. Decoding the first two (no key needed) yields readable JSON:

```
header  : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
          -> {"alg":"HS256","typ":"JWT"}
payload : eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdyY2Jvb3RjYW1wLmV4YW1wbGUiLCJzdWIiOiJ1c2VyLTdmM2Ei…
          -> {"iss":"<the issuer https-URI for accounts.grcbootcamp.example>","sub":"user-7f3a",
              "aud":"grc-bootcamp-lab","iat":1718200000,"exp":1718203600,
              "name":"Avery Lin","role":"auditor"}
signature: J9SkdtAQCO-2M2--8pdgsuRJMx12RzL_ZbcZKxBcJZU   (a MAC over header.payload — integrity, not secrecy)
```

Read it as the §3 model: the header announces the algorithm (`HS256`), and the payload's reserved claims answer the auditor's questions — `iss` is the issuer to pin, `exp` is the expiry deadline, `sub` is the principal. You decoded all of it with no key, which is the proof that a JWT is a signed claim, not an encrypted secret. Nothing was authored — the base64url decode is the answer key.

### 5.2 EVALUATE: answer an access claim from those fields

- *"The token came from our IdP."* → read `iss`: the issuer URI for `accounts.grcbootcamp.example`. The verifier pins this; a token with a different `iss` is rejected before any other claim is honored.
- *"The token is still live."* → read `exp`: `1718203600` (a NumericDate). Compare to now. This token's `exp` is genuinely in the past relative to today, so by this predicate it is expired — the live-token claim is false, and you can point to the field.
- *"The signature actually protects it."* → read `header.alg`. `HS256` means a real MAC was applied; `none` would mean the signature was disclaimed and the token is forgeable. The protection lives in this field plus a verifier that honors it.

Notice the trap: nothing here required a key. The same fields an attacker reads from a stolen token are the fields you read to assess it — which is exactly why short `exp` windows and issuer pinning are the controls that matter.

### 5.3 Compose the valet-key dance, and read the consequence of a wrong move

The authorization-code + OIDC dance assembles in one order: `authorization_request` (client → authz server) → `authorization_response` carrying the one-time `code` (authz server → client) → `token_request` exchanging the code (client → authz server) → `token_response` carrying the short-lived `access_token` (authz server → client) → `resource_request` bearing that token (client → resource server) → `resource_response`. The separation is the control: the credential reached the authorization server once; the token rides the rest. Route a `resource_request` to the resource server *before* the token exchange and a conformant authorization server answers with the real `invalid_request` — no valet key was ever issued. The consequence is the protocol's, not a stored "try again."

### 5.4 DIAGNOSE: the field where the claim breaks

Put a clean artifact beside a real tampered twin and the finding is a single divergent field. **JWT:** clean header `{"alg":"HS256",…}`; the tampered twin's header `alg` reads `none` and the signature segment is empty — a forgeable, unsigned token (IA-2 / AC-3 / CC6.1), and you can point to the exact field. **SAML:** clean `<Conditions NotOnOrAfter="2030-01-01T00:00:00Z">` (window open); the tampered twin reads `NotOnOrAfter="2024-01-02T00:00:00Z"` — years in the past, so `now >= NotOnOrAfter` and the assertion is stale and must be rejected (AC-3 / IA-2 / CC6.1). The discriminating field is the parser's computed divergence over two real artifacts, not your opinion. Your finding names the field, both values, the broken control, and the framework reference — and anyone can re-derive it by decoding the same bytes.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (token/assertion conventions drift). This lab runs entirely in your browser on the bootcamp site (Module 23 → Interactive lab) — no install, no identity provider to stand up.

**Scenario.** You are handed real identity artifacts — a three-segment JWT and its real tamper twin, the OAuth2/OIDC dance as orderable cards, and an OASIS SAML assertion with its expired twin — and asked to read each access claim's truth directly off the bytes, then diagnose the single field where a real broken artifact contradicts its claim.

> **Interactive lab.** The lab is the Inspect-&-Assemble surface. The JWT and SAML panels render as selectable regions whose decoded values are the ported parser's real output over the real bytes (the same JSON a base64url decode produces with no key; the same field values the assertion's XML carries). The OAuth dance is a set of orderable cards driving the real RFC 6749 state machine — a wrong order raises the protocol's real `invalid_request`, not a hint. Every task is machine-verified against that parse tree or that sim.

**Tasks (performed on the surface).**

1. Select the JWT **header** and decode it live with no key; state the algorithm and why this proves a JWT is a signed claim, not a secret. *(Objectives 1, 2)*
2. Select the payload's **`exp`** claim and read its value — the token's expiry deadline. *(Objective 2)*
3. Select the payload's **`iss`** claim and read the issuer a verifier must pin. *(Objective 2)*
4. Assemble the **OAuth2/OIDC dance** in order, routing each card between user-agent, client, authorization server, and resource server. *(Objective 3)*
5. On the clean **SAML** assertion, select the **`AuthnContextClassRef`** and read how the user authenticated. *(Objective 4)*
6. Still on the clean assertion, select the **`<Conditions NotOnOrAfter>`** and read the validity deadline. *(Objective 4)*
7. On the **alg:none twin**, select the header's **`alg`** field and read the value that defeats signature verification. *(Objective 5)*
8. **Diff-the-Trace.** On the **expired SAML twin**, click the single field (`NotOnOrAfter`) where the assertion diverges from the clean leg and is now stale. *(Objectives 5, 6)*

**Deliverable.** A short written finding for each broken artifact: the field, the clean value, the broken value, the control claim broken, and the framework reference (AC-3, IA-2, or CC6.1).

---

## 7. Assessment

**Competency artifact (not a quiz).** From real artifacts provided at assessment time, the learner must, unaided:

- **Decode** a real JWT and read, off the base64url segments, the `header.alg` and the reserved claims `exp` and `iss` — each verified against the parser's parse tree (`region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`), demonstrating that the claims are plaintext with no key.
- **Compose** the OAuth2/OIDC authorization-code dance in the correct order with correct routing (`sequence_matches` against the real RFC 6749 state machine), explaining the valet-key separation and what a resource call before the token exchange returns.
- **Read** a SAML assertion's `AuthnContextClassRef` and `<Conditions NotOnOrAfter>` as the control-truth (`region_labeled_correctly`, `field_value_is`).
- **Diff-the-Trace**: given a clean artifact and a real tampered twin — an `alg:none` JWT and an assertion past its `NotOnOrAfter` — click the single field where evidence contradicts the control claim (`region_labeled_correctly` against the parser's computed divergence, `field_value_is` on the divergent value), then write a finding naming the field, both values, the broken control, and the framework reference (NIST 800-53 AC-3 / IA-2; SOC 2 CC6.1).

Every shown value is the parser's output over the real artifact (JWT base64url decode, SAML field read) or the sim's real verdict (the dance order), fidelity-checked in the engine tests. A single field read wrong, or a control mapped to the wrong field, routes the learner back to the specific concept section — not the whole module.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **RFC 7519 (JWT) and RFC 7515 (JWS)** — the authoritative definitions of the JWT structure and the reserved claims this module reads. https://www.rfc-editor.org/rfc/rfc7519 · https://www.rfc-editor.org/rfc/rfc7515 — *use to confirm a claim's meaning and the segment layout from the source.*
- **RFC 8725 (JWT Best Current Practices)** — the document behind §4.5, including the `alg:none` unprotected-token attack and how to avoid it. https://www.rfc-editor.org/rfc/rfc8725 — *use for a deeper treatment of why a verifier must never trust the header's `alg` blindly.*
- **RFC 6749 (OAuth 2.0) and OpenID Connect Core 1.0** — the authorization-code grant and the OIDC `id_token` behind §4.3. https://www.rfc-editor.org/rfc/rfc6749 · https://openid.net/specs/openid-connect-core-1_0.html — *use to follow the dance step by step and read the error codes a wrong move returns.*
- **OASIS SAML 2.0 Core (saml-core-2.0-os)** — the assertion structure and the `<Conditions>`/`<AuthnStatement>` definitions behind §4.4. https://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf — *use as the lookup for any assertion field, including the exclusive semantics of `NotOnOrAfter`.*
- **OWASP API Security Top 10 (2023)** — the attacker's-eye view of broken authentication (API2) and broken object-level/function-level authorization. https://owasp.org/API-Security/editions/2023/en/0x11-t10/ — *use to connect the field-level breaks here to the named API risk classes.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
