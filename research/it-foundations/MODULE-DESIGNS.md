# IT-Foundations Module Design Dossier (Wave 3)

> Ten Tier-1 modules adding the IT/Internet-foundations band to the bootcamp. Every module is framed
> by the **loop question** it answers, never "learn this technology." A control is a claim about a
> system; each module teaches where that claim's truth physically lives, travels, and how to read it.
> Honesty doctrine: every shown artifact/output is real (real packet bytes, real JWT, real PEM cert,
> real protocol message, cited authoritative key) or produced by a real engine — never invented. Each
> design names the honesty source for every shown value.
>
> Recommended teaching order (see `SEQUENCING.md` for the dependency graph): **networking →
> databases → web-application-architecture → API-paradigms → cloud-shared-responsibility →
> containers → applied-crypto/PKI → identity → how-the-internet-works → logging/observability.**
> Rationale: build the wire and the stores first, then the architecture and the four contracts that
> ride them, then the trust primitives (crypto → identity), then the integrative lifecycle that ties
> them all together, and finally the place continuous evidence is born.

---

## 1. it-networking-fundamentals — On the Wire: Where a Control's Truth Travels

*Loop question: when a control claims "data is encrypted in transit," which layer, header, and byte on the wire physically hold that claim's truth — and how do I read it?*

**Loop stages:** LOCATE · QUERY · EVALUATE · EVIDENCE/MONITOR (taught as the segue).

### §1 Bloom objectives
1. **Explain** encapsulation as nesting — one captured frame is literally Ethernet{IPv4{TCP{TLS{HTTP}}}}, frame/packet/segment name the same bytes at different layers — mapping each header to its OSI layer with the honest caveat that the wire runs TCP/IP and OSI is the teaching scaffold.
2. **Locate** where a control claim's truth physically lives: MAC=hop-truth (L2), IP=end-to-end-truth (L3), port=service-exposure (L4), TLS ContentType=in-transit-encryption (L6), HTTP start-line=application-intent (L7).
3. **Query** a real packet by reading the bytes — EtherType, IPv4 Protocol, src/dst IP, TCP ports + flag bits, TLS ContentType from RFC-fixed offsets — and answer the control question from the field values.
4. **Describe** the TCP 3-way handshake as a state transition readable in the flag bits, and contrast TCP/UDP and MAC-vs-IP scope by reading the same packet at two hops.
5. **Compose** the 5-tuple and express SC-7 (segmentation), SC-8 (encryption-in-transit), CM-7 (port-exposure) as predicates over those fields.
6. **Diagnose**, in a Diff-the-Trace of two real captures, the single byte where evidence contradicts a claim, naming the control and framework ref.

### Activities
- **PEEL the Google search — one frame, five nested layers** (PEEL). One real captured frame works down Ethernet{IPv4{TCP{TLS{HTTP}}}} as nested keyboard-selectable byte-range regions; each layer stays collapsed until the learner reads the selector byte (EtherType 0x0800 unlocks IPv4; Protocol 0x06 unlocks TCP). Tasks gate `region_labeled_correctly` (selection == dissector range + OSI label) and `field_value_is` (decoded value). **Sim state:** a real google-search pcap frame (or stitched Wireshark SampleCaptures TLS + http.cap legs). **Honesty:** the TS dissector (ported from RFC 791/9293/768/8446 + IANA registries) is the oracle, fidelity-checked against tshark.
- **MAC is hop-truth, IP is end-to-end** (PEEL, two panes). The SAME logical packet at two adjacent hops side by side; L2 MAC regions visibly differ, L3 IP regions identical. Verdict gated by the dissector's byte-comparison. **Honesty:** two real adjacent-hop captures; verdicts are computed, not authored.
- **Assemble the TCP 3-way handshake** (TRACE). Three real handshake packet-cards ordered between client/server; a stateful RFC 9293 counterpart emits a real RST on wrong order. Flags byte (offset 13) decoded to 0x02/0x12/0x10. Gates `sequence_matches` + `field_value_is`.
- **The 5-tuple is the firewall rule** (MAP). The peeled fields become draggable cards placed into a 5-tuple ACL; three control claims map onto their predicate (the "encrypted in transit" trap lives at L6/SC-8, not the 5-tuple). Gates `mapping_correct` against the cited NIST 800-53 / SOC 2 key.
- **Diff-the-Trace** (assessment, below).

