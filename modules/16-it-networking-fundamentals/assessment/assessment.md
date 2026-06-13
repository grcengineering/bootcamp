# Assessment — On the Wire: Where a Control's Truth Travels

**Competency artifact (not a quiz).** Unaided, from real captures provided at assessment time,
the learner produces the evidence below. Every value is read off real bytes; the dissector's
parse tree (fidelity-checked against `tshark`) is the verifier.

## What the learner delivers

1. **A peeled frame.** Reading at the RFC-fixed offsets, the learner reports: the EtherType and
   the layer it selects; the IPv4 Protocol and the L4 parser it selects; the source and destination
   IP; the TCP destination port; and the TLS ContentType. Each is gated by `region_labeled_correctly`
   (the selection equals the dissector's true region + OSI label) and `field_value_is` (the read
   equals the oracle's decode).

2. **A control-to-field map.** For three claims — segmentation (SC-7), encryption-in-transit (SC-8),
   port-exposure (CM-7) — the learner states which field, at which layer, decides each, including the
   trap: "encrypted in transit" is decided by the TLS ContentType (L6), **not** the 5-tuple. Gated by
   `mapping_correct` against the cited NIST 800-53 / SOC 2 key.

3. **A Diff-the-Trace finding.** Given a clean capture and a real broken twin, the learner clicks the
   single byte/field where the evidence contradicts the control claim (`region_labeled_correctly`
   against the dissector's computed divergence) and writes a **Wire Evidence Finding**: field, clean
   value, broken value, control broken, framework reference.

## Honesty

Both captures in every pair are real bytes; the "broken" leg is a genuine instance of the
misconfiguration (a real port-80 exchange, a real cleartext HTTP GET, a real ARP reply). The
discriminating byte is the dissector's computed diff over the real bytes — never an authored answer
key. The learner can re-derive every value with `tshark -r` on the same bytes.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
