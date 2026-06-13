# Sequencing — placing the ten IT-foundations modules in Tier-1

> Where the ten new modules land in the existing Tier-1 dependency graph, their prerequisites among
> themselves, the numbering decision (additive vs 3-digit relabel), and the track-map depth per role.
> Order is defined here and in the curriculum doc — **not by directory number** (the build-time
> numbering choice is reversible and numbering-agnostic to the designs).

## The existing Tier-1 graph (modules 00–06, unchanged)

```
        ┌──────────────┐
        │ 0. Mindset   │  (Part I — what GRC Engineering is; everyone)
        └──────┬───────┘
        ┌──────┴───────┐
        ▼              ▼
┌──────────────┐  ┌───────────────────────────┐
│ 1. CLI/Shell │  │ (substrate; everything assumes it) │
└──────┬───────┘
   ┌───┴───────────────────┐
   ▼                       ▼
┌──────────────┐     ┌───────────────────────┐
│ 2. Linux     │     │ 5. Programming + Git   │  (parallel from ~wk2)
└──────┬───────┘     └───────────┬────────────┘
       ▼                          ▼
┌──────────────────────┐   ┌───────────────┐
│ 3/4. macOS / Windows │   │ 6. APIs        │  ← current capstone of Tier 1
└──────────────────────┘   └───────────────┘
```

## Where the ten new modules attach (the "IT & Internet Foundations" band)

The ten modules form a band that sits **after the terminal/programming substrate (1, 5) and
alongside/after the OS + API + data modules they enrich**. The recommended learning order and the
prerequisite edges among the new modules:

```
            ┌─────────────────────────────┐
1 CLI ──────▶ NET  it-networking-fundamentals  ──┐  (the wire; the PEEL exemplar)
            └─────────────┬───────────────┘      │
5 Prog/Git ─▶ DB  databases-relational-nosql     │  (extends 7's SQL; reuses sql.js)
            └─────────────┬───────────────┘      │
                          ▼                       ▼
            ┌─────────────────────────────┐   ┌──────────────────────────┐
            │ WEB web-application-arch     │◀──┤ NET + DB feed the tiers   │
            └─────────────┬───────────────┘   └──────────────────────────┘
                          ▼
            ┌─────────────────────────────┐
6 APIs ─────▶ APIP it-api-paradigms        │  (complements 6; reuses api + JWT)
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐   ┌──────────────────────────┐
            │ CLOUD cloud-shared-resp      │   │ CONT containers + virt    │  (light/medium; MAP-led + OCI PEEL)
            └─────────────┬───────────────┘   └────────────┬─────────────┘
                          ▼                                 ▼
            ┌─────────────────────────────┐
            │ CRYPTO applied-crypto-pki    │  (trust primitive; ships x509 + crypto-transform + tls13-sim)
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐
            │ ID identity-authn-authz      │  (needs CRYPTO's transforms; ships jwt + oauth + saml)
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐
            │ HIW how-the-internet-works   │  ← the integrative spine (needs NET + CRYPTO + WEB + ID)
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐
            │ LOG logging-telemetry-obs    │  (EVIDENCE/MONITOR; where continuous evidence is born)
            └─────────────────────────────┘
```

### Prerequisite rules (the load-bearing edges)

- **NET → HIW.** How-the-Internet-Works reuses the packet dissector, the TCP handshake, and the
  encryption-boundary intuition NET establishes. NET must precede HIW.
- **CRYPTO → ID.** Identity's JWT signature verification (HS256) and the broader trust framing depend
  on CRYPTO's `crypto-transform` and the hash/encrypt/encode distinction. CRYPTO must precede ID.
- **CRYPTO + ID → HIW.** HIW's lifecycle TRACE places the encryption boundary and reads the cert the
  name resolves to — both depend on CRYPTO; its DNS-domain-as-identity (CAA/SPF/DMARC) leans on ID.
- **NET + DB → WEB.** Web-application-architecture maps controls onto tiers (the DB is the at-rest
  tier; the wire feeds the per-hop transit control). DB and NET should precede WEB.
- **6 APIs → APIP.** API-paradigms is explicitly the four-paradigm contrast to module 6's REST pulls;
  it reuses the `api` surface and the shared 8-user seed. Module 6 must precede APIP.
- **JWT is the shared thread.** The `jwt-7519` parser is first built in ID (R1) and reused by module 6,
  WEB (stateless-token classification), and APIP (transport-auth). Build it in ID; the others import it.
