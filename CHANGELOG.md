# Changelog

All notable changes to the GRC Engineering Bootcamp curriculum. The curriculum is GRC-engineered:
this file is its versioned change record, and retired modules get a tombstone here (never silently abandoned).

## [Unreleased]

### 2026-05-28 — Approval gate cleared; curriculum-as-code engine instantiated
- **Decisions resolved:** (D1) original-content + curriculum-as-code model approved as-is; (D2) all five role tracks in scope; (D3) Justin Pagano accountable Curriculum Owner, Jai operational.
- **Engine stood up:** repo skeleton (`modules/`, `tracks/`, `style/`, `.ci/`, `dashboard/`), `package.json` (bun), `tsconfig.json`, project `ISA.md` as system of record.
- **Module 01 migrated** from root proof-draft into `modules/01-terminal-and-command-line-basics/` (`module.md` §1–8 + `meta.yaml` + `labs/` + `assessment/`); status `proof-draft` → `published`, owner set.
- **CI gates (bun/TypeScript, zero external deps):** `anatomy-lint`, `originality-lint`, `style-lint`, `link-check`, `lab-repro`, plus `dashboard/generate.ts` (continuous-controls-monitoring rot dashboard) and `.github/workflows/ci.yml`.
- **Anti-rot machinery live with module #1:** `.ci/triggers.yaml` (Loop-2 triggered reviews), volatility-tiered review cadence, rot dashboard.
- **Tracks:** five role-track definitions + coverage matrix wired (Generalist, Governance, Risk[1st+3rd], Compliance, Customer Trust & Assurance).
- Authoring of the remaining backlog (Part I + Modules 02–15) pipelined via the production workflow.
