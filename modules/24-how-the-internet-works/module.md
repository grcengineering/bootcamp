# Module 24 — From a URL in a Box to a Chain of Trust: Reading the Request Lifecycle on the Wire

*Loop stages: UNDERSTAND → LOCATE → QUERY → EVALUATE → EVIDENCE → MONITOR → OWN (the integrative spine). Tier-1, IT-foundations band. Original content; third-party material is confined to §8. The loop question: as "example.com" becomes pixels, where does each control claim physically live in the lifecycle — which hop travels in the clear, where does encryption begin, and which record on the wire proves it?*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, how typing a domain into a browser becomes one continuous chain of handoffs — a name resolved (DNS), a transport opened (TCP), a channel secured (TLS), a conversation held (HTTP), pixels rendered — and why each handoff is a place a control claim can be made or broken.
2. **Describe** recursive versus iterative resolution and map the DNS treasure hunt — root → TLD → authoritative — onto where control-truth physically lives, including the difference between a referral and an answer.
3. **Map** the bytes of a real DNS message to their RFC 1035 structural regions (the header flags-word, the length-prefixed QNAME labels, the resource-record TYPE/CLASS/TTL/RDATA) and read the encoded values directly off the wire.
4. **Locate** the encryption boundary in the request lifecycle precisely — DNS, the TCP handshake, and the TLS ClientHello (SNI) as plaintext-by-default, and the post-handshake record as where confidentiality begins.
5. **Compose** the full type-to-render protocol sequence in correct order across DNS / TCP / TLS / HTTP, and recognize the consequence the real state machine returns when a message arrives out of order.
6. **Diagnose** a broken or weak control by reading it off real evidence — an unvalidated (AD-clear) DNS answer, a certificate whose name does not cover the connected host, an expired certificate, a non-CA leaf — and tie each to its control family (SC-8 / SC-12 / SC-17 / SC-23, SI-8, SOC 2 CC6.6 / CC6.7).

Each objective is checked by the Assessment in §7. If you can already produce the §7 Lifecycle Evidence Findings unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

The single most common sentence in a security questionnaire is some version of "data is encrypted in transit." It is also the sentence most often answered with a screenshot of a padlock, a vendor's word, or a green checkmark in a scanner — none of which is the truth, all of which are *claims about a journey*. The journey is the request lifecycle: the few hundred milliseconds in which a name you typed becomes an address, an address becomes a connection, a connection becomes a secure channel, and a channel carries a conversation. Every control you will ever assess about that journey is a claim about one specific stage of it — and either you can point to the stage, the message, and the field that holds the claim's truth, or you are trusting the screenshot.

This is the module that ties the whole IT-foundations band together. Networking taught you to peel a single frame; databases and web architecture taught you where a claim sits still; crypto and identity taught you what trust is made of. Here those threads become one moving picture. **UNDERSTAND** is seeing the lifecycle as a chain of handoffs. **LOCATE** is naming which handoff a claim lives in. **QUERY** is reading a real DNS message's bytes or a real certificate's fields. **EVALUATE** is deciding, from those values, whether the control holds. **EVIDENCE** is the find: the one field where a real capture contradicts a real claim. And **MONITOR/OWN** is the recognition that a DNSSEC validator, a certificate-expiry alert, and a TLS-version policy are all just this same reading, done continuously, by a machine.

The discipline is the same one the whole bootcamp builds, applied to motion: the owner *claims*, the wire and the certificate are *ground truth*, and the gap between them — at a stage you can name and a field you can point to — is your finding. An auditor who can trace a request from a name to a chain of trust can never again be told "it's encrypted, trust us," because they know exactly which message would prove it and exactly where to read it.

---

## 3. The Mental Model

Imagine you want to send a sealed letter to a person you have never met, in a country whose postal system you do not control. First you do not even know their street address — you only know their name. So you ask. You ask a local clerk, who does not know either but knows who *would*: she sends you up a chain of increasingly specific offices until one of them hands back the actual address. That asking-around is **DNS**, and the catch — the thing that surprises everyone — is that the early offices never give you the address. They give you a *pointer to the next office*. The root office says "ask the country desk." The country desk says "ask the city desk." Only the last, most local office actually knows. A pointer is not an answer; learning to tell them apart is half of understanding the internet.

