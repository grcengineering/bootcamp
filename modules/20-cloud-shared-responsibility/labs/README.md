# Lab — Whose Control Is It? (the Inspect-&-Assemble MAP surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no cloud account to connect: the lab loads the **cited shared-responsibility matrix** and
renders it as a MAP board — control cards you place onto a YOU / PROVIDER boundary, a second board
that sorts cloud actions onto the control plane vs the data plane, and an IaaS → PaaS → SaaS slider.

## What runs

- **The artifact:** the committed shared-responsibility key at
  `.ci/fixtures/assets/cloud/responsibility-matrix.json` — the control-to-party assignments authored
  from the AWS Shared Responsibility Model, the CSA CAIQ shared-responsibility columns, and NIST
  SP 800-53 / SP 800-204, with the service-model slider re-deriving each migrating card's side.
- **The oracle:** the cited matrix itself. This is a conceptual MAP module — there are no wire bytes
  to peel and no new parser. The matrix's `keyByModel` / `keyZone` columns ARE the answer key the
  surface scores against (the `csa` oracle id is the label for that cited matrix, not a byte parser).
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  `mapping_correct` verifier, which reads each card's placement against the cited matrix at the
  current slider position. The golden/anti transcripts in `exercises/transcripts/` replay the
  learner's place / toggle / slider actions through the same MAP surface the player drives.

## Why this is honest

The responsibility model is a published vendor contract, not a wire capture — so the matrix is
authored to its cited sources (`match: authored-with-citation`) and every zone assignment carries a
`keyRef` citation to AWS / CSA / NIST. The slider re-derivation reproduces the published shift of
responsibility from IaaS to SaaS (the customer surface shrinks as the provider's managed surface
grows); the invariant cards reproduce the model's constants ("security OF the cloud" is the
provider's, "security IN the cloud" is yours). See
`.ci/fixtures/assets/cloud/responsibility-matrix.json` for the full provenance block. The cited
matrix over those control families IS the oracle — there is no per-render authored answer.
