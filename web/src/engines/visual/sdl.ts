/**
 * GraphQL SDL contract oracle (engine id: `sdl`) — the api-paradigms module's GraphQL oracle.
 *
 * Pure, DOM-free TypeScript. Parses a REAL GraphQL Schema Definition Language document over the
 * shared "list users + MFA" model into the SHARED parse tree (the same `ParseTreeProbe` the other
 * oracles produce). The learner PEELs to the MFA truth-field node: `type User { … mfaEnabled: Boolean … }`.
 *
 * Honesty doctrine: the parser IS the oracle. The SDL is tokenized and structured by a small,
 * deterministic type/field reader (no schema is invented). Each field region carries its real
 * GraphQL type read off the document; the byte range is the field token's character span in the
 * raw SDL. Node ids are stable (`sdl.type.User.field.mfaEnabled`).
 *
 * Cited: GraphQL Specification — Schema Definition Language (spec.graphql.org). Scope is SDL
 * reading (type/field/argument extraction); it is not a full GraphQL validator (that is `gqlsim`).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

/** One parsed SDL field: name, type expression, and its char span in the raw text. */
interface SdlField {
  name: string;
  type: string;
  span: ByteRange;
}

/** One parsed SDL type/object: name, kind, fields, and its span. */
interface SdlType {
  kind: string; // "type" | "input" | "enum" | "interface" | "scalar"
  name: string;
  fields: SdlField[];
  span: ByteRange;
}

/**
 * Tokenize the SDL into top-level type definitions. Deterministic, comment-aware (strips `#`
 * line comments), brace-balanced field extraction. Returns the structured types in document order.
 */
function parseTypes(sdl: string): SdlType[] {
  const stripped = sdl.replace(/#[^\n]*/g, (m) => " ".repeat(m.length)); // keep offsets stable
  const types: SdlType[] = [];
  const typeRe = /\b(type|input|interface|enum|scalar)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(stripped)) !== null) {
    const kind = m[1];
    const name = m[2];
    const headStart = m.index;
    const nameStart = stripped.indexOf(name, m.index);
    const fields: SdlField[] = [];
    let span: ByteRange = { start: nameStart, end: nameStart + name.length };
    if (kind === "scalar") {
      types.push({ kind, name, fields, span });
      typeRe.lastIndex = nameStart + name.length;
      continue;
    }
    const braceOpen = stripped.indexOf("{", m.index);
    if (braceOpen < 0) continue;
    // brace-balanced body
    let depth = 0;
    let i = braceOpen;
    for (; i < stripped.length; i++) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const body = stripped.slice(braceOpen + 1, i - 1);
    span = { start: headStart, end: i };
    if (kind === "enum") {
      // enum values, not typed fields
      const valRe = /([A-Za-z_][A-Za-z0-9_]*)/g;
      let v: RegExpExecArray | null;
      while ((v = valRe.exec(body)) !== null) {
        const vs = braceOpen + 1 + v.index;
        fields.push({ name: v[1], type: "(enum value)", span: { start: vs, end: vs + v[1].length } });
      }
    } else {
      // fields:  name(args): Type
      const fieldRe = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:\s*([A-Za-z_][A-Za-z0-9_!\[\]]*)/g;
      let f: RegExpExecArray | null;
      while ((f = fieldRe.exec(body)) !== null) {
        const fs = braceOpen + 1 + f.index;
        fields.push({ name: f[1], type: f[2], span: { start: fs, end: fs + f[1].length } });
      }
    }
    types.push({ kind, name, fields, span });
    typeRe.lastIndex = i;
  }
  return types;
}

/** Parse a real GraphQL SDL document into a ParseTreeProbe. */
export function parseSdl(sdl: string): ParseTreeProbe {
  const types = parseTypes(sdl);
  const root: ParseRegion = {
    id: "sdl",
    start: 0,
    end: sdl.length,
    label: "GraphQL SDL",
    layer: "document",
    value: `${types.length} type definitions`,
    rfc: "GraphQL SDL",
    children: [],
  };
  for (const t of types) {
    const typeRegion: ParseRegion = {
      id: `sdl.${t.kind}.${t.name}`,
      start: t.span.start,
      end: t.span.end,
      label: `${t.kind} ${t.name}`,
      layer: "type",
      value: t.kind === "scalar" ? "scalar" : `${t.fields.length} ${t.kind === "enum" ? "values" : "fields"}`,
      rfc: "GraphQL SDL",
      children: t.fields.map((f) => ({
        id: `sdl.type.${t.name}.field.${f.name}`,
        start: f.span.start,
        end: f.span.end,
        label: f.name,
        layer: "field",
        value: f.type,
        rfc: "GraphQL SDL",
        children: [],
      })),
    };
    root.children.push(typeRegion);
  }
  return buildProbe(root, sdl.length);
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