### Visual-for-abstractions
Encapsulation, layering, and addressing-scope become literal DOM regions: the nested PEEL tree, the two-pane MAC-differs/IP-identical contrast, the flags byte decoding to handshake states, and the PEEL tree refusing to expand an L4 region until the selector byte is read.

### Assessment
Forensic **Diff-the-Trace** competency artifact. Three pairs of real captures (one clean, one carrying a real control failure); the learner PEELs to the exact differing byte-range and writes a Wire Evidence Finding per pair. Failures: (A) dst-port 0x0050 (80) vs 0x01BB (443) → CM-7/SC-7; (B) cleartext HTTP start-line vs ContentType 0x17 → SC-8; (C) unsolicited ARP reply (opcode 2, no request) → SC-7. `region_labeled_correctly` gates the discriminating byte; `file_content_matches` gates the written finding.

---

## 2. databases-relational-and-nosql — Same Question, Three Stores: Where Control-Truth Lives at Rest

*Loop question: when the same control question ("which users lack MFA?") must be answered against a relational table, a document store, and a key-value store, where does the truth physically live and how do I reach it in each?*

**Loop stages:** LOCATE · QUERY · EVALUATE · EVIDENCE.

### §1 Bloom objectives
1. **Explain** the three data models and how each stores the SAME control-truth differently.
2. **Query** the same claim against relational (SQL), document (per-field), and KV (key scan), reading the truth in each.
3. **Map** an access pattern onto the store suited to it and name where completeness is proven.
4. **Diagnose** SQL injection by running a concatenated vs a parameterized query on the real engine and reading the differing result sets.
5. **Locate** data-at-rest control-truth (encryption-at-rest setting + key reference, access enforcement) and tie it to SC-28/AC-3/CC6.1.
6. **Produce** an evidence finding mapping the answer + its store to the control and framework ref.

### Activities
- **QUERY the same claim against three stores** (console-sql + PEEL). Relational leg runs on the wave-2 **sql.js** engine (`SELECT email FROM users WHERE mfa_enabled = 0`, gated by `engine_result_equals` against the generated expectation); document/KV legs PEEL the SAME 8 users as JSON / a key-value dump (gated by `field_value_is` + `region_labeled_correctly`). **Sim state:** the shared module-06 8-user acme.example seed loaded three ways. **Honesty:** sql.js is the oracle for relational; a ported JSON parser for the document fields; no invented rows.
- **MAP the access pattern to the right store** (MAP). Three access-pattern cards onto relational/document/KV with a completeness note each; `mapping_correct` against the cited data-model definitions.
- **Build-and-Break: SQL injection on the real engine** (build-and-break). The classic `' OR '1'='1` input run concatenated (over-broad result, real) then parameterized (only matching rows, real); both `engine_result_equals` against the real sql.js output. **Honesty:** OWASP A03; the engine is the oracle.

### Visual-for-abstractions
The SAME 8 users shown in three storage pictures side by side — rows-and-columns, self-describing JSON documents, a flat key→opaque-value map — so "where the truth lives" is spatial. The injection failure is the diffed result sets of two real engine runs.

### Assessment
**Diff-the-Trace** + produced finding. The same claim against a clean store and a tampered twin (altered mfa value / missing field / undecodable KV value) plus a concatenated-vs-parameterized pair. The learner runs the relational query (`engine_result_equals` + completeness check), clicks the discriminating field in the document/KV diff (`region_labeled_correctly`), and produces a finding mapping the at-rest control (SC-28/AC-3/CC6.1) and the injection control (SI-10).

---

## 3. web-application-architecture — Where the Claim Can Be True: Tracing a Request Through the Tiers

*Loop question: a control truth is produced by a system and can only be read where that system produces it — so which tier owns each control claim, and where does defense-in-depth fail?*

**Loop stages:** UNDERSTAND · LOCATE · EVALUATE · EVIDENCE · MONITOR/OWN.

