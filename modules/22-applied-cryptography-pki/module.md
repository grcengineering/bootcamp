# Module 22 — The Padlock Is a Lie (Until You Read the Cert)

*Loop stages: UNDERSTAND · LOCATE · EVALUATE · EVIDENCE · MONITOR · OWN. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. A control is a claim about a system — and this is the module where you learn to read the two-part claim "encrypted at rest AND in transit" where each half physically lives: in a transform you can re-run, in a certificate field you can point to, in a handshake the protocol itself refuses to fake.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, the irreducible three-way distinction — hashing (one-way, no key, integrity), encryption (reversible *with* a key, confidentiality), encoding (reversible with *no* key, transport) — and why "it looks scrambled" is not "it is protected."
2. **Map** the auditor's two-part claim "encrypted at rest AND in transit?" onto where each half's truth lives: in-transit truth in the TLS certificate's validity, chain, and AEAD cipher (CC6.7 / SC-8); at-rest truth in a storage-encryption setting and a KMS key reference (CC6.1 / SC-28).
3. **Describe** the X.509 certificate as a CA-signed binding of identity to public key, naming the load-bearing RFC 5280 fields and how a three-tier chain links each cert's issuer-name to the next cert's subject-name.
4. **Compose** the TLS 1.3 full-handshake message sequence in correct order between client and server, and explain what CertificateVerify proves.
5. **Diagnose** a broken in-transit control by reading real evidence — spotting the ONE field that fails validation (expired notAfter, SAN/host mismatch, self-signed) and mapping it to openssl's real verify return code (0 / 10 / 18 / 62).
6. **Produce** a re-runnable evidence verdict for the "at rest and in transit" claim: confirm a transform's output equals a cited constant (SHA-256 of empty = e3b0c442…), read the negotiated protocol and cipher, and map both halves to CC6.1 / CC6.7 and SC-8 / SC-13 / SC-28.

Each objective is checked by the Assessment in §7. If you can already produce the §7 evidence verdict unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

There is one claim an auditor hears more than any other, and it is almost always offered as a green padlock: "the data is encrypted." It is two claims wearing one coat. *At rest* is a claim about bytes sitting on a disk; *in transit* is a claim about bytes moving between two machines. They live in different places, are owned by different systems, and break in completely different ways — and the padlock in the address bar speaks to neither of them honestly. A padlock can be closed over an expired certificate, over a certificate for the wrong hostname, over a self-signed certificate a corporate proxy quietly trusted. The icon means "a TLS session was established," not "the right party, with a valid identity, is protecting your data."

This is the module where **UNDERSTAND** stops being a vibe and becomes a test you can run: is this string a hash, a cipher, or just an encoding? Run the transform and find out — base64 turns back into the original with no key, SHA-256 never turns back at all. Where **LOCATE** means finding the single certificate field that anchors a claim, not gesturing at "TLS." Where **EVALUATE** is reading one field against the claim and binding it to a return code the validator actually emits. And where the segue to **EVIDENCE / MONITOR / OWN** is the realization that a re-runnable transform output, a parsed certificate field, and a negotiated cipher line are evidence anyone can reproduce — the opposite of "trust the icon."

The discipline this builds is the GRC mindset applied to the most over-trusted control on the internet: the owner *claims* encryption, the bytes are *ground truth*, and the gap between a green padlock and a read certificate field is your finding.

---

## 3. The Mental Model

Hold three objects in your hand. The first is a **paper shredder**: you can feed a document in and watch it become confetti, but no amount of effort reassembles the confetti into the document. That is a **hash** — one-way, no key, and its only job is to let you prove later that two documents are the same (or catch that one changed). The second is a **lockbox with a key**: you put a document in, lock it, and only someone with the matching key can get it back out. That is **encryption** — reversible, but *only with the key*, and its job is confidentiality. The third is **a message written in a different alphabet** — Morse code, or base64. Anyone who knows the alphabet can read it; there is no secret at all. That is **encoding** — reversible with no key, and its only job is to move data safely through systems that choke on raw bytes.

