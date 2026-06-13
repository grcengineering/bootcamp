# Assessment — The Padlock Is a Lie (Until You Read the Cert)

**Competency artifact (not a quiz).** Unaided, from real artifacts provided at assessment time,
the learner produces the evidence below. Every value is read off real bytes; the parser / transform /
state-machine (fidelity-checked against `openssl`, `shasum`, and RFC 8446) is the verifier.

## What the learner delivers

1. **A sorted scramble.** The learner sorts real strings into HASH / ENCRYPT / ENCODE by running
   the real transform — base64 reverses with no key (ENCODE), SHA-256 never reverses (HASH) — and
   decodes a JWT header with no key to show a signed token is not an encrypted one. Gated by
   `region_labeled_correctly` (the class label matches the transform's derived class) and
   `decoded_artifact_matches` (the live decode equals the real transform).

2. **A peeled certificate.** Reading the real `www.google.com` leaf at its RFC 5280 fields, the
   learner reports the notAfter (the in-transit deadline), BasicConstraints (CA:FALSE — a leaf),
   the SAN (the host covered), and the issuer (the next chain link). Each is gated by
   `region_labeled_correctly` and `field_value_is` against the x509-parser's parse tree, and the
   learner states which field anchors the in-transit half of "encrypted at rest AND in transit."

3. **A composed handshake.** The learner orders the TLS 1.3 full-handshake correctly
   (`sequence_matches`) and triggers the real `unexpected_message(10)` alert by playing a message
   out of order (`sim_alert_is`) — the protocol's own refusal, not an authored "try again."

4. **A Diff-the-Trace verdict.** Given the clean leaf and real broken twins, the learner clicks the
   single field that breaks the in-transit control — the expired certificate's notAfter and the
   wrong-host certificate's SAN (`region_labeled_correctly` against the parser's computed
   divergence) — and binds each to openssl's real return code (10, 62).

5. **A re-runnable evidence verdict.** SHA-256 of the empty string equals the cited constant
   e3b0c442… (`decoded_artifact_matches`), and the learner maps the in-transit half to CC6.7 / SC-8
   and the at-rest half to CC6.1 / SC-28 with SC-13.

## Honesty

Every certificate is real bytes off a real handshake (the Google chain via `openssl s_client`; the
broken legs are badssl.com's deliberately-broken public endpoints). The verdict codes are
`openssl verify`'s own `X509_V_ERR_*` constants, the transform digests are `shasum`/`node:crypto`'s,
and the handshake alerts are RFC 8446's literal §6.2 codes. The discriminating field is the parser's
computed divergence over the real bytes — never an authored answer key. The learner can re-derive
every value by running `openssl x509 -text`, `openssl verify`, a base64 decoder, or `shasum` on the
same artifact.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