Now you have the address. You still cannot just shove a sealed letter through the door. First the two of you perform a tiny ritual — you knock, they answer, you confirm you heard them answer — and only then is a *channel* open. That ritual is the **TCP three-way handshake**, and like a real knock-and-answer it is ordered: you cannot confirm an answer you have not yet received. Then, before you say anything private, the two of you agree on a shared secret in a way an eavesdropper standing in the hallway cannot follow — but, crucially, *the eavesdropper can still hear you say whose door you are standing at*. That negotiation is **TLS**, and the part the eavesdropper hears — the name on the door you asked for — is the plaintext SNI. Confidentiality does not begin when you connect; it begins a beat later, after the secret is agreed. Everything before that beat is in the clear.

Only now, inside the sealed channel, do you actually hold the conversation: "please send me the homepage," "here it is." That is **HTTP**. And the letter only matters if you trust it came from the right person — which is why, during the secret-agreement, the other party hands you a sealed credential, a **certificate**, that says "I am the holder of this name, and a trusted authority vouches for me." Reading that credential — does the name on it cover the door I knocked on? is the authority one I trust? is it still in date? — is the chain of trust. The whole lifecycle, then, is five honest questions in order: *who are you* (DNS), *can we talk* (TCP), *can we talk privately* (TLS), *prove who you are* (certificate), *now what do you have for me* (HTTP). Miss the order and the real systems do not politely retry — they refuse, with a specific, readable consequence. There is no answer key in this module. The message, the state machine, and the certificate are the answer key.

---

## 4. Concepts

### 4.1 The lifecycle is a chain of handoffs, and each handoff depends on the last

Typing a name and getting pixels is not one event; it is a chain, and the chain has a strict dependency order. You cannot open a connection to an address you do not yet have, so DNS comes first. You cannot encrypt on a channel that is not yet open, so the TCP handshake comes before TLS. You cannot hold an application conversation on a channel that is not yet secured, so HTTP rides inside TLS. Each stage hands the next stage exactly what it needs and nothing more: DNS hands TCP an address, TCP hands TLS an open socket, TLS hands HTTP an encrypted tunnel. This dependency order is not a convention you could rearrange — it is causal. And because it is causal, it tells you precisely where to stand to ask any given control question: the stage that *produces* the thing a claim is about is the stage where that claim's truth lives.

### 4.2 DNS is a delegated treasure hunt, and a referral is not an answer

A name like `example.com` is resolved by walking a tree of authority. Your machine's **stub resolver** asks one question of a **recursive resolver** — "resolve this for me, do all the legwork" (the *recursion desired* bit, RD=1) — and the recursive resolver then walks the hierarchy *iteratively*. It asks a **root** server, which does not know the address and never will; the root knows only who runs each top-level domain, so it returns a **referral** to the `.com` **TLD** servers. The recursive resolver asks a `.com` server, which knows only who runs `example.com`, so it returns a referral to the **authoritative** servers. Only the authoritative server returns the actual address. The control-relevant idea is the distinction between a *referral* and an *answer*: every level is authoritative only for the boundary one step below it (this is **delegation**), and a server higher in the tree that *claimed* to answer a leaf record would be lying about authority it does not have. The honest behavior — try to ask the root for the leaf and it refers you onward — is the protocol refusing to overreach.

### 4.3 A DNS message is bytes at fixed offsets, and the flags-word carries control state

A DNS message (RFC 1035 §4.1) is not free-form. It opens with a 12-byte **header**: a two-byte ID, a two-byte **flags word**, and then four 16-bit counts — QDCOUNT (questions), ANCOUNT (answers), NSCOUNT (authority), ARCOUNT (additional). The flags word is bit-packed and it is where control state lives: QR (is this a query or a response), RD (was recursion desired), RA (is recursion available), and — the one that matters for assurance — **AD**, the *Authenticated Data* bit (RFC 4035), set by a validating resolver to say "I checked the DNSSEC signatures on this data." After the header comes the **question**: the **QNAME**, which is not stored with dots but as length-prefixed labels (`07` then seven bytes spelling `example`, `03` then `com`, then a `00` terminator), followed by QTYPE and QCLASS. A response then carries **resource records**, each with a NAME, a TYPE (A=1, CNAME=5, CAA=257), a CLASS, a **TTL**, an RDLENGTH, and the **RDATA** — for an A record, four bytes that are the IPv4 address. You read each of these at its offset; the value is whatever the bytes say.

### 4.4 The encryption boundary is a line you can place exactly

