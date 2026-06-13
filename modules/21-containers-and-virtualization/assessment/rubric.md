# Rubric — Peel the Image: Where a Workload's Control-Truth Is Baked In

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Explain VM vs. container | Places the VM card on "own host kernel" and the container card on "shared host kernel," and can state why the shared kernel widens the blast radius — `mapping_correct` + §7 reflection | §3, §4.1 |
| 2 | Peel the manifest + config | Selects `config.User`, `config.ExposedPorts`, and the ordered layer descriptors at their true nodes and reads each value off the real image — `region_labeled_correctly` + `field_value_is` | §4.2, §4.3 |
| 3 | Locate the baked secret | Selects the layer whose tar carries `/app-credentials.env` and cites its real sha256 digest as provenance — `region_labeled_correctly` + `field_value_is` against the reader's tar walk | §4.4 |
| 4 | Diagnose the misconfig findings | Reads `User` = root/uid 0 and the unexpected exposed port off the real config, not a scan summary — `field_value_is` | §4.2, §5 |
| 5 | Map findings to controls | Places runs-as-root → CM-6, exposed ports → CM-7, baked secret → IA-5/SC-28 in their cited zones — `mapping_correct` (CIS Docker / 800-190 / 800-53) | §4.5, §5 |
| 6 | Produce the finding sheet | Clicks the divergent field in the Diff-the-Trace and names the field, both values, the control broken, and the framework ref — `region_labeled_correctly`, `field_value_is` | §4.6, §7 |
