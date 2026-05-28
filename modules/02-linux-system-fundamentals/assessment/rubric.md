# Module 02 — Assessment Rubric

*Each row maps to a §1 objective and, on a miss, to the specific concept section to revisit. All rows must be **Pass**. Scored against the `evidence-writeup.md` artifact and its backing raw outputs (see `assessment.md`).*

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| Locate the truth | O1 | For each control, the learner gathers evidence from the correct physical home — `/etc` for declarations, the process/service for running state, `/var/log` or the journal for records — without guessing | module.md §4.1 |
| Service permanence | O2 | `systemctl status` evidence shows **both** `active (running)` and `enabled`; learner states what would happen at the next reboot if `enable` were skipped | module.md §4.3, §5.4 |
| Privilege boundary | O3 | Least privilege is evidenced **two-sided** from `id`: the admin user is in the `sudo`/`wheel` group and a named ordinary user is demonstrably not | module.md §4.4, §5.1 |
| Permission verdict | O4 | The `ls -l` permission string for the `.ssh` material is decoded to a correct per-user read/write/execute verdict, and any over-permission is identified and fixed | module.md §4.5, §5.2 |
| SSH hardening | O5 | `PasswordAuthentication` and `PermitRootLogin` are the **effective** `no` directives, resolved the way `sshd` parses (comments ignored, last wins); a key login is shown working | module.md §4.6, §5.3 |
| Log evidence | O6 | A `publickey` authentication event is located in `journald`/`/var/log` and correctly distinguished from a password login | module.md §4.7 |
| Defensible writeup | O7 | The one-page artifact gives, per control, control statement + exact command + evidence line + verdict, reproducible such that the assessor reaches the identical verdict | module.md §6 |