### §1 Bloom objectives
1. **Explain** the tiers (client/presentation/application/data) and what each request-path hop does, so each hop is a place a claim could live.
2. **Map** a control claim onto the SPECIFIC tier capable of producing its truth and name the NIST/SOC 2 control.
3. **Trace** a real request through the tiers, ordering the participants and the proxy-injected provenance bytes (X-Forwarded-For/-Proto, RFC 7239 Forwarded).
4. **Describe** stateless vs stateful by classifying a real Set-Cookie session vs a real Bearer/JWT request and naming which tier holds the state.
5. **Diagnose** a defense-in-depth gap: the hop where a control asserted at one tier is unverifiable or broken.
6. **Produce** a per-tier control-ownership map + a structured access-log line whose src_ip is recovered from X-Forwarded-For, mapped to AU-2/AU-3 and the owning team.

### Activities
- **TRACE the request through the tiers** (TRACE). Nine participant nodes wired into the canonical AWS three-tier path; the request card visibly accretes hop-injected headers; a stateful sim flags a WAF bypass as the honest consequence. Gates `sequence_matches`, `region_labeled_correctly` (the RFC 7239 `proto=https` parameter), `participant_routing_correct`. **Honesty:** AWS reference architecture (cited key) + RFC 7239 §4 literal examples parsed by an RFC-7239 ABNF port.
- **MAP the controls onto the tiers** (MAP). Six control cards onto their tiers; "logging" is a THROUGHOUT multi-zone card; the laptop-encryption claim splits (SC-8 every-hop vs SC-28 at the DB). Gates `mapping_correct` + `file_content_matches` on the tier-ownership note.
- **PEEL the session: stateful cookie vs stateless token** (PEEL). RFC 6265 §3.1 Set-Cookie (Secure/HttpOnly attributes) vs a real JWT (R1 parser); classify stateful vs stateless; select the missing-Secure attribute in a bad twin. Gates `region_labeled_correctly`, `field_value_is`, `mapping_correct`.

### Visual-for-abstractions
The architecture IS the Inspect-&-Assemble island: TRACE shows the request gaining provenance bytes hop by hop; MAP's wrong-tier placement triggers "this tier cannot produce that truth"; stateless-vs-stateful is two storage pictures (server box + opaque ID cookie vs self-describing signed token).

### Assessment
**Diff-the-Trace** + produced evidence artifact. A clean vs failing real trace pair; planted real failures: (1) SC-8 gap — TLS terminated at LB, edge→app rides plain HTTP on 80; (2) Set-Cookie missing Secure/HttpOnly; (3) cached-sensitive-data — `/account` carrying `X-Cache: HIT` + `Age: 142` where it should be `Cache-Control: private, no-store` (RFC 9111); (4) a WAF-bypassing request (absent X-Forwarded-*). `region_labeled_correctly` pins each byte (RFC 7239/6265/9111/9110 parsers). Then a structured access-log line with src_ip recovered from X-Forwarded-For (`field_value_is`) + a field→control map (`mapping_correct`).

---

## 4. it-api-paradigms — Four Counters, One Question: REST / SOAP / GraphQL / gRPC and Where the Control Lives

*Loop question: when the SAME control question ("list every user and whether MFA is on") takes four wire shapes, where does each paradigm's contract let me LOCATE the control's truth-field, and which control surface does each invite?*

**Loop stages:** UNDERSTAND · QUERY · EVALUATE · EVIDENCE.

