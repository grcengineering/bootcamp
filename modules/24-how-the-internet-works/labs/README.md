# Lab — The Request Lifecycle (the Inspect-&-Assemble PEEL + TRACE surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh` to
run, no host packet capture, and no DNS server to stand up: the lab loads the **real artifacts of
one request lifecycle** for `example.com` and lets you read each control claim's truth directly off
them (the visual surface, `engine: visual`).

## What runs

- **The artifacts (all real):**
  - the canonical RFC 1035 DNS **query** and a live-captured DNS **response**, committed as bytes at
    `.ci/fixtures/assets/net/dns-query-example-com.json` and `dns-response-example-com.json`;
  - the real DNS **delegation** chain (root → `.com` TLD → authoritative) at `dns-delegation.json`;
  - the RFC 8446 TLS 1.3 **handshake** message set at `tls13-handshake.json`;
  - the real `www.google.com` **leaf certificate** and a broken twin at
    `.ci/fixtures/assets/crypto/google-cert-chain.json` and `cert-diff-the-trace.json`.
- **The oracles:** four ported engines, each parsing or running over the real bytes —
  `web/src/engines/visual/dns.ts` (the RFC 1035 message parser), `dnsres-sim.ts` (the RFC 1034
  delegation state machine), `tls13-sim.ts` (the RFC 8446 handshake state machine), and `x509.ts`
  (the certificate parser). Every region boundary, decoded value, accepted sequence, and raised
  alert the surface shows is computed from the real bytes — there is no answer key.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives — `region_labeled_correctly` / `field_value_is` read the DNS and certificate
  parse trees; `sequence_matches` / `sim_alert_is` read the delegation and TLS state machines. The
  golden/anti transcripts in `exercises/transcripts/` replay the learner's select/read/assemble
  actions through the same surface the player drives.

## Why this is honest

The DNS response is real bytes off the wire (its AD bit reads **0** — this answer was genuinely not
DNSSEC-validated, the honest control reading, not an authored "pass"). The DNS query is authored
from RFC 1035 *with citation* because `dig` does not emit raw query wire bytes — but its decode
matches `dig`'s parsed question, and the QNAME bytes decode to `example.com` by hand. The delegation
data is real `dig`/IANA data, and the sim runs the real referral behaviour: route the leaf query to
the root and it returns the real referral, because a root server refers, it never answers a leaf.
The TLS handshake order and its alert codes are RFC 8446's literal values, run by the real state
machine — order it wrong and it raises the real `unexpected_message(10)`. The certificate is a real
`openssl s_client` capture; the broken twin is a genuine hostname mismatch.

Each oracle is fidelity-checked against `dig`, `openssl`, and the RFC state machines in the web test
suite. See `.ci/fixtures/assets/net/README.md` and `.ci/fixtures/manifest.d/24.yaml` for the full
capture provenance — how, when, and the cross-check. The parser / state-machine over those real
bytes IS the oracle.
