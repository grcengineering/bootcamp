/**
 * protobuf-wire + HTTP/2-frame oracle (engine id: `pbwire`) — the api-paradigms module's
 * gRPC oracle.
 *
 * Pure, DOM-free TypeScript. It decodes three real, layered things into the SHARED parse
 * tree (the same `ParseTreeProbe` the packet-dissector produces, so the PEEL surface and the
 * closed verifier registry treat it identically):
 *
 *   1. the protobuf WIRE format — `tag = (field_number << 3) | wire_type`, VARINT / LEN
 *      (length-delimited) decoding — over REAL message bytes;
 *   2. the gRPC length-prefixed message framing `[compressed-flag:1B][length:4B big-endian][msg]`
 *      (grpc PROTOCOL-HTTP2.md);
 *   3. the gRPC-over-HTTP/2 pseudo-header set (:method/:scheme/:path/:authority) + the required
 *      gRPC request headers + the `grpc-status` trailer.
 *
 * Honesty doctrine: the decoder IS the oracle. Every region value is computed from the real
 * bytes. The encoding is fidelity-checked against the protobuf.dev VERIFIED examples in
 * web/tests/pbwire-fidelity.test.ts (a=150 → 08 96 01; b="testing" → 12 07 74 65 73 74 69 6e 67;
 * mfa_enabled=false → 10 00). No value is authored. Field MEANINGS (which field number is which
 * name) come from the committed .proto contract — supplied as a small field-name map, never
 * invented — and the wire decode stands on its own when no map is given.
 *
 * Cited: protobuf.dev "Encoding"; grpc PROTOCOL-HTTP2.md; RFC 7540 (HTTP/2) for the pseudo-header
 * concept (gRPC always rides HTTP/2 and never HTTP/1.1).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

// ----------------------------------------------------------------------------
// byte helpers (shared shape with pkt.ts; kept local so the engine is self-contained)
// ----------------------------------------------------------------------------

/** Parse a contiguous hex string (no separators required) into bytes. Throws on malformed input. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length === 0) throw new Error("empty hex");
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex (${clean.length})`);
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error("non-hex characters in input");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** protobuf wire types (protobuf.dev Encoding). The api-paradigms model uses VARINT + LEN. */
export const WIRE_TYPES: Record<number, string> = {
  0: "VARINT",
  1: "I64",
  2: "LEN",
  3: "SGROUP",
  4: "EGROUP",
  5: "I32",
};

interface VarintResult {
  value: number;
  /** Number of bytes the varint consumed. */
  len: number;
}

/**
 * Decode one base-128 VARINT at offset `o`. Returns the value (as a JS number — sufficient for
 * the small tags/lengths/booleans the api-paradigms model uses) and the byte length consumed.
 * Throws on a truncated varint (an honest forensic tool never silently zero-fills).
 */
export function readVarint(bytes: Uint8Array, o: number): VarintResult {
  let value = 0;
  let shift = 0;
  let i = o;
  while (i < bytes.length) {
    const b = bytes[i];
    value += (b & 0x7f) * 2 ** shift;
    i++;
    if ((b & 0x80) === 0) return { value, len: i - o };
    shift += 7;
    if (shift > 63) throw new Error(`varint at offset ${o} exceeds 64 bits`);
  }
  throw new Error(`truncated varint at offset ${o}`);
}

/** Decode the tag byte(s) at `o` into { field_number, wire_type } + consumed length. */
export function readTag(bytes: Uint8Array, o: number): { field: number; wire: number; len: number } {
  const { value, len } = readVarint(bytes, o);
  return { field: value >>> 3, wire: value & 0x07, len };
}

/** Big-endian unsigned 32-bit read (the gRPC frame length field). */
function u32be(b: Uint8Array, o: number): number {
  return (b[o] * 0x1000000) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}

function asciiPrintable(b: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) if (b[i] < 0x20 || b[i] > 0x7e) return false;
  return true;
}

const td = new TextDecoder();

// ----------------------------------------------------------------------------
// protobuf message decode → parse-tree regions
// ----------------------------------------------------------------------------

/** Field-name map for a protobuf message: field number → { name, type } from the .proto. */
export type FieldMap = Record<number, { name: string; type: string; sub?: FieldMap }>;

/**
 * Decode a protobuf message body [start,end) into child regions under `parent`. Recurses into
 * LEN fields that the field-map marks as a sub-message (`sub`). idPrefix keeps region ids stable
 * and unique (e.g. "pb.f1.f2").
 */
