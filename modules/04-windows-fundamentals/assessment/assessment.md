# Module 04 — Assessment (facilitator copy)

> Competency artifact, not a quiz. Mirrors `module.md` §7. The learner works from a **fresh,
> unseen** Windows endpoint (or a fresh sample posture bundle generated with different values —
> see "Fresh endpoint / bundle" below) and must, unaided and within 40 minutes, deliver the
> artifact and walkthrough.

## What the learner delivers

1. A **re-runnable PowerShell script** that collects a Windows endpoint compliance bundle —
   disk encryption (BitLocker), endpoint protection (Defender), the **effective** screen-lock
   setting, the **last 20 failed logons**, and **local-administrator membership** — built
   **entirely from `Get-` (read-only) commands**, with **each field labeled to a SOC 2 CC6
   control**, exported to **both JSON and CSV**, and **structurally identical across two
   consecutive runs** (same fields, same control labels).
2. A **spoken or written walkthrough** that correctly: names which subsystem owns each control
   claim (BitLocker / Defender / registry-policy / Security log / local account database);
   explains why **property selection** (not text parsing) makes the evidence durable;
   distinguishes a **real non-compliance** from a **collection error** from a **not-applicable**
   result; states the **SOC 2 CC6 claim each field is evidence for**; and names **at least one
   control the endpoint script cannot prove** and the **Entra ID** subsystem (conditional access /
   MFA) that owns it.

## Fresh endpoint / bundle (assessor setup)

Do **not** reuse the guided-lab readings. Either:

- Hand the learner a **fresh managed Windows endpoint** whose posture differs from the lab VM
  (e.g., encryption in progress, or an extra local admin), **or**
- Generate a **fresh sample bundle** with different values and a different verdict:

```bash
bash ../labs/setup.sh /tmp/assess04     # then hand-edit the JSON so the answer differs
```

The assessor records the expected per-control results and the overall verdict before the learner
begins, so the walkthrough can be scored against ground truth.

## Read-only discipline (assessor note)

The artifact **must** be all `Get-` (read-only). If the learner's script issues any command that
could change endpoint state (e.g., `Set-`, `Enable-`, `Disable-`, `Remove-`), that is an automatic
**Not-yet** on the *Read-only collection* criterion regardless of output correctness — an evidence
collector that mutates the thing it measures is not evidence.

## Scoring

Score against `rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner
back to the specific concept section named in the rubric — not the whole module. Per-criterion
pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any
objective falls below `assessment_passrate_threshold` (0.80) in `meta.yaml`.
