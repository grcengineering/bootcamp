# GRC Engineering Bootcamp — Web App

Static site for the bootcamp: a learner course experience + an owner curriculum-health dashboard,
deployed to **GitHub Pages** at **`bootcamp.grc.engineering`**. Built with Astro + bun + TypeScript +
Tailwind, with small React islands for the interactive bits.

## One source of truth

The app **does not** own any curriculum content. `scripts/sync-content.ts` projects the repo's
`../modules/*/{module.md,meta.yaml}` and `../tracks/*.md` into `src/content/` (gitignored) at build
time, and Astro renders from there. **Edit the curriculum in `../modules` and `../tracks`, never in
`web/src/content/`.**

### Add or change a module

1. Author it in `../modules/NN-name/` (`module.md` + `meta.yaml` + `labs/` + `assessment/`) — the
   same 9-section anatomy the CI gates enforce. `meta.yaml` drives the site: `title`, `tier`,
   `loop_stages`, `volatility`, `review_due`, `status`, `tracks`.
2. `bun run dev` — the sync runs automatically; the module appears in `/modules`, gets its own page,
   and shows on the `/dashboard` rot table.

## Run locally

```bash
bun install
bun run dev        # sync + astro dev   → http://localhost:4321
bun run build      # sync + astro build → ./dist (static)
bun run preview    # serve ./dist exactly as production
bun run check      # sync + astro check (typecheck)
```

## Deploy (GitHub Pages, custom domain)

Deployment is **manual** (`.github/workflows/pages.yml`, `workflow_dispatch`) so publishing is an
explicit step. To go live at `bootcamp.grc.engineering`:

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Add the custom domain `bootcamp.grc.engineering` in Settings → Pages (the `public/CNAME` file
   keeps it across deploys).
3. DNS: a `CNAME` record `bootcamp` → `<org>.github.io` (or the apex A/AAAA records per GitHub docs).
4. Run the **deploy-pages** workflow (Actions tab → Run workflow). To switch to continuous deploy on
   push, uncomment the `push` trigger in `pages.yml`.

`public/.nojekyll` ships in the build so the hashed `_astro/` assets are never Jekyll-stripped.

## v1 scope boundary (read before reviewing the dashboard)

This is a **static** site with **no backend**. Learner progress is stored **only in the viewer's
browser** (localStorage) — there is no account, no server, and **no cross-learner cohort telemetry**.
The owner dashboard therefore shows two real things: (1) the **curriculum rot state** computed from
each module's `review_due` (continuous controls monitoring on the curriculum itself), and (2) **the
current viewer's own** progress. Aggregated per-objective pass-rates across a cohort (the
curriculum's Loop-3 telemetry) require the deferred full-stack upgrade and are explicitly out of v1.

## Structure

```
web/
  scripts/sync-content.ts   # curriculum -> src/content (single source of truth)
  src/content.config.ts     # Astro collections (modules, tracks) + schema
  src/layouts/Layout.astro   # shell, nav, footer, design system
  src/styles/global.css      # Tailwind v4 tokens + markdown reading styles
  src/lib/{rot,progress}.ts  # rot status (mirrors CLI dashboard) + localStorage progress
  src/components/*.tsx        # React islands: ProgressControl, ProgressSummary, TrackPicker
  src/pages/                  # index, modules/[index,id], tracks, dashboard, 404
  public/{CNAME,.nojekyll,favicon.svg}
```
