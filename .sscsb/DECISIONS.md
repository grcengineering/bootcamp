# Supply-chain control decisions

Every place this repository's security posture diverges from the sscs-bootstrapper
defaults, with the evidence behind it. Written during the initial `sscsb init`
bootstrap on 2026-09-12.

Each entry states what was decided, why, and **how to re-check it** — so a future
reviewer can falsify the claim rather than trust this file.

---

## 1. TruffleHog is the only credential scanner (`gitleaks = false`)

`.sscsb/config.toml` sets `trufflehog = true`, `gitleaks = false`, and the
Gitleaks job was removed from `.github/workflows/secrets-scan.yml`.

**Why.** TruffleHog verifies a candidate secret against the issuing provider, so
a finding means a live credential. Gitleaks matches regexes, so it cannot tell a
live key from a specimen. This repository deliberately ships specimens — a
throwaway SSH keypair and sample JWTs used in decoding exercises — which a
regex-only scanner reports forever. A check that is always red is a check people
learn to ignore, which costs more security than it buys.

A second, independent reason: `gitleaks-action` requires a paid licence for
organisation-owned repositories, and this repo lives under the `grcengineering`
org, so that job could not have passed here regardless of findings.

**Evidence.** TruffleHog reports **zero** findings across the entire git history
at the strictest setting CI uses:

```
trufflehog git file://. --results=verified,unknown --no-update
# → 0 findings
```

GitHub-native secret scanning with **push protection** is also enabled on the
repository, so this is not a single-tool dependency.

---

## 2. Trivy scan scope (`trivy.yaml`)

`trivy.yaml` narrows Trivy with `scan.skip-dirs`. `sscsb verify` and `sscsb scan`
both print the exact skip list on every run, so this is declared, not silent.

Two classes of path are skipped, and **vulnerability (CVE) scanning is not
narrowed at all**:

- **Not repository content** — `**/node_modules`, `web/dist`, `web/.astro`,
  `web/public/engines`. All gitignored, absent from a fresh clone. The findings
  here were upstream dev-container Dockerfiles inside `sql.js` and
  `yaml-language-server`.
- **Scanner specimens** — `.ci/fixtures`, `modules/*/labs/fixtures`, and
  `web/src/content/labs` (the generated projection of the first two). These are
  files whose *purpose* is to fail a scan. See SECURITY.md § "Deliberately
  insecure teaching material".

**Evidence that no CVE coverage was lost.** Every skipped path was checked for
dependency manifests and contains none:

```
find .ci/fixtures modules -name package.json -o -name '*.lock' \
  -o -name go.mod -o -name requirements.txt -o -name Cargo.toml -o -name pom.xml
# → no results
```

So these directories could never have produced a CVE finding; only misconfig and
secret rules fired there. Nothing that ships as running code is skipped:
`web/src`, `.ci/*.ts`, `dashboard/` and all curriculum markdown stay in scope.

---

## 3. `binary-artifacts` is a KNOWN, ACCEPTED FAIL

`sscsb verify` reports `binary-artifacts` as FAIL on two tracked files. This is
left red on purpose — the control has no allowlist, and disabling it outright
would hide a genuine fact about the tree. Both files were investigated:

### `.ci/fixtures/seeds/m02/home/evidence-collector_1.0.0_all.deb`

**Not a binary at all.** It is 992 bytes of plain ASCII: an `!<arch>` header, a
`debian-binary` member containing `2.0`, a comment explaining itself, and `#`
padding to land on exactly 992 bytes so captured `ls -l` and `cksum` output stays
byte-exact. The detector classifies by leading bytes and sees the spoofed `ar`
magic. Verify with `cat` — the whole file is readable text.

### `modules/09-policy-as-code/exercises/assets/policy.wasm`

A genuine compiled artifact (134 KB), and a deliberate design decision: the
in-browser `@open-policy-agent/opa-wasm` runtime cannot compile Rego in the
browser, so module 09's exercises mutate input JSON against a precompiled policy.

It ships with `policy.wasm.provenance.json` recording the source file, the source
hash, the entrypoint, and the compiler image **pinned by digest**. Both hashes
were verified during this bootstrap and matched exactly:

```
shasum -a 256 modules/09-policy-as-code/exercises/assets/policy.wasm
# a55b7f8bb557cf21598ce8fc96749158fd83894c370da0bf9b8c66869287f7eb  (matches provenance)
shasum -a 256 modules/09-policy-as-code/labs/fixtures/policy.rego
# 47d51b823d52402f344401c11bef0748259345b9e2bd84de9684563e6a17bbf5  (matches provenance)
```

Rebuild command and smoke test are recorded in the provenance file. The control's
concern — "a committed binary is code nobody reviewed" — is answered by that
chain, which the byte-level detector cannot model.

---

## 4. `commit-signing` — signer added, hardware-backed gap left visible

One approved human signer is registered in `.sscsb/policy/signers.toml`: Justin
Pagano, signing via the 1Password-vaulted SSH key wired globally in `~/.gitconfig`.
There is no separate AI or automation signing identity — agents draft, the human
signs.

`hardware_backed` is recorded as **false**, honestly. Every signature requires
interactive device authentication, but the key is not resident on a secure
element, so it is not an `ed25519-sk` key. `require_hardware_backed = true` was
deliberately **left on** rather than switched off, so `sscsb verify` keeps
printing the gap. Closing it means moving to a YubiKey-resident key, which is an
owner decision.

---

## 5. `signing-model` — DEGRADED by design

sscsb models five signing environments and expects a distinct agent identity for
the `agent-claude-code` lane. This project follows a **one-signer** standard
instead: a single human identity signs everything, and no agent key exists to
configure. The remaining lanes (`github-web`, `codespaces`, `cloud-claude`) are
attestations about GitHub account settings that have no read API. They are left
un-attested rather than self-attested, because attesting to an account setting
nobody verified would be fabricating evidence.

---

## 6. Actions pinned to current major, not latest major

Every GitHub Action is pinned to a full 40-character commit SHA, which is the
security fix (a mutable `@v4` tag can be repointed — the tj-actions/changed-files
compromise, CVE-2025-30066). Each action was pinned at the SHA of **its current
major**, not bumped to the newest major, so pinning introduces no behavioural
change and stays independently verifiable. Version currency is Renovate's job;
`renovate.json5` was installed by `sscsb init` and will raise major bumps as
reviewable PRs.

`slsa-framework/slsa-github-generator` remains tag-pinned (`@v2.1.0`) because
slsa-verifier requires a semantic version tag to verify the trusted builder —
SHA-pinning it would break verification. sscsb reports this as `[info]`.
