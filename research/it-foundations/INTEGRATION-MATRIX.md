# IT-Foundations Integration Matrix (Wave 4)

> The visual-class → module → engine/oracle → test-suite → status map for the IT-foundations band
> (modules 16-25). Generated and verified during the Wave-4 integration sweep (2026-06-13). Every
> shown value in every module is produced by a real oracle over real bytes/records — the parse tree
> over the committed real artifact IS the answer key (honesty doctrine). This matrix records which
> visual class each module exercises, which engine/oracle backs it, and which suite proves it green.

## Visual classes

The Wave-4 visual surface (`web/src/components/lab/VisualSurface.tsx` + `sessions/visual-host.ts`)
exposes five learner-facing classes, each verified by the six verifier primitives in
`web/src/verifiers/registry.ts`:

- **PEEL** — select a real byte/field region; gated by `region_labeled_correctly` + `field_value_is`
  / `decoded_artifact_matches`.
- **TRACE** — order real protocol messages between participants; gated by `sequence_matches` +
  `participant_routing_correct`; a stateful sim raises the real alert on a wrong move.
- **MAP** — place control cards onto zones against a cited authoritative key; gated by
  `mapping_correct`.
- **build-and-break** — run a real validator/limiter; gated by `validator_passes` (+ `sequence_matches`).
- **diff-the-trace** — the forensic assessment: click the single divergent field across a clean/broken
  pair; gated by `region_labeled_correctly` + `field_value_is` over the oracle's computed divergence.

## Matrix

| # | Module | Engine | Primary oracle (spec mode) | Visual classes exercised | Test suite | Anti-transcripts | Status |
|---|--------|--------|----------------------------|--------------------------|------------|------------------|--------|
| 16 | it-networking-fundamentals | visual | `pkt` (diff-the-trace) | PEEL · TRACE · MAP · diff-the-trace | `exercise-replay-16.test.ts` (6) + `_anti-discriminate.ts` | 2 | 🟢 green |
| 17 | databases-relational-and-nosql | sql (sql.js) + visual `xform`/JSON peel | `engine_result_equals` | console-SQL · PEEL · MAP · build-and-break · diff-the-trace | `exercise-replay-17.test.ts` (5) | 2 | 🟢 green |
| 18 | web-application-architecture | visual | `hdr` (diff-the-trace) | TRACE · MAP · PEEL · diff-the-trace | `exercise-replay-18.test.ts` (6) | 2 | 🟢 green |
| 19 | it-api-paradigms | visual | `pbwire` (diff-the-trace) | MAP · PEEL · build-and-break · diff-the-trace | `exercise-replay-19.test.ts` (8) | 4 | 🟢 green |
| 20 | cloud-shared-responsibility | visual | `csa` (map) | MAP (boundary slider + control/data plane) | `exercise-replay-20.test.ts` (6) | 2 | 🟢 green |
| 21 | containers-and-virtualization | visual | `oci` (diff-the-trace) | PEEL · MAP · diff-the-trace | `exercise-replay-21.test.ts` (7) | 2 | 🟢 green |
| 22 | applied-cryptography-pki | visual | `x509` (diff-the-trace) | MAP (`xform`) · PEEL (`jwt`/`x509`) · build-and-break (`tls13-sim` TRACE) · diff-the-trace | `exercise-replay-22.test.ts` (8) | 3 | 🟢 green |
| 23 | identity-authn-authz-protocols | visual | `jwt` (diff-the-trace) | PEEL (`jwt`/`saml`) · TRACE (`oauth-oidc-sim`) · diff-the-trace | `exercise-replay-23.test.ts` (8) | 3 | 🟢 green |
| 24 | how-the-internet-works | visual | `dns` (diff-the-trace) | PEEL (`dns`/`x509`) · TRACE (`dnsres-sim`/`tls13-sim`) · diff-the-trace | `exercise-replay-24.test.ts` (7) | 3 | 🟢 green |
| 25 | logging-telemetry-observability | visual | `syslog` (diff-the-trace) | PEEL (`syslog`) · TRACE (log pipeline) · MAP · diff-the-trace + console (jq) | `exercise-replay-25.test.ts` (6) | 2 | 🟢 green |

## Oracle → asset directory → seed builder

The build step (`web/scripts/sync-content.ts`) projects each module's `exercises/exercise.yaml` +
its committed real artifacts into `web/src/content/labs/<module>.json`. Wave-4 added a serializable
`ApiPanelSource` seam (`web/src/engines/visual/api-oracle.ts`) so the parse tree the build computes
re-builds byte-identically in the browser. Routing by oracle:

| Oracle | Asset dir | Seed builder | Modules |
|--------|-----------|--------------|---------|
| `pkt` | `assets/net/` | `lib/visual-seed.ts` `buildVisualOptions` | 16 |
| `oas`/`wsdl`/`sdl`/`proto`/`pbwire`/`gqlsim` | `assets/api/` | `lib/api-seed.ts` `buildApiVisualOptions` | 19 |
| `oci` | `assets/containers/` | `lib/oci-seed.ts` `buildOciVisualOptions` | 21 |
| `hdr` | `assets/web/` | `lib/visual-content-seed.ts` `buildWebVisualOptions` | 18 |
| `csa` | `assets/cloud/` | `lib/visual-content-seed.ts` `buildCloudVisualOptions` | 20 |
| `x509` | `assets/crypto/` (+`google-cert-chain`, `jwt-tokens`) | `lib/visual-content-seed.ts` `buildCryptoVisualOptions` | 22 |
| `jwt` | `assets/crypto/` + `assets/identity/` (SAML) | `lib/visual-content-seed.ts` `buildIdentityVisualOptions` | 23 |
| `dns` | `assets/net/` (+`crypto` leaf) | `lib/visual-content-seed.ts` `buildInternetVisualOptions` | 24 |
| `syslog` | `assets/logging/` | `lib/visual-content-seed.ts` `buildLoggingVisualOptions` | 25 |

## Gate status (verified 2026-06-13)

| Gate | Command | Result |
|------|---------|--------|
| Unit/replay/fidelity tests | `cd web && bun test` | 1243 pass, 0 fail (60 files) |
| Site build | `cd web && bun run build` | 0 errors; 26 lab dirs in `dist/labs/` |
| Type check | `cd web && bun run check` | 0 errors, 0 warnings, 25 hints |
| Exercise lint | `bun .ci/exercise-lint.ts` | 26/26 specs pass |
| Manifest lint | `bun .ci/fixtures/manifest-lint.ts` | 314/314 entries pass |
| Semantic originality | `OFFLINE=1 bun .ci/semantic-originality.ts` | 0 fail, 13 review (sub-2% shared loop-stage vocabulary) |
| Module anatomy | `bun .ci/anatomy-lint.ts` | 26/26 modules pass |
| Module style | `bun .ci/style-lint.ts` | 26/26 modules pass |
| Rot dashboard | `bun dashboard/generate.ts` | 26 modules (🟢26 🟡0 🔴0) |
