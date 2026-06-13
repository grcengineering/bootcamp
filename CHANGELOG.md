# Changelog

All notable changes to the GRC Engineering Bootcamp curriculum. The curriculum is GRC-engineered:
this file is its versioned change record, and retired modules get a tombstone here (never silently abandoned).

## [Unreleased]

### 2026-06-13 — Wave 4: IT-foundations band integrated (modules 16–25)

- **Ten Tier-1 IT/internet-foundations modules added** (16–25): networking, databases, web-app
  architecture, API paradigms, cloud shared responsibility, containers/virtualization, applied
  crypto/PKI, identity protocols, how-the-internet-works, logging/observability. Each is framed by
  its **loop question** — *where does a control claim's truth physically live, travel, and how do I
  read it* — never "learn this stack." Authored + reviewed in Wave 3; integrated here.
- **Visual engine generalized to the full band.** The PEEL / TRACE / MAP / build-and-break /
  diff-the-trace surface (`web/src/components/lab/VisualSurface.tsx` + `sessions/visual-host.ts`)
  now backs all ten, driven by 18 real-bytes oracles in `web/src/engines/visual/` (pkt, dns,
  dnsres-sim, tls13-sim, oauth-oidc-sim, saml, x509, jwt, xform, oas, wsdl, sdl, proto, pbwire,
  gqlsim, hdr, syslog, oci).
- **Build↔browser seam extended (the integration fix).** `sync-content.ts` only routed `net`,
  `api`, and `containers` asset dirs; the header/crypto/identity/logging/cloud oracles
  (`hdr`/`x509`/`jwt`/`dns`/`syslog`/`csa`) had no build path, so the site build failed on module 18.
  Added a serializable `ApiPanelSource` seam for those oracles
  (`web/src/engines/visual/api-oracle.ts`) + a content seed builder
  (`web/src/lib/visual-content-seed.ts`) so the parse tree the build computes rebuilds
  byte-identically in the browser. The parser over the real artifact remains the only answer key.
- **Honesty doctrine preserved end-to-end:** spot-verified the rebuilt hosts produce the exact real
  oracle values the exercise specs expect (Forwarded `proto=https`, `for=192.0.2.43`; syslog PRIVAL
  34 → Facility 4 / Severity 2 Critical) — every shown value is computed, none authored.
- **Gates green:** `web` test suite 1243/1243 · `bun run build` 0 errors, 26 `dist/labs/` dirs ·
  `bun run check` 0 errors/0 warnings · exercise-lint 26/26 · manifest-lint 314/314 ·
  semantic-originality 0 fail (13 sub-2% loop-vocabulary reviews) · anatomy-lint 26/26 ·
  style-lint 26/26 · rot dashboard 26 modules (🟢26 🟡0 🔴0).
- **Fixed two pre-existing type errors** in `crypto-fidelity.test.ts` / `syslog-fidelity.test.ts`
  (`Record<string, unknown>` truth fixtures narrowed to typed shapes) so `bun run check` is clean.
- **Coverage matrix + integration matrix updated:** `tracks/coverage-matrix.md` gains the band
  (Customer Trust & Assurance goes Deep on the wire/web/API/crypto/identity surface);
  `research/it-foundations/INTEGRATION-MATRIX.md` records the visual-class → module → oracle →
  suite → status map.

### 2026-05-28 — Approval gate cleared; curriculum-as-code engine instantiated
- **Decisions resolved:** (D1) original-content + curriculum-as-code model approved as-is; (D2) all five role tracks in scope; (D3) Justin Pagano accountable Curriculum Owner, Jai operational.
- **Engine stood up:** repo skeleton (`modules/`, `tracks/`, `style/`, `.ci/`, `dashboard/`), `package.json` (bun), `tsconfig.json`, project `ISA.md` as system of record.
- **Module 01 migrated** from root proof-draft into `modules/01-terminal-and-command-line-basics/` (`module.md` §1–8 + `meta.yaml` + `labs/` + `assessment/`); status `proof-draft` → `published`, owner set.
- **CI gates (bun/TypeScript, zero external deps):** `anatomy-lint`, `originality-lint`, `style-lint`, `link-check`, `lab-repro`, plus `dashboard/generate.ts` (continuous-controls-monitoring rot dashboard) and `.github/workflows/ci.yml`.
- **Anti-rot machinery live with module #1:** `.ci/triggers.yaml` (Loop-2 triggered reviews), volatility-tiered review cadence, rot dashboard.
- **Tracks:** five role-track definitions + coverage matrix wired (Generalist, Governance, Risk[1st+3rd], Compliance, Customer Trust & Assurance).
- Authoring of the remaining backlog (Part I + Modules 02–15) pipelined via the production workflow.

## 2026-06-12 — Wave 2: the interactive exercise layer (in build)

- **Exercise specs as curriculum data**: `modules/*/exercises/exercise.yaml` (schema-locked via
  `style/EXERCISE-SPEC.md` + `.ci/exercise-lint.ts`); hint ladders, machine-verified tasks,
  golden + anti-transcripts per exercise.
- **Ground-truth fidelity harness**: `.ci/fixtures/` — declared taxonomy (byte-exact /
  structured / engine-pinned / synthesized-porcelain / authored-with-citation / computed),
  executable environment contracts (digest-pinned `ubuntu:24.04` userland + systemd-booted lab
  image + `zsh -f` macOS contract), capture scripts with provenance, manifest lint with the
  assertion-loosening tripwire. 32 fixtures captured (modules 01 + 03 + divergence set).
- **Module 01 reconciled (ISC-75)**: the lab's stream-separation task is now producible with
  taught composition via the seeded `parse-access-export` tool; reference solution no longer
  contradicts the lab's own constraint; canon drift check added to `happy-path.sh`.
- **Semantic originality gate (closes wave-1 ISC-41)**: n-gram shingle overlap vs live §8
  sources + cross-module self-similarity with anatomy-template subtraction. First sweep: 0 fails.
- **Rot dashboard** gains Exercise + Fixtures columns; `triggers.yaml` gains fixture re-capture
  triggers; CI gains exercise-lint, manifest-lint, fidelity-suite, and nightly-originality jobs.
- **Web app (in flight)**: DOM-accessible terminal + spec-driven Lab Player, real WASM engines,
  encrypted cross-device sync (AES-256-GCM), evidence-pack hash chain, deterministic badges.
