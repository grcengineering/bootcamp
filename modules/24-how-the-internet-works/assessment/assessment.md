# Assessment — From a URL in a Box to a Chain of Trust

**Competency artifact (not a quiz).** Unaided, from the real lifecycle artifacts provided at
assessment time, the learner produces the evidence below. Every value is read off real bytes or
returned by a real state machine; the oracles (fidelity-checked against `dig` and `openssl`) are the
verifier.

## What the learner delivers

1. **A read DNS message.** Reading at the RFC 1035-fixed offsets, the learner reports, off the real
   query and response: QDCOUNT (questions pending), the QNAME decoded from its length-prefixed
   labels, QTYPE, ANCOUNT (answers returned), the first A record's RDATA (the resolved address), and
   the flags-word **AD** bit. Each is gated by `region_labeled_correctly` (the selection equals the
   parser's true region) and `field_value_is` (the read equals the oracle's decode). The AD reading
   is a control reading: AD=0 means the answer was **not** DNSSEC-validated (SC-12/SC-17), and the
   learner states the trap — AD speaks to the data's authenticity, never to whether the lookup
   travelled encrypted.

2. **A composed lifecycle.** The learner assembles the two real state machines: the DNS delegation
   (stub → recursive, then recursive walking root → TLD → authoritative iteratively) until the sim
   reaches the authoritative answer, *and* the TLS 1.3 handshake (ClientHello → ServerHello →
   EncryptedExtensions → Certificate → CertificateVerify → server Finished → client Finished) until
   the sim reaches its established state. Each is gated by `sequence_matches` (with routing). The
   learner then triggers each refusal — route the leaf query to the root and read the real referral;
   inject application data before the Finished messages and read the real `unexpected_message(10)`
   alert (`sim_alert_is`) — and states where the **encryption boundary** sits (after the handshake,
   so the plaintext SNI and the DNS lookup leaked).

3. **A Diff-the-Trace finding.** Given the real `www.google.com` leaf and a real broken twin, the
   learner clicks the single field where the evidence contradicts the identity claim
   (`region_labeled_correctly` / `field_value_is` against the parser's computed divergence — a SAN
   that does not cover the connected host) and writes a **Lifecycle Evidence Finding**: stage, field,
   clean value, broken value, control broken, framework reference.

## Honesty

Every shown value is the oracle's decode of the real artifact or the real state machine's verdict.
The DNS response is real wire bytes (AD genuinely clear); the delegation referral and the TLS alert
are the protocols' real consequences, not authored "try again" messages; the broken certificate is a
genuine hostname mismatch (`openssl verify` code 62). The discriminating field is the parser's
computed diff over the real bytes — never an authored answer key. The learner can re-derive every DNS
value with `dig` and every certificate value with `openssl x509 -text` on the same artifacts.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
