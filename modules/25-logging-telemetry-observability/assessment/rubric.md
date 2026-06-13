# Rubric — The Field That Proves It

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Peel the HEADER slots | Selects each HEADER field at its grammar-true position and reads its value — `region_labeled_correctly`, `field_value_is` | §3, §4.1 |
| 2 | Read NILVALUE as absence | Reads a PROCID/STRUCTURED-DATA `-` as genuine *absence*, not the text "dash" — `field_value_is` | §4.2 |
| 3 | Compute the PRI by hand | Reverses PRIVAL = Facility × 8 + Severity to read Facility (PRIVAL ÷ 8) and Severity (PRIVAL mod 8) off the one PRI byte — `field_value_is` | §3, §4.3, §5.2 |
| 4 | Read Severity as the alert parameter | States that the Severity slot — not the message text — decides whether an alert fires — `field_value_is` | §4.4, §5.2 |
| 5 | Peel STRUCTURED-DATA | Reads an SD-ID and a named SD-PARAM and states why a named parameter is provable where MSG text is not — `region_labeled_correctly`, `field_value_is` | §4.5, §5.3 |
| 6 | Trace born vs queried | Orders source → collector → store → query → alert and states evidence is born at the source, queried at the store — `sequence_matches` | §4.6 |
| 7 | Map fields to controls | Places Severity/outcome → AC-7/IA-5, audit content → AU-3, retention → AU-11, catching the application-vs-audit trap — `mapping_correct` | §4.7, §4.8 |
| 8 | Diff-the-Trace diagnosis | Computes the single divergent field (PRI → Severity) where the downgraded line breaks the alert claim — `field_value_is` | §4.4, §5.4 |
| 9 | Log Evidence Finding | Writes a finding naming the field, both values, control broken, and framework ref (AU-3 / AC-7 / AU-11) | §2, §5.4 |