The single most expensive confusion in this whole field is mistaking the third object for the second. A password that has been base64-encoded *looks* scrambled, and a tired reviewer ticks the "encrypted" box. But base64 is the different-alphabet box, not the lockbox: anyone can decode it in one step, no key required. "It looks scrambled" is a statement about appearance; "it is protected" is a statement about who can reverse it and how. The only way to tell them apart is to *run the transform* — and the transform, not your intuition, is the answer key.

Now apply the same read-the-truth instinct to the green padlock. When you connect to a site over HTTPS, the server hands you a **certificate**: a document, signed by a Certificate Authority, that says "this public key belongs to *this name*." The certificate is exactly the lockbox lid with a tamper-evident seal on it — it does not itself encrypt your traffic, it *proves whose key* is doing the encrypting. So the honest version of "is this encrypted in transit?" is a set of small, pointable questions about that certificate: is it inside its validity window (the notAfter date)? Does the name it is bound to (the Subject Alternative Name) actually match the site you connected to? Does it chain, issuer-to-subject, up to a CA you trust? Each of those is one field, read against one claim. A padlock is the *summary*; the certificate is the *evidence*.

Everything in this module you read off real bytes — a real Google certificate, real deliberately-broken certificates from a public test site, a real signed token — using the same parsers and the same transforms the tools use. There is no authored answer key. The cert is the answer key. The transform is the answer key. The protocol's own refusal is the answer key.

---

## 4. Concepts

### 4.1 Hash, encrypt, encode — three jobs, proven by running them

Three operations make a string "look scrambled," and conflating them is the field's most common error. A **hash** (SHA-256, SHA-1, MD5) is a one-way function: feed it any input and it returns a fixed-size digest, but the function has no inverse — you cannot recover the input, with or without a key. Its job is *integrity*: the same input always produces the same digest, so a changed input produces a different one. **Encryption** (AES and friends) is reversible *only with a key*: ciphertext returns to plaintext exactly when you hold the right key, and not otherwise. Its job is *confidentiality*. **Encoding** (base64, hex) is reversible with *no key at all*: it is a reversible re-spelling for transport, and anyone can undo it in one step. Its job is *moving data*, never protecting it. The honest test is mechanical: try to reverse it. If it reverses with no key, it is encoding. If it reverses only with a key, it is encryption. If it never reverses, it is a hash. "It looks scrambled" is not a class — running the transform is.

### 4.2 The two-part claim splits into two locations

"Encrypted at rest AND in transit?" is two controls owned by two systems, and an auditor who collapses them collects the wrong evidence. *In transit* lives in the TLS layer: a valid certificate, a chain to a trusted CA, and a negotiated AEAD cipher — the truth is on the wire and at the endpoint that terminates TLS (CC6.7 / SC-8). *At rest* lives at the storage layer: a storage-encryption setting that is on, and a key-management reference naming the key that protects the bytes on disk (CC6.1 / SC-28). The same word, "encrypted," names two facts in two places. You answer the auditor by pointing at the certificate for one half and the storage/KMS setting for the other — never by pointing at one and waving at the other.

### 4.3 The certificate's notAfter is where "in transit" dies on a calendar

A certificate is trusted only inside a time window: RFC 5280 fixes a **notBefore** and a **notAfter**, and outside that window the certificate is invalid no matter how strong the key or how clean the chain. The **notAfter** is the deadline — the date past which "encrypted in transit" becomes false purely by the passage of time. This is why an expired certificate is a real, common, and total break: the cipher can be perfect and the chain can connect, but a notAfter in the past means the validator refuses the certificate. Reading the notAfter against today's date is the first and simplest in-transit check, and it maps to openssl verify return code 10 (certificate has expired).

### 4.4 The certificate binds a name to a key — read SAN, BasicConstraints, issuer

An X.509 certificate is a CA-signed statement that *this public key belongs to this name*, and three RFC 5280 fields carry the load. The **Subject Alternative Name (SAN)** lists the host(s) the certificate is valid for; the host you connected to must appear there, or the certificate is valid but pointed at the wrong door (hostname mismatch, openssl code 62). **BasicConstraints** carries the cA flag: CA:FALSE marks a leaf (it may authenticate a server but may not sign other certificates), CA:TRUE marks a CA. The **issuer** names the certificate that signed this one; to assemble the chain, each certificate's issuer-name must equal the next certificate's subject-name, leaf to intermediate to root, ending at a CA you already trust. A chain that does not connect — or never reaches a trusted root — is openssl code 20. Name-to-key binding *is* what a certificate is; these are the fields that prove it.

