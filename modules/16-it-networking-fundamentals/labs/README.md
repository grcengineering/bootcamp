# Lab — On the Wire (the Inspect-&-Assemble PEEL surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no host packet capture to perform: the lab loads a **real captured frame** and renders
it as nested, keyboard-selectable byte-range regions (the PEEL surface, `engine: visual`).

## What runs

- **The artifact:** one real Ethernet II frame from a `curl https://www.google.com` request,
  committed as bytes at `.ci/fixtures/assets/net/google-search-clienthello.json`, plus the
  TCP handshake frames and the Diff-the-Trace clean/broken pairs alongside it.
- **The oracle:** the packet-dissector `web/src/engines/visual/pkt.ts` parses those real bytes
  into a nested parse tree. Every region boundary and decoded value the surface shows is computed
  from the real bytes — there is no answer key.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `mapping_correct`, …) reading
  that parse tree. The golden/anti transcripts in `exercises/transcripts/` replay the learner's
  select/label/decode actions through the same surface the player drives.

## Why this is honest

The dissector's output is fidelity-checked against `tshark`'s decode of the same frames
(`web/tests/pkt-fidelity.test.ts`), and every asserted field value equals the RFC-true value at
its fixed byte offset (RFC 791 / 9293 / 768 / 826 / 8446; IANA EtherTypes + Protocol Numbers).
See `.ci/fixtures/assets/net/README.md` for the full capture provenance — how, when, and the
cross-check. The parse tree over those real bytes IS the oracle.