function decodeMessage(
  bytes: Uint8Array,
  start: number,
  end: number,
  parent: ParseRegion,
  fields: FieldMap,
  idPrefix: string,
): void {
  let o = start;
  let occurrence = 0;
  while (o < end) {
    const tagStart = o;
    const { field, wire, len: tagLen } = readTag(bytes, o);
    o += tagLen;
    const fmeta = fields[field];
    const fname = fmeta?.name ?? `field ${field}`;
    occurrence++;
    const rid = `${idPrefix}.f${field}_${occurrence}`;
    if (wire === 0) {
      // VARINT — bool / int. tag byte + value byte(s).
      const { value, len } = readVarint(bytes, o);
      const valEnd = o + len;
      const decoded = fmeta?.type === "bool" ? (value === 0 ? "false" : "true") : String(value);
      const region: ParseRegion = {
        id: rid,
        start: tagStart,
        end: valEnd,
        label: `${fname} (field ${field}, VARINT)`,
        layer: "field",
        value: `${decoded} — tag 0x${bytes[tagStart].toString(16).padStart(2, "0")} = (field ${field} << 3) | 0 (VARINT)`,
        rfc: "protobuf.dev Encoding",
        children: [
          { id: `${rid}.tag`, start: tagStart, end: o, label: "tag", layer: "field", value: `0x${bytes.slice(tagStart, o).reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")} = (field ${field} << 3) | ${wire} (${WIRE_TYPES[wire]})`, rfc: "protobuf.dev Encoding", children: [] },
          { id: `${rid}.value`, start: o, end: valEnd, label: "value", layer: "field", value: decoded, rfc: "protobuf.dev Encoding", children: [] },
        ],
      };
      parent.children.push(region);
      o = valEnd;
    } else if (wire === 2) {
      // LEN — string / bytes / sub-message. tag + length-varint + payload.
      const { value: plen, len: lenLen } = readVarint(bytes, o);
      const payloadStart = o + lenLen;
      const payloadEnd = payloadStart + plen;
      const isSub = !!fmeta?.sub;
      const isStr = !isSub && asciiPrintable(bytes, payloadStart, payloadEnd);
      const decoded = isSub
        ? `${plen}-byte sub-message`
        : isStr
          ? `"${td.decode(bytes.slice(payloadStart, payloadEnd))}"`
          : `${plen} bytes`;
      const region: ParseRegion = {
        id: rid,
        start: tagStart,
        end: payloadEnd,
        label: `${fname} (field ${field}, LEN)`,
        layer: "field",
        value: `${decoded} — tag 0x${bytes[tagStart].toString(16).padStart(2, "0")} = (field ${field} << 3) | 2 (LEN), length ${plen}`,
        rfc: "protobuf.dev Encoding",
        children: [
          { id: `${rid}.tag`, start: tagStart, end: payloadStart - lenLen, label: "tag", layer: "field", value: `(field ${field} << 3) | 2 (LEN)`, rfc: "protobuf.dev Encoding", children: [] },
          { id: `${rid}.len`, start: payloadStart - lenLen, end: payloadStart, label: "length", layer: "field", value: String(plen), rfc: "protobuf.dev Encoding", children: [] },
          { id: `${rid}.payload`, start: payloadStart, end: payloadEnd, label: "payload", layer: "field", value: decoded, rfc: "protobuf.dev Encoding", children: [] },
        ],
      };
      parent.children.push(region);
      if (isSub && payloadEnd <= bytes.length) {
        decodeMessage(bytes, payloadStart, payloadEnd, region, fmeta!.sub!, rid);
      }
      o = payloadEnd;
    } else {
      // I64 / I32 / groups — surfaced honestly but not deep-decoded (the model doesn't use them).
      const width = wire === 1 ? 8 : wire === 5 ? 4 : 0;
      const valEnd = o + width;
      parent.children.push({
        id: rid,
        start: tagStart,
        end: valEnd,
        label: `${fname} (field ${field}, ${WIRE_TYPES[wire] ?? "wire " + wire})`,
        layer: "field",
        value: `${width}-byte ${WIRE_TYPES[wire] ?? "wire " + wire} field`,
        rfc: "protobuf.dev Encoding",
        children: [],
      });
      o = valEnd;
    }
  }
}

// ----------------------------------------------------------------------------
// public decoders
// ----------------------------------------------------------------------------

/** Decode a bare protobuf message (no gRPC frame) into a ParseTreeProbe. */
export function decodeProtobuf(bytes: Uint8Array, fields: FieldMap = {}): ParseTreeProbe {
  if (bytes.length === 0) throw new Error("empty protobuf message");
  const root: ParseRegion = {
    id: "pb",
    start: 0,
    end: bytes.length,
    label: "protobuf message",
    layer: "message",
    value: `${bytes.length} bytes`,
    rfc: "protobuf.dev Encoding",
    children: [],
  };
  decodeMessage(bytes, 0, bytes.length, root, fields, "pb");
  return buildProbe(root, bytes.length);
}

/**
 * Decode a gRPC length-prefixed message frame `[flag:1B][len:4B BE][protobuf]` into a parse
 * tree: the 1-byte compressed-flag, the 4-byte big-endian length, and the framed protobuf
 * message (decoded with the supplied field map). grpc PROTOCOL-HTTP2.md.
 */
