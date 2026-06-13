# Lab — Where the Claim Can Be True (the Inspect-&-Assemble PEEL/Diff surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no host capture to perform: the lab loads real HTTP-header artifacts and a real JWT and
renders each as selectable, decoded regions (the visual surface, `engine: visual`).

## What runs

- **The artifacts:** real HTTP headers a request accretes crossing the three tiers — an RFC 7239
  `Forwarded` header (`for=`/`proto=`/`by=`), an RFC 6265 `Set-Cookie` session cookie
  (`Secure`/`HttpOnly`), an RFC 9111 `Cache-Control` response (`private, no-store` vs a cached
  `public` + `Age`), and a real three-segment JWT (and its `alg:none` twin), committed at
  `.ci/fixtures/assets/web/diff-the-trace.json`.
- **The oracles:** the header parser `web/src/engines/visual/hdr.ts` (Forwarded/Set-Cookie/
  Cache-Control) and the JWT parser `web/src/engines/visual/jwt.ts` parse those real bytes into a
  nested parse tree. Every region boundary and decoded value the surface shows is computed from the
  real header/token bytes per its RFC grammar — there is no answer key.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`)
  reading that parse tree. The golden/anti transcripts in `exercises/transcripts/` replay the
  learner's select/read/decode actions through the same surface the player drives.

## Why this is honest

The `hdr` oracle parses each header per its RFC grammar (RFC 7239 §4 / RFC 6265 §4.1.2 / RFC 9111
§5.2); the `jwt` oracle base64url-decodes the real token segments (RFC 7519 / RFC 8725 §2.1, the
latter flagging `alg:none`). Each clean/broken pair's discriminating field is the parser's *computed
divergence* over the two real header values — `proto=` present vs absent, `Secure`/`HttpOnly`
present vs stripped, `no-store` vs a cached `public`+`Age`, a signed `alg` vs `none` — never a stored
verdict. See `.ci/fixtures/assets/web/README.md` for the full provenance. The parse tree over those
real bytes IS the oracle.
