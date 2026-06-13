# Integration Canary Matrix

> **Gates the fan-out.** Per the advisor's *coverage-representative-canary* requirement (root ISA
> ISC-80; web ISA ISC-109): the curriculum's 16 exercises do not need 16 independent green-light
> proofs before the build is trusted — they need **one green proof per engine class**, because every
> exercise of a given class rides the *same* engine seam, the *same* verifier registry, and the
> *same* Lab Player surface. This matrix maps each engine class → the module(s) using it → the test
> suite that proves it runs against reality → the live-site presence of at least one exercise of that
> class. When every engine class has a green canary, the fan-out across all 16 modules is gated:
> a new module declaring an existing engine class inherits an already-proven seam.
>
> Specs are **data**; verifiers are **registry code** (`web/src/verifiers/registry.ts`). Honest
> simulation only — fixture-replayed, real-engine, or cited-and-flagged; never invented.
>
> Generated: 2026-06-13 · gates re-run from a clean tree · bun only.

## Gate results (every gate's quoted tail)

| # | Gate | Command | Exit | Quoted tail |
|---|------|---------|------|-------------|
| 1 | engine + replay + fidelity suites | `bun test` | **0** | `949 pass` / `0 fail` / `4767 expect() calls` / `Ran 949 tests across 37 files. [8.17s]` |
| 2 | site build + lab-route fan-out | `bun run build` ; count `dist/labs` | **0** | `38 page(s) built in 3.10s` / `Complete!` — `dist/labs` non-index dirs = **16** |
| 3 | typecheck (`astro check`) | `bun run check` | **0** | `- 0 errors` / `- 0 warnings` |
| 4 | exercise-lint (spec↔registry seam) | `.ci/exercise-lint.ts` | **0** | `exercise-lint: 16/16 specs pass (0 modules have no spec yet)` |
| 5 | manifest-lint (fidelity manifest) | `.ci/fixtures/manifest-lint.ts` | **0** | `manifest-lint: 273/273 entries pass` |
| 6 | semantic-originality (offline) | `OFFLINE=1 .ci/semantic-originality.ts` | **0** | `semantic-originality: 0 fail, 3 review across 16 modules` |
| 7 | curriculum dashboard (exercise-ready rows) | `dashboard/generate.ts` ; count `🧪 yes` | **0** | `🧪 yes` count = **16** |

All seven gates green. No gate was red; no fixes were required.

## Engine-class → module → proving suite → status

The `engine:` field on each `exercise.yaml` is the **Lab Player surface** the spec declares. Several
specs declare a composite surface (`mixed`) or a generic builder surface (`builder`) but internally
drive a specific WASM/real engine — the matrix resolves to the **actual engine class exercised** so
each closed-set class has an explicit canary, not just each surface label.

