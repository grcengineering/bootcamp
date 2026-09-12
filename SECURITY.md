# Security Policy

The GRC Engineering Bootcamp is public teaching material: a curriculum, a static
site, and the tooling that builds and verifies them. We take reports seriously
and will work with you to get issues fixed and credited.

## Reporting a vulnerability

**Please report privately — do not open a public issue.**

Use [GitHub's private vulnerability reporting](https://github.com/grcengineering/bootcamp/security/advisories/new)
on this repository. That channel notifies the maintainers directly and keeps the
report confidential until a fix ships.

Please include, as far as you can:

- what the issue is and where it lives (file, URL, or workflow),
- how to reproduce it,
- what an attacker gains,
- any suggested remediation.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement of your report | within 3 business days |
| Initial assessment and severity | within 7 business days |
| Fix or documented mitigation for accepted issues | within 30 days, sooner when severity warrants |

We will tell you when the issue is accepted, disputed, or fixed, and we credit
reporters in the release notes unless you prefer to stay anonymous.

## Scope

In scope:

- the site under `web/` and anything it serves to learners,
- the CI and verification tooling in `.ci/` and `dashboard/`,
- the GitHub Actions workflows in `.github/workflows/`,
- the supply-chain configuration under `.sscsb/`,
- dependency vulnerabilities that reach shipped code.

## Deliberately insecure teaching material — out of scope

This repository **ships intentionally flawed artifacts on purpose**, because the
curriculum teaches people to run security scanners and read real output. The
following are working as designed and are not vulnerabilities:

- **`modules/*/labs/fixtures/main-noncompliant.tf`** — Terraform written to fail
  an IaC scan. Module 08 hands it to learners precisely so a scanner flags it.
  Its compliant sibling is compliant against the ruleset that module teaches.
- **`.ci/fixtures/**` and the lab bundles generated from it** — captured lab
  transcripts and seed filesystems, including a throwaway SSH keypair for the
  fictional `grcops@web-01` container persona and sample JWTs used in decoding
  exercises. These grant access to nothing; TruffleHog reports zero findings
  across the entire git history at `--results=verified,unknown`.
- **Lab container images** under `.ci/fixtures/env/` — these run systemd as PID 1
  as root because module 02 teaches `systemctl` and `journalctl`, which need a
  real init. They are built locally for capture and are never published.

None of the above is deployed, applied, or executed outside a learner's local
lab container. If you believe one of these crosses from "specimen" into a real
risk — for example if a fixture credential were ever reused somewhere live — we
very much want to hear about it; report it through the channel above.

## Supply-chain posture

This repository is bootstrapped with
[sscs-bootstrapper](https://github.com/p4gs/sscs-bootstrapper). Current controls:

- **Secret scanning** — TruffleHog in pre-commit, pre-push, and CI, verified
  against the issuing provider; GitHub push protection is also enabled.
- **Vulnerability scanning** — Trivy and OSV-Scanner in CI, failing on High.
- **SAST** — CodeQL and OpenGrep, both enabled.
- **Signed commits** — required on `main`; a single human signing identity.
- **Pinned actions** — every GitHub Action is pinned to a full commit SHA.
- **SBOM and provenance** — Syft SBOM, Sigstore signing, SLSA provenance.

Scanner scope decisions, and the evidence behind each, are documented in
[`.sscsb/DECISIONS.md`](.sscsb/DECISIONS.md).
