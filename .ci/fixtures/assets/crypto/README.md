# Crypto / PKI fixtures — real certs, real tokens, real transforms (honesty doctrine)

Every byte here came off a real handshake, a real signing run, or a real transform. Nothing is
authored or invented. Each fixture carries a `provenance` block with `match: captured-real`
(captured with a local tool) or — where the source is a normative spec example — the citation.

## What was captured, how, and when

- **When:** 2026-06-13 ~18:50Z.
- **`google-cert-chain.json`** — the live `www.google.com:443` chain (leaf ← WR2 ← GTS Root R1),
  captured with `echo | openssl s_client -connect www.google.com:443 -servername www.google.com
  -showcerts`, each cert re-emitted as DER via `openssl x509 -outform DER`. The negotiated
  TLSv1.3 / AEAD-CHACHA20-POLY1305-SHA256 line is the in-transit SC-8 PASS evidence.
- **`cert-diff-the-trace.json`** — the clean google leaf plus three real misconfigurations from
  badssl.com (`expired.badssl.com` → code 10, `self-signed.badssl.com` → code 18,
  `wrong.host.badssl.com` → code 62 hostname mismatch). badssl.com publishes these deliberately
  broken endpoints for exactly this teaching purpose. The verdict codes are openssl's own
  `X509_V_ERR_*` constants, captured from the `Verify return code` line.
- **`jwt-tokens.json`** — a real HS256 JWT signed with `node:crypto` (HMAC-SHA-256 over
  `base64url(header).base64url(payload)`) and its real `alg:none` tamper twin. The HS256 signature
  recomputes identically; the alg:none twin is a genuine tampered instance (header `alg` → `none`,
  signature segment emptied). The `exp` claim (1718203600 = 2024-06-12) is genuinely in the past.
- **`transform-vectors.json`** — SHA-256/SHA-1/MD5 + base64/hex reference vectors, computed with
  `shasum`/`md5`/`base64`/`xxd` and cross-checked against `node:crypto` and python `hashlib`.
  `SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` is the canonical
  empty-string digest cited across the curriculum.

## Why this is the oracle, not an answer key

- **x509-parser** parses the committed DER bytes into a `ParseTreeProbe` (validity window, subject,
  SAN, issuer, BasicConstraints, KeyUsage) and computes the issuer↔subject chain predicate. Its
  output is fidelity-checked against `openssl x509 -text` in `web/tests/crypto-fidelity.test.ts`. The
  chain verdict mirrors `openssl verify`'s real return codes (0/10/18/62).
- **jwt-7519** base64url-splits the three segments and JSON-decodes header + payload — no key, by
  design. The decode is the oracle; it flags `alg:none` and reads `exp`/`iss`/`aud`/`sub`. HS256
  verification delegates to crypto-transform.
- **crypto-transform** runs the REAL SHA-256/SHA-1/MD5 + base64/hex transforms over learner bytes via
  `node:crypto` / WebCrypto. It recomputes from input every time and never stores a string; the
  reference vectors above only pin its fidelity. The MAP sort class (HASH / ENCRYPT / ENCODE) is
  derived by running the transform (reversible-no-key → ENCODE; one-way → HASH; reversible-with-key →
  ENCRYPT), not authored.

A learner can paste any of these into `openssl x509 -text`, a base64url decoder, or `shasum` and get
the identical result — that reproducibility is the whole point.