"Encrypted in transit" has a precise beginning, and most of the lifecycle is *before* it. The DNS lookup travels in the clear (unless you are using DNS-over-HTTPS or DNS-over-TLS). The TCP handshake — SYN, SYN-ACK, ACK — is in the clear. And the very first TLS message, the **ClientHello**, is in the clear, including the **SNI** field that names the host you are connecting to. Confidentiality begins only *after* the key exchange completes, a beat after the server's hello. So the honest answer to "is the connection private?" is layered: the *contents* of the application conversation are encrypted, but the *fact that you connected to this host* leaked in the plaintext SNI, and the *name you looked up* leaked in plaintext DNS. For GRC this matters twice: it bounds what "encryption in transit" actually protects (SC-8), and it explains why mitigations like DoH/DoT and Encrypted ClientHello exist — they push the boundary earlier to cover the metadata that the default lifecycle leaves exposed.

### 4.5 The handshake is an ordered state machine, and out-of-order is refused, not retried

TLS 1.3 (RFC 8446) opens a secure channel with a fixed message order: the client sends **ClientHello**; the server answers **ServerHello**, then (now able to encrypt) **EncryptedExtensions**, **Certificate**, **CertificateVerify**, and its **Finished**; the client sends its **Finished**; and only then may application data flow. The order is not arbitrary — **CertificateVerify** (the server signing the handshake transcript to prove it holds the private key) must follow **Certificate** (which carries the public key), or the client would have nothing to check the signature against. The state machine is real: send a message in the wrong state — application data before the Finished messages are exchanged — and the protocol does not say "try again." It terminates the connection with a specific alert, `unexpected_message`, code 10 (RFC 8446 §6.2). The consequence is structural, and it is readable. This is the same lesson as the TCP handshake (which answers a wrong order with a RST): ordered protocols enforce their order with refusals you can observe.

### 4.6 The certificate is where the name becomes an identity you can verify

During the handshake the server presents a **certificate** (RFC 5280), and that certificate is the bridge between the name you looked up and the party you are actually talking to. Three fields decide whether the in-transit identity claim holds. The **Subject Alternative Name** (SAN) lists the hostnames the certificate is valid for — if the host you connected to (the same name that rode in the plaintext SNI) is not covered by the SAN, the channel is encrypted but pointed at the wrong door. The **validity** window (notBefore, notAfter) bounds when the certificate is trusted — past notAfter, the in-transit claim is dead on the calendar even if the cipher is perfect. The **issuer** must chain, link by link, to a trusted root, and a leaf's **BasicConstraints** must read `CA:FALSE` so a stolen server key cannot mint other certificates. Reading these fields is how "encrypted in transit" stops being a padlock icon and becomes a verifiable statement: the right name, in date, vouched for by an authority you trust.

### 4.7 Every stage is a control predicate, which is why the lifecycle is evidence

Pull the threads together and the lifecycle becomes a sequence of control predicates, each at a named stage. *Is the DNS answer trustworthy?* is a predicate over the AD bit — AD-clear means the data was not DNSSEC-validated (the integrity-of-name-data question, SC-12/SC-17). *Is the connection actually private, and to whom?* splits across the encryption boundary — the application contents are protected (SC-8) but the SNI and DNS leaked. *Is this the right party?* is a predicate over the certificate's SAN and validity and chain (SC-23). *Did the channel open legally?* is the state machine reaching its established state. Each control claim names a stage, a message or field, and an expected value; the evidence is the real lifecycle whose bytes either satisfy the predicate or violate it. That is the whole game, now in motion: an owner makes a claim about the journey, the journey carries the truth, and your finding is the single stage and field where they disagree. This is the bridge to MONITOR — a DNSSEC-validation alert, a cert-expiry monitor, a TLS-version policy are all this same reading, evaluated continuously, on bytes nobody had to screenshot.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using the real artifacts the lab parses: the canonical RFC 1035 query for `example.com`, a real DNS response captured from a public resolver, the real RFC 1034 delegation chain, the RFC 8446 handshake, and the real `www.google.com` leaf certificate. Every value shown is the oracle's decode of the real bytes, confirmed against `dig` and `openssl`. (Worked examples are Tier-B content — reviewed when capture conventions or RFC errata shift.)

### 5.1 UNDERSTAND + LOCATE: the lifecycle as five questions in order

A request for `example.com` is five handoffs: **DNS** (who are you → an address), **TCP** (can we talk → an open socket), **TLS** (can we talk privately → an encrypted channel), the **certificate** check (prove who you are → a verified identity), and **HTTP** (now what do you have → the page). Each control claim lands on exactly one handoff. "Names are resolved over a validated path" lands on DNS. "The connection is encrypted" lands on TLS — but only *after* the boundary. "We are talking to the real site" lands on the certificate. Locating the claim's handoff is the move that turns a vague assurance question into a readable one.

