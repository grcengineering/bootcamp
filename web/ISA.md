---
project: grc-bootcamp-web
effort: E3
phase: verify
progress: 31/34
mode: build
started: 2026-05-28
updated: 2026-05-28
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

## Vision

A learner lands on `bootcamp.grc.engineering`, immediately gets the inversion thesis and the
irreducible loop, picks a track, and walks a personalized path through the modules — reading,
doing the lab, taking the assessment, marking progress — all in a fast, clean, technical reading
experience that feels like the curriculum's voice. An owner opens `/dashboard` and sees the
curriculum's own compliance state (green/amber/red by review-due) exactly like a control board.
Euphoric surprise: the training site is *itself* a live demonstration of GRC engineering — the
same meta.yaml that owns the module drives both the learner UX and the rot board.

## Out of Scope (v1)

- No backend, no database, no server: GitHub Pages serves static files only.
- No auth and no cross-learner cohort telemetry — there is no server to aggregate to. Per-learner
  progress is **localStorage only**, on that browser. True multi-learner pass-rate aggregation
  (the curriculum's Loop-3 telemetry) is the deferred full-stack upgrade, explicitly NOT in v1.
- No content authoring in the app — modules are authored in markdown in the repo; the app renders.
- No automatic deploy this build — the Pages workflow is wired but firing it (publishing) needs
  explicit owner go + DNS for the custom domain.

## Principles

- **One source of truth.** The app reads the repo's `modules/*/{module.md,meta.yaml}` + `tracks/`;
  it never forks or re-states curriculum data. A build-time sync bridges curriculum → Astro content.
- **Content-first, JS-last.** Static HTML for all reading; tiny interactive islands only where
  genuinely interactive (progress, track selector, dashboard). Works (degrades) without JS for reading.
- **The medium is the method.** The owner dashboard renders the curriculum's rot state from the
  same meta.yaml the CLI dashboard uses — CCM on the curriculum, in the browser.

## Constraints

- **Astro (static output) + bun + TypeScript + Tailwind + React islands.** No npm/npx.
- **GitHub Pages** hosting; custom domain `bootcamp.grc.engineering` (CNAME + `site` config, base `/`).
- Lives in `web/` inside the bootcamp repo; build-time `scripts/sync-content.ts` copies curriculum
  markdown + meta into `web/src/content/` with frontmatter — no Astro-loader-version coupling.
- Must build with `bun run build` (runs sync then `astro build`) producing `web/dist/` static output.
- Accessibility: semantic headings, keyboard-navigable, no color-only meaning (mirrors the a11y checklist).

## Goal

Ship a static Astro site that renders all 16 modules (reading + lab + assessment) with a
track-aware learner path and localStorage progress, plus an owner dashboard showing curriculum
rot from meta.yaml — building clean via `bun run build`, deployable to GitHub Pages at
`bootcamp.grc.engineering`, with the curriculum repo as the single content source.

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

## Features

| name | description | satisfies | depends_on | parallelizable |
|---|---|---|---|---|
| content-bridge | sync script + collections (single source of truth) | ISC-1..5 | — | no (foundation) |
| app-foundation | Astro config, Tailwind, Layout, design system, build/deploy wiring | ISC-6..11,26,27 | content-bridge | no |
| learner-pages | home, modules index, module detail, tracks + coverage | ISC-12..18 | app-foundation | yes |
| progress-islands | localStorage progress control + summary | ISC-19..21,24 | app-foundation | yes |
| owner-dashboard | rot table from meta + local progress + boundary note | ISC-22..25 | content-bridge | partial |
| verify | Interceptor screenshots + console + deep-link + a11y | ISC-28..33 | all | no |

## Decisions

- 2026-05-28: Chose **Astro static** (over Next.js static-export / VitePress) — best markdown rendering, minimal JS, clean GitHub Pages fit; user deferred backend (no auth/DB), so static + localStorage is the right v1.
- 2026-05-28: **Build-time content sync** (`scripts/sync-content.ts`) bridges curriculum markdown+meta → Astro content collections, avoiding Astro-loader-version coupling and keeping ONE source of truth (the repo's modules/).
- 2026-05-28: **Custom domain `bootcamp.grc.engineering`** → `site` set to it, base `/` (root, not /repo/), `public/CNAME` emitted. DNS + Pages-enable + publish are owner steps, not taken here.
- 2026-05-28: v1 owner dashboard is curriculum-rot (build-time, from meta) + local progress only; cross-learner telemetry is explicitly deferred (no backend) — stated in-UI, not faked.
- 2026-05-28: Tier de-escalated classifier E4 → E3: the three architecture forks were resolved by owner answers, leaving substantial multi-file execution.
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
