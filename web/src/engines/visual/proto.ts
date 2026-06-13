/**
 * protobuf .proto contract oracle (engine id: `proto`) — the api-paradigms module's gRPC contract.
 *
 * Pure, DOM-free TypeScript. Parses a REAL protobuf IDL (.proto, proto3) over the shared
 * "list users + MFA" model into the SHARED parse tree (the same `ParseTreeProbe` the other
 * oracles produce). The learner PEELs to the MFA truth-field node: `bool mfa_enabled = 2;` —
 * reading the FIELD TAG `= 2` that the wire encoder turns into byte 0x10 (verified in `pbwire`).
 *
 * Honesty doctrine: the parser IS the oracle. Messages, service RPCs, and fields (type, name,
 * tag number) are read deterministically off the document text; nothing is invented. The byte
 * range is the field declaration's char span in the raw .proto. Node ids are stable
 * (`proto.message.User.field.mfa_enabled`). The `= N` tag the parser reads is the SAME N the
 * `pbwire` decoder reconstructs from `tag = (N << 3) | wire_type` — the contract and the wire agree.
 *
 * Cited: Protocol Buffers — Language Guide (proto3); protobuf.dev Encoding for tag semantics.
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

interface ProtoField {
  modifier?: string; // "repeated" | "optional" | ""
  type: string;
  name: string;
  tag: number;
  span: ByteRange;
}
interface ProtoMessage {
  name: string;
  fields: ProtoField[];
  span: ByteRange;
}
interface ProtoRpc {
  name: string;
  input: string;
  output: string;
  span: ByteRange;
}
interface ProtoService {
  name: string;
  rpcs: ProtoRpc[];
  span: ByteRange;
}

/** Strip // and /* *​/ comments while preserving character offsets (replace with spaces). */
function stripComments(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function balancedBody(src: string, openIdx: number): { body: string; end: number } {
  let depth = 0;
  let i = openIdx;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return { body: src.slice(openIdx + 1, i - 1), end: i };
}

/** Parse a real proto3 .proto document into a ParseTreeProbe. */
export function parseProto(rawProto: string): ParseTreeProbe {
  const src = stripComments(rawProto);
  const messages: ProtoMessage[] = [];
  const services: ProtoService[] = [];

  const msgRe = /\bmessage\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = msgRe.exec(src)) !== null) {
    const name = m[1];
    const open = src.indexOf("{", m.index);
    const { body, end } = balancedBody(src, open);
    const fields: ProtoField[] = [];
    // field:  [repeated|optional] Type name = N;
    const fieldRe = /(?:(repeated|optional)\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*;/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(body)) !== null) {
      const fs = open + 1 + f.index;
      fields.push({ modifier: f[1] ?? "", type: f[2], name: f[3], tag: Number(f[4]), span: { start: fs, end: fs + f[0].length } });
    }
    messages.push({ name, fields, span: { start: m.index, end } });
    msgRe.lastIndex = end;
  }

  const svcRe = /\bservice\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  let s: RegExpExecArray | null;
  while ((s = svcRe.exec(src)) !== null) {
    const name = s[1];
    const open = src.indexOf("{", s.index);
    const { body, end } = balancedBody(src, open);
    const rpcs: ProtoRpc[] = [];
    const rpcRe = /\brpc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)\s*returns\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/g;
    let r: RegExpExecArray | null;
    while ((r = rpcRe.exec(body)) !== null) {
      const rs = open + 1 + r.index;
      rpcs.push({ name: r[1], input: r[2], output: r[3], span: { start: rs, end: rs + r[0].length } });
    }
    services.push({ name, rpcs, span: { start: s.index, end } });
    svcRe.lastIndex = end;
  }

  const root: ParseRegion = {
    id: "proto",
    start: 0,
    end: rawProto.length,
    label: ".proto definition (proto3)",
    layer: "document",
    value: `${services.length} service(s), ${messages.length} message(s)`,
    rfc: "protobuf proto3 Language Guide",
    children: [],
  };

  for (const svc of services) {
    root.children.push({
      id: `proto.service.${svc.name}`,
      start: svc.span.start,
      end: svc.span.end,
      label: `service ${svc.name}`,
      layer: "service",
      value: `${svc.rpcs.length} rpc(s)`,
      rfc: "protobuf proto3 Language Guide",
      children: svc.rpcs.map((r) => ({
        id: `proto.service.${svc.name}.rpc.${r.name}`,
        start: r.span.start,
        end: r.span.end,
        label: `rpc ${r.name}`,
        layer: "rpc",
        value: `(${r.input}) returns (${r.output})`,
        rfc: "protobuf proto3 Language Guide",
        children: [],
      })),
    });
  }

  for (const msg of messages) {
    root.children.push({
      id: `proto.message.${msg.name}`,
      start: msg.span.start,
      end: msg.span.end,
      label: `message ${msg.name}`,
      layer: "message",
      value: `${msg.fields.length} field(s)`,
      rfc: "protobuf proto3 Language Guide",
      children: msg.fields.map((f) => ({
        id: `proto.message.${msg.name}.field.${f.name}`,
        start: f.span.start,
        end: f.span.end,
        label: `${f.modifier ? f.modifier + " " : ""}${f.type} ${f.name}`,
        layer: "field",
        // value surfaces the FIELD TAG — the load-bearing number the wire encodes (= 2 → 0x10)
        value: `${f.type} ${f.name} = ${f.tag} (field tag ${f.tag})`,
        rfc: "protobuf.dev Encoding",
        children: [],
      })),
    });
  }

  return buildProbe(root, rawProto.length);
}

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map<string, ParseRegion>();
  for (const r of regions) {
    const k = `${r.start}:${r.end}`;
    if (!byRange.has(k)) byRange.set(k, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