| Engine class | Module(s) using it (`id` / `engine:` decl) | Proving test suite(s) | What the suite proves (non-vacuous) | Built-site canary | Status |
|---|---|---|---|---|---|
| **shell-linux** | 01 (`shell-linux`), 02 (`shell-linux`), 09 (`shell-linux`) | `exercise-replay.test.ts` (generic shell replay; 01/02/09 each have `golden.jsonl`) + `engine-semantics.test.ts` + `fidelity.test.ts` (96 fixtures) | Golden transcript satisfies every action task through the real shell engine; anti-transcripts fail their targeted task; command output byte-diffs against `.ci/fixtures/` captures | `/labs/01-…`, `/labs/02-…`, `/labs/09-…` | **GREEN** |
| **shell-macos** (zsh/BSD variant) | 03 (`shell-macos`) | `exercise-replay.test.ts` (variant `zsh-macos`; 03 has `golden.jsonl`) + `fidelity.test.ts` macOS-host captures | Same shell seam under the zsh-macos variant; BSD wc padding, zsh `no matches found` glob error, csrutil/spctl/fdesetup canon byte-exact | `/labs/03-…` | **GREEN** |
| **powershell** | 04 (`powershell`) | `powershell-fidelity.test.ts` + `powershell-semantics.test.ts` + `exercise-replay-04.test.ts` | PS prompt + object pipeline → Format-Table; Get-BitLockerVolume / Get-MpComputerStatus / Get-WinEvent. No real Windows box is captured — every fixture (happy-path AND error-path) is authored-with-citation from Microsoft Learn (cmdlet refs, ParameterBindingException, Win32 ERROR_INVALID_DRIVE, provider ItemNotFound/EventLogNotFound) + module-04 §5 prose canon, suite-locked: `powershell-fidelity.test.ts` byte-asserts the engine against each `.ci/fixtures/captured/m04-*.json`; module-04 golden/anti replay | `/labs/04-…` | **GREEN** |
| **python** (Pyodide / real CPython) | 05 (`git` surface; Python lab assets) | `engines-python.test.ts` | Module-05 lab assets run on **real CPython** (Pyodide); taught test assertions execute in-engine; drifted-version guard | `/labs/05-…` | **GREEN** |
| **sql** (sql.js / real SQLite) | 07 (`mixed` — two-pane shell + SQL console) | `engines-sql.test.ts` + `exercise-replay-07.test.ts` | Module-07 taught queries return correct result sets from **real SQLite**; SQL errors mirror `sqlite3` (message on stderr, exit 1); two-pane `pane:sql` replay | `/labs/07-…` | **GREEN** |
| **policy/cedar** (cedar-wasm, live authoring) | 09 (`shell-linux` surface; Cedar flagship) | `engines-policy.test.ts` (Cedar half) + `exercise-replay.test.ts` (m09 golden) | Live Cedar evaluation of the committed `policy.cedar` (355 B) via real evaluator; forbid-wins semantics; `policy_decision_is` checks the real `CedarDecision[]` artifacts | `/labs/09-…` | **GREEN** |
| **policy/rego** (opa-wasm, precompiled) | 09 (`shell-linux` surface; OPA reference) | `engines-policy.test.ts` (OPA half) | The **precompiled** `policy.wasm` (134 KB, built by dockerized `opa build -t wasm`) evaluated against mutated inputs via `check.sh` — input-mutation pedagogy, real OPA wasm | `/labs/09-…` | **GREEN** |
| **jq** (real jq evaluation) | 06 (`api`; jq bridge per ISC-70 in `labs/happy-path.sh`) | `engines-jq.test.ts` | `parseInvocation` arg/flag/file parsing + **real jq evaluation** (`-r`, default filter/input) returns correct streams with exit 0 | `/labs/06-…` (jq rides the m06 surface) | **GREEN** |
| **git** (isomorphic-git + porcelain) | 05 (`git`) | `engines-git.test.ts` + `exercise-replay-05.test.ts` | Reference flow byte-diffs real-git captures (pinned identity/dates → deterministic SHAs); free-form flows **state-verified** via `repo_state_matches`, not string-matched; boundary honesty (no invented output) | `/labs/05-…` | **GREEN** |
| **api** (mock SaaS API, auth ladder) | 06 (`api`) | `api-lab.test.ts` + `api-error-fixtures.test.ts` + `exercise-replay-06.test.ts` | acme.example DATA payloads (users/devices pages) byte-identical to committed module fixtures; auth-ladder + error bodies (401→key→bearer→OAuth2, 403/404/405/429/5xx) are authored-with-citation (RFC 9110/6749/6750/6585 + module 06 §4/§5, acme.example is fictional — no real host to capture), each locked by a doc-cited fixture (`.ci/fixtures/captured/m06-err-*.json`) + suite; cursor pagination; 429+Retry-After; `api_pull_complete` over the observed exchange log | `/labs/06-…` | **GREEN** |
| **builder** (workspace / ported validators / mapping) | 00 (`builder`), 08 (`builder`), 10 (`builder`), 11 (`builder`), 12 (`builder`), 13 (`builder`), 14 (`builder`), 15 (`builder`) | `builders-models.test.ts` + `builders-validators.test.ts` + per-module `exercise-replay-{00,08,10,11,12,13,14,15}.test.ts` | The repo's own lab validators (validate-crosswalk / validate-coverage / validate-oscal / ccm-check / expected_loss / validate-capstone) ported client-side and verified **byte-identical stdout + exit codes** vs CI lab-repro; `validator_passes` / `mapping_score_at_least` gate the real ported run | `/labs/{00,08,10,11,12,13,14,15}-…` | **GREEN** |

### Coverage statement

**Every engine class in the closed set has at least one exercise that runs in the built site, proven
green by a named suite that executes against reality** (fixture byte-diff, real WASM engine, or
ported-validator equivalence — never invented output):

- shell-linux · shell-macos · powershell · python · sql · policy/cedar · policy/rego · jq · git ·
  api · builder — **11/11 classes have a green canary.**
- All 16 `/labs/*` routes are present in `web/dist/labs/` (gate 2: 16 non-index dirs; gate 7: 16
  `🧪 yes` rows in the curriculum dashboard).
- The 36-file `bun test` suite (907 tests) spans every class: dedicated engine suites
  (`engines-{git,jq,policy,python,sql}`, `api-lab`, `powershell-*`) prove the real-engine seam;
  per-module + generic replay suites prove the golden transcript satisfies each spec's verifiers
  and each anti-transcript fails its target.

## Notes on surface-label vs engine-class resolution

- Modules **01 / 03 / 09** have **no dedicated `exercise-replay-NN.test.ts`** — they are
  shell-engine specs covered by the **generic** `exercise-replay.test.ts`, which enumerates every
  module directory containing `exercises/transcripts/golden.jsonl` and replays it through the
  shell engine (variant `zsh-macos` for `shell-macos`, else `bash-linux`). Confirmed: 01/02/03/09
  all ship `golden.jsonl`.
- Module **07** declares `engine: mixed` — a two-pane surface (shell terminal + real-SQLite
  console). It is the **sql** canary; its shell pane is additionally exercised by the generic
  replay logic via the dedicated `exercise-replay-07.test.ts`.
- Module **09** declares `engine: shell-linux` (its Lab Player surface is the shell, where the
  learner runs `cedar`/`opa` CLIs), but it is the host for **both** policy engine classes:
  Cedar (live authoring flagship, cedar-wasm full parser) and Rego (OPA precompiled wasm +
  input-mutation). Both are proven by the same `engines-policy.test.ts` against module-09 assets.
- Module **05** declares `engine: git` but is also the **python** canary — its lab assets run on
  real CPython (Pyodide) and are proven by `engines-python.test.ts`, while its git flows are proven
  by `engines-git.test.ts` + `exercise-replay-05.test.ts`.
- The eight **builder** modules (00/08/10/11/12/13/14/15) share one ported-validator seam; each has
  a per-module replay suite, and the seam itself is proven by `builders-validators.test.ts`.
