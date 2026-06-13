# Visual Engine Spec — the Inspect-&-Assemble Lab Player surface (Wave 3)

> The consolidated build spec for the NEW reusable `visual` engine that powers ~all ten
> IT-foundations modules. It is the wave-3 analogue of the wave-2 engine seam (terminal, console,
> api, builder, sql.js): one data-driven, DOM-based React island with three composable modes
> (PEEL / TRACE / MAP), two specialized assessment mechanics (Build-and-Break, Diff-the-Trace), a
> minimal set of new verifier primitives that extend the closed registry in
> `web/src/verifiers/registry.ts`, and a small set of new parser/state-machine oracles. Honesty
> doctrine carries over verbatim: the parser/state-machine/transform over real bytes IS the oracle;
> there is no authored answer key for any decoded value.
>
> **Reuse wave-2 engines where the topic already fits them** (no re-port):
> - `sql` (sql.js / WASM SQLite) — databases module relational + injection legs (`engine_result_equals`).
> - `console` (jq) — logging module's structured-stream query leg (`engine_result_equals`).
> - `api` (the mock-vendor curl surface, `ApiExchangeProbe` + `api_pull_complete`) — already covers
>   module 06; the API-paradigms module captures payloads from it rather than re-implementing HTTP.
> - `builder` (`ValidatorRunProbe` + `validator_passes`, `MappingScoreProbe` + `mapping_score_at_least`)
>   — the GraphQL Build-and-Break limiter and the determination-artifact structural check run as
>   ported builder validators.
> - `git` — unchanged; not used by this wave.

---

## 1. The Inspect-&-Assemble island — data model

One React island, three modes selected by a `mode` discriminator. DOM-based (regions and cards are
real DOM nodes with ARIA), keyboard-operable, screen-reader-navigable — **never a canvas** (the
wave a11y bar). The spec stays data: the island is seeded by a `visual` payload; all execution
semantics (parsing, state machines, transforms, scoring) live in engine/verifier code.

### 1.1 Shared seed payload

```yaml
engine: visual
seed:
  profile: m-<slug>-<activity>     # manifest seed-state id (.ci/fixtures/manifest.yaml)
  artifact:                        # the REAL bytes/records the oracle parses
    kind: pcap | dns-msg | doh-json | pem-chain | jwt | saml-xml |
          oci-manifest | syslog-5424 | set-cookie | forwarded | http-cache |
          openapi | wsdl | graphql-sdl | proto | grpc-http2 | json-store | kv-store
    from: assets/<file>            # provenance: committed real fixture bytes
  oracle: <parser-or-engine-id>    # which ported oracle produces the parse tree / state machine
mode: peel | trace | map | build-and-break | diff-the-trace
```

The `oracle` is the single source of truth for every region boundary, decoded value, accepted
sequence, and computed diff the island shows. Specs reference only verifier primitive names + params;
they never carry parse logic (the `expr:`/`js:`/`script:` ban applies unchanged).

### 1.2 Mode 1 — PEEL (inspect a layered/nested real artifact)

- **Surface:** the artifact rendered as nested, expandable, keyboard-selectable **byte-range
  regions** (a roving-tabindex tree). Each region is generated *from the oracle's parse tree* — the
  learner can never be shown invented structure.
- **Interaction:** select a byte-range or node → "which region is this? / what does this field
  assert?"; selecting reveals the oracle's real decoded value. Layers may be **gated**: a child
  region stays collapsed until the learner reads the selector byte (EtherType → IPv4, Protocol →
  TCP) — protocol-selection made tangible.
- **Probe surface (new):** `ParseTreeProbe` — the oracle's parse tree exposed read-only to verifiers:
  `{ regions: Array<{ id, start, end, label, layer?, value }>, decode(range): value | null }`.
- **Auto-verify:** `region_labeled_correctly`, `field_value_is`, `decoded_artifact_matches`.

### 1.3 Mode 2 — TRACE (assemble a sequence/flow between participants)

