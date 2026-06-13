/**
 * protobuf-wire + HTTP/2 fidelity suite (Wave-4, api-paradigms) — the byte-exact honesty gate.
 *
 * The protobuf decoder is the oracle for the gRPC leg. This suite pins it to the VERIFIED
 * protobuf.dev "Encoding" examples (the same constants the module teaches and the fixtures carry),
 * so the decoder can never drift from the real wire format:
 *   - message Test1 { int32 a = 1; }  with a = 150        → 08 96 01
 *   - message Test2 { string b = 2; } with b = "testing"  → 12 07 74 65 73 74 69 6e 67
 *   - bool mfa_enabled = 2 (field 2, VARINT) = false       → 10 00
 * It also pins the gRPC framing ([flag:1B][len:4B BE][msg]) and the SHA-1 vectors the WS-Security
 * digest transform stands on. If any of these change, the oracle is wrong — fail loudly.
 */
import { describe, expect, test } from "bun:test";
import { decodeProtobuf, decodeGrpcFrame, hexToBytes, readVarint, readTag, WIRE_TYPES } from "../src/engines/visual/pbwire";
import { sha1, base64ToBytes } from "../src/engines/visual/wsdl";

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

describe("protobuf wire fidelity — protobuf.dev verified byte examples", () => {
  test("a=150 (field 1, int32 VARINT) is exactly the bytes 08 96 01", () => {
    // the decoder reads these exact bytes and reconstructs field 1 = 150
    const bytes = hexToBytes("089601");
    expect(hex(bytes)).toBe("089601"); // assert the fixture/example bytes themselves
    const tree = decodeProtobuf(bytes, { 1: { name: "a", type: "int32" } });
    const f = tree.region("pb.f1_1")!;
    expect(f.value).toContain("150");
    expect(f.value).toContain("0x08"); // tag = (1 << 3) | 0 = 0x08
    // tag byte decoded structurally
    const tag = readTag(bytes, 0);
    expect(tag.field).toBe(1);
    expect(tag.wire).toBe(0);
    expect(WIRE_TYPES[tag.wire]).toBe("VARINT");
    // the VARINT 96 01 decodes to 150
    expect(readVarint(bytes, 1).value).toBe(150);
  });

  test('b="testing" (field 2, string LEN) is exactly 12 07 74 65 73 74 69 6e 67', () => {
    const bytes = hexToBytes("120774657374696e67");
    expect(hex(bytes)).toBe("120774657374696e67");
    const tree = decodeProtobuf(bytes, { 2: { name: "b", type: "string" } });
    const f = tree.region("pb.f2_1")!;
    expect(f.value).toContain('"testing"');
    expect(f.value).toContain("0x12"); // tag = (2 << 3) | 2 = 0x12 (LEN)
    expect(f.value).toContain("length 7");
    const tag = readTag(bytes, 0);
    expect(tag.field).toBe(2);
    expect(tag.wire).toBe(2);
    expect(WIRE_TYPES[tag.wire]).toBe("LEN");
  });

  test("mfa_enabled = false (field 2, bool VARINT) is exactly 10 00", () => {
    const bytes = hexToBytes("1000");
    expect(hex(bytes)).toBe("1000");
    const tree = decodeProtobuf(bytes, { 2: { name: "mfa_enabled", type: "bool" } });
    const f = tree.region("pb.f2_1")!;
    expect(f.value).toContain("false");
    expect(f.value).toContain("0x10"); // tag = (2 << 3) | 0 = 0x10 (field 2 VARINT)
  });

  test("mfa_enabled = true (field 2, bool VARINT) is exactly 10 01", () => {
    const tree = decodeProtobuf(hexToBytes("1001"), { 2: { name: "mfa_enabled", type: "bool" } });
    expect(tree.region("pb.f2_1")!.value).toContain("true");
  });

  test("the gRPC frame prefix is [compressed-flag:1B][length:4B big-endian]", () => {
    // wrap the a=150 message in a gRPC frame: flag 0, length 3, then 08 96 01
    const frame = hexToBytes("00000000" + "03" + "089601"); // 00 | 00 00 00 03 | 08 96 01
    const tree = decodeGrpcFrame(frame, { 1: { name: "a", type: "int32" } });
    expect(tree.region("grpc.flag")!.value).toContain("uncompressed");
    expect(tree.region("grpc.length")!.value).toBe("3 bytes");
    expect(tree.region("grpc.message.f1_1")!.value).toContain("150");
  });
});

describe("SHA-1 fidelity (the WS-Security digest transform stands on RFC 3174 vectors)", () => {
  test("sha1 reproduces the RFC 3174 / FIPS 180 vectors", () => {
    expect(hex(sha1(new Uint8Array(0)))).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(hex(sha1(new TextEncoder().encode("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(hex(sha1(new TextEncoder().encode("hello")))).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  });

  test("base64ToBytes round-trips the canonical example", () => {
    expect(new TextDecoder().decode(base64ToBytes("aGVsbG8="))).toBe("hello");
  });
});
