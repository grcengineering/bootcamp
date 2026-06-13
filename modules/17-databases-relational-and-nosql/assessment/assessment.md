# Assessment — Same Question, Three Stores: Where Control-Truth Lives at Rest

**Competency artifact (not a quiz).** Unaided, against the three real stores provided at assessment
time, the learner produces the evidence below. Every value is a real SQLite result set; the engine
(sql.js / WASM SQLite) is the verifier.

## What the learner delivers

1. **The control answer, in the relational store.** The learner queries "which users lack MFA?" as a
   predicate over the `mfa_enabled` column and reads the four violators off the engine
   (`engine_result_equals`), then proves completeness with `COUNT(*)` over all eight accounts —
   showing the four are out of the whole set, not a sample.

2. **The SAME answer, in the document store.** Using `json_extract(doc, '$.field')`, the learner
   answers the identical question against the JSON documents and confirms the result set is
   byte-for-byte identical (`engine_result_equals`) — demonstrating that the store changed the reach
   (a field path instead of a column), not the truth.

3. **A SQL-injection diagnosis.** Over the same `' OR '1'='1` input, the learner runs the
   concatenated query (over-broad result set — all eight rows) and the parameterized query (empty
   result set), reads both off the engine (`engine_result_equals`), and names the control the
   over-broad set breaks (SI-10) and the assembly the empty set proves (bound value, not glued
   string).

4. **An at-rest evidence finding.** The learner produces a finding that names the data answer and its
   store, the injection result, and pins the at-rest and access claims to where their truth actually
   lives — the encryption setting + key reference (SC-28 / CC6.1) and the access policy (AC-3) — not
   to any returned row.

## Honesty

All three stores hold the SAME eight `acme.example` users (reused verbatim from the module-06 API
seed). The result sets are SQLite's own output over the real rows; the "same answer" identity across
the relational and document stores is the engine's, not an authored claim. The injection finding is
two real engine runs over the same input — the over-broad and empty result sets are both the engine's
honest answers. The learner can re-derive every value by running the same SQL against any SQLite.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