- **Surface:** participant nodes (DOM nodes) + orderable **message/packet cards** (a roving-tabindex
  listbox, keyboard reorder; `aria-grabbed`/`aria-dropeffect`). Cards carry **real protocol
  fields/values**.
- **Honest consequence:** a stateful simulated counterpart runs the **real protocol state machine**;
  an out-of-order/mis-routed message produces the real alert/error/referral — not "try again".
- **Probe surface (new):** `TraceProbe` — `{ orderedMessages: Array<{ from, to, type, fields }>,
  reachedEndState: boolean, lastAlert: { name, code } | null }`.
- **Auto-verify:** `sequence_matches`, `participant_routing_correct`, `sim_alert_is`.

### 1.4 Mode 3 — MAP (place/classify items onto a structure)

- **Surface:** draggable/keyboard-assignable **item cards** + labeled **drop-zones**; supports the
  THROUGHOUT multi-zone card (logging on every tier) and a key-swapping **slider** (IaaS/PaaS/SaaS).
- **Honest key:** the zone key is derived from a cited authoritative source (NIST 800-53, SOC 2 TSC,
  AWS/CSA matrices, CIS Docker, OWASP API 2023) committed as a closed key fixture — **or** computed
  by running the real transform (crypto sort class). Partial-credit gap names the misplaced item.
- **Probe surface (reuse):** the existing `MappingScoreProbe { correct, total }`, extended so each
  row carries the cited `key_ref`.
- **Auto-verify:** `mapping_correct` (new, item-level) and the existing `mapping_score_at_least`
  (fraction floor) where partial credit suffices.

---

## 2. Minimal new verifier-primitive set (deduped across all ten designs)

Every design's checks collapse to **five** new primitives plus reuse of seven existing ones. This is
the closed extension to `PRIMITIVES` in `registry.ts` — each gets a Zod schema, unit + mutation
tests, and an `exercise-lint` descriptor exactly like the existing primitives.

| New primitive | Mode | Schema (params beyond `check`) | Semantics (the oracle is truth) |
|---|---|---|---|
| `region_labeled_correctly` | PEEL / Diff | `{ region: {start,end} \| {node_id}, expect_layer?: string }` | The learner's selected byte-range/node equals the oracle's true region boundary; if `expect_layer` given, the learner's label matches the region's layer/field name. Gap names the wrong boundary, never the answer. |
| `field_value_is` | PEEL / TRACE / MAP | `{ value?: string, from?: "generated" }` (one-of) | The learner-read value equals the oracle's real decode (or the generated expectation from replaying the reference). Covers EtherType, Protocol, ContentType, flag-byte decode, QDCOUNT, notAfter, payload sizes, src_ip, PRIVAL→Facility/Severity, .proto tag, etc. |
| `decoded_artifact_matches` | PEEL / MAP | `{ from?: "generated" \| value? }` | The learner's live decode (base64url/hex/QNAME labels/protobuf bytes/WS-Security digest) equals the engine/transform's decode. Discriminates encoding-≠-protection and digest-recompute. |
| `sequence_matches` | TRACE / Build | `{ canonical_ref: string }` resolving a committed canonical-sequence fixture | The learner's ordered messages equal the canonical protocol sequence AND the stateful sim reached its end-state (ESTABLISHED, Finished, full resolution chain, completed dance). |
| `sim_alert_is` | TRACE / Build | `{ alert: string, code?: number }` | The alert the stateful sim raised equals the named RFC alert/error (TLS `unexpected_message(10)` / `protocol_version(70)`, OAuth `invalid_request`, DNS root referral). Used only on the deliberate-break rounds. |

`participant_routing_correct` is folded into `sequence_matches` (the canonical fixture pins both
order and from/to routing), keeping the new set at five. It is exposed as a distinct param flag
(`check_routing: true`) rather than a separate primitive, so a TRACE task can assert routing without
asserting full order when a design needs it (web-app WAF-bypass consequence).