### 4.5 The TLS 1.3 handshake is an order the protocol enforces

TLS 1.3 establishes a secure channel in a fixed message sequence (RFC 8446 §4.1.1): the client sends **ClientHello**; the server answers **ServerHello**, then (now handshake-encrypted) **EncryptedExtensions**, **Certificate**, **CertificateVerify**, and **Finished**; the client sends its own **Finished**; only then may application data flow. The order is load-bearing, not stylistic. **CertificateVerify** must follow **Certificate** because it is the step where the server signs the handshake transcript with the *private* key matching the certificate's *public* key — the client verifies that signature with the public key, and that is how it knows the party holding the certificate also holds the matching private key (not merely a copy of someone else's certificate). Play a message out of order — application data before the Finished messages — and a real TLS peer does not say "try again"; it terminates with the alert **unexpected_message(10)** (RFC 8446 §6.2). The handshake's integrity is structural, and the protocol enforces it with a code you can read.

### 4.6 A broken in-transit control is one field, bound to one return code

Put a clean certificate beside a real broken one and the finding is a single divergent field bound to the validator's real verdict. An **expired** certificate diverges at notAfter (a date in the past) → openssl code 10. A **self-signed** certificate diverges at issuer (issuer equals subject, with no CA above it) → code 18. A **wrong-host** certificate diverges at SAN (the listed names do not cover the host you connected to) → code 62. The clean leg is the in-transit PASS → code 0. The discriminating field is not your opinion; it is the parser's computed difference over the real bytes, and the verdict code is openssl's, not authored. Your finding names the field, both values, the broken control, and the framework reference — and anyone can re-derive it by running openssl on the same certificate.

### 4.7 Evidence is a verdict that reproduces; a padlock is not

Pull the threads together. The reason a re-run matters is that it removes you from the loop: SHA-256 of the empty string is e3b0c442… on every machine, forever, so a verdict that recomputes to a cited constant is evidence no one has to take on faith. The in-transit half of the claim is answered by the negotiated protocol-and-cipher line (TLS 1.3 with an AEAD cipher) plus the certificate fields you read; the at-rest half is answered by the storage-encryption setting and the KMS key reference (CC6.1 / SC-28). Each is a thing you can produce, re-run, and hand to the next auditor. A green padlock is a *summary an icon drew for you*; an evidence verdict is a *fact you reproduced*. This is the bridge to MONITOR and OWN — a certificate-expiry alert, a TLS-version scan, a cipher-suite policy check are all just these same reads, evaluated continuously, on bytes nobody had to screenshot.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using the real `www.google.com` certificate chain captured with `openssl s_client` and the real deliberately-broken endpoints published for teaching. The field values shown are the real bytes', confirmed against `openssl x509 -text` and `openssl verify`. (Worked examples are Tier-B content — reviewed when certificates rotate or capture conventions shift.)

### 5.1 UNDERSTAND: sort the scramble by running the transform

Three strings, each "scrambled-looking," sorted by what reversing them requires:

```
aGVsbG8=                                                              base64("hello")  → reverses with NO key → ENCODE
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824     SHA-256("hello") → never reverses        → HASH
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9                                  a JWT header     → reverses with NO key → ENCODE
```

Decode the first with base64 and you get back `hello`. Feed the second back into anything and you get a different digest, never `hello`. Decode the third — it is base64url — and you get `{"alg":"HS256","typ":"JWT"}`, readable with no key, which is the whole lesson: a JWT is a *signed* claim (integrity), not an *encrypted* one (confidentiality). The class is what the real transform does, not what the string looks like.

### 5.2 LOCATE: peel the real certificate to the fields that anchor "in transit"

Selected fields from the real `www.google.com` leaf, as `openssl x509 -text` reports them and the parser confirms:

