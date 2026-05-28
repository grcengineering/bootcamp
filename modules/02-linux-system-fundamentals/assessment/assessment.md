# Module 02 — Assessment (Competency Artifact Spec)

*Original assessment. Maps to the §1 objectives of `module.md`. This is an artifact-production task, not a trivia quiz — the learner proves competence by hardening a real host and proving each control from the host's own evidence.*

---

## What the learner produces

On a **fresh, unseen Linux instance** provided at assessment time, the learner — **unaided, within 60 minutes** — implements the three-control hardening standard and delivers a **one-page compliance-evidence writeup** (`evidence-writeup.md`) that proves each control from the host's own commands.

This mirrors the real GRC engineering task: take a claim about a system and turn it into reproducible, host-sourced evidence that a reviewer can independently re-run and confirm.

## The hardening standard (the controls being proven)

1. **Least privilege.** Administration is performed by a named non-root user that holds `sudo`; ordinary accounts do not. Direct root login is not used.
2. **SSH key-only authentication.** `sshd` accepts public-key authentication only — `PasswordAuthentication no` and `PermitRootLogin no` are the *effective* directives.
3. **Supervised service.** A defined background service is installed via the package manager (or a minimal `systemd` unit), and is both `active (running)` and `enabled` to start on boot.

## Required structure of `evidence-writeup.md`

One page. For **each** of the three controls, a block containing:

- **Control statement** — one sentence, the claim being proven.
- **Command** — the exact command run to gather evidence (copy-pasteable).
- **Evidence line(s)** — the specific line(s) of output that constitute the proof.
- **Verdict** — one sentence: pass/fail and why this output proves it.

Plus the captured raw outputs backing each block:

- `id` for the admin user **and** a non-privileged user (two-sided least privilege).
- The decoded `ls -l` of the admin user's `.ssh` material, with the per-user read/write/execute verdict written out.
- The **effective** `PasswordAuthentication` and `PermitRootLogin` values, resolved the way `sshd` parses them (comments ignored, last directive wins) — not a naive single `grep`.
- `systemctl status` output showing **both** `active (running)` and `enabled`.
- The `journalctl -u ssh` (or `/var/log/auth.log` / `secure`) line witnessing a `publickey` login — and the absence of any successful `password` login.

## Pass condition

The artifact passes only if **every** control is both **correctly implemented** on the host **and** **correctly evidenced** in the writeup, such that the assessor re-running each stated command reaches the **identical verdict**. A control that is implemented but not defensibly evidenced does not pass — in GRC, an unprovable control is an unmet control.

## How it is graded

See `rubric.md`. Every rubric row maps to a §1 objective and, on a Not-yet, routes the learner to the specific concept section to revisit. All rows must be Pass. Per-criterion pass-rates are reported as Loop-3 telemetry: a criterion falling below the `assessment_passrate_threshold` in `meta.yaml` flags this module for revision — the content is treated as the defect, not the learner.

## Reproducibility check (offline proxy)

The control-evaluation *logic* this assessment depends on — resolving `sshd_config` the way `sshd` does and reading sudo-group membership from `id` — is independently reproduced on a clean machine by `../labs/happy-path.sh` against bundled fixtures, with no host, network, or root required. That smoke test is the curriculum's own evidence that the assessment's evaluation logic is sound.