**Reused unchanged:** `mapping_score_at_least`, `validator_passes` (GraphQL limiter exit,
determination-artifact structural check), `engine_result_equals` (sql.js + jq legs),
`file_content_matches` / `file_not_matches` (written Wire/Evidence Findings, tier-ownership notes —
the *semantic* gate that names the correct field/value/control regex, never an answer key),
`api_pull_complete` (the api surface for paradigm payload capture). `mapping_correct` (item-level,
authoritative-zone) is treated as the sixth registry addition shared with the builder-mapping family;
where a design only needs a coverage floor it uses the existing `mapping_score_at_least`.

> Net: **6 new registry entries** (`region_labeled_correctly`, `field_value_is`,
> `decoded_artifact_matches`, `sequence_matches`, `sim_alert_is`, `mapping_correct`) — the four named
> in `VISUAL-PUZZLE-MODALITY.md` plus `decoded_artifact_matches` and `sim_alert_is` the protocol/
> transform activities require. Shared schema for the PEEL pair:
> `{ check, region: {start,end}|{node_id} | value, expect, from?: generated }` validated against the
> oracle's `ParseTreeProbe`.

### Anti-transcript discrimination (the wave-2 H1 contract, unchanged)

Each activity ships `golden.jsonl` + `anti-*.jsonl`. For the visual surface a "transcript" is the
ordered list of select/label/order/assign actions. Each anti pins `fails_check` to the discriminating
primitive:
- a PEEL near-miss that selects the *adjacent* field fails `region_labeled_correctly` (not an
  incidental `field_value_is`);
- a decode that reads the right region but mis-decodes fails `field_value_is`;
- a TRACE that orders correctly but mis-routes fails `sequence_matches` with `check_routing`;
- a build-and-break that skips the break fails `sim_alert_is`;
- a MAP near-miss with one card wrong fails `mapping_correct` (gap names the misplaced item).

---

## 3. New parsers / engines / state machines — and where each gets honest ground truth

All are ported to TS, **fidelity-checked against a reference dissector the way wave-2 fixtures are
reference-verified**, and shipped as tested engines. The parse tree / state machine / transform IS
the oracle; the puzzle is generated from it.