### 5.2 QUERY: read the DNS query and response off the bytes

The canonical 29-byte query for `example.com A` is `12 34 01 00 00 01 00 00 00 00 00 00 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01`. Read it by the §4.3 model: the header's flags word `0x0100` decodes to QR=0 (a query), RD=1 (recursion desired); QDCOUNT at bytes 10–11 is `00 01` (one question pending); the QNAME `07 'example' 03 'com' 00` decodes to `example.com`; QTYPE `00 01` is A and QCLASS `00 01` is IN. The real response carries the header flags `0x8180` (QR=1 response, RA=1, **AD=0** — *not* DNSSEC-validated), ANCOUNT=2, and two A records whose RDATA reads `104.20.23.154` and `172.66.147.243`. Nothing here is authored — paste the QNAME bytes and decode them by hand; the parser produces the same result.

### 5.3 EVALUATE: what the AD bit does and does not tell you

The AD bit in that real response is **0**. That is a genuine control reading: this answer was returned without DNSSEC validation, so the integrity of the name-to-address mapping rests on the resolver and the path, not on a cryptographic signature you can check (SC-12/SC-17). Note the trap: AD speaks only about whether the *data* was authenticated. It says nothing about whether the query *travelled* encrypted — a DoH query can carry AD=1 over an encrypted transport, and a plaintext UDP query can too. Confidentiality of the lookup and authenticity of the answer are two different controls at the same stage, and the AD bit is evidence for exactly one of them.

### 5.4 COMPOSE: order the lifecycle and feel the refusal

Assemble the handoffs and the order is forced: DNS, then TCP SYN/SYN-ACK/ACK, then the TLS messages ClientHello → ServerHello → EncryptedExtensions → Certificate → CertificateVerify → server Finished → client Finished, then the HTTP GET and 200. The TLS state machine is the consequence engine: order those seven handshake messages correctly and the sim reaches its established state; inject application data before the Finished messages and it returns the real `unexpected_message` alert (code 10, RFC 8446 §6.2) — not a hint, the protocol's actual refusal. The DNS delegation is the same kind of consequence: route the leaf query to a root server and the sim returns the real referral to the `.com` servers, because a root server refers, it never answers a leaf.

### 5.5 DIAGNOSE: the field where the identity claim breaks

The real `www.google.com` leaf certificate reads SAN `DNS:www.google.com`, validity ending `2026-08-17T08:39:10Z`, issuer `CN=WR2`, and BasicConstraints `CA:FALSE`. Each is a control predicate you can point to. Put it beside a real broken twin and the finding is a single field: a certificate whose SAN does not cover the host you connected to is a hostname mismatch (the channel is encrypted but pointed at the wrong door, SC-23); one whose notAfter is in the past is expired (the in-transit claim is dead on the calendar). The discriminating field is the parser's computed difference over real bytes — `openssl x509 -text` prints the same values — not your opinion. Your Lifecycle Evidence Finding names the stage, the field, both values, the broken control, and the framework reference, and anyone can re-derive it from the same artifact.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (capture conventions and certificate rotation drift). This lab runs entirely in your browser on the bootcamp site (Module 24 → Interactive lab) — no install, no host packet capture, no DNS server needed.

> **Interactive lab.** The lab is the Inspect-&-Assemble surface. It composes four real artifacts on one host: the real DNS query and response as PEELable byte-range trees (the RFC 1035 parser is the oracle), the DNS delegation chain and the TLS 1.3 handshake as orderable TRACE sequences driven by their real state machines, and the real `www.google.com` leaf and a broken twin as PEELable certificates (the X.509 parser is the oracle). Selecting a region reveals the oracle's real decode; assembling a sequence runs the real protocol consequence — a wrong DNS route returns the real referral, an out-of-order TLS message returns the real `unexpected_message(10)`. Every task is machine-verified against the parser's parse tree or the state machine's verdict.

