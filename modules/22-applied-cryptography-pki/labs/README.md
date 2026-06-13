# Lab — The Padlock Is a Lie (the Inspect-&-Assemble surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no openssl to install on your host: the lab loads **real cryptographic artifacts** and
renders them as transform cards, selectable certificate fields, and orderable handshake cards
(the visual surface, `engine: visual`).

## What runs

- **The artifacts (all real bytes):**
  - the transform cards (SHA-256, base64, and the real JWT header) — the "Sorting the Scramble"
    sort, where each card's class is *computed by running the transform*, not labelled in advance;
  - the real `www.google.com` certificate chain (leaf ← WR2 ← GTS Root R1), captured with
    `openssl s_client` and committed at `.ci/fixtures/assets/crypto/google-cert-chain.json`;
  - the real Diff-the-Trace certificates — the clean Google leaf plus three deliberately-broken
    endpoints from badssl.com (expired, self-signed, wrong-host) at
    `.ci/fixtures/assets/crypto/cert-diff-the-trace.json`;
  - the RFC 8446 TLS 1.3 handshake message cards (the order the state machine runs).
- **The oracles:** `web/src/engines/visual/xform.ts` (the real SHA/base64 transform),
  `jwt.ts` (the real base64url JWT decode), `x509.ts` (the real DER/X.509 parser and the
  issuer↔subject chain + validity + hostname predicates), and `tls13-sim.ts` (the real RFC 8446
  handshake state machine). Every value the surface shows is computed from the real bytes — there
  is no answer key.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`,
  `sequence_matches`, `sim_alert_is`) reading that parse tree, transform output, or sim verdict.
  The golden/anti transcripts in `exercises/transcripts/` replay the learner's select/label/read/
  decode/order actions through the same surface the player drives
  (`web/tests/exercise-replay-22.test.ts`).

## Why this is honest

The transform recomputes from the learner's bytes every run; the certificate parser's output is
fidelity-checked against `openssl x509 -text` and `openssl verify`'s real return codes
(0 / 10 / 18 / 62) in `web/tests/crypto-fidelity.test.ts`; the TLS sim's accept/reject and alert
codes are fidelity-checked against RFC 8446 in `web/tests/tls13-protocol.test.ts`; and
SHA-256("") = e3b0c442… is the canonical constant anyone can reproduce with `shasum`. See
`.ci/fixtures/assets/crypto/README.md` for the full capture provenance — how, when, and the
cross-check. The parser / transform / state-machine over those real bytes IS the oracle; the
padlock is the thing this module teaches you to stop trusting.
