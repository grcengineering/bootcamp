# Module 03 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** set of endpoint status outputs (regenerate a sample set with different values and a
> different "could-not-run" gap — see "Fresh fixture" below), or from a real, unfamiliar Mac, and
> must, unaided and within 40 minutes, deliver the packet, the evaluator, and the walkthrough.

## What the learner delivers

1. An **endpoint compliance-evidence packet**, built from the CLI, covering at least these five
   controls — each line labeled to the control **and** the subsystem that owns its truth, carrying
   the **raw machine reply**, and a **three-valued verdict (PASS / FAIL / UNKNOWN)**:
   - encryption at rest — **FileVault** (`fdesetup status`)
   - OS tamper protection — **SIP** (`csrutil status`)
   - software-execution control — **Gatekeeper** (`spctl --status`)
   - central management — **MDM enrollment** (`profiles status`)
   - an enforced screen-lock policy — **MDM profile** (`profiles status` **and**
     `system_profiler SPConfigurationProfileDataType`, both required)
2. A **deterministic evaluator** that derives each verdict by matching a known-good string,
   then a known-bad string, and **defaulting to UNKNOWN** — demonstrably returning `UNKNOWN`
   (not `FAIL`) when handed a check that could not run (empty / errored output).
3. A **spoken or written walkthrough** that correctly: names the subsystem that owns each
   control's truth; explains why the screen-lock control requires *two* subsystems
   (managed **and** policy-present); identifies the `UNKNOWN` line in the packet and explains
   why scoring it `PASS` or clean `FAIL` would be a defect; and states what re-running the
   packet identically proves about continuous assurance.

## Fresh fixture (assessor setup)

Do **not** reuse the guided-lab fixtures. Generate a fresh sample set with different values and
a different could-not-run gap, e.g.:

```bash
bash ../labs/setup.sh /tmp/assess03      # then hand-edit a status string to FAIL,
                                         # and move the empty gap to a different control
```

If a real Mac is used instead, the assessor picks the device and notes the expected per-control
verdict (including which control, if any, should resolve to `UNKNOWN`) before the learner begins.
The empty/errored "could-not-run" gap must be present in whatever the learner is handed — the
UNKNOWN-not-FAIL discipline is the load-bearing assessment, not an edge case.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
