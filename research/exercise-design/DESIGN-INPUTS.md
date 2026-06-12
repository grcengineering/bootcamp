# GRC Engineering Bootcamp — Interactive Exercise Build: Design Inputs

> Synthesized 2026-06-11 from `inventory.json` (per-module command/lab/assessment inventories) and `research.json` (browser/WASM engine survey, learning-UX pattern survey, PowerShell fidelity survey), both in this directory.
>
> **Update 2026-06-12:** the original synthesis input covered modules 00–08 plus a truncated module 09. The inventory has since been re-run for modules 09–15 (`modules/*.json`) and merged into `inventory.json`, which now covers all **16 modules (00–15)** completely. The manifest in §1 and the engine-stack table in §2 are regenerated from the merged inventory; no rows are inferred or placeholder anymore.

---

## 1. Command Fidelity Manifest

Every command entry across the inventoried modules, grouped by **fidelity source** — i.e., where byte-accurate ground truth for the simulator comes from:

| Source | Meaning | Entries | Unique command rows |
|---|---|---|---|
| `docker-linux` | Deterministic bash/coreutils/awk behavior — capture golden transcripts by replaying in a pinned Ubuntu container | 146 | 96 |
| `real-engine-wasm` | A real engine runs in-browser (Pyodide/python+pytest, sql.js/SQLite, isomorphic-git, opa-wasm, cedar-wasm) — fidelity comes free from the engine itself | 22 | 22 |
| `authored-fixture` | Fictional commands, services, and APIs (lab-setup, collect-encryption-status, evidence-collector.service, acme.example API, scanner outputs) — output must be authored once and committed as canonical | 33 | 33 |
| `pwsh-authored` | Windows-only PowerShell cmdlets with no browser engine — output authored from Microsoft Learn verbatim blocks + one-time real Windows capture | 6 | 6 |
| `macos-host` | Byte-stable as captured on the authoring macOS host (module 03's fdesetup/csrutil/spctl/security, plus modules 10/12/13/14/15 lab scripts and TypeScript validators captured there) — the modules' committed fixtures/transcripts are the canonical strings | 42 | 40 |
| **Total** | | **249** | **197** |

Notes on reading the tables below: commands are listed as they appear in the inventory (some entries are scripts, HTTP endpoints, file-as-evidence targets, or concept bundles rather than bare binaries — that is deliberate, since each needs a fidelity decision). The same command name can appear under more than one source (e.g. `bash` is docker-linux ground truth in modules 00–03/06/07 but an authored-fixture wrapper in module 05's `labs/setup.sh` echo).

### authored-fixture (33 unique commands)

| Command | Platform | Modules |
|---|---|---|
| `(conceptual only: MDM device API call, version-control merge API, shell/API/SQL named abstractly)` | any | 00 |
| `./collect.sh` | linux | 15 |
| `Authorization header forms taught (auth ladder)` | api | 06 |
| `CSV editing of crosswalk rows (any editor; lab is editor-agnostic)` | any | 10 |
| `Collect-EndpointCompliance.ps1` | windows | 04 |
| `HTTP GET /api/v2/users (cursor-paginated list endpoint, simulated vendor)` | api | 06 |
| `HTTP POST /oauth/token (simulated vendor acme.example, OAuth2 client-credentials exchange)` | api | 06 |
| `HTTP error semantics (taught status-code vocabulary: 2xx parse, 401 authn, 403 authz/scope, 404 wrong address, 429 + Retry-After backoff, 5xx bounded retry; error body shape { "error": "...", "message": "..." }; cursor page shape { "data": [...], "pagination": { "total": 8, "next_cursor": "eyJwYWdlIjoyfQ==" } })` | api | 06 |
| `awk '{print ($3=="rc=0" ? "🟢" : "🔴")}' ./ccm-lab/evidence/ledger.log` | linux | 13 |
| `bash` | linux | 05 |
| `cat / open fixture files (inspection step, task 1)` | linux | 11 |
| `cat <file>` | any | 09 |
| `cat capstone-manifest.yaml` | linux | 15 |
| `cat labs/fixtures/state-compliant.json` | linux | 13 |
| `cat scoring-table.tsv / grep stage assertions` | any | 14 |
| `cat work/crosswalk.csv` | any | 10 |
| `cat work/spine-families.txt` | any | 10 |
| `checkov (real IaC scanner, optional task 6 / supplemental; fixtures are 'Checkov-shaped')` | linux | 08 |
| `collect-encryption-status` | linux | 01 |
| `collect-endpoint-evidence.sh (learner-authored packet collector)` | any | 03 |
| `evaluate.sh (learner-authored three-valued evaluator; reference implementation = evaluate() in labs/happy-path.sh)` | any | 03 |
| `evaluate_analysis` | linux | 00 |
| `evidence-collector.service` | linux | 02 |
| `lab-setup` | linux | 01 |
| `launchctl` | macos | 03 |
| `pip install compliance-trestle / trestle import / trestle validate (real-environment optional Task 7)` | python | 12 |
| `posture-service / audit-log records (CloudTrail, Config, Security Hub shaped JSON)` | other | 07 |
| `profiles` | macos | 03 |
| `prowler (supplemental cloud-posture scanner, mention only — no invocation)` | linux | 08 |
| `sshd_config (file-as-evidence-target)` | linux | 02 |
| `system_profiler` | macos | 03 |
| `terraform (taught as HCL language/concept only — the terraform CLI is never invoked anywhere in module, labs, or assessment)` | linux | 08 |
| `trivy (supplemental alternative scanner, mention only)` | linux | 08 |

### docker-linux (96 unique commands)

| Command | Platform | Modules |
|---|---|---|
| `--help convention` | linux | 01 |
| `./check.sh <access-export.csv>` | any | 09 |
| `./control-evidence.sh` | linux | 07 |
| `./run-policy-gate.sh <access-export.csv> <evidence-store-dir>` | any | 09 |
| `: (null builtin, creates the empty UNKNOWN fixture)` | any | 03 |
| `ConvertTo-Json` | windows | 04 |
| `Export-Csv` | windows | 04 |
| `Select-Object` | windows | 04 |
| `[pscustomobject]` | windows | 04 |
| `apt` | linux | 02 |
| `awk` | linux | 01, 02, 07 |
| `awk (gate's internal JSON extractor and CSV lookup — not taught as a user command but its semantics define gate output)` | linux | 08 |
| `awk (manifest parsing inside validate-capstone.sh)` | linux | 15 |
| `awk -F, '<rule>' <csv>` | any | 09 |
| `bash` | any | 03 |
| `bash` | linux | 00, 01, 02, 06, 07 |
| `bash gate.sh (lab gate script)` | linux | 08 |
| `bash happy-path.sh (CI smoke test, lab asset — not a learner task but defines machine-verification semantics)` | linux | 06 |
| `bash happy-path.sh (CI smoke test; awk fallback validator when bun absent)` | linux | 11 |
| `bash labs/happy-path.sh` | any | 09 |
| `bash labs/happy-path.sh (CI smoke test)` | linux | 08 |
| `bash labs/setup.sh` | linux | 08 |
| `bash labs/setup.sh "$PWD/capstone-lab"` | linux | 15 |
| `bash labs/setup.sh ./lab09` | any | 09 |
| `bash setup.sh ./work` | linux | 11 |
| `bun (bun:sqlite)` | any | 07 |
| `bun aggregate-mfa.ts (complete pull, both pages)` | any | 06 |
| `bun aggregate-mfa.ts (no args — usage error)` | any | 06 |
| `bun aggregate-mfa.ts (truncated pull, page 1 only — completeness guard)` | any | 06 |
| `cat` | any | 03 |
| `cat` | linux | 00, 01, 02, 05, 07 |
| `cat (implied by lab task 1 'Open fixtures/users-page-1.json')` | linux | 06 |
| `cat / file reading of fixtures` | linux | 08 |
| `cd` | linux | 00, 01, 05, 07 |
| `chmod` | linux | 01, 02, 07 |
| `chmod +x check.sh run-policy-gate.sh` | any | 09 |
| `chmod +x validate-capstone.sh` | linux | 15 |
| `cksum <file> (input_ref hash)` | any | 09 |
| `command` | linux | 05 |
| `coreutils used inside lab scripts (mkdir -p, cat<<heredoc, mktemp -d, trap, command -v, test -f, grep -q/-oE, printf, head)` | linux | 06 |
| `cp` | linux | 05 |
| `date -u +%Y-%m-%dT%H:%M:%SZ` | any | 09 |
| `diff` | any | 03 |
| `diff / cmp / sha256sum (implied by task 8 'run twice and confirm byte-identical reports'; module never names the command)` | linux | 06 |
| `dirname` | linux | 00, 01 |
| `dnf` | linux | 02 |
| `echo` | any | 03 |
| `echo` | linux | 00, 01, 02, 05, 06, 07 |
| `echo $?` | any | 09 |
| `echo $?` | linux | 15 |
| `echo $? (exit code as the verdict)` | linux | 11 |
| `echo $? (exit-code inspection)` | linux | 08 |
| `grep` | any | 03 |
| `grep` | linux | 00, 01, 02, 04, 05 |
| `grep (used by happy-path.sh assertions)` | linux | 08 |
| `grep -v removal of killed control from scope (the kill verdict, mechanically)` | linux | 11 |
| `happy-path.sh` | linux | 04 |
| `head` | any | 03 |
| `head` | linux | 04 |
| `http (HTTPie) — §8 supplemental only, named but never invoked; Postman/Hoppscotch likewise named as optional practice clients` | linux | 06 |
| `id` | linux | 02 |
| `journalctl` | linux | 02 |
| `labs/happy-path.sh` | linux | 07 |
| `labs/setup.sh` | linux | 07 |
| `ls` | linux | 01, 02, 05, 15 |
| `ls evidence-store/` | any | 09 |
| `man` | linux | 01 |
| `mkdir` | any | 03 |
| `mkdir` | linux | 00, 01, 02, 05, 07 |
| `mktemp` | any | 03 |
| `mktemp` | linux | 00, 01, 02, 04, 05, 07 |
| `printf` | any | 03 |
| `ps` | linux | 02 |
| `pwd` | linux | 00, 01 |
| `rm` | linux | 00, 07 |
| `sed` | linux | 04 |
| `sed (tamper edits on fixtures)` | any | 09 |
| `sed edit of coverage-map.csv to close the gap (happy-path's canonical fix)` | linux | 11 |
| `set` | linux | 00, 01, 05, 07 |
| `set / trap / cd / dirname / rm (harness shell plumbing in happy-path.sh)` | any | 03 |
| `setup.sh` | linux | 04 |
| `shell-operators (taught as core concepts, not commands)` | linux | 01 |
| `ssh` | linux | 02 |
| `sudo` | linux | 02 |
| `systemctl` | linux | 02 |
| `tail` | linux | 02 |
| `tee` | any | 03 |
| `test` | any | 03 |
| `test` | linux | 00, 01, 02, 05, 07 |
| `tr` | linux | 04 |
| `trap` | linux | 00, 01, 02, 05, 07 |
| `useradd` | linux | 02 |
| `usermod` | linux | 02 |
| `validator output redirection to capture files` | linux | 11 |
| `wc` | linux | 01 |
| `yum` | linux | 02 |

### macos-host (40 unique commands)

| Command | Platform | Modules |
|---|---|---|
| `./validate-capstone.sh capstone-manifest.yaml` | linux | 15 |
| `./validate-capstone.sh capstone-manifest.yaml \| tail -1` | linux | 15 |
| `awk Monte-Carlo-lite (frequency x magnitude sampling, histogram p95)` | linux | 14 |
| `bash happy-path.sh (CI smoke test; awk re-implementation of the validator)` | linux | 10 |
| `bash labs/happy-path.sh` | linux | 13, 14, 15 |
| `bash labs/happy-path.sh (CI smoke test, 5 assertions)` | any | 12 |
| `bash labs/setup.sh` | linux | 14 |
| `bash labs/setup.sh ./ccm-lab` | linux | 13 |
| `bash labs/setup.sh ./lab12` | any | 12 |
| `bash setup.sh ./work` | linux | 10 |
| `bun ... > lab12/oscal-validation-pass.txt (capture clean run to deliverable file)` | any | 12 |
| `bun expected_loss.ts` | any | 14 |
| `bun expected_loss.ts fixtures/risk-input.json` | any | 14 |
| `bun validate-crosswalk.ts <crosswalk with invalid relationship label> (bad-relationship -> FAIL)` | any | 10 |
| `bun validate-crosswalk.ts <crosswalk with non-spine family row> (unknown-family -> FAIL)` | any | 10 |
| `bun validate-crosswalk.ts <crosswalk.csv> [spine-families.txt] (seed file with planted orphan -> FAIL)` | any | 10 |
| `bun validate-crosswalk.ts <resolved crosswalk> (orphan resolved -> PASS)` | any | 10 |
| `bun validate-oscal.ts (missing args, usage error, exit 2)` | any | 12 |
| `bun validate-oscal.ts <broken-catalog.json> <profile.json> <component.json> (control id removed, exit 1)` | any | 12 |
| `bun validate-oscal.ts <catalog.json> <dangling-profile.json> <component.json> (profile includes ac-9 the catalog does not define, exit 1)` | any | 12 |
| `bun validate-oscal.ts <catalog.json> <profile.json> <component.json> (well-formed set, exit 0)` | any | 12 |
| `cat ./ccm-lab/evidence/run-20260520090000.evidence` | linux | 13 |
| `cat fixtures/risk-input.json` | any | 14 |
| `csrutil` | macos | 03 |
| `echo $?` | linux | 13 |
| `echo $? (exit code as machine-readable verdict, after validator runs)` | any | 10 |
| `echo $? (inspect validator exit code after a run)` | any | 12 |
| `emit_evidence <state-json-file> <evidence-dir>` | linux | 13 |
| `evaluate_control <state-json-file>` | linux | 13 |
| `fdesetup` | macos | 03 |
| `grep -o '"frequency"[^}]*}' fixtures/risk-input.json` | any | 14 |
| `grep <pattern> ledger.log / evidence records` | linux | 13 |
| `ls ./ccm-lab/evidence` | linux | 13 |
| `normalize_buckets <state-json-file>` | linux | 13 |
| `security` | macos | 03 |
| `sed 's/"ac-2"/"ac-9"/' acme-profile.json > acme-profile-dangling.json (CI's mechanical version of lab Task 6's hand edit)` | any | 12 |
| `source ./ccm-lab/ccm-check.sh` | linux | 13 |
| `spctl` | macos | 03 |
| `tail -1 ./ccm-lab/evidence/ledger.log` | linux | 13 |
| `validation-before.txt / validation-after.txt capture (redirect validator output to file)` | any | 10 |

### pwsh-authored (6 unique commands)

| Command | Platform | Modules |
|---|---|---|
| `Get-BitLockerVolume` | windows | 04 |
| `Get-ItemProperty` | windows | 04 |
| `Get-LocalGroupMember` | windows | 04 |
| `Get-MpComputerStatus` | windows | 04 |
| `Get-WinEvent` | windows | 04 |
| `gpresult` | windows | 04 |

### real-engine-wasm (22 unique commands)

| Command | Platform | Modules |
|---|---|---|
| `SQL (SELECT/WHERE/GROUP BY/COUNT/SUM/CASE/ROUND)` | sql | 07 |
| `bun validate-coverage.ts (map containing an invalid mitigation label — honesty negative test)` | any | 11 |
| `bun validate-coverage.ts (other validator error branches, verbatim from source)` | any | 11 |
| `bun validate-coverage.ts <coverage-map.csv> [prioritized-threats.txt] [controls-in-scope.txt]` | any | 11 |
| `bun validate-coverage.ts work/coverage-map.csv (resolved map, dead control removed from scope)` | any | 11 |
| `cedar authorize / cedar validate (optional real engine)` | any | 09 |
| `git` | git | 06 |
| `git add` | git | 05 |
| `git commit` | git | 05 |
| `git config` | git | 05 |
| `git init` | git | 05 |
| `git init (optional task 6, real environment)` | git | 08 |
| `git log` | git | 05 |
| `git push` | git | 05 |
| `git switch` | git | 05 |
| `jq — referenced only as prior-module callback ('JSON ... jq's raw material'); never invoked in this module` | any | 06 |
| `opa eval / opa test (optional real engine)` | any | 09 |
| `pip` | python | 05 |
| `pytest` | python | 05 |
| `python` | python | 05 |
| `python3` | python | 05 |
| `sqlite3` | any | 07 |

---

## 2. Recommended Engine Stack per Module

Primary interaction / engines / sim state, from each module's `exercise_design` block. All 16 modules are now covered by the merged inventory (see update note above); rows 09–15 are taken directly from the re-run inventory's `exercise_design` data.

| # | Module | Primary interaction | Engines | Sim state (condensed) |
|---|---|---|---|---|
| 00 | What GRC Engineering Is | mixed (concept drills + artifact builder) | none (JS port of `evaluate_analysis()` validator) | VFS: read-only exemplar + counterexample + editable template with 5 section headings; authored data tables (5 problems, 5 principles, arrow/loop tokens, vignettes); export of the capstone-bound artifact is essential |
| 01 | Terminal & CLI Basics | terminal-sim | shell-sim-linux (real bash+coreutils WASM strongly indicated — learner-authored scripts must execute) | POSIX shell over VFS, HOME=/home/analyst (evidence/ reports/ scratch/), prompt with ~-collapse, $?/pipes/redirection as first-class state; fictional `lab-setup` + `collect-encryption-status` on PATH; separate access.csv vs access-export.csv fixtures |
| 02 | Linux System Fundamentals | mixed (terminal + evidence-writeup builder) | shell-sim-linux (stateful system model) | Simulated Ubuntu host web-01: VFS with mode/owner/size metadata, /etc/passwd + /etc/group (sudo gid 27), process table (sshd PID 742), systemd unit registry, journald store, apt DB, sshd_config with `#PasswordAuthentication yes` decoy; scripted SSH/sudo dialogues |
| 03 | macOS Fundamentals | mixed (matching + terminal + code-editor) | shell-sim-macos, shell-sim-linux | Mocked macOS endpoint (zsh prompt, user analyst) returning the committed fixture strings; parameterized device state (FileVault/SIP/Gatekeeper/MDM + one empty-output gap); `bash labs/setup.sh` materializes 7 samples byte-exactly; real coreutils subset (tee, grep -Eqi, diff -q, redirections) |
| 04 | Windows Fundamentals | mixed (PowerShell terminal + script editor) | powershell-sim (object-pipeline interpreter + faithful default-table formatter), shell-sim-linux (optional CI-side add-on) | WIN-LAB04 as typed object store per subsystem (BitLocker, Defender, registry, Security log w/ 3×4625, Administrators group), elevation flag, authored gpresult fixture, frozen clock, writable C:\Users\labuser; non-compliant re-seed for assessment |
| 05 | Programming & Git | mixed (3-pane: editor + terminal + PR panel) | python-wasm (Pyodide + pytest), git-engine, shell-sim-linux, http-mock-api (forge mock) | ~/lab05 VFS with 5 byte-exact evidence fixtures; Pyodide FS mirror so learner code runs against real files; real git objects + in-memory origin; GitHub-style PR state with scripted reviewer persona |
| 06 | API Fundamentals | mixed (3-act: API client panel + terminal + editor/git) | http-mock-api, shell-sim-linux, git-engine | Mock acme.example (OAuth token, cursor pagination advertising total:8, stateful 401/403/404/429+Retry-After/5xx); VFS with setup.sh/aggregate-mfa.ts/happy-path.sh; `bun` = type-stripped aggregator executed in the browser JS engine (byte-identical output/exit codes); parametrized assessment fixture generator |
| 07 | Data & Cloud Control Plane | mixed (3-pane: terminal + SQL console + evidence notebook) | shell-sim-linux (real awk required — e.g. goawk-wasm), sql-wasm | VFS with labs/setup.sh + happy-path.sh, fixtures NOT pre-created (running setup is gate zero); line-shaped JSON fixtures preserved byte-exactly; SQLite-wasm preloaded with evidence(control,status) from the same CSV; determinism byte-diff gate |
| 08 | IaC & Scanning in CI | mixed (terminal + widgets + mock CI panel) | shell-sim-linux (JS port of gate.sh validated against 4 captured outputs), git-engine | VFS seeded exactly as setup.sh leaves ./lab08 (2 checkov JSONs, control-map.csv, 2 .tf files, gate.sh +x); env-var prefix + $? + redirection; pinned UTC clock for evaluated_at; assessment variant: generated fixture pair + blanked control-map rows in an editor |
| 09 | Policy as Code | mixed (policy editor + terminal + structured builders) | terminal-sim (bash over lab09/ VFS), policy-editor (Cedar + Rego panes; opa-wasm and cedar-wasm both ship real WASM builds for genuine evaluation), code-editor (author check.sh / run-policy-gate.sh against a happy-path.sh assertion harness), structured-builder (evidence-record assembly, tool-fit classification, rot diagnosis) | VFS seeded with the exact committed fixtures (both CSVs incl. the revokeRole trap row, policy.cedar, policy.rego, rotted-policy.txt, reference scripts) plus evidence-store/ the simulated gate writes into; tracks exec bits, last exit code, and accumulated JSON evidence records with GATE_FAKE_TIME-style fixed timestamps; CSV verdict logic (deny iff action==grantRole && resource_role==legacy-admin, skip header, exit 1 iff count>0) is trivially portable to JS with 100% fidelity |
| 10 | The Standards Spine | mixed | terminal-sim, code-editor, structured-builder, matching-mapping | VFS seeded exactly as setup.sh produces it: work/spine-families.txt (20 families) + work/crosswalk.csv (header + 4 seed rows incl. the planted PCI4,6.3.2 orphan); validate-crosswalk.ts is dependency-free and ported byte-identically to client-side JS so `bun validate-crosswalk.ts` yields the real summary line, FAIL/PASS sections, and exit codes against the learner's current CSV; tracks cwd, mutable crosswalk.csv (editor pane), command history, $?, redirection to validation-before/after.txt |
| 11 | Threat-informed GRC & Systems/Design Thinking | mixed | terminal-sim, matching-mapping, structured-builder, code-editor | Editable workspace holding the four fixtures live (prioritized-threats.txt, controls-in-scope.txt, coverage-map.csv) plus learner-authored markdown artifacts (removal-recommendation.md, interview-notes.md, redesigned-control-flow.md, validation captures); the ~60-line validator (coverage gaps, zero-threat controls, label-vocabulary check, unknown-threat check) reimplemented client-side byte-identical to validate-coverage.ts and always evaluated against CURRENT state so fail-then-pass is genuine, not scripted |
| 12 | OSCAL & Compliance-as-Code | mixed | code-editor, terminal-sim, structured-builder, matching-mapping | VFS seeded with the five lab12 JSON fixtures + working directory; validate-oscal.ts is plain dep-free Bun/TS, so a faithful client-side port gives real-engine fidelity — any learner edit to any JSON file produces the genuinely correct PASS/FAIL/usage output and exit code (0/1/2); also sims bash labs/setup.sh, echo $?, output redirection (> file), cat/ls; tracks last exit code |
| 13 | Continuous Controls Monitoring | mixed | terminal-sim, code-editor, dashboard-sim, structured-builder | ./ccm-lab dir: read-only ccm-check.sh (real committed library text), evidence/ mutated by emit_evidence, and the four state-*.json fixtures; sim implements bash builtins + the lab contract (source, evaluate_control, emit_evidence, echo $?, ls/cat/tail/head/grep/awk/wc/diff) as pure fixture→(stdout/stderr, exit code, FS mutation) functions replayed byte-identically (PASS/FAIL/ERROR lines, run-*.evidence, ledger.log appends, alert-*.txt); extra 31-row ledger.log variant (30×rc=0 + 1×rc=1) for the dashboard tile; simulated scheduler + cloud console (bucket-flag toggles + time-advance button) for the capstone |
| 14 | Product Ownership & Build-vs-Buy | mixed | terminal-sim (setup.sh, cat/jq fixture, bun expected_loss.ts, happy-path.sh), code-editor (risk-input.json ranges; expected_loss.ts source view), structured-builder (product card, seven-stage BUILD/BUY/HYBRID scoring table, boundary argument, memo assembler), dashboard-sim (live loss-distribution histogram, mean vs p95 tail) | Virtual lab dir {labs/setup.sh, labs/expected_loss.ts, labs/fixtures/risk-input.json, learner-created decision-memo.md + scoring-table.tsv}; risk-input document model (frequency/magnitude ranges, iterations, seed) shared between editor and calculator; deterministic LCG sampler is an exact JS port of expected_loss.ts (it IS TS) so every run is bit-identical to the real tool; memo model accumulating the five parts; scoring-table state validated with the same assertions as happy-path.sh |
| 15 | Capstone: Ship One Control, Fully Engineered | mixed — re-opens the learner's module-00 artifact (`legacy-vs-engineered-<control>.md`) as the "before" half of the program-long before/after diff | terminal-sim, code-editor, structured-builder, matching-mapping | Capstone repo VFS seeded exactly from setup.sh (9 files incl. the complete manifest fixture) + the incomplete-manifest fixture for negative/diagnosis exercises; tracks file contents (manifest YAML, control-statement.md, README.md, before-after.md, ccm.yml, collect.sh, rego policy), exec bits, validator invocation history with exit codes, validator file hash (gate-gaming detection), and evidence/ accumulating run-<timestamp>.json; faithful validate-capstone.sh sim (awk loop_coverage parsing, per-stage `  %-11s ok  -> %s` alignment, both MISSING variants, before/after check, exit codes 0/1/2); requires persistent learner-artifact storage across modules (export/import or localStorage/IndexedDB) |

### Engine implementation choices (from the verified mid-2026 survey)

| Engine label | Concrete implementation | Payload (brotli) | Notes |
|---|---|---|---|
| shell-sim-linux / shell-sim-macos | Custom TypeScript shell simulator over `@isomorphic-git/lightning-fs` VFS, CI-verified against golden transcripts from a pinned Ubuntu container; escalate to real bash+coreutils-in-WASM only for modules where arbitrary learner scripts must execute (01, 03 tasks 4–5, 07) | ~KBs (custom) | Do NOT use v86 (multi-MB images, no a11y) or WebContainers (commercial license, COOP/COEP, Node-centric) |
| powershell-sim | Custom constrained PowerShell grammar + object pipeline + faithful default-formatter (right-aligned numerics, dash rules, 4-vs-5 property table/list rule, width truncation/column dropping) | custom | Golden outputs from MS Learn verbatim blocks + one-time Windows 11/PS 5.1 capture; `mcr.microsoft.com/powershell` container as regression oracle for portable cmdlets only |
| python-wasm | Pyodide **314.0.0** via jsDelivr CDN in a Web Worker; pytest **9.0.2** preinstalled | ~6–7 MB | Too big to bundle; pin indexURL; pre-warm at lab load |
| sql-wasm | sql.js **1.14.1** (real SQLite), self-hosted in Astro `public/` | 323 KB | Dialect-correct; skip DuckDB-WASM (~7 MB, PostgreSQL dialect) |
| git-engine | isomorphic-git **1.38.4** + lightning-fs **4.6.2**; `git diff` surface built with statusMatrix/readBlob + a JS diff lib | small | Porcelain text must be templated from docker captures; verify by repo state, not output match |
| policy engines | `@open-policy-agent/opa-wasm` **1.10.0** (policies precompiled in CI via `opa build -t wasm`) + `@cedar-policy/cedar-wasm` **4.11.1** (official AWS build, dynamic import) | ~1 MB + 1.23 MB | Pin opa-wasm (last release Nov 2024) and smoke-test against the CI OPA compiler version |
| jq | jq-wasm **1.1.0-jq-1.8.1** (real jq 1.8.1) | 439 KB | Prefer over jq-web |
| http-mock-api | Pure client-side request router (no backend) for acme.example + GitHub-style forge/CI mocks | ~KBs | Author 401/403/404/429 bodies to the documented `{error, message}` shape |
| Terminal UI | DOM-based accessible terminal (aria-live log + native input) as default; `@xterm/xterm` **6.0.0** with screenReaderMode only where ANSI/VT fidelity is required (Pyodide REPL) | ~KBs / moderate | Accessibility-first default |
| Hosting | Astro React islands (`client:visible` + dynamic import), heavy engines in Web Workers; no COOP/COEP needed | — | Deploys to any static host incl. GitHub Pages; self-host everything except Pyodide |

---

## 3. Ten Learning-UX Patterns to Adopt

1. **State-based auto-verification with a Check button** (killercoda/Instruqt). Every step ships a verify routine asserting on the *result* in the environment — file contents, exit codes, repo state — never on the command typed. Doubly apt for GRC: verifying control outcomes rather than procedures *is* auditing, so the lab mechanic teaches the discipline's core mental model for free.

2. **Diagnostic failure messages that name the gap, not the answer** (Instruqt fail-message pattern). Branch the verifier on *which* assertion failed and emit a targeted message instead of a generic "incorrect." The inventoried CI scripts already define these strings (e.g. module 00's two-space-indented `  missing legacy problem: <p>` lines) — reuse them verbatim as free contextual micro-hints.

3. **Productized hint ladder: nudge → concept → command → full solution** (Codecademy Get Unstuck + TryHackMe + SQLBolt). Three to four escalating reveals behind explicit clicks, conceptual review offered before answer code, and a per-step solution floor so no one dead-ends. Optionally mark assisted completions rather than blocking them — finishing with help beats quitting.

4. **Show-goal with a diffable target state** (Learn Git Branching "show goal"/"show solution"). Show the expected SQL result table, the target policy evaluation outcome, the expected response shape — and let learners diff current vs. goal on demand. GRC work is gap analysis; make the lab UI a gap-analysis tool.

5. **Reset and undo affordances on disposable sandboxes** (Learn Git Branching + iximiuz). Per-step "reset this step" (re-run setup) and per-lab "fresh environment" buttons, one click, instant. A learner who can't break anything permanently will experiment instead of copy-pasting.

6. **One concept per step, later steps hidden** (Flexbox Froggy + Bandit + HTB Guided Mode). Each step introduces exactly one new idea while interleaving earlier ones, and future questions stay unrendered until the current one passes — visible upcoming steps leak spoilers and inflate perceived workload.

7. **Earned evidence artifacts as completion gates** (Bandit password gating, adapted). Each lab yields a unique token — a hash of the correct query result, a value only the correctly-authenticated API call returns — submitted to advance. Tamper-resistant cheap verification, and framed as "evidence collection" it rehearses exactly what GRC engineers do for auditors.

8. **Dual guided/adventure mode on the same labs with shared progress** (HTB Guided Mode). Author every lab as a scenario brief plus an optional guided overlay of checkpointed tasks. This serves mixed cohorts from one content investment and yields the timed assessments (guided labs run in adventure mode against fresh fixtures) for free — exactly matching the inventory's per-module assessment design.

9. **Post-success "why this worked" reinforcement** (Codecademy concept review + Missing Semester philosophy). The green-check moment is peak receptivity: show a 3–5 line explanation connecting the action to the control objective and framework citation (SOC 2 CC6.1 / NIST AC-6), optionally with an efficiency note. Without it learners pattern-match commands without forming GRC judgment.

10. **Placement test-out at entry, spaced mixed-review after** (Educative/Study.com + Boot.dev Training Grounds). Open with a short hands-on diagnostic that lets experienced learners skip foundations module-by-module, then schedule short mixed-review labs resurfacing earlier skills weighted toward each learner's past failed checks — one-shot lab completion decays without interleaved retrieval.

---

## 4. Open Fidelity Risks & Mitigations

| # | Risk | Affected modules | Mitigation |
|---|---|---|---|
| 1 | **PowerShell simulation has no real engine.** No production PowerShell-on-WASM exists; all five evidence cmdlets are Windows-only (absent even from the Linux pwsh container — verified); the module's own ConvertTo-Json sample matches no real PowerShell; PS 5.1 vs 7 differ in prompt, truncation glyph, Get-Process columns, JSON formatting. | 04 | Build an object-pipeline interpreter + faithful default-formatter (rules, not canned strings); pin the simulated environment to Windows PowerShell 5.1, culture en-US; author golden outputs from MS Learn verbatim blocks + one-time Windows 11/PS 5.1 capture (GitHub Actions `windows-latest` is the scriptable route); use the pwsh Linux container (`--platform linux/amd64`) only as a regression oracle for portable pipeline semantics. |
| 2 | **Arbitrary learner-authored script execution.** Tasks in 01 (task 7 + assessment), 03 (tasks 4–5), and 07 require running learner-written bash/awk; a pattern-matching shell sim cannot grade these, and hand-rolled awk will break on POSIX match()/RSTART arithmetic. | 01, 03, 07 (and any later module reusing the pattern) | Use real bash+coreutils compiled to WASM (or a complete-enough interpreter) for these modules; use a real awk build (e.g. goawk-wasm); fallback: restructure as guided code-builder steps whose semantics the engine implements natively, validated against the happy-path.sh assertion tables. CI snapshot-tests replay every manifest command in an Ubuntu container and diff against the sim. |
| 3 | **systemd/journald/apt golden capture.** Standard docker containers have no systemd; systemctl/journalctl formatting varies by distro/version; the evidence-collector unit is fictional; interactive ssh/sudo/editor flows can't run for real in a static site. | 02 | One-time capture from a systemd-enabled Ubuntu 24.04 privileged container or VM with the exact scenario constants seeded (web-01, PIDs 742/1402, uids 1001/1002, gid 27, file sizes 3243/411, frozen May 27 2026 timestamps); author the fictional unit file so status output is real; script ssh/sudo handshakes as dialogues; support sed/tee/append or a simplified editor instead of vim. |
| 4 | **Module prose diverges from real engine/script output.** Verified cases: module 05's stylized json.dumps block, module 07's prettified SQL table vs raw sqlite3 list mode, module 08's padded gate output missing header lines, module 04's ConvertTo-Json sample. Matching the prose would teach falsehoods. | 04, 05, 07, 08 | Simulate the *real* engine/script output (the repo's executable assets are canonical and several were already byte-captured); label module excerpts "representative output" in the UI; verification must be token/outcome-based, never byte-match against module prose. |
| 5 | **Judgment-dependent grading at scale.** Every module carries free-text deliverables (falsifiable claims, reflections, walkthroughs, defenses) the CI rubrics check only structurally — the validators are gameable floors, not grades. | All (00–15) | Present deterministic validators explicitly as the structural floor; convert what's convertible to structured widgets (matching, MCQ, line-pickers, ordered sorting); apply keyword gates + optional LLM rubric for the rest; never block progression on style. |
| 6 | **Fictional commands/services/APIs have no ground truth.** `lab-setup`, `collect-encryption-status` stdout, `evidence-collector.service`, acme.example OAuth/429 bodies, gpresult fixture, "Checkov-shaped" scan JSON (real checkov lacks the per-check severity field). | 01, 02, 04, 06, 08 | Author each once, commit as canonical fixtures in the repo, and snapshot-test the sim against them; follow module 03's stance — committed fixtures, not any particular real machine, are the byte-fidelity target; never live-capture scanner output that would contradict the module's idealized fixtures. |
| 7 | **git porcelain text and hash nondeterminism.** isomorphic-git manages state but prints no CLI text; real engines produce non-module hashes; `git push` output is unspecified. | 05, 06, 08 | Render porcelain from docker-captured templates over real engine state; verify via repo state (branches, merge-commit parents, tree contents) rather than output strings; pin GIT_AUTHOR_DATE/COMMITTER_DATE for reproducible demos; accept any hash in graders. |
| 8 | **GNU vs BSD and terminal-rendering divergence.** `wc -l` padding, `ls` two-space columns, prompt ~-collapse, terminal width and colorless output are all load-bearing in module 01's verbatim transcripts. | 01 (and shell sims generally) | All golden transcripts from docker-linux (never macOS host) despite the module permitting macOS terminals; pin terminal width and color-off; implement the prompt template exactly; treat the §5.1–5.4 transcripts as the sim's fidelity test suite. |
| 9 | **Heavy/slow engine payloads and bundled docs.** Pyodide ~6–7 MB brotli with slow pytest start; full Ubuntu man pages are heavy. | 05 (Pyodide), 01 (man) | CDN + Web Worker + pre-warm Pyodide on lab load behind `client:visible`; pre-install pytest at load; ship authored condensed man pages (or real text without the pager) and document the fidelity tradeoff. |
| 10 | **Inventory gap — RESOLVED 2026-06-12.** The module inventory was re-run for 09–15 and merged into `inventory.json`; §1–§2 above now cover all 16 modules. Remaining tail of this risk: module 15 re-opens the learner's module-00 artifact, so cross-module artifact persistence is a hard dependency. | 15 (residual) | Design persistent learner-artifact storage (export/IndexedDB) now so module 00's capstone-bound artifact survives to module 15. |

---

*Files: `/Users/p4gs/Code/grcengineering/bootcamp/research/exercise-design/inventory.json`, `research.json`, `DESIGN-INPUTS.md` (this file).*
