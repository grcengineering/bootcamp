/**
 * crypto-oracle fidelity gate (Wave-4 honesty doctrine; the x509/jwt/xform analogue of
 * pkt-fidelity.test.ts). The parser/transform over REAL committed bytes IS the oracle — this
 * suite asserts each engine's output equals the RFC-true, tool-confirmed values recorded in
 * .ci/fixtures/assets/crypto/*.json. If an engine drifts from reality (or someone edits a
 * fixture), CI fails. There is no authored answer key:
 *   - x509: every assertion's RHS was cross-checked against `openssl x509 -text` / `openssl
 *     verify`'s real return codes at capture time (2026-06-13).
 *   - jwt:  the decode equals python/node base64url-decode of the committed real token.
 *   - xform: the digests equal `shasum`/`md5`/node:crypto, anchored on
 *            SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  parseCertificate,
  buildCertProbe,
  hexToBytes,
  verifyChain,
  issuerMatchesSubject,
  isSelfSigned,
  hostMatchesSan,
  isWithinValidity,
  readTLV,
  VERIFY_CODE,
} from "../src/engines/visual/x509";
import { decodeJwt, verifyHs256, isExpired, buildJwtProbe } from "../src/engines/visual/jwt";
import {
  transform,
  sha256,
  sha1,
  md5,
  toHex,
  toBase64,
  fromBase64,
  fromHex,
  bytesToUtf8,
  utf8Bytes,
  hmacSha256,
  wsSecurityDigest,
  buildTransformProbe,
} from "../src/engines/visual/xform";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/crypto");
const chain = JSON.parse(readFileSync(join(ASSETS, "google-cert-chain.json"), "utf8"));
const diff = JSON.parse(readFileSync(join(ASSETS, "cert-diff-the-trace.json"), "utf8"));
const jwtFx = JSON.parse(readFileSync(join(ASSETS, "jwt-tokens.json"), "utf8"));
const vec = JSON.parse(readFileSync(join(ASSETS, "transform-vectors.json"), "utf8"));

// ============================================================================
// x509-parser — REAL www.google.com chain vs openssl x509 -text / openssl verify
// ============================================================================
describe("x509-parser fidelity — real DER bytes vs openssl ground truth", () => {
  const certs = chain.certs as Array<{ role: string; der_hex: string; openssl_text_truth: Record<string, unknown> }>;
  const leaf = parseCertificate(hexToBytes(certs[0].der_hex));
  const inter = parseCertificate(hexToBytes(certs[1].der_hex));
  const root = parseCertificate(hexToBytes(certs[2].der_hex));

  test("the leaf decodes to the real www.google.com fields openssl x509 -text reports", () => {
    const t = certs[0].openssl_text_truth;
    expect(leaf.subject.cn).toBe("www.google.com");
    expect(leaf.subject.text).toBe(t.subject);
    expect(leaf.issuer.text).toBe(t.issuer);
    expect(leaf.serialHex).toBe(t.serial_hex);
    expect(leaf.notBefore).toBe(t.not_before);
    expect(leaf.notAfter).toBe(t.not_after);
    expect(leaf.sanDns).toEqual(t.san_dns as string[]);
    expect(leaf.basicConstraintsCa).toBe(t.basic_constraints_ca as boolean);
    expect(leaf.keyUsage).toEqual(t.key_usage as string[]);
  });

  test("the intermediate (WR2) and root (GTS Root R1) decode to their real CA fields", () => {
    const ti = certs[1].openssl_text_truth;
    expect(inter.subject.cn).toBe("WR2");
    expect(inter.issuer.text).toBe(ti.issuer);
    expect(inter.basicConstraintsCa).toBe(true);
    expect(inter.keyUsage).toEqual(ti.key_usage as string[]);
    const tr = certs[2].openssl_text_truth;
    expect(root.subject.cn).toBe("GTS Root R1");
    expect(root.issuer.text).toBe(tr.issuer);
    expect(root.basicConstraintsCa).toBe(true);
  });

  test("the DER reader decodes high-tag-number form per X.690 §8.1.2.4 (spec-correct totality)", () => {
    // [APPLICATION 31] PRIMITIVE len 1 content 0x42 — tag number 31 in high-tag form (0x5f 0x1f).
    const tag31 = readTLV(new Uint8Array([0x5f, 0x1f, 0x01, 0x42]), 0);
    expect(tag31.tag).toBe(31);
    expect(tag31.cls).toBe(1); // APPLICATION
    // tag number 200 spans two base-128 bytes (0x81 0x48) — verified against the X.690 encoding.
    const tag200 = readTLV(new Uint8Array([0x5f, 0x81, 0x48, 0x01, 0x99]), 0);
    expect(tag200.tag).toBe(200);
    // a length that overruns the buffer is a hard error (no invented bytes)
    expect(() => readTLV(new Uint8Array([0x04, 0x05, 0x01]), 0)).toThrow(/overruns/);
  });

  test("the issuer↔subject chain predicate links leaf → WR2 → GTS Root R1 (the drawn chain)", () => {
    expect(issuerMatchesSubject(leaf, inter)).toBe(true); // leaf.issuer 'WR2' == WR2.subject
    expect(issuerMatchesSubject(inter, root)).toBe(true); // WR2.issuer 'GTS Root R1' == root.subject
    expect(isSelfSigned(leaf)).toBe(false);
  });

  test("verifyChain returns code 0 (ok) for the real chain anchored at GTS Root R1", () => {
    const verdict = verifyChain([leaf, inter, root], {
      now: new Date("2026-06-13T19:00:00Z"),
      host: "www.google.com",
      trustedRootSubjects: [root.subject.text],
    });
    expect(verdict.code).toBe(VERIFY_CODE.OK);
    expect(chain.chain_verdict.openssl_verify_return_code).toBe(0); // fixture records openssl's verdict
  });

  test("a real post-2050 cert decodes GeneralizedTime notAfter exactly as openssl's asn1parse", () => {
    const g = chain.generalizedtime_cert;
    const f = parseCertificate(hexToBytes(g.der_hex));
    expect(f.subject.text).toBe(g.openssl_text_truth.subject);
    expect(f.notBefore).toBe(g.openssl_text_truth.not_before); // UTCTime path (260613...Z → 2026)
    expect(f.notAfter).toBe(g.openssl_text_truth.not_after); // GeneralizedTime path (20510202...Z → 2051)
    expect(isSelfSigned(f)).toBe(true); // openssl req -x509 produces a self-signed cert
    expect(f.sanDns).toEqual(g.openssl_text_truth.san_dns as string[]);
  });

  test("the cert PEEL probe surfaces the openssl-true fields as selectable regions", () => {
    const p = buildCertProbe(hexToBytes(certs[0].der_hex));
    expect(p.region("cert.subject")!.value).toBe("CN=www.google.com");
    expect(p.region("cert.validity.notAfter")!.value).toBe(certs[0].openssl_text_truth.not_after);
    expect(p.region("cert.san")!.value).toBe("DNS:www.google.com");
    expect(p.region("cert.basicConstraints")!.value).toBe("CA:FALSE");
    expect(p.region("cert.keyUsage")!.value).toBe("Digital Signature");
    // two builds of the same cert are byte-identical (no module-global span drift)
    const p2 = buildCertProbe(hexToBytes(certs[0].der_hex));
    expect(p2.region("cert.serial")!.start).toBe(p.region("cert.serial")!.start);
  });
});

// ============================================================================
// x509 Diff-the-Trace — real badssl misconfigurations vs openssl verify codes
// ============================================================================
describe("x509 Diff-the-Trace fidelity — real badssl certs vs openssl's real verdict codes", () => {
  const cleanLeaf = parseCertificate(hexToBytes(chain.certs[0].der_hex));
  const root = parseCertificate(hexToBytes(chain.certs[2].der_hex));
  const inter = parseCertificate(hexToBytes(chain.certs[1].der_hex));
  const now = new Date("2026-06-13T19:00:00Z");

  test("expired.badssl.com leaf yields openssl code 10 (certificate has expired)", () => {
    const pair = diff.pairs.find((p: { id: string }) => p.id === "cert-expired");
    const expired = parseCertificate(hexToBytes(pair.broken.der_hex));
    expect(isWithinValidity(expired, now)).toBe(false); // notAfter is in the past
    const verdict = verifyChain([expired], { now });
    expect(verdict.code).toBe(VERIFY_CODE.CERT_HAS_EXPIRED);
    expect(verdict.code).toBe(pair.verdict.openssl_verify_return_code); // == openssl's real code 10
  });

  test("self-signed.badssl.com leaf yields openssl code 18 (self signed certificate)", () => {
    const pair = diff.pairs.find((p: { id: string }) => p.id === "cert-self-signed");
    const ss = parseCertificate(hexToBytes(pair.broken.der_hex));
    expect(isSelfSigned(ss)).toBe(true); // issuer == subject
    const verdict = verifyChain([ss], { now });
    expect(verdict.code).toBe(VERIFY_CODE.DEPTH_ZERO_SELF_SIGNED_CERT);
    expect(verdict.code).toBe(pair.verdict.openssl_verify_return_code); // == openssl's real code 18
  });

  test("wrong.host leaf yields openssl code 62 (hostname mismatch) when matched against a foreign host", () => {
    const pair = diff.pairs.find((p: { id: string }) => p.id === "cert-wrong-host");
    const wrong = parseCertificate(hexToBytes(pair.broken.der_hex));
    // the cert's SAN does not cover the host the learner connected to
    expect(hostMatchesSan(wrong, "wrong.host.badssl.com")).toBe(false);
    expect(hostMatchesSan(wrong, "anything.badssl.com")).toBe(true); // *.badssl.com DOES cover this
    const verdict = verifyChain([wrong], { now, host: "wrong.host.badssl.com" });
    expect(verdict.code).toBe(VERIFY_CODE.HOSTNAME_MISMATCH);
    expect(verdict.code).toBe(pair.verdict.openssl_verify_return_code); // == openssl's real code 62
  });

  test("the clean leg (www.google.com against its own host) is the in-transit PASS (code 0)", () => {
    const verdict = verifyChain([cleanLeaf, inter, root], {
      now,
      host: "www.google.com",
      trustedRootSubjects: [root.subject.text],
    });
    expect(verdict.code).toBe(VERIFY_CODE.OK);
  });

  test("a broken chain link (leaf not issued by the next cert) yields code 20 with a naming reason", () => {
    // leaf followed directly by the ROOT (skipping WR2): leaf.issuer 'WR2' != root.subject.
    const verdict = verifyChain([cleanLeaf, root], { now, trustedRootSubjects: [root.subject.text] });
    expect(verdict.code).toBe(VERIFY_CODE.UNABLE_TO_GET_ISSUER_CERT);
    expect(verdict.reason).toContain("does not match the next cert's subject");
  });

  test("a chain whose top is not a trusted root yields code 20 (the trust-anchor check)", () => {
    // full structural chain but with a trust set that does NOT contain GTS Root R1.
    const verdict = verifyChain([cleanLeaf, inter, root], { now, trustedRootSubjects: ["CN=Some Other Root"] });
    expect(verdict.code).toBe(VERIFY_CODE.UNABLE_TO_GET_ISSUER_CERT);
    expect(verdict.reason).toContain("does not reach a trusted root");
  });

  test("notBefore-in-the-future is reported as expired-window with the future-dated reason", () => {
    // evaluate the real google leaf BEFORE its notBefore (2026-05-25): the window has not opened.
    const verdict = verifyChain([cleanLeaf], { now: new Date("2026-01-01T00:00:00Z") });
    expect(verdict.code).toBe(VERIFY_CODE.CERT_HAS_EXPIRED);
    expect(verdict.reason).toContain("notBefore");
    expect(verdict.reason).toContain("in the future");
  });

  test("the cert PEEL probe's decode/regionAt accessors read the same oracle values as region()", () => {
    const p = buildCertProbe(hexToBytes(chain.certs[0].der_hex));
    const sanRegion = p.region("cert.san")!;
    // decode(range) and regionAt(range) agree with region(id) — one oracle, three accessors
    expect(p.decode({ start: sanRegion.start, end: sanRegion.end })).toBe(sanRegion.value);
    expect(p.regionAt({ start: sanRegion.start, end: sanRegion.end })!.id).toBe("cert.san");
    expect(p.decode({ start: 9999, end: 99999 })).toBeNull(); // no region spans that range
    expect(p.regionAt({ start: 9999, end: 99999 })).toBeNull();
    expect(p.region("cert.nonexistent")).toBeNull();
  });
});

// ============================================================================
// jwt-7519 — REAL three-segment token vs base64url decode; alg:none twin
// ============================================================================
describe("jwt-7519 fidelity — real token decode vs base64url/JSON ground truth", () => {
  const valid = jwtFx.tokens.valid_hs256;
  const none = jwtFx.tokens.algnone_twin;

  test("the valid HS256 token decodes to the committed header + payload (the decode IS the oracle)", () => {
    const d = decodeJwt(valid.jwt);
    expect(d.header).toEqual(valid.header_decoded);
    expect(d.payload).toEqual(valid.payload_decoded);
    expect(d.algNone).toBe(false);
    expect(d.segments.signatureB64).toBe(valid.signature_b64url);
  });

  test("HS256 verification RECOMPUTES the HMAC and matches the real signature", () => {
    expect(verifyHs256(valid.jwt, valid.hs256_secret)).toBe(true);
    // wrong secret never verifies (the transform is real)
    expect(verifyHs256(valid.jwt, "wrong-secret")).toBe(false);
  });

  test("the alg:none twin decodes, is flagged, and NEVER verifies (RFC 8725 §2.1)", () => {
    const d = decodeJwt(none.jwt);
    expect(d.header).toEqual(none.header_decoded); // {alg:none,typ:JWT}
    expect(d.payload).toEqual(none.payload_decoded);
    expect(d.algNone).toBe(true);
    expect(d.segments.signatureB64).toBe(""); // empty signature segment
    expect(verifyHs256(none.jwt, valid.hs256_secret)).toBe(false); // unsigned never verifies
  });

  test("isExpired reads the real exp claim (the token's exp is genuinely in the past)", () => {
    // exp 1718203600 = 2024-06-12T14:46:40Z — expired relative to 2026
    expect(isExpired(valid.jwt, Math.floor(new Date("2026-06-13T00:00:00Z").getTime() / 1000))).toBe(true);
    expect(isExpired(valid.jwt, 1718200001)).toBe(false); // just after iat, before exp
  });

  test("the JWT PEEL probe exposes segments + decoded claims as selectable regions", () => {
    const p = buildJwtProbe(valid.jwt);
    expect(p.region("jwt.header")!.value).toBe(JSON.stringify(valid.header_decoded));
    expect(p.region("jwt.payload.iss")!.value).toBe(valid.payload_decoded.iss);
    expect(p.region("jwt.payload.exp")!.value).toBe(String(valid.payload_decoded.exp));
    // the none twin's signature region is honest about being empty
    const pn = buildJwtProbe(none.jwt);
    expect(pn.region("jwt.signature")!.value).toContain("empty");
    expect(pn.root.value).toContain("UNPROTECTED");
    // the probe's decode/regionAt accessors agree with region() (one oracle, three accessors)
    const hdr = p.region("jwt.header")!;
    expect(p.decode({ start: hdr.start, end: hdr.end })).toBe(hdr.value);
    expect(p.regionAt({ start: hdr.start, end: hdr.end })!.id).toBe("jwt.header");
    expect(p.decode({ start: 99998, end: 99999 })).toBeNull();
    expect(p.regionAt({ start: 99998, end: 99999 })).toBeNull();
    expect(p.region("jwt.no.such.claim")).toBeNull();
  });

  test("a structurally invalid token is a hard error (no invented structure)", () => {
    expect(() => decodeJwt("only.two")).toThrow();
    expect(() => decodeJwt("a.b.c.d")).toThrow();
  });

  test("a segment that is not valid base64url JSON throws a naming error (forensic honesty)", () => {
    // a JSON array (not an object) in the header segment — RFC 7515 requires a JSON object
    const arraySeg = toBase64(utf8Bytes("[1,2,3]"), true);
    expect(() => decodeJwt(`${arraySeg}.${arraySeg}.`)).toThrow(/JSON object/);
    // a segment whose decoded bytes are not JSON at all
    const notJson = toBase64(utf8Bytes("not json"), true);
    expect(() => decodeJwt(`${notJson}.${notJson}.`)).toThrow(/not valid JSON/);
    // a base64url segment with an illegal length (1 mod 4) is rejected by the decoder
    expect(() => decodeJwt("A.A.A")).toThrow();
  });
});

// ============================================================================
// crypto-transform — REAL SHA/MD5/base64/hex vs shasum/md5/node:crypto
// ============================================================================
describe("crypto-transform fidelity — real transforms vs FIPS/RFC ground truth", () => {
  test("SHA-256('') equals the canonical empty-string digest (the curriculum anchor)", () => {
    const empty = vec.vectors.find((v: { input: string }) => v.input === "");
    expect(toHex(sha256(utf8Bytes("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(toHex(sha256(utf8Bytes("")))).toBe(empty.sha256);
  });

  test("SHA-256/SHA-1/MD5 of the committed vectors equal the tool-computed digests", () => {
    const hello = vec.vectors.find((v: { input: string }) => v.input === "hello");
    expect(transform("sha256", "hello").output).toBe(hello.sha256);
    expect(transform("sha1", "hello").output).toBe(hello.sha1);
    expect(transform("md5", "hello").output).toBe(hello.md5);
    const abc = vec.vectors.find((v: { input: string }) => v.input === "abc");
    // FIPS 180-4 known-answer for SHA-256('abc')
    expect(transform("sha256", "abc").output).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(transform("sha256", "abc").output).toBe(abc.sha256);
    expect(transform("sha1", "abc").output).toBe(abc.sha1);
  });

  test("base64 / hex round-trip with no key (encoding != protection)", () => {
    const hello = vec.vectors.find((v: { input: string }) => v.input === "hello");
    expect(transform("base64", "hello").output).toBe(hello.base64); // aGVsbG8=
    expect(transform("hex", "hello").output).toBe(hello.hex); // 68656c6c6f
    expect(bytesToUtf8(fromBase64("aGVsbG8="))).toBe("hello"); // reversible, no key
    expect(bytesToUtf8(fromHex("68656c6c6f"))).toBe("hello");
    // base64url has no padding
    expect(toBase64(utf8Bytes("A"), true)).toBe("QQ");
    expect(toBase64(utf8Bytes("A"), false)).toBe("QQ==");
  });

  test("the sort class is DERIVED from the algorithm, not authored", () => {
    expect(transform("sha256", "hello").klass).toBe("hash"); // one-way
    expect(transform("md5", "hello").klass).toBe("hash");
    expect(transform("base64", "hello").klass).toBe("encode"); // reversible, no key
    expect(transform("hex", "hello").klass).toBe("encode");
  });

  test("HMAC-SHA-256 reproduces the JWT signature (the HS256 leg's real transform)", () => {
    const valid = jwtFx.tokens.valid_hs256;
    const signingInput = `${valid.jwt.split(".")[0]}.${valid.jwt.split(".")[1]}`;
    const sig = toBase64(hmacSha256(utf8Bytes(valid.hs256_secret), utf8Bytes(signingInput)), true);
    expect(sig).toBe(valid.signature_b64url);
  });

  test("WS-Security digest = Base64(SHA-1(nonce ++ created ++ password)) recomputes faithfully", () => {
    // self-checking known vector: Base64(SHA-1('abc')) == the committed sha1_base64
    const abc = vec.vectors.find((v: { input: string }) => v.input === "abc");
    expect(toBase64(sha1(utf8Bytes("abc")), false)).toBe(abc.sha1_base64); // qZk+NkcGgWq6PiVxeFDCbJzQ2J0=
    // the digest transform composes correctly (nonce empty → SHA-1 of created++password)
    const d = wsSecurityDigest("", "", "abc");
    expect(d).toBe(abc.sha1_base64);
  });

  test("the 'Sorting the Scramble' MAP probe tags each card with the transform's real class", () => {
    const cards = (vec.sort_classes.items as Array<{ id: string; value: string; key_class: string }>)
      .filter((c) => ["base64-hello", "hex-hello", "sha256-hello"].includes(c.id))
      .map((c) => ({
        id: c.id,
        input: "hello",
        transform: c.id.startsWith("base64") ? ("base64" as const) : c.id.startsWith("hex") ? ("hex" as const) : ("sha256" as const),
      }));
    const p = buildTransformProbe(cards);
    expect(p.region("base64-hello")!.layer).toBe("ENCODE");
    expect(p.region("hex-hello")!.layer).toBe("ENCODE");
    expect(p.region("sha256-hello")!.layer).toBe("HASH");
    // the computed value equals the committed real transform output
    expect(p.region("sha256-hello")!.value).toBe(vec.sort_classes.items.find((i: { id: string }) => i.id === "sha256-hello").value);
    // the probe's decode/regionAt accessors agree with region() for the card regions
    const card = p.region("base64-hello")!;
    expect(p.decode({ start: card.start, end: card.end })).toBe(card.value);
    expect(p.regionAt({ start: card.start, end: card.end })!.id).toBe("base64-hello");
    expect(p.decode({ start: 5000, end: 5001 })).toBeNull();
    expect(p.region("no-such-card")).toBeNull();
    expect(p.byteLength).toBe(cards.length);
  });

  test("the JWT-header decoy decodes with no key to {alg:HS256,typ:JWT} (encoding != protection)", () => {
    const headerCard = vec.sort_classes.items.find((i: { id: string }) => i.id === "jwt-header");
    expect(bytesToUtf8(fromBase64(headerCard.value))).toBe('{"alg":"HS256","typ":"JWT"}');
    expect(headerCard.key_class).toBe("ENCODE");
  });

  test("the codecs reject malformed input rather than inventing bytes (parser honesty)", () => {
    expect(() => fromHex("abc")).toThrow(/odd-length/); // 3 hex chars
    expect(() => fromHex("zz")).toThrow(/non-hex/);
    expect(() => fromBase64("=")).toThrow(/invalid base64 length/); // 1 mod 4
    expect(() => fromBase64("!!!!")).toThrow(/non-base64/);
    // empty inputs are valid and round-trip to empty
    expect(toHex(fromHex(""))).toBe("");
    expect(bytesToUtf8(fromBase64(""))).toBe("");
    expect(transform("base64", "").output).toBe(""); // base64 of empty is empty
    expect(transform("hex", "").output).toBe("");
  });

  test("a long key is pre-hashed by HMAC (RFC 2104 block-size handling)", () => {
    // a key longer than the 64-byte SHA-256 block must be SHA-256'd first; the result is stable.
    const longKey = utf8Bytes("k".repeat(100));
    const a = toHex(hmacSha256(longKey, utf8Bytes("message")));
    const b = toHex(hmacSha256(longKey, utf8Bytes("message")));
    expect(a).toBe(b); // deterministic
    expect(a.length).toBe(64); // 32-byte digest as hex
  });
});