- **CLOUD and CONT are loosely coupled** — both are LOCATE/OWN-flavored and depend only on the wire +
  store + architecture context; they can slot anywhere after WEB and before HIW.

> The hard chain is: **NET → (DB) → WEB → APIP**, and in parallel **CRYPTO → ID**, with **HIW** last
> as the integrative capstone of the band and **LOG** closing it on the EVIDENCE/MONITOR stage.

## Numbering — two options (build-time, reversible; flagged, not blocking)

The repo uses flat `NN-name` dirs (00–15). Both options keep the *designs* numbering-agnostic.

### Option A — Additive (recommended, low-risk)

Append the ten as `16+` in learning order; the curriculum doc + track map define order, not the dir
number. No renumber, no churn to the ~15 existing gate/spec/fixture paths, the CI lint, or the content
sync.

| New dir | Module | Old enum id |
|---|---|---|
| `16-networking-fundamentals` | it-networking-fundamentals | N1 |
| `17-databases-relational-and-nosql` | databases-relational-and-nosql | N2 |
| `18-web-application-architecture` | web-application-architecture | N3 |
| `19-api-paradigms` | it-api-paradigms | N4 |
| `20-cloud-shared-responsibility` | cloud-shared-responsibility | R5 |
| `21-containers-and-virtualization` | containers-and-virtualization | R6 |
| `22-applied-cryptography-pki` | applied-cryptography-pki | R2 |
| `23-identity-authn-authz-protocols` | identity-authn-authz-protocols | R1 |
| `24-how-the-internet-works` | how-the-internet-works | R3 |
| `25-logging-telemetry-observability` | logging-telemetry-observability | R4 |

> Note: dir numbers 16–25 are in *learning* order for readability, but the existing dirs 07–15 are
> Tier 2–4 — so 16+ sits *numerically* after Tier 4 while being *pedagogically* Tier 1. That is a
> cosmetic wart, accepted because it costs nothing; the track map and curriculum doc carry the true
> sequence. (If the wart bothers, Option B fixes it cleanly.)

### Option B — 3-digit relabel (matches the owner's "100 series" language literally)

Renumber the whole repo to a series scheme: `000` mindset / `1xx` foundations / `2xx` engineering /
`3xx` GRC-as-code / `4xx` product. The ten new modules then interleave cleanly into the `1xx`
foundations band in true learning order (e.g. `100` CLI … `110` networking … `119` logging), and the
Tier-1/2/3/4 boundary becomes self-documenting.

Cost: a mechanical migration touching every gate, spec, fixture path, `meta.yaml`, `manifest.yaml`
`seed.profile` key, track-map reference, and the content sync — run deliberately as its own task with
a rename map + a CI green-bar before merge.

### Recommendation

**Ship Option A now** (additive `16–25`), because it unblocks the wave with zero migration risk and
the designs are numbering-agnostic. **Schedule Option B as a separate, deliberate migration** if the
owner wants the literal "100 series" labels — it is a clean relabel best done once, in isolation, with
its own CI gate, not folded into a content wave. Either way, the canonical learning order lives in the
curriculum doc + track map, never in the dir number.

## Track-map depth (coverage matrix delta)

Following the existing **D**eep / **W**orking / **A**wareness convention. The band is Tier-1
foundations, so the generalist takes it at full depth; specialists vary:

| Module | Generalist | Governance | Risk | Compliance | Customer-Trust |
|---|---|---|---|---|---|
| NET networking | D | W | W | W | W |
| DB databases | D | W | D (data pipeline) | W | W |
| WEB web-arch | D | D (control architecture) | W | W | D (trust surface) |
| APIP api-paradigms | D | W | W | D (evidence shape) | D (assurance surface) |
| CLOUD shared-resp | D | D | W | D | W |
| CONT containers | D | W | W | W | A |
| CRYPTO crypto/PKI | D | W | W | D (evidence) | D (the padlock question) |
| ID identity | D | D | W | D | D (the #1 auditor surface) |
| HIW how-internet-works | D | W | W | W | D (the end-to-end trust story) |
| LOG logging/obs | D | W | W | D (continuous evidence) | W |

Placement gating is unchanged: each module's competence artifact (its Diff-the-Trace finding or
build-and-break verdict) is also its placement test — demonstrated competence skips the module.

## Rollout note

The band slots into the existing Phase 1 (Foundations) rollout. Build order should follow the
VISUAL-ENGINE-SPEC §6 engine-build order (NET/packet-dissector first as the exemplar), which is the
same as the recommended *teaching* order for the first four modules — so the surface is proven on the
exemplar before the heavier contract-parser modules are attempted.