export function decodeGrpcFrame(bytes: Uint8Array, fields: FieldMap = {}): ParseTreeProbe {
  if (bytes.length < 5) throw new Error("gRPC frame shorter than the 5-byte prefix");
  const flag = bytes[0];
  const msgLen = u32be(bytes, 1);
  const msgStart = 5;
  const msgEnd = Math.min(msgStart + msgLen, bytes.length);
  const root: ParseRegion = {
    id: "grpc",
    start: 0,
    end: bytes.length,
    label: "gRPC length-prefixed message",
    layer: "frame",
    value: `compressed=${flag}, length=${msgLen}`,
    rfc: "grpc PROTOCOL-HTTP2.md",
    children: [
      { id: "grpc.flag", start: 0, end: 1, label: "Compressed-Flag", layer: "frame", value: `0x${flag.toString(16).padStart(2, "0")} = ${flag === 0 ? "uncompressed" : "compressed"}`, rfc: "grpc PROTOCOL-HTTP2.md", children: [] },
      { id: "grpc.length", start: 1, end: 5, label: "Message-Length (uint32 big-endian)", layer: "frame", value: `${msgLen} bytes`, rfc: "grpc PROTOCOL-HTTP2.md", gates: "grpc.message", children: [] },
    ],
  };
  const message: ParseRegion = {
    id: "grpc.message",
    start: msgStart,
    end: msgEnd,
    label: "protobuf message",
    layer: "message",
    value: `${msgEnd - msgStart} bytes`,
    rfc: "protobuf.dev Encoding",
    children: [],
  };
  decodeMessage(bytes, msgStart, msgEnd, message, fields, "grpc.message");
  root.children.push(message);
  return buildProbe(root, bytes.length);
}

/** A single HTTP/2 header (pseudo-header or regular) the capture carries. */
export interface Http2Header {
  name: string;
  value: string;
}

/**
 * Build a parse tree over a gRPC-over-HTTP/2 EXCHANGE: the request HEADERS frame's pseudo +
 * regular headers, the framed message body, and the response `grpc-status` trailer. This is
 * the high-level PEEL view (the design's "PEEL the gRPC Frame" activity). Headers are real
 * captured fields (their byte offsets in the decoded HPACK table are not meaningful, so each
 * header region is keyed by stable id and its [start,end) is its index in the header block —
 * the PEEL surface treats them as selectable nodes, the same as byte ranges).
 */
export function decodeGrpcExchange(opts: {
  requestHeaders: Http2Header[];
  frameHex: string;
  responseTrailers: Http2Header[];
  fields?: FieldMap;
}): ParseTreeProbe {
  const root: ParseRegion = {
    id: "exchange",
    start: 0,
    end: 0,
    label: "gRPC/HTTP-2 exchange",
    layer: "exchange",
    value: "request HEADERS + message + response trailers",
    rfc: "grpc PROTOCOL-HTTP2.md",
    children: [],
  };
  let cursor = 0;
  const headerRegion = (group: string, h: Http2Header, layer: string): ParseRegion => {
    const start = cursor++;
    return {
      id: `${group}.${h.name.replace(/[^a-z0-9]/gi, "_")}`,
      start,
      end: start + 1,
      label: h.name,
      layer,
      value: h.value,
      rfc: h.name.startsWith(":") ? "RFC 7540 §8.1.2.3 (pseudo-header)" : "grpc PROTOCOL-HTTP2.md",
      children: [],
    };
  };
  const reqHeaders: ParseRegion = {
    id: "req.headers",
    start: cursor,
    end: 0,
    label: "Request HEADERS",
    layer: "http2",
    value: `${opts.requestHeaders.length} headers`,
    rfc: "RFC 7540 §6.2",
    children: opts.requestHeaders.map((h) => headerRegion("req", h, h.name.startsWith(":") ? "pseudo" : "http2")),
  };
  reqHeaders.end = cursor;
  root.children.push(reqHeaders);

  // the framed message body
  const frameBytes = hexToBytes(opts.frameHex);
  const frameTree = decodeGrpcFrame(frameBytes, opts.fields ?? {});
  // re-base the frame regions' offsets onto a synthetic body window so ids stay unique & ranges valid
  const bodyBase = cursor;
  cursor += frameBytes.length;
  const rebase = (r: ParseRegion): ParseRegion => ({
    ...r,
    id: `body.${r.id}`,
    start: bodyBase + r.start,
    end: bodyBase + r.end,
    gates: r.gates ? `body.${r.gates}` : undefined,
    children: r.children.map(rebase),
  });
  const body = rebase(frameTree.root);
  body.label = "Message body — " + body.label;
  root.children.push(body);

  const trailers: ParseRegion = {
    id: "resp.trailers",
    start: cursor,
    end: 0,
    label: "Response trailers",
    layer: "http2",
    value: opts.responseTrailers.map((t) => `${t.name}: ${t.value}`).join(", "),
    rfc: "grpc PROTOCOL-HTTP2.md",
    children: opts.responseTrailers.map((t) => headerRegion("trailer", t, "http2")),
  };
  trailers.end = cursor;
  root.children.push(trailers);

  root.end = cursor;
  return buildProbe(root, cursor);
}

// ----------------------------------------------------------------------------
// probe assembly (mirrors pkt.buildProbe so verifiers treat every oracle uniformly)
// ----------------------------------------------------------------------------

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map(regions.map((r) => [`${r.start}:${r.end}`, r]));
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