| Oracle (engine id) | Used by | What it parses/runs | Honest ground-truth source |
|---|---|---|---|
| **packet-dissector** (`pkt`) | networking | Ethernet/IPv4/TCP/UDP/TLS-record byte layouts → nested parse tree; flags-byte + ContentType decode; 5-tuple extraction; cross-capture byte-diff | RFC 791/9293/768/8446 + IANA EtherType/Protocol; real Wireshark SampleCaptures (http.cap, dns.cap) + a real TLS 1.3 capture; fidelity-checked vs **tshark** decode of the same file |
| **dns-1035** (`dns`) | how-internet-works | RFC 1035 message: header flags-word bit-unpack, QNAME label decoder, RR TYPE/CLASS/TTL/RDATA walker; DoH-JSON response shape | RFC 1035 §4.1; the 29-byte example.com A query verified live via `printf\|xxd`; live DoH response; fidelity-checked vs `dig +qr` |
| **x509-parser** (`x509`) | crypto/PKI, how-internet-works | DER/x.509 decode: validity, subject/SAN, issuer, BasicConstraints, KeyUsage; issuer↔subject chain predicate | RFC 5280; the real www.google.com leaf + chain captured via `openssl s_client \| openssl x509 -text` (2026-06-13); fidelity-checked vs `openssl x509 -text`; chain verdict from `openssl verify` (codes 0/10/18/62) |
| **jwt-7519** (`jwt`) | identity, web-app, api-paradigms, (reused by mod 06) | base64url segment split + JSON claim decode (header.payload.signature); reads exp/iat/iss/aud/sub; flags alg:none | RFC 7519; a real three-segment token; the decode is the oracle; HS256 verification delegates to `crypto-transform` |
| **crypto-transform** (`xform`) | crypto/PKI, api-paradigms (digest), identity (HS256) | base64/hex/SHA-256/SHA-1/MD5 + Base64(SHA-1(...)) over learner-supplied bytes; runs the REAL transform in-browser | FIPS 180-4 (SHA), RFC 4648 (base64); constants reproduced locally this session (SHA-256 of empty = e3b0c442...); the transform recomputes from learner bytes — no stored string |
| **tls13-sim** (`tls13`) | crypto/PKI, how-internet-works (composite) | RFC 8446 full-handshake state machine; accepts/rejects ordered messages; emits real AlertDescription codes (10/40/42/45/48/70) | RFC 8446 §4.1/§6 verbatim; reproducible via `openssl s_client`; the state machine is the consequence engine |
| **dns-resolve-sim** (`dnsres`) | how-internet-works | real DNS delegation state machine (root refers to TLD, TLD to authoritative, only authoritative answers) | RFC delegation behaviour; live-captured .com TLD NS (TTL 21594) + root list (iana.org/domains/root/servers) |
| **oauth-oidc-sim** (`oauth`) | identity | RFC 6749 authorization-code + OIDC Core state machine; emits real `invalid_request` on out-of-order | RFC 6749 + OpenID Connect Core 1.0; reproducible against a real IdP authorize/token endpoint |
| **rfc7239 / rfc6265 / rfc9111 parsers** (`hdr`) | web-app | Forwarded ABNF (for/by/host/proto), Set-Cookie cookie-av (Secure/HttpOnly/SameSite), Cache-Control + Age | RFC 7239 §4 / RFC 6265 §3.1+§5.2 / RFC 9111 §5.1+§5.2 literal examples; parsers fidelity-checked vs the RFC grammars |
| **contract parsers** (`oas`,`wsdl`,`sdl`,`proto`) | api-paradigms | OpenAPI 3.1 / WSDL 1.1+WS-SecurityPolicy / GraphQL SDL / protobuf .proto-definition → parse trees; the truth-field nodes | OpenAPI 3.1.0, WSDL, GraphQL SDL, .proto IDL specs; real machine-readable contracts over the shared User model |
| **protobuf-wire + http2-frame** (`pbwire`) | api-paradigms | protobuf wire decode (tag=(field<<3)\|wire_type) + the gRPC `[flag:1B][len:4B][msg]` frame + HTTP/2 pseudo-headers | protobuf.dev encoding (verified examples a=150→08 96 01; b="testing"→12 07 74 65 73 74 69 6e 67); grpc PROTOCOL-HTTP2.md; real gRPC HTTP/2 capture |
| **graphql-sim** (`gqlsim`) | api-paradigms | real graphql depth/cost limiter + NoIntrospection rule + alias/batch operation counter | OWASP GraphQL Cheat Sheet; runs the real validation rules so the limiter exit/refusal is protocol-true |
| **syslog-5424** (`syslog`) | logging | RFC 5424 ABNF: HEADER tokenizer, PRI bit-unpack (PRIVAL=Facility*8+Severity), STRUCTURED-DATA SD-ELEMENT walker, BOM/MSG + NILVALUE handling | RFC 5424 §6.5 verbatim examples + Table 1/2 codes; fidelity-checked vs a reference syslog parser |
| **oci-manifest** (`oci`) | containers | OCI image manifest → config (Cmd/User/ExposedPorts/Env) + ordered layer descriptors (sha256); surfaces a layer's tar for the baked-secret leg | OCI Image/Runtime Spec; a real manifest from `skopeo inspect`/`docker inspect`/a `docker save` tarball; fidelity-checked vs skopeo/docker inspect |
| **saml-xml** (`saml`) | identity | reads `<AuthnStatement>` (AuthnContextClassRef) + `<Conditions>` NotOnOrAfter from a real assertion | OASIS SAML 2.0 spec example assertion; **scope bounded honestly** — field reading + expired-Conditions tamper, NOT full XML-DSig validation |