**Scenario.** You are handed the real artifacts of one request lifecycle for `example.com` (and the certificate the connection's server presents) and asked to read each control claim's truth directly off them — then to diagnose the single field where a real broken certificate contradicts its claim.

**Tasks (performed on the surface).**

1. On the DNS **query**, select QDCOUNT and read it (one question pending); then select the QNAME and decode the label sequence to the name it spells. *(Objective 3)*
2. Select the query's QTYPE and QCLASS and report what this query asks for. *(Objective 3)*
3. On the DNS **response**, select ANCOUNT and the two Answer A records and read each RDATA (the resolved addresses). *(Objectives 3, 6)*
4. On the response, select the flags word and read the **AD** bit; state whether this answer was DNSSEC-validated and the one thing AD does *not* tell you. *(Objectives 2, 6)*
5. **TRACE the treasure hunt.** Order the delegation messages so the stub asks once and the recursive resolver walks root → TLD → authoritative; observe that routing the leaf query to the root returns a referral, not an answer. *(Objective 2)*
6. **TRACE the lifecycle.** Order the TLS 1.3 handshake messages until the sim reaches its established state, then inject application data early and read the real alert the protocol returns. *(Objective 5)*
7. On the **certificate**, select the SAN and read the host it covers; state why this is the field that ties the certificate back to the name in the plaintext SNI. *(Objectives 1, 4)*
8. **Diff-the-Trace.** Switch to the broken certificate and select the single field where it contradicts the "we are talking to the real site" claim. *(Objective 6)*

**Deliverable.** A short written Lifecycle Evidence Finding for the Diff: the stage, the field, the clean value, the broken value, the control claim broken, and the framework reference (SC-8, SC-12, SC-17, or SC-23).

---

## 7. Assessment

**Competency artifact (not a quiz).** From real artifacts provided at assessment time, the learner must, unaided:

- **Read** a real DNS query and response off the bytes at their RFC-fixed offsets — QDCOUNT, the QNAME label decode, QTYPE/QCLASS, ANCOUNT, the A-record RDATA, and the flags-word AD bit — each verified against the parser's parse tree (`region_labeled_correctly`, `field_value_is`).
- **Compose** the lifecycle: order the DNS delegation so the recursive resolver walks root → TLD → authoritative (and observe the root's real referral), and order the TLS 1.3 handshake to its established state (and observe the real `unexpected_message` refusal on an early-data injection) — each verified against the real state machine (`sequence_matches`, `sim_alert_is`).
- **Diff-the-Trace**: given the real `www.google.com` leaf and a real broken twin, click the single field where the evidence contradicts the identity claim (`region_labeled_correctly` / `field_value_is` against the parser's computed divergence), then write a **Lifecycle Evidence Finding** naming the stage, the field, both values, the broken control, and the framework reference (NIST 800-53 SC-8 / SC-12 / SC-17 / SC-23, SI-8; SOC 2 CC6.6 / CC6.7).

Every shown value is the oracle's output over the real artifact, fidelity-checked against `dig` and `openssl`. A single field read wrong, or a control mapped to the wrong stage, routes the learner back to the specific concept section — not the whole module.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **RFC 1034 & RFC 1035 (DNS concepts and message format)** — the authoritative references for the delegation model and the byte layout this module reads from. https://www.rfc-editor.org/rfc/rfc1034 · https://www.rfc-editor.org/rfc/rfc1035 — *use to confirm a DNS field's offset and meaning from the source, and the §4.2 delegation/resolution algorithm.*
- **RFC 4035 (DNSSEC protocol) and the AD bit** — the definition behind §4.3's Authenticated Data flag. https://www.rfc-editor.org/rfc/rfc4035 — *use for a deeper treatment of what a validating resolver actually verifies before setting AD.*
- **RFC 9293 (TCP) and RFC 8446 (TLS 1.3)** — the transport handshake and the secure-channel handshake, including the §6.2 alert codes behind §4.5. https://www.rfc-editor.org/rfc/rfc9293 · https://www.rfc-editor.org/rfc/rfc8446 — *use for the full state machines and the ack=seq+1 / message-order invariants.*
- **RFC 5280 (X.509) and RFC 6125 (host verification)** — the certificate fields and the SAN-matching rules behind §4.6. https://www.rfc-editor.org/rfc/rfc5280 · https://www.rfc-editor.org/rfc/rfc6125 — *use to confirm how a SAN is matched against a connected host and why a single-label wildcard does not cover a deeper name.*
- **RFC 8659 (CAA), RFC 7208 (SPF), RFC 7489 (DMARC)** — the DNS-published issuance and mail-authentication controls referenced in §4. https://www.rfc-editor.org/rfc/rfc8659 · https://www.rfc-editor.org/rfc/rfc7208 · https://www.rfc-editor.org/rfc/rfc7489 — *use to read the control records (CAA `issue`, SPF qualifiers, DMARC `p=`) that hang off a domain in DNS.*
- **IANA DNS Parameters and TLS Alert registries** — the cited sources for the TYPE/CLASS/RCODE numbers and the handshake alert codes. https://www.iana.org/assignments/dns-parameters and https://www.iana.org/assignments/tls-parameters — *use to look up any record type or alert code you encounter beyond the few taught here.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
