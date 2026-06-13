# Assessment — The Field That Proves It: Reading a Log Line as Continuous Evidence

**Competency artifact (not a quiz).** Unaided, from real RFC 5424 log lines provided at assessment
time, the learner produces the evidence below. Every value is read off the real characters of the
line; the parser's parse tree (fidelity-checked against the RFC's own worked decode) is the verifier.

## What the learner delivers

1. **A peeled line.** Reading at the grammar-fixed positions, the learner reports: the HEADER fields
   (TIMESTAMP, HOSTNAME, APP-NAME, MSGID), the PROCID and STRUCTURED-DATA NILVALUEs read as genuine
   *absence*, and — by reversing PRIVAL = Facility × 8 + Severity — the Facility (PRIVAL ÷ 8) and the
   Severity (PRIVAL mod 8) from the single PRI byte. Each is gated by `region_labeled_correctly` (the
   selection equals the parser's true region) and `field_value_is` (the read equals the oracle's
   computed decode).

2. **A pipeline trace + a field-to-control map.** The learner orders the pipeline
   (source → collector → store → query → alert) and states where evidence is *born* versus *queried*
   (`sequence_matches`), then maps the deciding fields onto the controls they evidence — Severity and
   outcome → AC-7 / IA-5, audit content → AU-3, retention → AU-11 — catching the trap of an
   application log offered as audit evidence (`mapping_correct` against the cited NIST 800-53 / SOC 2
   key).

3. **A Diff-the-Trace finding.** Given a clean line and a real downgraded twin, the learner computes
   the single field — the PRI's Severity — where the evidence contradicts the control claim
   (`field_value_is` against the parser's computed Severity divergence over the real PRI byte) and
   writes a **Log Evidence Finding**: field, clean value, broken value, control broken, framework
   reference.

## Honesty

Every line in every pair is real RFC 5424 text (the §6.5 verbatim examples and a real instance built
from one by changing only the PRIVAL); the "broken" leg is a genuine downgrade — Severity 2 (Critical)
recomputed to Severity 7 (Debug) from the real PRI byte `<39>` = 4×8+7. The discriminating field is the
parser's arithmetic over the real characters — never an authored answer key. The learner can re-derive
every value by hand with the PRIVAL formula or by pasting the line into any reference RFC 5424 parser.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