**Document/KV stores** (databases module) need no new parser: the relational + injection legs reuse
`sql.js`; the document/KV legs reuse the generic JSON parser already available to the console surface.

---

## 4. Build-and-Break mechanic (TRACE with teeth)

A stateful simulated counterpart (`tls13-sim`, `oauth-oidc-sim`, `graphql-sim`) responds to the
learner's *constructed* messages/queries with **real protocol responses including real error/alert
codes**. The learner first builds the legal artifact (handshake, dance, precise query) and watches it
succeed, then constructs the attack/illegal artifact and watches the sim return the real consequence:
- TLS: `[Application Data]` before `{Finished}` → `unexpected_message(10)`; TLS-1.0-only offer →
  `protocol_version(70)`.
- OAuth: resource call without a token exchange → `invalid_request` / 401.
- GraphQL: circular query past the depth cap → the real depth-limit validation error; aliased batch →
  5 ops under 1 request; introspection → schema dump, then `NoIntrospection` enabled → refused.
- SQL (databases): `' OR '1'='1` concatenated → over-broad result set; parameterized → only the match.

Verified by the sandbox reaching the correct end-state (`sequence_matches`) and the named consequence
(`sim_alert_is` / `validator_passes` / `engine_result_equals`). Honest because the sim runs the real
state machine; the end-state IS the consequence, never an authored "wrong, try again." Reserved for
the highest-value protocol modules (crypto, identity, api-paradigms, databases) per the modality doc's
build-cost guidance.

## 5. Diff-the-Trace mechanic (the reusable EVALUATE-stage assessment)

Two **real** artifacts side by side — one clean, one carrying a **real instance** of a control
failure — rendered as aligned PEEL panes plus a per-diff click target. The learner clicks the single
field/byte that breaks the control; the **oracle computes the diff** over the real bytes, so the
discriminating field is the parser's computed divergence, never an answer key. It doubles as the
assessment for networking, how-internet-works, crypto, web-app, api-paradigms, databases, containers,
identity, and logging.

- **Click gate:** `region_labeled_correctly` against the oracle's computed single-divergent region.
- **Value gate:** `field_value_is` reads both the clean and broken values correctly.
- **Decode gate (where applicable):** `decoded_artifact_matches` (the SOAP digest recompute
  disagreeing with the stale envelope; a JWT alg:none).
- **Finding gate:** `file_content_matches` / `file_not_matches` on the written/structured finding —
  the *semantic* gate (correct field, value, control family regex), `file_not_matches` guarding
  against citing the wrong control. `validator_passes` on a produced structured determination
  artifact (api-paradigms grid).

Every "bad" leg is a real capture/record of the misconfiguration (a genuine port-80 exchange, a real
cleartext http.cap, a real gratuitous-ARP capture, expired/self-signed/wrong-host badssl certs, a real
stale-Created SOAP envelope, a real reflection-enabled gRPC capture, a real root-uid OCI config). No
faked failures anywhere.

---

## 6. Build-order note (for the build team, not blocking the designs)

1. Ship the **packet-dissector** + the PEEL surface + the six new primitives first — networking is the
   exemplar and exercises every new primitive class.
2. Add the **TRACE** surface + `tls13-sim` / `dns-resolve-sim` (crypto + how-internet-works share them).
3. Add the **MAP** surface upgrades (slider, THROUGHOUT, `mapping_correct`) — cloud + web-app + logging.
4. The **contract parsers + protobuf-wire** are the heaviest single lift (api-paradigms) — schedule
   after the surface is proven on the lighter modules.
5. Reuse `sql.js`, `jq`, `api`, `builder` verbatim for the legs noted in the preamble — no re-port.

Every oracle ships with a fidelity-check fixture (its reference-dissector output) committed alongside,
and an `exercise-lint` descriptor for its primitives, so the wave-2 golden/anti discrimination gate
applies unchanged.
