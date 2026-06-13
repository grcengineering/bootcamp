/**
 * API-paradigms engine unit suite (Wave-4): the contract parsers (oas/wsdl/sdl/proto), the
 * protobuf-wire + HTTP/2 decoder (pbwire), the GraphQL limiter sim (gqlsim), and the RFC header
 * parsers (hdr) — every branch the fidelity + replay suites don't already touch, plus the
 * api-seed normalizer's modes and error paths. Every test asserts an observable outcome over the
 * REAL committed artifacts (or RFC literal examples); the parser/decoder/transform is the oracle,
 * no value is authored. (Coverage floor 95/95 on the new engine files.)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseOpenApi } from "../src/engines/visual/oas";
import { parseSdl } from "../src/engines/visual/sdl";
import { parseProto } from "../src/engines/visual/proto";
import { parseWsdl, parseSoapSecurity, wsSecurityPasswordDigest, sha1, base64ToBytes } from "../src/engines/visual/wsdl";
import {
  decodeProtobuf, decodeGrpcFrame, decodeGrpcExchange, hexToBytes, readVarint, readTag,
} from "../src/engines/visual/pbwire";
import {
  validateQuery, runBatch, maxSelectionDepth, nodeCount, isIntrospection, aliasedOperationCount,
  type GqlLimiterConfig,
} from "../src/engines/visual/gqlsim";
import { parseForwarded, parseSetCookie, parseCacheControl } from "../src/engines/visual/hdr";
import { buildApiVisualOptions, toFieldMap, buildGqlBuildAndBreak, type ApiFixture } from "../src/lib/api-seed";
import { buildApiPanelTree, type ApiPanelSource } from "../src/engines/visual/api-oracle";

const API = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/api");
const CONTRACT_FILES = ["users.openapi.json", "users.wsdl", "users.graphql", "users.proto"];
function contracts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of CONTRACT_FILES) out[f] = readFileSync(join(API, f), "utf8");
  return out;
}
function fixture(name: string): ApiFixture {
  return JSON.parse(readFileSync(join(API, name), "utf8")) as ApiFixture;
}

// ============================================================================
// OpenAPI (oas)
// ============================================================================
describe("oas — OpenAPI 3.1 contract parser", () => {
  test("locates the mfa_enabled truth-field, its type, and walks arrays + scalars", () => {
    const tree = parseOpenApi(contracts()["users.openapi.json"]);
    expect(tree.region("oas.components.schemas.User.properties.mfa_enabled")!.value).toContain("boolean");
    // the security array node is walked (array index regions exist)
    expect(tree.region("oas.paths./users.get.security.0.bearerAuth")).not.toBeNull();
    // root carries the document title region
    expect(tree.root.label).toContain("OpenAPI");
    // regionAt + decode resolve by exact range
    const node = tree.region("oas.openapi")!;
    expect(tree.decode({ start: node.start, end: node.end })).toBe(node.value);
    expect(tree.regionAt({ start: 999999, end: 999999 })).toBeNull();
  });

  test("preview surfaces enum + format + description and handles null/primitive values", () => {
    const doc = JSON.stringify({
      openapi: "3.1.0",
      x: { type: "string", format: "email", enum: ["a", "b"], description: "d" },
      n: null,
      list: [1, "two", true],
      bare: {},
    });
    const tree = parseOpenApi(doc);
    expect(tree.region("oas.x")!.value).toContain("format=email");
    expect(tree.region("oas.x")!.value).toContain("enum=[a,b]");
    expect(tree.region("oas.n")!.value).toBe("null");
    expect(tree.region("oas.list")!.value).toContain("3 items");
    expect(tree.region("oas.bare")!.value).toContain("0 keys");
    expect(tree.region("oas.list.2")!.value).toBe("true");
  });
});

// ============================================================================
// GraphQL SDL (sdl)
// ============================================================================
describe("sdl — GraphQL SDL contract parser", () => {
  test("reads type fields, enum values, scalar, interface, and strips comments", () => {
    const tree = parseSdl(contracts()["users.graphql"]);
    expect(tree.region("sdl.type.User.field.mfaEnabled")!.value).toBe("Boolean!");
    expect(tree.region("sdl.enum.Role")!.value).toContain("values");
    // enum value regions exist
    expect(tree.region("sdl.type.Role.field.ADMIN")).not.toBeNull();
  });

  test("scalar definitions and interface kinds parse without a body", () => {
    const sdl = `# a comment\nscalar DateTime\ninterface Node { id: ID! }\ntype Query { now: DateTime }`;
    const tree = parseSdl(sdl);
    expect(tree.region("sdl.scalar.DateTime")!.value).toBe("scalar");
    expect(tree.region("sdl.interface.Node")).not.toBeNull();
    expect(tree.region("sdl.type.Query.field.now")!.value).toBe("DateTime");
  });

  test("the SDL probe's regionAt/decode resolve by exact range; a type missing its brace is skipped", () => {
    const tree = parseSdl(contracts()["users.graphql"]);
    const node = tree.region("sdl.type.User.field.mfaEnabled")!;
    expect(tree.regionAt({ start: node.start, end: node.end })!.id).toBe(node.id);
    expect(tree.decode({ start: node.start, end: node.end })).toBe("Boolean!");
    expect(tree.regionAt({ start: -1, end: -1 })).toBeNull();
    // a `type` keyword with no opening brace before EOF is skipped (continue branch)
    const trunc = parseSdl("type Dangling");
    expect(trunc.region("sdl.type.Dangling")).toBeNull();
  });
});

// ============================================================================
// protobuf .proto (proto)
// ============================================================================
describe("proto — .proto contract parser", () => {
  test("reads services, rpcs, message fields, tags, and modifiers; strips comments", () => {
    const tree = parseProto(contracts()["users.proto"]);
    expect(tree.region("proto.service.UserService.rpc.ListUsers")!.value).toContain("ListUsersResponse");
    expect(tree.region("proto.message.User.field.mfa_enabled")!.value).toContain("field tag 2");
    // repeated modifier surfaces in the label
    expect(tree.region("proto.message.ListUsersResponse.field.users")!.label).toContain("repeated");
  });

  test("block comments and optional modifiers parse", () => {
    const proto = `syntax = "proto3";\n/* block */ message M { optional int32 x = 7; }`;
    const tree = parseProto(proto);
    const f = tree.region("proto.message.M.field.x")!;
    expect(f.label).toContain("optional");
    expect(f.value).toContain("= 7");
  });

  test("the proto probe's regionAt/decode resolve by exact range", () => {
    const tree = parseProto(contracts()["users.proto"]);
    const node = tree.region("proto.message.User.field.mfa_enabled")!;
    expect(tree.regionAt({ start: node.start, end: node.end })!.id).toBe(node.id);
    expect(tree.decode({ start: node.start, end: node.end })).toContain("field tag 2");
    expect(tree.regionAt({ start: -5, end: -5 })).toBeNull();
  });
});

// ============================================================================
// WSDL + WS-Security (wsdl)
// ============================================================================
describe("wsdl — WSDL + WS-SecurityPolicy + the digest transform", () => {
  test("locates SignedParts, the ListUsers operation, and the mfaEnabled element", () => {
    const tree = parseWsdl(contracts()["users.wsdl"]);
    expect(tree.region("wsdl.binding.policy.SignedParts")!.value).toContain("MUST be signed");
    expect(tree.region("wsdl.portType.operation.ListUsers")).not.toBeNull();
    expect(tree.region("wsdl.types.mfaEnabled")!.value).toContain("xsd:boolean");
  });

  test("the WS-Security PasswordDigest is the transform's real output (self-consistent)", () => {
    // OASIS example nonce/created; the OASIS example password; the recomputed digest IS the oracle
    const digest = wsSecurityPasswordDigest("WScqanjCEAC4mQoBE07sAQ==", "2003-07-16T01:24:32Z", "taadtaadpstcsm");
    expect(digest).toBe("AtYMdWClJo7PIuTpqmhmEEoEZyc=");
    // SHA-1 vectors (the transform stands on these)
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    expect(hex(sha1(new TextEncoder().encode("hello")))).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
    expect(new TextDecoder().decode(base64ToBytes("dGVzdA=="))).toBe("test");
  });

  test("parseSoapSecurity recomputes the digest; a stale Created diverges from the envelope", () => {
    const env = (created: string, digest: string) =>
      `<Envelope><Nonce>WScqanjCEAC4mQoBE07sAQ==</Nonce><Created>${created}</Created>` +
      `<Password Type="#PasswordDigest">${digest}</Password></Envelope>`;
    const clean = parseSoapSecurity(env("2003-07-16T01:24:32Z", "AtYMdWClJo7PIuTpqmhmEEoEZyc="), "taadtaadpstcsm");
    expect(clean.region("soap.recomputed-digest")!.value).toBe(clean.region("soap.wsse.Password")!.value);
    const stale = parseSoapSecurity(env("2001-01-01T00:00:00Z", "AtYMdWClJo7PIuTpqmhmEEoEZyc="), "taadtaadpstcsm");
    expect(stale.region("soap.recomputed-digest")!.value).not.toBe(stale.region("soap.wsse.Password")!.value);
  });

  test("a WSDL without a types block omits the types region (total parse, no throw)", () => {
    const tree = parseWsdl(`<definitions><portType><operation/></portType><Policy><SignedParts><Body/></SignedParts></Policy></definitions>`);
    expect(tree.region("wsdl.types")).toBeNull();
    expect(tree.region("wsdl.binding.policy.SignedParts")).not.toBeNull();
  });

  test("the WSDL/SOAP probes' regionAt/decode resolve by exact range; absent elements yield empty spans", () => {
    const tree = parseWsdl(contracts()["users.wsdl"]);
    const sp = tree.region("wsdl.binding.policy.SignedParts")!;
    expect(tree.regionAt({ start: sp.start, end: sp.end })!.id).toBe(sp.id);
    expect(tree.decode({ start: sp.start, end: sp.end })).toContain("MUST be signed");
    expect(tree.regionAt({ start: -9, end: -9 })).toBeNull();
    // a SOAP envelope missing nonce/created → recomputed digest is empty (no transform input)
    const empty = parseSoapSecurity(`<Envelope><Password>x</Password></Envelope>`, "pw");
    expect(empty.region("soap.recomputed-digest")!.value).toBe("");
    const sn = empty.region("soap.wsse.Password")!;
    expect(empty.decode({ start: sn.start, end: sn.end })).toBe("x");
  });
});

// ============================================================================
// protobuf-wire + HTTP/2 (pbwire)
// ============================================================================
describe("pbwire — protobuf wire + gRPC frame + HTTP/2 exchange decoder", () => {
  test("hexToBytes rejects malformed input", () => {
    expect(() => hexToBytes("")).toThrow("empty hex");
    expect(() => hexToBytes("abc")).toThrow("odd-length");
    expect(() => hexToBytes("zz")).toThrow("non-hex");
  });

  test("readVarint throws on truncation and over-long varints", () => {
    expect(() => readVarint(new Uint8Array([0x80]), 0)).toThrow("truncated");
    expect(() => readVarint(new Uint8Array(Array(11).fill(0x80)), 0)).toThrow("64 bits");
  });

  test("decodeProtobuf surfaces I64/I32 fixed-width fields honestly", () => {
    // field 3, wire type 1 (I64): tag = (3<<3)|1 = 0x19, then 8 bytes
    const i64 = decodeProtobuf(hexToBytes("19" + "0102030405060708"), {});
    expect(i64.region("pb.f3_1")!.value).toContain("8-byte");
    // field 4, wire type 5 (I32): tag = (4<<3)|5 = 0x25, then 4 bytes
    const i32 = decodeProtobuf(hexToBytes("25" + "01020304"), {});
    expect(i32.region("pb.f4_1")!.value).toContain("4-byte");
  });

  test("decodeProtobuf recurses into sub-messages and reads strings vs raw bytes", () => {
    // field 1 LEN sub-message { field 2 = "x" } : 0a 03 12 01 78
    const tree = decodeProtobuf(hexToBytes("0a03120178"), { 1: { name: "u", type: "message", sub: { 2: { name: "s", type: "string" } } } });
    expect(tree.region("pb.f1_1")!.value).toContain("sub-message");
    expect(tree.region("pb.f1_1.f2_1")!.value).toContain('"x"');
    // non-printable LEN bytes surface as a byte count, not a bogus string
    const rawBytes = decodeProtobuf(hexToBytes("0a02" + "00ff"), {});
    expect(rawBytes.region("pb.f1_1")!.value).toContain("2 bytes");
  });

  test("decodeProtobuf rejects an empty message; decodeGrpcFrame rejects a short prefix", () => {
    expect(() => decodeProtobuf(new Uint8Array(0))).toThrow("empty");
    expect(() => decodeGrpcFrame(new Uint8Array([0, 0, 0]))).toThrow("5-byte prefix");
  });

  test("decodeGrpcExchange surfaces pseudo-headers, the framed body, and trailers", () => {
    const fx = fixture("grpc-listusers.json");
    const tree = decodeGrpcExchange({
      requestHeaders: fx.request_headers!,
      frameHex: fx.frame_hex!,
      responseTrailers: fx.response_trailers!,
      fields: toFieldMap(fx.field_map),
    });
    expect(tree.region("req._path")!.value).toBe("/userservice.UserService/ListUsers");
    expect(tree.region("body.grpc.flag")!.value).toContain("uncompressed");
    expect(tree.region("trailer.grpc_status")!.value).toBe("0");
    // readTag structural decode
    expect(readTag(hexToBytes("08"), 0).field).toBe(1);
    // the exchange probe's regionAt/decode resolve by the synthetic header index range
    const path = tree.region("req._path")!;
    expect(tree.regionAt({ start: path.start, end: path.end })!.id).toBe("req._path");
    expect(tree.decode({ start: path.start, end: path.end })).toBe("/userservice.UserService/ListUsers");
    expect(tree.regionAt({ start: 100000, end: 100001 })).toBeNull();
    // the grpc frame probe's regionAt/decode
    const frame = decodeGrpcFrame(hexToBytes(fx.frame_hex!), toFieldMap(fx.field_map));
    const flag = frame.region("grpc.flag")!;
    expect(frame.regionAt({ start: flag.start, end: flag.end })!.id).toBe("grpc.flag");
    expect(frame.decode({ start: flag.start, end: flag.end })).toContain("uncompressed");
  });
});

// ============================================================================
// GraphQL limiter sim (gqlsim)
// ============================================================================
describe("gqlsim — real depth/cost/introspection/batch limiter", () => {
  const cfg: GqlLimiterConfig = { maxDepth: 6, maxNodes: 60, noIntrospection: false };

  test("a precise query is accepted; a deep circular query trips the real depth error", () => {
    expect(validateQuery("query { users { email mfaEnabled } }", cfg).exit).toBe(0);
    const deep = "query { a { b { c { d { e { f { g { id } } } } } } } }";
    const run = validateQuery(deep, cfg);
    expect(run.exit).toBe(1);
    expect(run.stdout).toContain("depth");
  });

  test("a query past the cost budget trips the real cost error", () => {
    const wide = "query { " + Array.from({ length: 70 }, (_, i) => `f${i}`).join(" ") + " }";
    const run = validateQuery(wide, { maxDepth: 50, maxNodes: 60, noIntrospection: false });
    expect(run.exit).toBe(1);
    expect(run.stdout).toContain("cost");
  });

  test("introspection is allowed by default but refused once NoIntrospection is on", () => {
    const intro = "query { __schema { types { name } } }";
    expect(validateQuery(intro, { ...cfg, maxNodes: 500 }).exit).toBe(0); // default off → accepted
    const run = validateQuery(intro, { ...cfg, maxNodes: 500, noIntrospection: true });
    expect(run.exit).toBe(1);
    expect(run.stdout).toContain("NoIntrospection");
  });

  test("aliased batch counts N operations under one request (API4 scenario)", () => {
    const batch = "mutation { a: login(e:\"x\") b: login(e:\"y\") c: login(e:\"z\") }";
    expect(aliasedOperationCount(batch)).toBe(3);
    const probe = runBatch(batch, 3);
    expect(probe.orderedMessages.length).toBe(3);
    expect(probe.reachedEndState).toBe(true);
    expect(probe.lastAlert).toBeNull();
    const mismatch = runBatch(batch, 5);
    expect(mismatch.reachedEndState).toBe(false);
    expect(mismatch.lastAlert!.name).toBe("operation-count-mismatch");
  });

  test("the analysis helpers are comment-aware and structural", () => {
    expect(maxSelectionDepth("query { a { b } } # { fake depth")).toBe(2);
    expect(nodeCount("query { a b }")).toBe(2);
    expect(isIntrospection("{ __typename }")).toBe(true);
    expect(isIntrospection("{ users { id } }")).toBe(false);
  });
});

// ============================================================================
// RFC header parsers (hdr)
// ============================================================================
describe("hdr — RFC 7239 / RFC 6265 / RFC 9111 header parsers over RFC examples", () => {
  test("RFC 7239 Forwarded: for/by/host/proto parameters per element", () => {
    const tree = parseForwarded("for=192.0.2.60;proto=http;by=203.0.113.43");
    expect(tree.region("fwd.el0.proto")!.value).toBe("http");
    expect(tree.region("fwd.el0.for")!.value).toBe("192.0.2.60");
    expect(tree.region("fwd.el0.by")!.value).toBe("203.0.113.43");
    // a multi-element header (comma-separated) yields a second element
    const multi = parseForwarded("for=192.0.2.43, for=198.51.100.17");
    expect(multi.region("fwd.el1")).not.toBeNull();
  });

  test("RFC 6265 Set-Cookie: cookie-pair + cookie-av; safety summary names absent attributes", () => {
    const safe = parseSetCookie("SID=31d4d96e407aad42; Path=/; Secure; HttpOnly; SameSite=Strict");
    expect(safe.region("cookie.pair")!.value).toContain("SID");
    expect(safe.region("cookie.av.secure")!.value).toContain("present");
    expect(safe.region("cookie.av.samesite")!.value).toBe("Strict");
    expect(safe.region("cookie.safety")!.value).toContain("absent: (none)");
    const bad = parseSetCookie("SID=abc; Path=/");
    expect(bad.region("cookie.safety")!.value).toContain("secure");
    expect(bad.region("cookie.safety")!.value).toContain("httponly");
  });

  test("RFC 9111 Cache-Control: directives + the Age fold", () => {
    const priv = parseCacheControl("private, no-store, max-age=0");
    expect(priv.region("cache.private")!.value).toContain("present");
    expect(priv.region("cache.max-age")!.value).toBe("0");
    const cached = parseCacheControl("public, max-age=3600", "142");
    expect(cached.region("cache.age")!.value).toContain("142");
    // empty directive segments are skipped (the `continue` branch)
    expect(parseCacheControl("no-store, , private").region("cache.private")).not.toBeNull();
  });

  test("the hdr probes' regionAt/decode resolve by exact range", () => {
    const fwd = parseForwarded("for=192.0.2.60;proto=http");
    const p = fwd.region("fwd.el0.proto")!;
    expect(fwd.regionAt({ start: p.start, end: p.end })!.id).toBe("fwd.el0.proto");
    expect(fwd.decode({ start: p.start, end: p.end })).toBe("http");
    expect(fwd.regionAt({ start: -2, end: -2 })).toBeNull();
    const ck = parseSetCookie("SID=x; Secure");
    const pair = ck.region("cookie.pair")!;
    expect(ck.decode({ start: pair.start, end: pair.end })).toContain("SID");
    const cc = parseCacheControl("private, no-store");
    const d = cc.region("cache.no-store")!;
    expect(cc.regionAt({ start: d.start, end: d.end })!.id).toBe("cache.no-store");
    expect(cc.decode({ start: d.start, end: d.end })).toContain("present");
  });
});

// ============================================================================
// api-seed normalizer (modes + errors)
// ============================================================================
describe("api-seed — visual-option builder for every api mode + error paths", () => {
  test("PEEL the four contracts builds one panel per paradigm", () => {
    const opts = buildApiVisualOptions("peel", "oas", fixture("grpc-listusers.json"), contracts());
    expect(opts.panels.map((p) => p.id)).toEqual(["oas", "wsdl", "sdl", "proto"]);
  });

  test("PEEL the gRPC frame builds the exchange panel with the byte-exact mfa node", () => {
    const opts = buildApiVisualOptions("peel", "pbwire", fixture("grpc-listusers.json"), contracts());
    expect(opts.panels[0].id).toBe("grpc");
    // the panel carries a serializable source; buildApiPanelTree rebuilds the live tree (the same
    // seam the VisualHost constructor uses, so the lab bundle survives JSON round-trips)
    const tree = buildApiPanelTree(opts.panels[0].source!);
    expect(tree.region("body.grpc.message.f1_2.f2_2")!.value).toContain("false");
    // every panel is serializable (no functions) — JSON round-trip preserves the source
    expect(JSON.parse(JSON.stringify(opts.panels[0].source))).toEqual(opts.panels[0].source as never);
  });

  test("diff-the-trace prepends the four contracts then the eight payload legs + a limiter run", () => {
    const opts = buildApiVisualOptions("diff-the-trace", "pbwire", fixture("diff-the-trace.json"), contracts());
    expect(opts.panels.length).toBe(12);
    expect(opts.buildAndBreak!.validatorRun.exit).toBe(1); // the 12-deep query is rejected
    expect(opts.buildAndBreak!.validatorRun.stdout).toContain("depth");
  });

  test("buildApiPanelTree dispatches every oracle source kind", () => {
    expect(buildApiPanelTree({ oracle: "sdl", raw: "type Q { a: Int }" }).region("sdl.type.Q.field.a")!.value).toBe("Int");
    expect(buildApiPanelTree({ oracle: "oas", raw: '{"openapi":"3.1.0"}' }).root.label).toContain("OpenAPI");
    expect(buildApiPanelTree({ oracle: "proto", raw: "message M { bool x = 1; }" }).region("proto.message.M.field.x")!.value).toContain("= 1");
    expect(buildApiPanelTree({ oracle: "wsdl", raw: "<definitions><portType><operation/></portType></definitions>" }).root.label).toContain("WSDL");
    const soap = buildApiPanelTree({ oracle: "soap", envelope: "<E><Nonce>WScqanjCEAC4mQoBE07sAQ==</Nonce><Created>2003-07-16T01:24:32Z</Created><Password>x</Password></E>", password: "taadtaadpstcsm" });
    expect(soap.region("soap.recomputed-digest")!.value).toBe("AtYMdWClJo7PIuTpqmhmEEoEZyc=");
    expect(buildApiPanelTree({ oracle: "gqlsim", query: "query { a { b } }" }).region("gql.depth")!.value).toBe("2");
  });

  test("buildGqlBuildAndBreak runs the limiter; accepted query exits 0", () => {
    expect(buildGqlBuildAndBreak("query { users { email } }")!.validatorRun.exit).toBe(0);
  });

  test("error paths: missing frame, missing pairs, missing contract file, unsupported mode, unknown diff oracle", () => {
    expect(() => buildApiVisualOptions("peel", "pbwire", { id: "x", kind: "grpc-http2" }, contracts())).toThrow(/frame_hex/);
    expect(() => buildApiVisualOptions("diff-the-trace", "pbwire", { id: "x", kind: "x" }, contracts())).toThrow(/no pairs/);
    expect(() => buildApiVisualOptions("peel", "oas", { id: "x", kind: "x" }, {})).toThrow(/contract file missing/);
    expect(() => buildApiVisualOptions("map", "oas", { id: "x", kind: "x" }, contracts())).toThrow(/unsupported/);
    // a diff pair naming an unknown per-leg oracle is rejected by diffLegSource
    const badPair: ApiFixture = {
      id: "x", kind: "x",
      pairs: [{ id: "p", paradigm: "P", oracle: "nope", control_claim: "c", owasp: "o", framework_ref: "f", discriminating_node: "d",
        clean: { label: "c" }, broken: { label: "b" } }] as never,
    };
    expect(() => buildApiVisualOptions("diff-the-trace", "pbwire", badPair, contracts())).toThrow(/unknown oracle/);
    // diff legs missing their artifact throw clear errors
    const noQ: ApiFixture = { id: "x", kind: "x", pairs: [{ id: "p", paradigm: "P", oracle: "gqlsim", control_claim: "c", owasp: "o", framework_ref: "f", discriminating_node: "d", clean: { label: "c" }, broken: { label: "b" } }] as never };
    expect(() => buildApiVisualOptions("diff-the-trace", "pbwire", noQ, contracts())).toThrow(/needs a query/);
  });

  test("toFieldMap turns the JSON string-keyed map into the numeric FieldMap", () => {
    const fm = toFieldMap({ "2": { name: "mfa_enabled", type: "bool" }, "1": { name: "u", type: "message", sub: { "1": { name: "e", type: "string" } } } });
    expect(fm[2].name).toBe("mfa_enabled");
    expect(fm[1].sub![1].name).toBe("e");
  });

  test("the GraphQL diff-leg tree exposes computed depth/introspection nodes + probe methods", () => {
    const opts = buildApiVisualOptions("diff-the-trace", "pbwire", fixture("diff-the-trace.json"), contracts());
    const gqlBroken = buildApiPanelTree(opts.panels.find((p) => p.id === "graphql-broken")!.source!);
    expect(gqlBroken.region("gql.depth")!.value).toBe("12");
    expect(gqlBroken.region("gql.introspection")!.value).toContain("true");
    // the long broken query is truncated in the root preview (the …-branch)
    expect(gqlBroken.root.value.endsWith("…")).toBe(true);
    // probe methods resolve
    const root = gqlBroken.root;
    expect(gqlBroken.regionAt({ start: root.start, end: root.end })!.id).toBe("gql");
    expect(gqlBroken.decode({ start: root.start, end: root.end })).toBe(root.value);
    expect(gqlBroken.regionAt({ start: -3, end: -3 })).toBeNull();
    const cleanGql = buildApiPanelTree(opts.panels.find((p) => p.id === "graphql-clean")!.source!);
    expect(cleanGql.root.value.endsWith("…")).toBe(false); // short query, not truncated
  });

  test("SOAP and gRPC diff legs missing their artifact throw clear errors", () => {
    const noEnv: ApiFixture = { id: "x", kind: "x", pairs: [{ id: "p", paradigm: "SOAP", oracle: "wsdl", control_claim: "c", owasp: "o", framework_ref: "f", discriminating_node: "d", clean: { label: "c" }, broken: { label: "b" } }] as never };
    expect(() => buildApiVisualOptions("diff-the-trace", "pbwire", noEnv, contracts())).toThrow(/needs an envelope/);
    const noFrame: ApiFixture = { id: "x", kind: "x", pairs: [{ id: "p", paradigm: "gRPC", oracle: "pbwire", control_claim: "c", owasp: "o", framework_ref: "f", discriminating_node: "d", clean: { label: "c" }, broken: { label: "b" } }] as never };
    expect(() => buildApiVisualOptions("diff-the-trace", "pbwire", noFrame, contracts())).toThrow(/needs frame_hex/);
  });
});
