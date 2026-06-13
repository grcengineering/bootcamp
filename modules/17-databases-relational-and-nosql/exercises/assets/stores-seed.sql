-- Module 17 seed — the SAME eight acme.example users loaded into THREE real stores.
-- Source of the eight users: the module-06 API seed
-- (modules/06-api-fundamentals/labs/fixtures/users-page-{1,2}.json), reused verbatim so the
-- "same question, three stores" claim-thread is byte-honest across modules. The engine (sql.js /
-- WASM SQLite) is the oracle; these rows are the real data it answers over — no authored answer key.
-- Idempotent: DROP + CREATE + INSERT so a re-run reseeds cleanly.

-- ---- Relational store: one typed row per user (§4.1) ----------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  mfa_enabled  INTEGER NOT NULL,   -- 0 = off, 1 = on
  status       TEXT NOT NULL
);
INSERT INTO users (id, email, mfa_enabled, status) VALUES
  ('u_001', 'alice@acme.example', 1, 'active'),
  ('u_002', 'bob@acme.example',   0, 'active'),
  ('u_003', 'carol@acme.example', 1, 'active'),
  ('u_004', 'dave@acme.example',  0, 'suspended'),
  ('u_005', 'erin@acme.example',  1, 'active'),
  ('u_006', 'frank@acme.example', 0, 'active'),
  ('u_007', 'grace@acme.example', 1, 'active'),
  ('u_008', 'heidi@acme.example', 0, 'active');

-- ---- Document store: one self-describing JSON record per user (§4.2) -------------------
DROP TABLE IF EXISTS users_doc;
CREATE TABLE users_doc (
  id   TEXT PRIMARY KEY,
  doc  TEXT NOT NULL              -- a real JSON object, read with json_extract()
);
INSERT INTO users_doc (id, doc) VALUES
  ('u_001', '{"email":"alice@acme.example","mfa_enabled":true,"status":"active"}'),
  ('u_002', '{"email":"bob@acme.example","mfa_enabled":false,"status":"active"}'),
  ('u_003', '{"email":"carol@acme.example","mfa_enabled":true,"status":"active"}'),
  ('u_004', '{"email":"dave@acme.example","mfa_enabled":false,"status":"suspended"}'),
  ('u_005', '{"email":"erin@acme.example","mfa_enabled":true,"status":"active"}'),
  ('u_006', '{"email":"frank@acme.example","mfa_enabled":false,"status":"active"}'),
  ('u_007', '{"email":"grace@acme.example","mfa_enabled":true,"status":"active"}'),
  ('u_008', '{"email":"heidi@acme.example","mfa_enabled":false,"status":"active"}');

-- ---- Key-value store: an opaque value reached only by its key (§4.3) -------------------
-- The value is deliberately opaque to the store: a pipe-delimited blob the store cannot filter on.
DROP TABLE IF EXISTS users_kv;
CREATE TABLE users_kv (
  k  TEXT PRIMARY KEY,           -- e.g. 'user:u_002'
  v  TEXT NOT NULL               -- e.g. 'bob@acme.example|mfa=0|active'
);
INSERT INTO users_kv (k, v) VALUES
  ('user:u_001', 'alice@acme.example|mfa=1|active'),
  ('user:u_002', 'bob@acme.example|mfa=0|active'),
  ('user:u_003', 'carol@acme.example|mfa=1|active'),
  ('user:u_004', 'dave@acme.example|mfa=0|suspended'),
  ('user:u_005', 'erin@acme.example|mfa=1|active'),
  ('user:u_006', 'frank@acme.example|mfa=0|active'),
  ('user:u_007', 'grace@acme.example|mfa=1|active'),
  ('user:u_008', 'heidi@acme.example|mfa=0|active');
