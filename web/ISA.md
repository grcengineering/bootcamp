---
project: grc-bootcamp-web
effort: E5
phase: build
progress: 31/114
mode: build
started: 2026-05-28
updated: 2026-06-11
iteration: 2
owner: Justin Pagano (accountable) · Jai (operational)
---

# ISA — GRC Engineering Bootcamp Web App

> Static web app for the bootcamp, deployed to GitHub Pages at `bootcamp.grc.engineering`.
> Learner-facing course site + owner curriculum-health dashboard. Reads the SAME
> `modules/*/meta.yaml` + `module.md` the curriculum-as-code repo already owns — one source of truth.

## Problem

The curriculum exists as 16 markdown modules + 5 tracks + a rot dashboard in git, but there is no
human-facing way to *learn from it* or *see its health* in a browser. A learner has to read raw
markdown; an owner has to read a generated `.md` table. The content is excellent and already
structured (anatomy, meta.yaml, coverage matrix) — it just needs a front end that renders it,
guides a path through it, tracks progress, and surfaces curriculum rot.

**Wave 2 (2026-06-11):** the site renders the curriculum but a learner cannot *do* anything in it.
The labs assume a terminal the learner may not have (or may be afraid of); the pedagogy is
"learning by doing" and the app offers only reading. Wave 2 adds the doing: a simulation layer —
a mock terminal accurate enough that the same commands on a real machine produce the same outputs,
real WASM engines where they exist, and realistic structured simulations for the non-terminal
modules — driven by exercise specs owned by the curriculum repo, machine-verified task by task.

## Vision

A learner lands on `bootcamp.grc.engineering`, immediately gets the inversion thesis and the
irreducible loop, picks a track, and walks a personalized path through the modules — reading,
doing the lab, taking the assessment, marking progress — all in a fast, clean, technical reading
experience that feels like the curriculum's voice. An owner opens `/dashboard` and sees the
curriculum's own compliance state (green/amber/red by review-due) exactly like a control board.
Euphoric surprise: the training site is *itself* a live demonstration of GRC engineering — the
same meta.yaml that owns the module drives both the learner UX and the rot board.

**Wave 2:** a learner who has never touched a terminal opens Module 01's lab and a terminal is
*right there in the page* — seeded with the lab's files, waiting at `analyst@workstation:~$`. They
type `pwd`, then build the lab's three-command pipeline, and the task list checks itself off as
the simulated filesystem actually changes. Stuck, they take one hint rung instead of the answer.
Done, they run the same commands in a real terminal and get the same outputs — trust earned, fear
gone. Every module gives its own kind of doing: real Python, real SQL, real Rego, a SaaS API that
401s until auth is right and 429s until rate limits are honored, a CI gate that blocks the bad
Terraform change, a CCM loop that catches induced drift. Euphoric surprise: the doing is real —
verified-against-reality, not theater.

## Out of Scope (v1)

