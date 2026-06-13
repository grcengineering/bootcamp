# Assessment — Whose Control Is It? Reading the Responsibility Boundary

**Competency artifact (not a quiz).** Unaided, from a stated service model and a list of control
claims provided at assessment time, the learner produces the evidence below. Every placement is
scored against the cited shared-responsibility matrix (AWS Shared Responsibility Model + CSA CAIQ +
NIST 800-53); the matrix is the verifier.

## What the learner delivers

1. **A responsibility map.** For the stated service model (a SaaS HR platform), the learner places
   each control claim on the party structurally capable of producing its truth — YOU or PROVIDER —
   and demonstrates the boundary shift by re-deriving the migrating cards at a second service model.
   Gated by `mapping_correct` against the cited matrix's `keyByModel` column.

2. **A plane sort.** The learner sorts cloud actions onto the control plane (management-API changes:
   IAM, security groups, KMS) versus the data plane (workload request traffic and the bytes it
   moves), including the audit-logging card that spans both. Gated by `mapping_correct` against the
   cited control-plane/data-plane key.

3. **A misattribution diagnosis + ownership note.** Given a list that contains a deliberately
   misattributed claim (a SaaS customer who says they *enforce* a control the provider owns), the
   learner catches it and writes an **ownership note**: per control, who is responsible and what
   evidence each party produces — for "encrypted at rest," that the provider attests and the customer
   inherits via a CUEC under SaaS, versus that the customer owns and produces it under IaaS — mapping
   each half to its NIST 800-53 family (SC-28 at rest; AC-2/AC-3 for the access the customer keeps).

## Honesty

There are no wire bytes and no new parser — this is a conceptual module. The cited shared-
responsibility matrix is the closed answer key, and every zone assignment carries a `keyRef`
citation to its authoritative source (AWS / CSA / NIST). The slider re-derivation reproduces the
published shift of responsibility across IaaS / PaaS / SaaS; the invariant cards reproduce the
model's constants. A wrong placement names the misplaced card without revealing the answer, and the
learner can check every assignment against the provider's published responsibility model.

## Rubric

See `rubric.md`. Every row must be **Pass**; a single **Not-yet** routes the learner back to the
specific concept section named there. Per-criterion pass-rates are the telemetry that flags this
module for revision (maintenance Loop 3) when any objective falls below
`assessment_passrate_threshold` in `meta.yaml`.
