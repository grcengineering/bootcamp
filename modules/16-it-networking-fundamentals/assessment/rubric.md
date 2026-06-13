# Rubric — On the Wire

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Peel the encapsulation stack | Selects each layer's region at its true boundary and labels its OSI layer correctly (Ethernet=L2, IPv4=L3, TCP=L4, TLS=L6) — `region_labeled_correctly` | §3, §4.1 |
| 2 | Read the selector bytes | Reads EtherType `0x0800`→IPv4 and IPv4 Protocol `0x06`→TCP off the bytes — `field_value_is` | §4.1, §5.1 |
| 3 | Read addressing scope | Reads the destination IP and states why IP (not MAC) attributes across a routed hop — `field_value_is` | §4.2 |
| 4 | Read the 5-tuple's port | Reads the TCP destination port and states which control it decides — `field_value_is` | §4.3 |
| 5 | Read encryption at the right layer | Reads the TLS ContentType and states it — not the port — decides "encrypted in transit" — `field_value_is`, `region_labeled_correctly` | §4.5, §5.2 |
| 6 | Map controls to fields | Places segmentation/encryption/port-exposure on their deciding field+layer, catching the L6 trap — `mapping_correct` | §4.7, §5.2 |
| 7 | Diff-the-Trace diagnosis | Clicks the single divergent byte where the broken capture contradicts the claim — `region_labeled_correctly` | §4.7, §5.4 |
| 8 | Wire Evidence Finding | Writes a finding naming field, both values, control broken, and framework ref (SC-7/SC-8/CM-7) | §2, §5.4 |
