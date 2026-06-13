# Rubric — Same Question, Three Stores

Every criterion is **Pass / Not-yet**. A single Not-yet routes the learner to the named §, not the
whole module. Pass-rates per criterion are the maintenance telemetry (Loop 3).

| # | Criterion | Pass means | Not-yet routes to |
|---|-----------|------------|-------------------|
| 1 | Relational predicate | Returns the four MFA-off users as a `WHERE mfa_enabled = 0` predicate over the relational table — `engine_result_equals` | §3, §4.1, §5.1 |
| 2 | Completeness proof | Returns `COUNT(*)` = 8 to prove the whole account set was evaluated, not a sample — `engine_result_equals` | §4.3, §5.1 |
| 3 | Document field path | Returns the SAME four users from the document store via `json_extract(doc, '$.mfa_enabled')` — `engine_result_equals` | §4.2, §5.2 |
| 4 | Key-value scan | Returns the SAME four users by scanning the opaque key-value store and parsing the value format — `engine_result_equals` | §4.3, §5.3 |
| 5 | Same answer, three reaches | States that the identical result set across stores proves the store changed the reach, not the truth | §4.4, §5.2 |
| 6 | Injection — concatenated | Runs the concatenated query and reads the over-broad result set (all eight rows) the injection returns — `engine_result_equals` | §4.5, §5.4 |
| 7 | Injection — parameterized | Runs the parameterized form over the same input and reads the empty result set (the control working) — `engine_result_equals` | §4.5, §5.4 |
| 8 | At-rest evidence finding | Names the data answer + store, the injection result, and pins encryption-at-rest to its setting+key (SC-28/CC6.1), access to its policy (AC-3), and injection to SI-10 | §2, §4.6, §5.5 |
