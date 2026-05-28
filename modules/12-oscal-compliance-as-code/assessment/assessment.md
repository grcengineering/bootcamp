# Module 12 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** mini-crosswalk (a spine control or two plus one framework's selection) and a named
> policy identifier, and must, unaided and within 60 minutes, deliver the OSCAL set, the
> control-to-policy link, the validator run, and the walkthrough.

## What the learner delivers

1. A **schema-valid minimal OSCAL set**: a catalog containing the provided control(s) with
   required metadata (a document UUID, title, version, oscal-version) and a stable `id` on every
   control; a profile that imports the catalog and selects the in-scope control(s); and a
   component-definition with at least one `implemented-requirement` naming a real control id.
2. A **control-to-policy link (C2P)**: the implemented control must carry a *resolvable* link (via
   `links` + `back-matter`) to the provided policy identifier — tying the OSCAL claim to the
   enforcing Module-09 policy, not merely asserting "implemented."
3. A **validator run** (the learner's own or the provided `validate-oscal.ts`) showing the set
   first **failing** on an introduced defect (a missing required field *or* a dangling profile
   reference) and then **passing** once resolved — with exit code as the verdict — plus a
   **written walkthrough** that correctly: explains what a *schema* gives you that a shared
   *format* does not; names what each OSCAL layer (catalog / profile / component-definition /
   assessment-POA&M) is the machine-readable version of; traces the `control-id` join from profile
   to implementation to policy; and states which downstream consumer the introduced defect would
   have broken.

## Fresh fixtures (assessor setup)

Do **not** reuse the guided-lab fixtures verbatim. Produce a fresh variant so the answer differs —
e.g. swap the spine control (`sc-28` instead of `ac-2`), change the framework the profile
represents, and hand the learner a *different* policy identifier to link to. Start from the
bundled fixtures and hand-edit:

```bash
bash ../labs/setup.sh /tmp/assess12
# then hand-edit /tmp/assess12/acme-catalog.json (different control id, e.g. sc-28)
# adjust /tmp/assess12/acme-profile.json to include that id
# and give the learner a fresh policy id to wire into the component-definition's back-matter
```

The assessor notes the expected validator verdict (which defect fails, which fields/links must
resolve) and the correct control-to-policy linkage before the learner begins. The validator
(`labs/fixtures/validate-oscal.ts`) is the reference implementation; a learner may use it or write
their own equivalent that asserts the same contract (required fields, resolved references,
resolvable policy link).

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
