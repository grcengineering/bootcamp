# Identity fixtures — real protocol artifacts (honesty doctrine)

Every artifact here is either captured/built from a real protocol exchange or authored verbatim
from the cited spec. Nothing is invented structure.

## What is here

- `oauth-oidc-dance.json` — the RFC 6749 §4.1 authorization-code grant (+ OIDC Core 1.0 id_token)
  as orderable dance cards. **match: authored-with-citation.** The act NAMES and error STRINGS
  (`invalid_request`, `invalid_grant`) are the literal RFC 6749 §4.1.2.1/§5.2 values; the example
  `code` / `access_token` are RFC 6749 §4.1.2/§5.1's own example values. The `oauth-oidc-sim`
  state machine is the consequence engine — the error a wrong move raises is computed.

- `saml-assertion.xml` — the OASIS SAML 2.0 example assertion (saml-core-2.0-os §2.3). **match:
  authored-with-citation.** The `saml-xml` oracle reads `<Issuer>`, `<Subject>/<NameID>`,
  `<Conditions NotBefore NotOnOrAfter>`, `<AudienceRestriction>/<Audience>`, `<AuthnStatement
  AuthnInstant>`, and `<AuthnContextClassRef>`. **Scope-bounded honestly:** field reading only —
  NOT XML-DSig validation. The module says so out loud.

- `saml-assertion-expired.xml` — the tampered twin: byte-identical except `<Conditions>`
  NotOnOrAfter is a PAST instant. The staleness break is `evaluateConditions()`'s computed
  verdict (now >= NotOnOrAfter, exclusive per §2.5.1.2), never an authored answer.

## Why this is the oracle, not an answer key

The OAuth/OIDC sim runs the RFC 6749 / OIDC Core state machine; the SAML reader parses the real
assertion XML and the Conditions evaluator computes the window verdict against a supplied "now".
The accepted sequence, the error a wrong move raises, and the staleness verdict are all the
protocol's behaviour over the real/spec artifacts — `web/tests/identity-protocol.test.ts` asserts
the sims and reader reproduce the cited RFC/OASIS values and that out-of-order inputs yield the
real error codes.