### §1 Bloom objectives
1. **Explain** why the SAME control question looks structurally different in four paradigms, and that each contract artifact (OpenAPI/WSDL/SDL/.proto) is the first place to LOCATE a control's truth-field.
2. **Map** each real wire payload to its contract AND its dominant control/security surface, reading the surface off the contract.
3. **Describe** where the credential lives per paradigm (header bearer/JWT for REST/GraphQL/gRPC vs SOAP's in-message WS-Security), verifying the WS-Security PasswordDigest by recomputing Base64(SHA-1(nonce+created+password)).
4. **Compose** the precise GraphQL selection set returning exactly `{ email mfaEnabled }`, contrast it with REST over-fetch (22.7KB→2.5KB), and explain precision as both a feature and the depth/batching-DoS mechanism.
5. **Diagnose** the four paradigm-specific attack/recon classes and map each to OWASP API Top 10 2023.
6. **Produce** an auditor's evidence determination: per paradigm, the completeness-proof method, the runtime feature that must be OFF, and the static contract that is itself evidence.

### Activities
- **One Question, Four Counters** (MAP). Four real payloads over the SAME 8-user seed as parallel columns; drag intent + shape labels; the REST `?fields=` toggle makes over-fetch visible (22.7KB vs 2.5KB). Gates `mapping_correct` + `field_value_is`.
- **PEEL the Four Contracts** (PEEL). Four real machine-readable contracts; select the MFA truth-field node in each (OpenAPI `properties.mfa_enabled`, WSDL `sp:SignedParts`, SDL `mfaEnabled`, .proto `mfa_enabled = 2`). Gates `region_labeled_correctly` + `field_value_is` against four ported parser oracles.
- **PEEL the gRPC Frame to the Byte** (PEEL). Real gRPC HTTP/2 capture; HTTP/2 pseudo-headers + the `[flag:1B][len:4B][protobuf]` frame; decode `mfa_enabled=false` to `0x10 0x00` after calibrating on `a=150 → 08 96 01`. Gates `region_labeled_correctly` + `decoded_artifact_matches` against a ported protobuf decoder.
- **Where Does the Credential Live?** (MAP). Auth-location grid (header vs in-message; gRPC also mTLS) + recompute the OASIS WS-Security digest to `weYI3nXd8LjMNVksCKFV8t3rgHh3Rw==`. Gates `mapping_correct` + `decoded_artifact_matches`.
- **Build-and-Break: GraphQL Precision Becomes a Weapon** (build-and-break). Real depth/cost limiter + NoIntrospection rule: circular query trips the real depth error; aliased batch = 5 ops/1 request; introspection toggled off and refused. Gates `validator_passes` + `sequence_matches`.
- **Diff-the-Trace** (assessment, below).

### Visual-for-abstractions
Four real wire payloads stacked side by side over identical data make "the same question, four shapes" byte-for-byte concrete; protobuf is PEELed to the literal `0x10 0x00`; discoverability (GraphQL introspection vs gRPC reflection) is a structural-twin MAP; auth-location is a MAP overlay.

### Assessment
**Diff-the-Trace** determination. Four real clean captures + four real near-twins (REST over-returns `salary`/`ssn` → API3; GraphQL 12-deep + introspection → API4+API9; SOAP stale `wsu:Created` + mismatched digest → API2; gRPC reflection-in-prod + `alg:none` JWT → API9+API2) + the four contracts. The learner clicks each failing field and produces a one-screen determination grid. Gates `region_labeled_correctly`, `decoded_artifact_matches`, `mapping_correct`, `validator_passes`.

---

## 5. cloud-shared-responsibility — Whose Control Is It? Reading the Responsibility Boundary

*Loop question: for any control claim in the cloud, who is structurally capable of producing its truth — you or the provider — and how does that boundary shift across IaaS / PaaS / SaaS?*

**Loop stages:** UNDERSTAND · LOCATE · OWN. (The lightest module in the wave — conceptual, no new parser.)

### §1 Bloom objectives
1. **Explain** the shared responsibility model (security OF the cloud vs IN the cloud) and why it decides who can produce a control's evidence.
2. **Map** each control to you vs provider and watch the boundary shift across IaaS/PaaS/SaaS.
3. **Place** a control on the control plane vs the data plane and explain why they are different objects.
4. **Locate**, for "encrypted at rest," who owns the evidence under IaaS vs SaaS (you produce vs you inherit via a CUEC).
5. **Diagnose** a misattributed control (a claim a SaaS customer says they enforce that the provider actually owns).
6. **Produce** an ownership note stating, per control, who is responsible and what evidence that party produces.

### Activities
- **MAP the boundary across IaaS / PaaS / SaaS** (MAP). Control cards on a you/provider board with a service-model slider; as the slider moves, the cited AWS/CSA key re-derives placement and migrating cards make the shifting boundary visible. Gates `mapping_correct`.
- **MAP the control plane vs the data plane** (MAP). IAM/SG/KMS changes → control plane; workload traffic → data plane. Gates `mapping_correct` against the cited vendor-neutral architecture.

### Visual-for-abstractions
The responsibility boundary is a movable line: the IaaS/PaaS/SaaS slider makes control cards visibly migrate across the you/provider boundary. The control-plane/data-plane split is a second board where each control lands in a structurally different zone.

### Assessment
MAP competency + produced ownership note. A list of control claims for a stated service model (a SaaS HR platform): map each to you vs provider (`mapping_correct`), catch the deliberately-misattributed claim (the inherited-controls/CUEC trap), and produce an ownership note (`file_content_matches`) stating per control who is responsible and what evidence they produce — for "encrypted at rest": SaaS → provider attests, you inherit via CUEC; IaaS → you own and produce it.

---

## 6. containers-and-virtualization — Peel the Image: Where a Workload's Control-Truth Is Baked In

*Loop question: when a control claims "no secrets in the image" or "containers don't run as root," where in the image manifest, layers, and runtime config does that claim's truth physically live?*

**Loop stages:** LOCATE · QUERY · EVALUATE · EVIDENCE.

### §1 Bloom objectives
1. **Explain** VM (own kernel) vs container (shared host kernel, namespace/cgroup isolation) and why that changes the blast radius.
2. **PEEL** a real OCI manifest into its config (Cmd, User, ExposedPorts, Env) + ordered layer descriptors with sha256 digests, reading each as control-truth.
3. **Locate** a baked-in secret by peeling the layer whose tar carries it, citing the real layer digest as provenance.
4. **Diagnose** the misconfigured-container findings (runs as root uid 0, exposed port, no resource limit) off the real config.
5. **Map** each finding onto its CIS Docker Benchmark / NIST 800-190 control and 800-53 ref (CM-7, CM-6, IA-5).
6. **Produce** a finding naming the field, value, broken control, and framework ref.

### Activities
- **PEEL the OCI image manifest + config** (PEEL). Real manifest + config JSON; select User (uid 0 = root), ExposedPorts, and the ordered layer descriptors. Gates `region_labeled_correctly` + `field_value_is` against a ported OCI-manifest reader (fidelity-checked vs skopeo/docker inspect).
- **Find the baked-in secret in a layer** (PEEL). One layer's tar genuinely carries a real test secret; select it and read the layer digest as provenance. Gates `region_labeled_correctly` + `field_value_is`.
- **MAP the findings onto CIS / NIST controls (and VM vs container)** (MAP). Findings onto CIS Docker / 800-190 zones; a VM-vs-container blast-radius board. Gates `mapping_correct`.

### Visual-for-abstractions
The manifest's ordered layer descriptors are stacked selectable regions, each with its real sha256 digest; peeling one reveals the tar diff (the secret glows in the layer that added it). The `User` uid 0 is a red "root" badge; VM-vs-container draws the shared-vs-own-kernel isolation boundary.

### Assessment
**Diff-the-Trace** + produced finding. Two real OCI manifests/configs (clean hardened vs misconfigured twin); the learner clicks the exact field breaking each control (uid 0, unexpected ExposedPort, secret-bearing layer) verified by `region_labeled_correctly`/`field_value_is` against the OCI reader, then produces a finding sheet (field, value, control, CIS/NIST ref).

---

## 7. applied-cryptography-pki — The Padlock Is a Lie (Until You Read the Cert)

*Loop question: when an auditor asks "is data encrypted at rest AND in transit?", where does each half's truth live — and which single cert field, read against the claim, breaks it?*

**Loop stages:** UNDERSTAND · LOCATE · EVALUATE · EVIDENCE · MONITOR · OWN.

### §1 Bloom objectives
1. **Explain** the irreducible three-way distinction — hashing (one-way, no key), encryption (reversible with key), encoding (reversible no key) — and why "it looks scrambled" is not "it is protected."
2. **Map** "encrypted at rest AND in transit?" onto where each half's truth lives (in-transit: cert validity + chain + AEAD cipher, CC6.7/SC-8; at-rest: storage-encryption setting + KMS key, CC6.1/SC-28).
3. **Describe** the x.509 cert as a CA-signed binding of identity→public key, naming the load-bearing RFC 5280 fields and the 3-tier chain.
4. **Compose** the TLS 1.3 full-handshake sequence and explain what CertificateVerify proves.
5. **Diagnose** a broken in-transit control by spotting the ONE failing field and mapping it to openssl's real return code (0/10/18/62).
6. **Produce** a re-runnable evidence verdict: a transform output == a cited constant (SHA-256 of empty = e3b0c442...), the negotiated protocol+cipher line, mapped to CC6.1/CC6.7 and SC-8/13/28.

### Activities
- **Sorting the Scramble** (MAP). Real strings into HASH/ENCRYPT/ENCODE; a "prove it" button runs the real transform (base64 round-trips, SHA-256 refuses); the JWT-header decoy decodes with no key. Gates `mapping_correct` (class derived by the real transform) + `decoded_artifact_matches`. **Engine:** new `crypto-transform`.
- **Peeling the Padlock** (PEEL). The real www.google.com leaf PEM as selectable fields; then connect the 3-tier chain (leaf→WR2→GTS Root R1) where the link completes only when issuer-of-N == subject-of-N+1. Gates `region_labeled_correctly`, `field_value_is`, `sequence_matches`. **Engine:** new `x509-parser`, fidelity-checked vs `openssl x509 -text`.
- **Building the Handshake** (build-and-break). Real TLS 1.3 message cards into the RFC 8446 full-handshake; `[Application Data]` before `{Finished}` returns the real `unexpected_message(10)`; CertificateVerify animates the sign-with-private/verify-with-public step. Gates `sequence_matches`, `participant_routing_correct`, the new `sim_alert_is`. **Engine:** new `tls13-sim`.

### Visual-for-abstractions
Every abstraction is a manipulable real artifact: the trichotomy is proven by running the transform live; the padlock is re-drawn as the cert's field stack; the chain connects issuer→subject nodes; the handshake is a TRACE into a stateful sim that answers wrong moves with real alert codes.

### Assessment
**Diff-the-Trace** verdict. Four real certs (clean www.google.com → code 0; expired.badssl.com → 10; self-signed.badssl.com → 18; wrong.host.badssl.com → 62). The learner clicks the failing field (`region_labeled_correctly` vs x509-parser) and selects the matching return code (`field_value_is` vs the real validator), then produces a record: negotiated protocol+cipher as the in-transit PASS, a re-runnable transform == SHA-256-of-empty (`field_value_is`), in-transit→CC6.7/SC-8 + at-rest→CC6.1/SC-28 + SC-13.

---

## 8. identity-authn-authz-protocols — The Valet Key: Reading Who You Are and What You May Do

*Loop question: when a control claims "access is authenticated and authorized," where does that claim's truth live — in the JWT claims I can decode, the OAuth/OIDC dance I can sequence, and the SAML assertion I can read?*

**Loop stages:** UNDERSTAND · LOCATE · EVALUATE · EVIDENCE · MONITOR.

### §1 Bloom objectives
1. **Explain** authentication (who you are) vs authorization (what you may do) and why a JWT is a signed claim, not an encrypted secret.
2. **PEEL** a real JWT into header.payload.signature, decode header + payload live, read reserved claims (exp/iat/iss/aud/sub).
3. **Compose** the OAuth2 authorization-code + OIDC dance and explain the valet-key separation (credential exchanged for a short-lived scoped token).
4. **Trace** a SAML SP-initiated SSO redirect chain and read the assertion's `<AuthnStatement>` and `<Conditions>` NotOnOrAfter.
5. **Diagnose** a broken auth control — alg:none JWT, expired exp, assertion past NotOnOrAfter — and tie each to AC-3/IA-2/CC6.1.
6. **Produce** an evidence finding for an access claim naming the truth-field and its control ref.

### Activities
- **PEEL the JWT** (PEEL). Real three-segment JWT; decode header (→ {alg:HS256,typ:JWT}) + payload live; read exp/iss; select the alg:none field in a bad twin. Gates `decoded_artifact_matches`, `field_value_is`, `region_labeled_correctly`. **Engine:** new RFC 7519 JWT parser (reused by modules 06, web-app, api-paradigms); shares the R2 `crypto-transform` for HS256 verification.
- **TRACE the OAuth2 / OIDC valet-key dance** (TRACE). Order authz request → code → token exchange → resource call; the stateful RFC 6749 / OIDC sim yields a real `invalid_request` on a wrong move. Gates `sequence_matches`, `participant_routing_correct`.
- **PEEL the SAML assertion + TRACE the SSO redirect** (PEEL + TRACE). Order SP→IdP→assertion→SP; PEEL `<AuthnStatement>` (AuthnContextClassRef proving MFA) + `<Conditions>` NotOnOrAfter; select the stale condition in a bad twin. **Scope bounded honestly:** reads assertion fields + catches the expired-Conditions tamper, NOT full XML-DSig validation. Gates `sequence_matches`, `field_value_is`, `region_labeled_correctly`.

### Visual-for-abstractions
The valet key is spatial: the OAuth TRACE shows the long-lived credential go to the authz server once and a short-lived token ride every subsequent call. The JWT PEEL shows the payload decoding to readable claims (inoculating "scrambled = protected"). The SAML NotOnOrAfter is a single highlightable region whose staleness is the break.

### Assessment
**Diff-the-Trace** verdict. Three real paired artifacts: (1) valid JWT vs alg:none/expired-exp; (2) valid SAML assertion vs one past NotOnOrAfter; (3) correctly-ordered OAuth dance vs one calling the resource without a token exchange. The learner clicks the discriminating field (`region_labeled_correctly`/`field_value_is`; the sim's `invalid_request` for the dance) and produces a finding mapping each to AC-3/IA-2/CC6.1.

---

## 9. how-the-internet-works — From a URL in a Box to a Chain of Trust: Reading the Request Lifecycle on the Wire

*Loop question: as "google.com" becomes pixels, where does each control claim live in the lifecycle — which hop is plaintext, where does encryption begin, and which zone asserts the claim's truth?*

**Loop stages:** UNDERSTAND → LOCATE → QUERY → EVALUATE → EVIDENCE → MONITOR → OWN (the integrative spine).

### §1 Bloom objectives
1. **Explain** how typing google.com becomes one continuous chain of trust (DNS → TCP → TLS → HTTP → render) and why each hop is a place a claim can be made or broken.
2. **Describe** recursive vs iterative resolution and map the DNS treasure hunt root→TLD→authoritative onto where control-truth lives (NS delegation, CAA, SPF/DKIM/DMARC).
3. **Map** raw DNS bytes to their RFC 1035 regions (header flags-word, QNAME labels, RR TYPE/CLASS/TTL/RDATA) and read the values off the wire.
4. **Locate** the encryption boundary precisely — DNS, TCP handshake, TLS SNI as plaintext-by-default; TLS-on-443 as where confidentiality begins.
5. **Compose** the full type-to-render sequence across DNS/TCP/TLS/HTTP, including the TCP ack=seq+1 invariant and the post-ServerHello encryption point.
6. **Diagnose** a broken control off real evidence (CAA absent, DMARC p=none, plaintext HTTP on 80, expired/wrong-host cert, AD-clear answer) and tie each to its control family.

### Activities
- **PEEL the DNS query** (PEEL). The real 29-byte example.com A query as a byte-ribbon; select QDCOUNT, decode the QNAME labels (07 'example' 03 'com' 00 → example.com), read QTYPE/QCLASS. Gates `region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`. **Engine:** new RFC 1035 parser, fidelity-checked vs dig +qr.
- **PEEL the DNS response** (PEEL). Live DoH JSON (Status:0, AD:true, two real A records TTL 300); peel the Answer section + the AD shield flag (DNSSEC authenticates DATA, not transport). Gates `field_value_is`, `region_labeled_correctly`.
- **TRACE the resolution treasure-hunt** (TRACE). Stub→Recursive→Root→.com TLD→Authoritative; routing the final query to the root returns the REAL referral (root refers, never answers). Gates `sequence_matches`, `participant_routing_correct`. **Honesty:** live-captured .com TLD NS (TTL 21594) + root list (iana.org).
- **TRACE the full lifecycle + the encryption boundary** (TRACE). Order DNS→TCP→TLS→HTTP; drop the encryption-boundary divider (lands right after ServerHello); an HTTP GET before TLS Finished returns the real `unexpected_message`; the ack=seq+1 invariant is checked. Gates `sequence_matches`, `region_labeled_correctly` (boundary position), `field_value_is`, `participant_routing_correct`.
- **PEEL the control surface — CAA, SPF, DMARC, and the cert** (PEEL). Live CAA (0 issue pki.goog), SPF (~all), DMARC (p=reject) + the real PEM chain; the DMARC dial, the CAA→CA arrow, the SAN↔SNI line. Gates `field_value_is`, `region_labeled_correctly`.

### Visual-for-abstractions
Each sub-concept is a DOM visual: a NAME as lit length-prefixed labels; RD as one lit bit; recursive-vs-iterative as one round-trip vs a referral staircase; the draggable encryption boundary flipping cards red/green; the DMARC policy dial; the CAA→CA arrow; the SAN↔SNI drawn line.

### Assessment
**Diff-the-Trace** + finding sheet. Real paired captures for one domain's lifecycle, one tampered variant per control surface: (1) CAA present vs ABSENT → SC-12/SC-17; (2) DMARC p=reject vs p=none → SI-8; (3) HTTP-on-443 vs plaintext GET on 80 → SC-8 (fix=HSTS+redirect); (4) AD=1 vs AD clear; (5) cert SAN-matches vs expired/wrong-host → SC-23. The learner clicks the exact divergent field (`region_labeled_correctly`, `field_value_is`) and fills a 5-row finding sheet (surface, divergent field, control broken, framework ref, remediation).

---

## 10. logging-telemetry-observability — The Field That Proves It: Reading a Log Line as Continuous Evidence

*Loop question: where is continuous control-evidence born — and how do I read a single structured log line as the proof (or the break) of a control claim across a noisy stream?*

**Loop stages:** LOCATE · QUERY · EVALUATE · EVIDENCE · MONITOR.

### §1 Bloom objectives
1. **Explain** why a log line is a structured record, decode an RFC 5424 line into its named HEADER fields, treating NILVALUE `-` as a real "absent."
2. **Compute** Facility and Severity from the real PRI byte (PRIVAL = Facility*8 + Severity) and read the severity word.
3. **Map** a structured line's fields to the control claim and family they evidence (auth → AC/IA, content → AU-3, retention → AU-11).
4. **Trace** the log pipeline (source→collector→store→query→alert) and locate where evidence is born vs queried.
5. **Diagnose**, across a noisy real stream, the single event that proves or breaks a control, distinguishing audit from application logs.
6. **Produce** an evidence finding naming the field, value, control, and framework ref.

### Activities
- **PEEL: the syslog PRI byte is a parse, not a guess** (PEEL). The verbatim RFC 5424 §6.5 line(s); label each HEADER field (PROCID `-` = absent), compute PRIVAL=34 → Facility 4/Severity 2 (Critical) and PRIVAL=165 → Facility 20/Severity 5 (Notice); peel the SD-ELEMENT. Gates `region_labeled_correctly`, `field_value_is`. **Engine:** new RFC 5424 ABNF parser, fidelity-checked vs a reference syslog parser.
- **TRACE the log pipeline** (TRACE). Order source→collector→store→query→alert; evidence is born at the source, queried at the store. Gates `sequence_matches`, `participant_routing_correct`. **Honesty:** vendor-neutral pipeline (kept conceptual to avoid Splunk/Elastic coupling).
- **MAP the field to the control it evidences** (MAP). Decoded fields onto AC-7/IA, AU-3, AU-11 zones; classify the two lines audit vs application. Gates `mapping_correct`.

### Visual-for-abstractions
A log line as a tree of clickable named regions over real bytes (the OSI move applied to a log); the bit-packed PRI byte expanded to show Facility (high bits) and Severity (low 3 bits) as the PRIVAL arithmetic; the SD-ELEMENT as a nested region; the pipeline as a spatial born-vs-queried TRACE.

### Assessment
**Diff-the-Trace** over a noisy real structured stream. Two real captures (clean baseline + tampered/incident variant) + a control claim; the learner finds the single event that proves or breaks the control, clicks its discriminating field (`region_labeled_correctly` vs the RFC 5424 parser), and produces a finding (`file_content_matches`). The structured-query leg runs on the wave-2 **console (jq)** engine over the real JSON-structured stream (`engine_result_equals`). Honesty: both streams are real; the tampered variant is a real instance (auth-failure burst or an audit-gap where the event is absent).
