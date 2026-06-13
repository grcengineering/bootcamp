# Rubric — From a URL in a Box to a Chain of Trust

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Read the DNS question | Selects QDCOUNT, the QNAME, and QTYPE at their true regions and reads them (QNAME decodes to `example.com`, QTYPE=A) — `region_labeled_correctly`, `field_value_is` | §4.3, §5.2 |
| 2 | Read the DNS answer | Selects ANCOUNT (2) and the first A-record RDATA (104.20.23.154) and reads them off the bytes — `region_labeled_correctly`, `field_value_is` | §4.3, §5.2 |
| 3 | Read the AD control flag | Reads the flags-word AD bit (0 = not DNSSEC-validated) and states what AD does NOT tell you about the lookup — `field_value_is` | §4.3, §5.3 |
| 4 | Compose the delegation | Orders the treasure hunt so the recursive resolver walks root → TLD → authoritative and the sim reaches the answer; observes the root's real referral — `sequence_matches`, `sim_alert_is` | §4.2, §5.4 |
| 5 | Compose the TLS handshake | Orders the RFC 8446 handshake to its established state and reads the real `unexpected_message(10)` on an early-data injection — `sequence_matches`, `sim_alert_is` | §4.5, §5.4 |
| 6 | Locate the encryption boundary | States that confidentiality begins after the handshake, so the DNS lookup and the plaintext SNI travelled in the clear — tied to §4.4 | §4.4 |
| 7 | Read the certificate identity field | Selects the leaf's SAN (DNS:www.google.com) and states why it ties the cert to the plaintext SNI host — `region_labeled_correctly`, `field_value_is` | §4.6, §5.5 |
| 8 | Diff-the-Trace diagnosis | Clicks the single divergent field where the broken cert's SAN fails to cover the connected host — `region_labeled_correctly`, `field_value_is` | §4.6, §5.5 |
| 9 | Lifecycle Evidence Finding | Writes a finding naming stage, field, both values, control broken, and framework ref (SC-8 / SC-12 / SC-17 / SC-23) | §2, §5.5 |