- No backend, no database, no server: GitHub Pages serves static files only.
- No auth and no cross-learner cohort telemetry — there is no server to aggregate to. Per-learner
  progress is **localStorage only**, on that browser. True multi-learner pass-rate aggregation
  (the curriculum's Loop-3 telemetry) is the deferred full-stack upgrade, explicitly NOT in v1.
- No content authoring in the app — modules are authored in markdown in the repo; the app renders.
- No automatic deploy this build — the Pages workflow is wired but firing it (publishing) needs
  explicit owner go + DNS for the custom domain.
- **Wave 2 additions:** no per-learner cloud sandboxes or real remote hosts (simulation is fully
  client-side). No full-coreutils emulation — the fidelity contract covers what the curriculum
  teaches and its labs require. No modal vim (a beginner-honest nano-class editor is in scope).
  No verbatim man pages (licensing; `--help` output is captured verbatim, `man` renders condensed
  original pages labeled as such). No grading backend or proctoring — completion is local and
  honest-by-design (revealed answers are recorded in local state). Placement "test-out in app"
  flow deferred to a later wave.

## Principles

- **One source of truth.** The app reads the repo's `modules/*/{module.md,meta.yaml}` + `tracks/`;
  it never forks or re-states curriculum data. A build-time sync bridges curriculum → Astro content.
- **Content-first, JS-last.** Static HTML for all reading; tiny interactive islands only where
  genuinely interactive (progress, track selector, dashboard). Works (degrades) without JS for reading.
- **The medium is the method.** The owner dashboard renders the curriculum's rot state from the
  same meta.yaml the CLI dashboard uses — CCM on the curriculum, in the browser.
- **Honest simulation or no simulation (Wave 2).** Every simulated output is either (a) replayed
  from a fixture captured on a real system, (b) produced by a real engine compiled for the browser,
  or (c) authored from cited documentation and flagged as such in fixture metadata. The simulator
  never invents plausible-looking output.
- **The engine is testable without a browser (Wave 2).** All simulation logic is DOM-free
  TypeScript exercised by `bun test`; the browser layer only renders and routes keystrokes.
- **Accessible doing (Wave 2).** The terminal is DOM-based (not canvas) so screen readers,
  keyboard-only users, and copy/paste all work — a deliberate trade against terminal-emulator
  convention, because this is a learning surface, not an ops surface.

## Constraints

- **Astro (static output) + bun + TypeScript + Tailwind + React islands.** No npm/npx.
- **GitHub Pages** hosting; custom domain `bootcamp.grc.engineering` (CNAME + `site` config, base `/`).
- Lives in `web/` inside the bootcamp repo; build-time `scripts/sync-content.ts` copies curriculum
  markdown + meta into `web/src/content/` with frontmatter — no Astro-loader-version coupling.
- Must build with `bun run build` (runs sync then `astro build`) producing `web/dist/` static output.
- Accessibility: semantic headings, keyboard-navigable, no color-only meaning (mirrors the a11y checklist).
- **Wave 2:** exercise specs are read from `modules/*/exercises/` via the same sync bridge (data,
  not code — the app never hardcodes exercise content). Simulation engines are pure TypeScript
  under `web/src/engines/` with zero DOM imports, covered ≥95% by `bun test`, fidelity-diffed
  against `.ci/fixtures/` ground truth. Heavy WASM engines (Python, SQL, OPA…) are self-hosted
  same-origin assets, lazy-loaded only when an exercise needs them; reading pages' JS budget must
  not regress. Zero runtime third-party network calls.

## Goal

Ship a static Astro site that renders all 16 modules (reading + lab + assessment) with a
track-aware learner path and localStorage progress, plus an owner dashboard showing curriculum
rot from meta.yaml — building clean via `bun run build`, deployable to GitHub Pages at
`bootcamp.grc.engineering`, with the curriculum repo as the single content source.

**Wave 2 (refined 2026-06-11):** additionally ship the interactive exercise layer — a
fixture-verified terminal simulation (Linux, macOS, PowerShell variants), real WASM engines
(Python, SQL, jq, Rego, Cedar, git), an in-browser mock SaaS API with a full auth ladder, and
structured simulations for the non-terminal modules — rendered by a spec-driven Lab Player with
machine-verified tasks, hint ladders, reset/persist, and full keyboard/screen-reader operability.
Done when all 16 module exercises run in the built site, the fidelity suite is green, and a
zero-terminal learner can complete Module 01's lab end-to-end in real Chrome (Interceptor-proven).

## Criteria

### Content pipeline (single source of truth)
- [ ] ISC-1: `scripts/sync-content.ts` reads all 16 `modules/*/module.md` + `meta.yaml` and writes `src/content/modules/*.md` with frontmatter
- [ ] ISC-2: sync also emits the 5 tracks + coverage matrix into `src/content/tracks/`
- [ ] ISC-3: synced module frontmatter carries title, tier, loop_stages, tracks, owner, volatility, review_due, status, objectives
- [ ] ISC-4: Anti: the app never hardcodes module data — every module page derives from synced content (grep: no module titles literal in pages)
- [ ] ISC-5: `content.config.ts` defines `modules` + `tracks` collections with a Zod schema that validates the synced frontmatter

### Build & config
- [ ] ISC-6: `bun install` resolves the dependency tree
- [ ] ISC-7: `bun run build` (sync + astro build) exits 0 and emits `web/dist/`
- [ ] ISC-8: `astro.config` sets `site: https://bootcamp.grc.engineering`, static output, base `/`
- [ ] ISC-9: `public/CNAME` contains `bootcamp.grc.engineering` (emitted to dist for the custom domain)
- [ ] ISC-10: typecheck/`astro check` is clean (no type errors in pages/islands)
- [ ] ISC-11: `.github/workflows/pages.yml` builds `web/` and deploys to Pages (fires only on push; not triggered here)

### Learner experience
- [ ] ISC-12: `/` renders the inversion thesis, the irreducible loop, the 4 tiers, the 5 tracks, and a "start here"
- [ ] ISC-13: `/modules/` lists all 16 modules grouped by tier with volatility + status + loop-stage badges
- [ ] ISC-14: `/modules/[id]` renders a module's full §1–8 body from synced markdown, with code highlighting
- [ ] ISC-15: a module page shows its objectives, lab, assessment, and §8 supplemental links distinctly
- [ ] ISC-16: every module id has a generated static route (getStaticPaths over the collection)
- [ ] ISC-17: `/tracks/` renders the 5 tracks + the coverage matrix (D/W/A per module)
- [ ] ISC-18: a track selector lets a learner pick a track and see their module path/depth highlighted

### Progress (localStorage)
- [ ] ISC-19: a module page has a progress control (not-started / in-progress / complete / placed-out) persisted in localStorage
- [ ] ISC-20: progress survives reload (read back from localStorage)
- [ ] ISC-21: Anti: progress writes never leave the browser (no network calls; static site)

### Owner dashboard
- [ ] ISC-22: `/dashboard` renders the curriculum rot table from module meta (volatility, review_due → green/amber/red)
- [ ] ISC-23: dashboard shows the same rot semantics as the CLI dashboard (overdue=red, <30d=amber, else green)
- [ ] ISC-24: dashboard shows the local learner's progress summary (overall % + per-track) from localStorage
- [ ] ISC-25: Anti: dashboard does NOT claim cross-learner cohort telemetry (it cannot; v1 is local-only) — states the boundary

### Design & a11y
- [ ] ISC-26: a shared Layout (nav + footer) wraps every page; consistent design system (Tailwind tokens)
- [ ] ISC-27: the reading experience matches the curriculum's technical/editorial voice (typography, spacing, code blocks)
- [ ] ISC-28: headings are semantic and sequential; no color-only meaning (rot states pair emoji/text + color)
- [ ] ISC-29: responsive (usable on mobile widths)
- [ ] ISC-30: reading pages are usable with JS disabled (islands enhance, don't gate, reading)

### Verification (Interceptor — mandatory for web output)
- [ ] ISC-31: home, a module page, tracks, and dashboard verified via Interceptor screenshots on a local preview
- [ ] ISC-32: console is free of errors on those pages (Interceptor network/console check)
- [ ] ISC-33: a module page deep-link loads directly (static route works without client routing)
- [ ] ISC-34: Anti: nothing is pushed/deployed without explicit owner "yes push/deploy"

### Wave 2 — Shell engine core (pure TS, DOM-free; added 2026-06-11)
- [ ] ISC-35: tokenizer handles single/double quotes + backslash escapes (unit-tested edge set)
- [ ] ISC-36: pipelines — `|` connects N stages stdout→stdin with correct propagation
- [ ] ISC-37: redirection — `>`, `>>`, `2>`, `2>&1`, `<` against the VFS
- [ ] ISC-38: exit-code tracking + `$?` expansion match bash semantics
- [ ] ISC-39: environment — `$VAR`/`${VAR}` expansion, `export`, seeded HOME/USER/PATH/PWD/SHELL
- [ ] ISC-40: globbing — `*`, `?`, `[...]` expand against the VFS with per-shell semantics: bash variant falls back to literal on no-match; macOS zsh variant errors `zsh: no matches found` (RedTeam finding 4)
- [ ] ISC-41: unknown command yields bash-exact `bash: <cmd>: command not found` + exit 127
- [ ] ISC-42: VFS nodes carry mode/owner/group/mtime/size; exec-bit enforced for `./script` (bash-exact `Permission denied` + 126)
- [ ] ISC-43: path semantics — absolute/relative, `.`/`..`/`~`, `cd` no-arg → home, `cd -`
- [ ] ISC-44: history — ArrowUp/Down recall + `history` builtin output format
- [ ] ISC-45: tab completion — commands and VFS paths (common-prefix + options on double-tab)
- [ ] ISC-46: prompt renders the module-prose canon `analyst@workstation:<cwd>$` with `~` abbreviation, live after `cd` — one prompt identity everywhere (prose, env contract, sim), no split-brain (RedTeam finding 4)
- [ ] ISC-47: `;`, `&&`, `||` sequencing with correct short-circuit
- [ ] ISC-48: Ctrl+C prints `^C` + fresh prompt; Ctrl+L and `clear` clear the screen
- [ ] ISC-49: scripts execute via `bash file.sh` and `./file.sh` (shebang + chmod +x path)
- [ ] ISC-50: heredoc (`<< EOF`) and command substitution `$( … )` for lab tasks
- [ ] ISC-51: nano-class editor opens/edits/saves VFS files with Ctrl+O/Ctrl+X semantics
- [ ] ISC-52: `man <taught cmd>` renders condensed original page labeled "condensed"; `--help` byte-matches captured output

### Wave 2 — Command fidelity (every probe = byte-diff vs `.ci/fixtures/` under `bun test`)
- [ ] ISC-53: navigation/inspection set green: pwd, ls (taught flag combos), cd, cat, file
- [ ] ISC-54: text-processing set green: grep (taught flags incl -q/-c/-i/-v/-n/-E/-r), wc, head, tail, sort, uniq, cut, tr
- [ ] ISC-55: awk taught-subset green (`'{print $N}'`, -F, patterns, NR/NF)
- [ ] ISC-56: sed taught-subset green (s///, -n p, d)
- [ ] ISC-57: find taught-subset green (-name, -type, -mtime, -exec as taught)
- [ ] ISC-58: file-management set green: mkdir -p, touch, cp -r, mv, rm -r/-f, ln -s, chmod (numeric + symbolic)
- [ ] ISC-59: system-inspection set green: ps (taught subset), id, whoami, uname -a, df -h, du -sh, env, which, date (frozen sim clock)
- [ ] ISC-60: module-02 Linux admin set green: systemctl status/enable/start (unit states), journalctl (taught filters), user mgmt (useradd/usermod/passwd as taught), apt scenario, ssh-keygen, sshd_config inspection
- [ ] ISC-61: module-03 macOS set green vs macos-host captures: sw_vers, csrutil status, spctl --status, fdesetup status, defaults read/write, profiles status, system_profiler SPConfigurationProfileDataType, log show (taught subset)
- [ ] ISC-62: macOS terminal variant: zsh prompt convention + taught BSD-flavor differences
- [ ] ISC-63: module-04 PowerShell sim green: PS prompt, object pipeline → default Format-Table behavior, Get-BitLockerVolume, Get-MpComputerStatus, Get-WinEvent (4625 subset), gpresult /R, Get-LocalGroupMember — authored fixtures each carrying citations
- [ ] ISC-64: PowerShell pipeline verbs taught-subset behaviorally correct (Select-Object, Where-Object, Sort-Object, Export-Csv, ConvertTo-Json), validated vs pwsh-in-docker captures where portable
- [ ] ISC-65: fictional GRC tools from module prose (e.g. collect-encryption-status) byte-match the module's §5 worked examples

### Wave 2 — Real engines (WASM, self-hosted)
- [ ] ISC-66: git engine — **synthesized-porcelain-over-real-plumbing** (honest class, RedTeam finding 6): isomorphic-git provides real state semantics (init/status/add/commit/log/branch/switch/merge fast-forward + clean 3-way); a TS porcelain renderer is fixture-verified against scripted real-git captures with pinned identity+dates (deterministic SHAs); scripted reference flows byte-match, learner free-form flows are state-verified; `git diff` rendered via plumbing+diff-lib and labeled; conflicted merges descoped or simulated-with-citation
- [ ] ISC-67: Python engine runs module-05 taught snippets with real CPython semantics; lazy-loaded on demand only
- [ ] ISC-68: Python exercise flow — learner edits a script in-app, taught test assertions run in-browser against it
- [ ] ISC-69: SQL console — real SQL engine with seeded evidence DB; module-07 taught queries return correct result sets
- [ ] ISC-70: jq engine — real jq evaluation for taught filters (modules 01/06 bridge)
- [ ] ISC-71: Rego — real OPA evaluation of **precompiled** policies (built by `opa build -t wasm` in CI; opa-wasm cannot compile learner source in-browser — RedTeam finding 5): exercises mutate input JSON against fixed policies + parsons/diff tasks on policy text, labeled honestly; free-form Rego authoring routed to the real-machine lab path; **Cedar is the live policy-authoring flagship** (cedar-wasm ships the full parser — matches teach-Cedar-first pedagogy)
- [ ] ISC-72: Cedar — faithful Cedar evaluation for module-09 taught policies
- [ ] ISC-73: Anti: all engines/WASM served same-origin (no CDN, no runtime third-party fetch)

### Wave 2 — API lab (module 06)
- [ ] ISC-74: in-browser mock SaaS API with realistic users/devices endpoints + stable JSON shapes
- [ ] ISC-75: auth ladder enforced — unauthenticated 401 → API key → bearer → OAuth2 client-credentials (token endpoint, expiry)
- [ ] ISC-76: pagination — complete evidence pull requires walking all pages (stable ordering, cursor/param as designed)
- [ ] ISC-77: rate limiting — 429 + Retry-After; honoring it is required for a complete pull
- [ ] ISC-78: taught curl/HTTPie invocations work against the mock API inside the terminal sim with byte-stable responses
- [ ] ISC-79: webhook exercise — simulated event delivery rendered in-app as taught

### Wave 2 — Structured simulations (non-terminal modules)
- [ ] ISC-80: module 00 — guided inversion exercise builds the week-0 before/after one-pager (exportable artifact)
- [ ] ISC-81: module 08 — IaC lab: seeded Terraform config, real-captured `terraform plan` output, real-captured scanner findings, CI-gate sim where the violation blocks and the fix unblocks
- [ ] ISC-82: module 10 — crosswalk builder: match TSC/ISO/CSF items to 800-53 families, machine-scored vs answer key
- [ ] ISC-83: module 11 — threat-coverage map: technique↔control mapping computes coverage + surfaces the zero-mitigation control
- [ ] ISC-84: module 12 — OSCAL lab: real schema validation of learner-assembled catalog/profile; dangling-ref fails as taught
- [ ] ISC-85: module 13 — CCM lab: scheduled checks, induced drift → evidence log + dashboard tile (current + 30-day history) + alert fires
- [ ] ISC-86: module 14 — build-vs-buy memo builder: 7-loop-stage scoring grid generates the decision-memo artifact
- [ ] ISC-87: module 15 — capstone assembler: 8-point contract checklist binds prior exercise artifacts into a portfolio view
- [ ] ISC-88: Anti: structured-sim domain data is original (third-party limited to §8 quarantine; ATT&CK IDs used with attribution per MITRE terms)

### Wave 2 — Lab Player UX
- [ ] ISC-89: LabPlayer island renders any exercise spec: intro, tasks, engine surface, progress
- [ ] ISC-90: tasks auto-verify live against sim state and flip complete with visible confirmation
- [ ] ISC-91: hint ladder per task (nudge → concept link → reveal); reveals recorded in local state
- [ ] ISC-92: reset-to-seed (confirmed) + state persists across reload (localStorage) + resume mid-exercise
- [ ] ISC-93: exercise completion feeds module progress store + dashboard summary
- [ ] ISC-94: terminal is DOM-based and screen-reader accessible with announcement DECOUPLED from transcript (RedTeam finding 7): throttled summarizing aria-live region ("command completed, 42 lines of output") + a non-live `role=log` transcript navigable by virtual cursor with "load earlier output" pagination; real input element; fully keyboard operable; spot-tested with VoiceOver against the messy-CSV and 10k-line cases before any conformance claim
- [ ] ISC-95: terminal feel — monospace, block cursor, scrollback, selectable/copyable text; stderr distinguishable without color alone
- [ ] ISC-96: exercise layout usable at 375 px width — terminal output horizontally scrolls, NEVER re-wraps (would falsify fixtures); heavy-engine exercises declare a desktop-class recommendation in-UI (RedTeam finding 12)
- [ ] ISC-97: prefers-reduced-motion respected; no flashing content
- [ ] ISC-98: exercises work offline after first load via service-worker precache of engine assets (claim only as tested) (RedTeam finding 12)
- [ ] ISC-99: Anti: zero runtime third-party network calls; learner state never leaves the browser
- [ ] ISC-100: Anti: reading-page JS budget not regressed (engines load only on exercise interaction)

### Wave 2 — Integration & build
- [ ] ISC-101: exercise specs flow through `sync-content.ts` from `modules/*/exercises/` (single source of truth)
- [ ] ISC-102: module pages surface their exercise with a clear "Interactive lab" affordance
- [ ] ISC-103: `/labs` index lists all 16 exercises with engine class + completion state
- [ ] ISC-104: `bun run build` exit 0; `astro check` 0 errors; all prior routes still render
- [ ] ISC-105: engine code ≥95% line/function coverage under `bun test`
- [ ] ISC-106: module reading pages' initial JS within budget (measured before/after)
- [ ] ISC-107: fidelity suite + exercise-lint wired into repo CI

### Wave 2 — Verification (Interceptor mandatory)
- [ ] ISC-108: Interceptor: Module 01 exercise completed end-to-end in real Chrome — commands typed, tasks check off, completion survives reload
- [ ] ISC-109: Interceptor screenshots: one exercise per engine class (linux-terminal, macos-terminal, powershell, git, python, sql, api, policy, builder) rendering correctly
- [ ] ISC-110: console free of errors + no failed requests on all exercise pages
- [ ] ISC-111: lab route deep-link loads directly (static)
- [ ] ISC-112: one full exercise completed keyboard-only (no pointer)
- [ ] ISC-113: cross-family review (Anvil) of engine architecture + sampled exercise specs; findings triaged
- [ ] ISC-114: Anti: no push/deploy without explicit owner "yes push" (standing)

### Wave 2 — IterativeDepth additions (2026-06-11: novice / boundary-honesty / maintenance / integrity lenses)
- [ ] ISC-115: Module 01 exercise opens with a dismissible guided first-input moment (e.g. "type `pwd`, press Enter") that never blocks typing
- [ ] ISC-116: coach/hint layer renders outside the terminal stream — terminal output stays fixture-pure (no injected pedagogy in-stream)
- [ ] ISC-117: per-task "restore lab files" affordance distinct from full reset (preserves history + completed tasks)
- [ ] ISC-118: paste into the terminal works (mouse + keyboard); Anti: no one-click "run for me" affordance for taught commands
- [ ] ISC-119: completed tasks display the evidence the checker used (file content/state/history that satisfied it)
- [ ] ISC-120: the simulated box's installed-command set is declared in the manifest; out-of-set commands produce the pinned container's REAL response (negative-space fixtures captured, not invented)
- [ ] ISC-121: destructive commands execute honestly in the VFS (`rm` really removes) with recovery affordance after
- [ ] ISC-122: stdin semantics bash-faithful: `cat` with no args waits, Ctrl+D sends EOF, Ctrl+C interrupts
- [ ] ISC-123: runaway protection — script loop caps with an honest sim-boundary message; ≥10k-line outputs render without UI freeze (paginated transcript per ISC-94, not destructive trim); `ls` columnization is width-parameterized — fixtures pin width 80, unit tests assert at 45/120 against `COLUMNS=N` captures; tty-ness explicit per manifest entry (RedTeam finding 9)
- [ ] ISC-124: local state size budgeted; localStorage quota exhaustion warns and degrades without corrupting progress
- [ ] ISC-125: completion records distinguish clean vs hint-revealed completion in local state + progress summary
- [ ] ISC-126: task verifier supports command-history constraint checks (e.g. pipes-only composition) beyond end-state checks
- [ ] ISC-127: verifier can re-run a learner's script in a clean sub-environment and diff outputs (reproducibility tasks) — deliberately perturbing sim clock/entropy between runs so determinism is a property of the learner's script, not the simulator; a `date`-contaminated anti-transcript must FAIL this check (RedTeam finding 8)
- [ ] ISC-128: WASM engine versions pinned + recorded in provenance; engine outputs participate in the fidelity suite

### Wave 2 — Signature mechanics (BeCreative 2026-06-11)
- [ ] ISC-129: Evidence Pack — every exercise completion appends a hash-chained local evidence record (commands, artifacts, timestamps, clean/revealed); exportable as `evidence-pack.json` + readable report; chain verifies
- [ ] ISC-130: the "one claim, sixteen ways" thread — exercise specs name their claim-thread connection where the module touches the laptop-encryption worked thread (≥10 modules); module 13's exercise re-runs the learner's (or reference) check script against drifted state
- [ ] ISC-131: cross-module learner artifacts persist (module-00's one-pager reaches module-15's capstone) via a local artifact store with export/import — survives the localStorage size budget

### Wave 2 — RedTeam amendments (2026-06-12, findings 8/10/12)
- [ ] ISC-132: sim clock is **simulated epoch + monotonic advance** (not frozen): starts at the seed epoch, advances with session time; `date; sleep 1; date` differs; seed-file mtimes defined relative to the epoch; Linux captures run under libfaketime at the seed epoch; module 13 uses a declared time-compression control
- [ ] ISC-133: verifier primitive registry at `web/src/verifiers/` — closed vocabulary, Zod-schema'd params, every primitive unit-tested; exercise-lint bans `expr:`/`js:`/`script:` fields in specs
- [ ] ISC-134: per-engine `payload_budget_bytes` declared in the manifest with a CI gate; Python wheels pinned to a stdlib+pytest allowlist
- [ ] ISC-135: heavy engines prefetch with a visible progress bar during intro dwell; one-heavy-engine-at-a-time teardown policy; VFS + editor buffers persist to IndexedDB on debounce (mobile jetsam protection)
- [ ] ISC-136: build emits a third-party-notices page; CI check rejects any shipped engine with an empty/unknown license field
- [ ] ISC-137: repo-owned lab validators (validate-crosswalk.ts, validate-coverage.ts, validate-oscal.ts, ccm-check.sh, expected_loss.ts, validate-capstone.sh) are ported client-side and verified equivalent against the same fixtures + expected outputs the CI lab-repro uses (byte-identical stdout + exit codes)

### Wave 2 — Profile, gamification & encrypted cross-device sync (owner directive 2026-06-12)
- [ ] ISC-138: local learner profile (display name, optional) stored browser-local only, shown in UI, included in the sync payload
- [ ] ISC-139: points + badges derived **deterministically** from completion state (recomputable pure function — no second source of truth); badge definitions are data in the curriculum repo; clean-completion (no reveals) earns distinct recognition
- [ ] ISC-140: sync payload = one versioned envelope of ALL learner state (module progress, exercise completions, evidence-pack chain, cross-module artifacts, profile, hint-reveal records)
- [ ] ISC-141: encryption: WebCrypto AES-256-GCM; key from user passphrase via PBKDF2-SHA-256 (≥600k iterations); fresh random salt (16B) + IV (12B) per export; envelope records kdf params + version; any ciphertext tamper is rejected (GCM auth)
- [ ] ISC-142: Anti: the passphrase is never persisted anywhere; plaintext learner state never leaves the browser; the sync flow makes zero third-party network calls except the optional user-configured transport (ISC-144)
- [ ] ISC-143: transport A — encrypted file download/upload + copy-paste armored text blob; round-trip into a fresh browser profile restores state exactly
- [ ] ISC-144: transport B (optional) — user's own private GitHub Gist via user-supplied fine-grained PAT (stored locally, never included in the payload): push/pull the same encrypted envelope; documented honestly as user-owned storage, not our service
- [ ] ISC-145: import merge semantics — per-module newest-wins with a visible summary; import never silently destroys local progress (confirmation + automatic pre-import local backup)
- [ ] ISC-146: sync verified end-to-end in real Chrome (Interceptor): export → import into a fresh profile → identical progress; tampered ciphertext rejected with a clear, non-cryptic error

## Test Strategy

| isc | type | check | threshold | tool |
|---|---|---|---|---|
| ISC-1/2/3 | sync | run sync; assert 16 module + track files with required frontmatter keys | all present | `bun` test |
| ISC-5 | schema | collection schema validates synced frontmatter | no zod errors | `astro check` |
| ISC-7 | build | `bun run build` exit code + dist exists | 0 / exists | `bun` |
| ISC-9 | config | `dist/CNAME` == bootcamp.grc.engineering | exact | `Read` |
| ISC-14/16 | render | module routes exist in dist; body rendered | 16 routes | build output / Interceptor |
| ISC-19/20 | progress | set progress, reload, read back | persists | Interceptor |
| ISC-22/23 | dashboard | rot table matches CLI dashboard semantics | match | Interceptor + compare |
| ISC-31/32 | visual | Interceptor screenshots + console clean on 4 pages | no errors | Interceptor |
| ISC-35..52 | engine | unit tests per feature (DOM-free) | all pass | `bun test` |
| ISC-53..65 | fidelity | byte-diff sim output vs captured/cited fixtures per manifest entry | 0 failures | `bun test` + fixtures |
| ISC-66..72 | engine | real-engine smoke: taught inputs → expected outputs | per engine | `bun test` (node/wasm) |
| ISC-73/99 | anti | grep dist for third-party origins; Interceptor net log | 0 external | grep + Interceptor |
| ISC-74..79 | api | mock-API integration tests (auth ladder, pagination, 429) | all pass | `bun test` |
| ISC-80..88 | sim | per-exercise spec playthrough tests (scripted task verification) | all pass | `bun test` |
| ISC-89..98 | ux | Interceptor interaction runs + a11y keyboard pass | per criterion | Interceptor |
| ISC-104/105 | build | build + check + coverage | 0 err / ≥95% | bun |
| ISC-106 | perf | compare module-page JS bytes before/after | no regression | build output diff |
| ISC-108..112 | e2e | scripted Interceptor playthroughs + screenshots | pass | Interceptor |

## Features

| name | description | satisfies | depends_on | parallelizable |
|---|---|---|---|---|
| content-bridge | sync script + collections (single source of truth) | ISC-1..5 | — | no (foundation) |
| app-foundation | Astro config, Tailwind, Layout, design system, build/deploy wiring | ISC-6..11,26,27 | content-bridge | no |
| learner-pages | home, modules index, module detail, tracks + coverage | ISC-12..18 | app-foundation | yes |
| progress-islands | localStorage progress control + summary | ISC-19..21,24 | app-foundation | yes |
| owner-dashboard | rot table from meta + local progress + boundary note | ISC-22..25 | content-bridge | partial |
| verify | Interceptor screenshots + console + deep-link + a11y | ISC-28..33 | all | no |
| shell-engine | tokenizer, VFS, pipes/redirects, builtins, line editor (pure TS) | ISC-35..52 | — | no (wave-2 foundation) |
| fidelity-suite | fixture loader + byte-diff runner + coverage report | ISC-53..65 | shell-engine | partial |
| wasm-engines | python/sql/jq/rego/cedar/git engine adapters, lazy-loaded | ISC-66..73 | — | yes (per engine) |
| api-lab | mock SaaS API + auth ladder + pagination + rate limit | ISC-74..79 | shell-engine | yes |
| structured-sims | 9 non-terminal exercise surfaces (00,08,10,11,12,13,14,15) | ISC-80..88 | lab-player | yes (per module) |
| lab-player | spec renderer, task verifier, hints, reset/persist, a11y | ISC-89..100 | shell-engine | no |
| integration | sync bridge, routes, budgets, CI wiring | ISC-101..107 | lab-player | partial |
| e2e-verify | Interceptor playthroughs + cross-family review | ISC-108..114 | all | no |

## Decisions

- 2026-05-28: Chose **Astro static** (over Next.js static-export / VitePress) — best markdown rendering, minimal JS, clean GitHub Pages fit; user deferred backend (no auth/DB), so static + localStorage is the right v1.
- 2026-05-28: **Build-time content sync** (`scripts/sync-content.ts`) bridges curriculum markdown+meta → Astro content collections, avoiding Astro-loader-version coupling and keeping ONE source of truth (the repo's modules/).
- 2026-05-28: **Custom domain `bootcamp.grc.engineering`** → `site` set to it, base `/` (root, not /repo/), `public/CNAME` emitted. DNS + Pages-enable + publish are owner steps, not taken here.
- 2026-05-28: v1 owner dashboard is curriculum-rot (build-time, from meta) + local progress only; cross-learner telemetry is explicitly deferred (no backend) — stated in-UI, not faked.
- 2026-05-28: Tier de-escalated classifier E4 → E3: the three architecture forks were resolved by owner answers, leaving substantial multi-file execution.
- 2026-06-11: **Wave 2 opened at E5** (interactive exercise layer). Engine architecture decision deferred to THINK/PLAN pending the design-inputs workflow (module command inventory + WASM engine research) — candidates: custom fixture-verified TS shell vs WASM bash (likely too heavy) vs xterm.js UI vs DOM terminal (leaning DOM for a11y). Canary: Module 01 end-to-end before fan-out.
- 2026-06-12: **Engine stack adopted** (from design-inputs research, 3 adjustments): custom TS shell over an in-engine VFS (v86/WebContainers rejected: weight/license/a11y); sql.js (~323KB, real SQLite — DuckDB rejected: 7MB + wrong dialect); opa-wasm + cedar-wasm (official builds); isomorphic-git + porcelain templated from docker captures, graded by repo state not output strings; jq-wasm (real jq); Pyodide **self-hosted** in a Web Worker (research suggested CDN — rejected, violates ISC-73 same-origin); DOM terminal everywhere (xterm.js only if the Python REPL truly needs VT — decide at build). PowerShell sim pinned to the module's committed fixtures as canon.
- 2026-06-12: **Fidelity canon hierarchy resolved** (prose-vs-reality divergence found in modules 04/05/07/08): (1) committed lab fixtures + happy-path.sh behavior are canonical; (2) real engine output beats module prose; (3) module-prose excerpts that diverge get labeled "representative output" in the UI; verification is outcome/state-based, never byte-match against prose. The §5 transcripts of module 01 ARE byte-canon (captured fresh).
- 2026-06-12: **Learner-script execution strategy**: the shell engine executes learner scripts through the same interpreter as interactive input (taught constructs only, declared honestly); awk = real-awk-in-WASM if a maintained build verifies, else taught-subset implementation — the fidelity gate over happy-path assertion tables is the acceptance test either way.
- 2026-06-12: **Owner directive (mid-build):** GitHub Pages deploy confirmed as target (publish still gated on explicit "yes push"); all user-specific data (progress, points/badges, profile) browser-local — already constitutional; NEW: cryptographically secure cross-browser sync. Design: client-side AES-256-GCM envelope (passphrase → PBKDF2-SHA-256 ≥600k), manual transports only (encrypted file/blob always; optional user-owned private Gist via local PAT) — no backend exists, so sync is learner-carried ciphertext; the curriculum's own evidence-integrity lesson applied to the learner's data. ISC-138..146 added. Gamification (points/badges) derived deterministically from completion — no second authority.
- 2026-06-12: **RedTeam amendments adopted** (12 findings, CONDITIONAL GO → GO): ISC-40/46/66/71/94/96/98/123/127 amended in place (IDs stable); ISC-132–137 added (epoch clock, verifier registry, payload budgets, prefetch+IndexedDB, license notices, validator porting). Prompt canon = `analyst@workstation` (module prose wins). Cedar promoted to live-authoring flagship; Rego via precompiled policies + input-mutation. Git engine honestly classed synthesized-porcelain-over-real-plumbing.
- 2026-05-29: **Rebrand to grc.engineering identity.** Extracted the EXACT palette from grc.engineering + cheatsheet.grc.engineering (orange `#ffa84f`/`#ff8c00`, blue `#1b95c1`/`#00a8e8`, signature orange→blue gradient; dark-tech surfaces `#0b0b1a`/`#0f0f23`/`#151530`). Replaced ALL site-chrome emoji with **Heroicons** (`astro-icon` + `@iconify-json/heroicons`) — rot status, arrows, section/nav glyphs; curriculum-prose `→` left intact (authored content). Theme is dark, glassy (backdrop-blur, translucent cards), Inter/JetBrains Mono, orange→blue gradient on headline/CTAs/active states. Verified: clean build (21 pages), astro check 0 errors, Interceptor screenshots of home/dashboard/module/tracks in real Chrome.

## Changelog

- 2026-05-28 — conjectured: a build-time sync into Astro content collections is simpler and more robust than a custom Astro content loader reading ../modules at runtime. refuted_by: (pending build). learned: (pending). criterion_now: ISC-1/ISC-5/ISC-7.

## Verification

2026-05-28 — built + Interceptor-verified against the **built `dist/`** (via `astro preview`, base `/`, matching production paths — not dev):

- ISC-1/2/3 (content bridge): `sync-content.ts` → 16 modules + 7 track files into `src/content/`, frontmatter quoted (dates as strings). ✓
- ISC-6 install: `bun install` resolved 404 packages (Astro 5.18.2, React 19, Tailwind 4). ✓
- ISC-7 build: `bun run build` exit 0, 21 pages, `dist/` emitted. ✓
- ISC-8/9: `astro.config` site=`https://bootcamp.grc.engineering`, base `/`, static; `dist/CNAME` = `bootcamp.grc.engineering`. ✓
- ISC-10 typecheck: `astro check` → 0 errors / 0 warnings / 0 hints. ✓
- ISC-12/13/14/15/16/17 (learner pages): Interceptor screenshots — home (thesis+loop+tiers+tracks), `/modules` (16 grouped by tier with volatility/loop/status badges), module-01 (full §1–8 body, shiki code blocks, tables), `/tracks` (picker + collapsible tracks + coverage matrix). 16 module routes built. ✓
- ISC-19/20 (progress): clicked "Complete" → `aria-pressed` flipped (e9=true, others false); after full reload still `Complete pressed=true` (localStorage persists). ✓
- ISC-21 (anti): no network calls on progress writes (static site; `progress.ts` is localStorage-only). ✓
- ISC-22/23/24/25 (dashboard): Interceptor screenshot — rot table 16 rows, 🟢16/🟡0/🔴0 with same overdue/30d/else semantics as `.ci/lib.ts`; progress summary "0/16 · 0%"; explicit amber boundary note that there is no cross-learner telemetry. ✓
- ISC-26/27/28/29 (design/a11y): shared Layout + Tailwind tokens; editorial reading style; rot states pair emoji+text+color; responsive utilities; progress buttons are native `<button>` with `aria-pressed` + `role=group`. ✓ (mobile-width spot-check deferred)
- ISC-31/32/33 (Interceptor): 5 pages screenshotted in real Chrome; `net log` showed no error/4xx/5xx lines; module deep-link navigated directly and rendered (static route). ✓
- Hardening from advisor: `public/.nojekyll` (anti-Jekyll-strip of `_astro/`) → `dist/.nojekyll` present; custom `404.astro` → `dist/404.html`; OG/theme-color meta; `web/README.md` handoff (content contract + run/deploy + the localStorage-self-only boundary).

Remaining (owner steps, not blockers):
- ISC-11 deploy: `pages.yml` wired (manual `workflow_dispatch`); NOT fired — publishing needs owner go + Pages-enable + DNS.
- ISC-34 (anti): nothing pushed/deployed. Holds.
- Future: relative-image asset handling (current modules embed none); `@astrojs/sitemap`; mobile-width pass.