```
Subject            : CN=www.google.com
Issuer             : C=US, O=Google Trust Services, CN=WR2
Validity notBefore : 2026-05-25T08:39:11Z
Validity notAfter  : 2026-08-17T08:39:10Z      ← the in-transit deadline (SC-8 / CC6.7)
Subject Alt Name   : DNS:www.google.com         ← must match the host you connected to
BasicConstraints   : CA:FALSE                    ← a leaf, not a CA
```

"Is it encrypted in transit?" is now three pointable reads: notAfter (is today inside the window?), SAN (does it cover the host?), and the chain (does issuer `WR2` equal the intermediate's subject, on up to a trusted root?). The padlock summarized all of this into one icon; the certificate spells it out field by field.

### 5.3 EVALUATE: the TLS 1.3 handshake, and the move the protocol refuses

The full handshake order (RFC 8446 §4.1.1): `ClientHello → ServerHello → {EncryptedExtensions} → {Certificate} → {CertificateVerify} → {Finished}` from the server, then `{Finished}` from the client, then application data. CertificateVerify follows Certificate because it signs the transcript with the private key matching the certificate's public key — that is what proves the server holds the key, not just a copy of the cert. Inject application data before the Finished messages and a real TLS peer answers with `unexpected_message(10)` — the consequence is real because the state machine is real, not because a script said "wrong."

### 5.4 DIAGNOSE: the field where the claim breaks, bound to a return code

Put the clean leaf beside two real broken certificates and the finding is one field plus one code. Clean: notAfter `2026-08-17`, SAN covers the host → `openssl verify` returns 0. Broken (the real `expired.badssl.com`): notAfter `2015-04-12T23:59:59Z` — years in the past → code 10 (certificate has expired). Broken (the real `wrong.host.badssl.com`): SAN reads `DNS:*.badssl.com, DNS:badssl.com` — a single-label wildcard that does *not* cover the three-label `wrong.host.badssl.com` → code 62 (hostname mismatch). The green padlock is closed in both broken cases; the *field* is what tells the truth. Your evidence verdict names the field, both values, the control broken (SC-8 / CC6.7), and the validator's real return code — and it re-runs the same way for anyone.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (certificates rotate, capture conventions drift). This lab runs entirely in your browser on the bootcamp site (Module 22 → Interactive lab) — no install, no openssl on your host needed.

**Scenario.** An auditor asks "is the data encrypted at rest AND in transit?" and is handed a green padlock. You are asked to replace the padlock with evidence: sort hash from encrypt from encode by running the real transform, peel the real `www.google.com` certificate to the fields that anchor the in-transit claim, assemble the TLS 1.3 handshake until the sim refuses an illegal move with the real RFC 8446 alert, and click the single field that breaks each of two real broken certificates.

> **Interactive lab.** The lab is the Inspect-&-Assemble surface: transform cards whose class is *derived by running the real transform* (base64 reverses with no key; SHA-256 never does), the real certificate rendered as selectable fields whose values are the parser's decode of the real DER, and the TLS 1.3 handshake as orderable cards a real RFC 8446 state machine runs. Selecting a field reveals the oracle's real decode — the same value `openssl x509 -text` produces from the same bytes. Every task is machine-verified against that parse tree, transform output, or the sim's verdict.

**Tasks (performed on the surface).**

1. On the SHA-256 card, sort it into ONE-WAY HASH and prove it: the transform recomputes the digest but never recovers the input. *(Objective 1)*
2. On the base64 card, sort it into ENCODE and prove it: it reverses to the original with no key. *(Objective 1)*
3. Decode the real JWT header live — base64url, no key — and state why a "scrambled-looking" header is plaintext. *(Objective 1)*
4. Peel the real leaf certificate and read the **notAfter** — the field that anchors the in-transit deadline. *(Objectives 2, 3)*
5. Read **BasicConstraints** (CA:FALSE) and the **SAN** (the host the certificate covers). *(Objectives 2, 3)*
6. Read the **issuer** and state which next certificate's subject it must equal to chain. *(Objective 3)*
7. Assemble the TLS 1.3 handshake in order; then inject application data early and read the real `unexpected_message(10)` alert. *(Objective 4)*
8. **Diff-the-Trace.** On the real `expired.badssl.com` certificate, click the divergent **notAfter**; on the real `wrong.host.badssl.com` certificate, click the divergent **SAN**. *(Objective 5)*
9. Confirm SHA-256 of the empty string equals the cited constant — a re-runnable verdict. *(Objective 6)*

**Deliverable.** A short evidence verdict: the in-transit PASS (negotiated TLS version and cipher, plus the certificate fields read), the two broken-certificate findings (field, value, broken control, openssl return code), and a re-runnable transform output equal to a cited constant — mapped to CC6.1 / CC6.7 and SC-8 / SC-13 / SC-28.

---

## 7. Assessment

**Competency artifact (not a quiz).** From real artifacts provided at assessment time, the learner must, unaided:

- **Sort** real strings into hash / encrypt / encode by running the real transform (the class is derived, not authored), and decode a JWT header with no key to show that a signed token is not an encrypted one — gated by `region_labeled_correctly` (class label) and `decoded_artifact_matches` (the live transform).
- **Peel** the real `www.google.com` leaf and read, off the bytes, the notAfter, BasicConstraints, SAN, and issuer — each verified against the x509-parser's parse tree (`region_labeled_correctly`, `field_value_is`), and state which certificate field anchors the in-transit half of the claim.
- **Compose** the TLS 1.3 full-handshake in correct order (`sequence_matches`) and trigger the real `unexpected_message(10)` alert on an illegal move (`sim_alert_is`).
- **Diff-the-Trace**: given the clean leaf and real broken twins, click the single field where the evidence contradicts the in-transit control — the expired certificate's notAfter and the wrong-host certificate's SAN (`region_labeled_correctly` against the parser's computed divergence) — and bind each to openssl's real return code (10, 62).
- **Produce** a re-runnable evidence verdict: SHA-256 of the empty string equals the cited constant (`decoded_artifact_matches`), and map the in-transit half to CC6.7 / SC-8 and the at-rest half to CC6.1 / SC-28 with SC-13.

Every shown value is the parser / transform / state-machine's output over real bytes, fidelity-checked against `openssl x509 -text`, `openssl verify`'s return codes, `shasum`, and RFC 8446. A single field read wrong, or a class assigned by appearance instead of by the transform, routes the learner back to the specific concept section — not the whole module.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **OpenSSL — `x509`, `s_client`, and `verify` documentation** — the canonical tools this module's oracles are fidelity-checked against; re-run the §5 peel and verdict on any host yourself. https://docs.openssl.org/master/man1/openssl-x509/ and https://docs.openssl.org/master/man1/openssl-s_client/ — *use to reproduce the certificate fields and the 0/10/18/62 return codes by hand.*
- **RFC 5280 (X.509 / PKIX) and RFC 6125 (hostname matching)** — the authoritative definitions of the certificate fields and the SAN/host match this module reads. https://www.rfc-editor.org/rfc/rfc5280 · https://www.rfc-editor.org/rfc/rfc6125 — *use as the lookup when you want a field's meaning from the source.*
- **RFC 8446 (TLS 1.3)** — the handshake message flow (§4.1.1) and the AlertDescription codes (§6.2) behind §4.5. https://www.rfc-editor.org/rfc/rfc8446 — *use for a deeper treatment of why CertificateVerify proves key possession and why an out-of-order message is `unexpected_message`.*
- **FIPS 180-4 (SHA-2), RFC 1321 (MD5), RFC 4648 (base64/hex)** — the algorithms behind the hash/encode distinction in §4.1. https://csrc.nist.gov/pubs/fips/180-4/upd1/final · https://www.rfc-editor.org/rfc/rfc1321 · https://www.rfc-editor.org/rfc/rfc4648 — *use to confirm that base64 is a reversible no-key transform and a hash is one-way.*
- **badssl.com** — the public test site that publishes the deliberately-broken endpoints (expired, self-signed, wrong-host) this module's Diff-the-Trace uses. https://badssl.com — *use to point your own browser and `openssl s_client` at a real broken certificate and watch the validator's verdict.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
