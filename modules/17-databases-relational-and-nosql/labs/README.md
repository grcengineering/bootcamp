# Lab — Same Question, Three Stores (the real SQLite console)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no database to stand up: the lab seeds three stores into a real SQLite engine and lets
you query them directly (the console surface, `engine: sql`).

## What runs

- **The artifact:** the SAME eight `acme.example` users the API module (06) pulled, loaded three
  ways by `exercises/assets/stores-seed.sql` — a relational `users` table, a `users_doc` table of
  JSON documents, and a `users_kv` key-value table. The eight users are reused verbatim from
  `modules/06-api-fundamentals/labs/fixtures/users-page-{1,2}.json` so the "one claim, three stores"
  thread is byte-honest across modules.
- **The oracle:** sql.js — real SQLite compiled to WASM, the same engine that ships in your phone
  and your browser (`web/src/engines/sql/index.ts`). Every result set the surface shows is the
  engine's own output over the real rows. There is no answer key.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by
  `engine_result_equals` (the learner's result set equals the engine's, captured by replaying the
  golden transcript) and `history_contains` (the query of the expected shape was run). The
  golden/anti transcripts in `exercises/transcripts/` replay the learner's SQL through the same
  engine the player drives.

## What you do

Answer ONE control question — "which users lack MFA?" — against each of the three stores (a `WHERE`
predicate on the relational table, a `json_extract` field path on the documents, a key scan on the
key-value table), prove completeness with `COUNT(*)`, then diagnose a SQL-injection break by running
a concatenated query (over-broad result set) against a parameterized one (empty result set).

## Why this is honest

The result set is the answer key: sql.js executes the learner's real SQL over the real seeded rows
and returns SQLite's own output, which `engine_result_equals` compares against what the golden
transcript produced from the SAME seed (`web/tests/exercise-replay-17.test.ts`). The "same answer,
three stores" claim is provable precisely because the engine returns identical rows from the
relational and document stores — the store changed the reach, not the truth. The injection finding
is two real engine runs over the same `' OR '1'='1` input: the concatenated form returns all eight
rows, the parameterized form returns zero. Nothing is invented.
