# Web-application-architecture fixtures (module 18) — provenance

Real HTTP-header artifacts for "where the claim can be true" — tracing a request through the
client / presentation / application / data tiers and reading each control claim off the header
the owning tier produces. The parser/decoder over each header IS the oracle (VISUAL-ENGINE-SPEC
honesty doctrine); there is no authored answer key.

## The model

A request enters a canonical three-tier path (CloudFront/WAF edge → public-subnet ALB → reverse
proxy → private-subnet EC2 app → private-subnet RDS), accreting proxy-injected provenance bytes as
it goes. Each control claim lives at the tier that can *produce* its truth, and the header that
tier writes is the evidence. Every value the surface shows is the `hdr` / `jwt` oracle's decode of
the real header bytes.

## Files

| File | What | Oracle | Provenance / match class |
|------|------|--------|--------------------------|
| `diff-the-trace.json` | Four clean/broken header pairs (provenance / session / caching / token), plus the stateless JWT and its alg:none twin | `hdr` (Forwarded/Set-Cookie/Cache-Control) + `jwt` | RFC-literal header values + a locally-minted real HS256 JWT. match: authored-with-citation (RFC literals) / computed (JWT signature + digest divergence) |

## Honesty notes

- **Forwarded (RFC 7239 §4).** The clean leg `for=192.0.2.43;proto=https;by=203.0.113.43` is the
  RFC literal forwarded-element shape; the `proto=https` parameter is the load-bearing field that
  lets the app recover the client's protocol after upstream TLS termination. The broken twin
  (`for=192.0.2.60`, no `proto`) is the WAF/edge-bypass instance — the SC-8 truth is unverifiable
  at the app. The `hdr` oracle reports `proto` present (clean) vs absent (broken).
- **Set-Cookie (RFC 6265 §3.1 / §4.1.2).** The clean leg is the RFC literal
  `SID=31d4d96e407aad42; Path=/; Secure; HttpOnly`; the broken twin strips `Secure` and `HttpOnly`.
  The oracle's `cookie.safety` region computes which safety attributes are present vs absent — the
  divergence is the session-control gap, not a stored verdict.
- **Cache-Control (RFC 9111 §5.2 / §5.1).** The clean leg `private, no-store` is the sensitive-
  response control truth; the broken twin is `public, max-age=300` carrying an `Age: 142` header —
  proof a shared cache served the `/account` response. The `cache.age` region is the tell.
- **JWT (RFC 7519 / RFC 8725 §2.1).** The stateless token is a real three-segment HS256 JWT minted
  this session (`HMAC-SHA-256` over `base64url(header).base64url(payload)`); the alg:none twin is a
  real RFC 8725 §2.1 unprotected-token instance with an empty signature. The `jwt` oracle decodes
  header/payload from the real base64url bytes and flags `alg:none`.
- **The diff divergence is computed.** Each Diff-the-Trace discriminating field is the oracle's
  computed difference between the clean and broken header, not a stored answer.
