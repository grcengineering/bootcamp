/**
 * OpenAPI 3.1 contract oracle (engine id: `oas`) — the api-paradigms module's REST oracle.
 *
 * Pure, DOM-free TypeScript. Parses a REAL machine-readable OpenAPI 3.1.0 document (JSON) over
 * the shared "list users + MFA" model into the SHARED parse tree (the same `ParseTreeProbe` the
 * packet-dissector produces). The learner PEELs to the MFA truth-field node:
 *   paths > /users > get > responses > 200 > content > schema > User > properties > mfa_enabled.
 *
 * Honesty doctrine: the parser IS the oracle. Every region label and value is computed from the
 * real document bytes (JSON.parse + a deterministic walk) — there is no authored answer key. The
 * "byte range" is the character offset of each node's key in the raw JSON text (so the PEEL
 * surface can show a real span), found by a forgiving locator; node ids are stable JSON pointers.
 *
 * Cited: OpenAPI Specification 3.1.0 (spec.openapis.org/oas/v3.1.0). The truth-field is read off
 * the contract, never from memory — the contract is the first place a control's truth lives.
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

/** Locate the character span of a `"key"` token in the raw JSON (best-effort; honest fallback). */
function locateKey(raw: string, key: string, fromOffset = 0): ByteRange {
  const needle = `"${key}"`;
  const idx = raw.indexOf(needle, fromOffset);
  if (idx < 0) return { start: 0, end: 0 };
  return { start: idx, end: idx + needle.length };
}

/** Compact one-line JSON value preview for the inspector. */
function preview(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "object") {
    if (Array.isArray(v)) return `[${v.length} items]`;
    // For a schema node, surface its load-bearing JSON-Schema keys inline (type/format/description)
    // so a learner reading "mfa_enabled" sees its real type without descending — the truth-field
    // value the design's field_value_is check reads ("boolean").
    const o = v as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o["type"] === "string") parts.push(`type=${o["type"]}`);
    if (typeof o["format"] === "string") parts.push(`format=${o["format"]}`);
    if (Array.isArray(o["enum"])) parts.push(`enum=[${(o["enum"] as unknown[]).join(",")}]`);
    if (typeof o["description"] === "string") parts.push(o["description"] as string);
    if (parts.length) return parts.join(" · ");
    return `{${Object.keys(o).length} keys}`;
  }
  return JSON.stringify(v);
}

interface BuildCtx {
  raw: string;
  cursor: number;
}

/**
 * Recursively turn a JSON node into a parse region. `path` is the dotted JSON pointer used as the
 * stable region id; `keyName` is the node's key under its parent. The byte range is the located
 * span of the key in the raw text (monotonic cursor keeps repeated keys distinct).
 */
function nodeRegion(ctx: BuildCtx, value: unknown, keyName: string, path: string, depth: number): ParseRegion {
  const span = keyName ? locateKey(ctx.raw, keyName, ctx.cursor) : { start: 0, end: ctx.raw.length };
  if (span.end > ctx.cursor) ctx.cursor = span.start; // advance past where we matched (allow children to find nested keys after)
  const region: ParseRegion = {
    id: path,
    start: span.start,
    end: span.end,
    label: keyName || "(root)",
    layer: depth === 0 ? "document" : "node",
    value: preview(value),
    rfc: "OpenAPI 3.1.0",
    children: [],
  };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      region.children.push(nodeRegion(ctx, v, k, `${path}.${k}`, depth + 1));
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => region.children.push(nodeRegion(ctx, v, String(i), `${path}.${i}`, depth + 1)));
  }
  return region;
}

/**
 * Parse a real OpenAPI 3.1 JSON document into a ParseTreeProbe. The whole document is walked so
 * any node is PEELable; the truth-field node id is the JSON pointer
 * `paths./users.get.responses.200.content.application/json.schema.properties.mfa_enabled`.
 */
export function parseOpenApi(rawJson: string): ParseTreeProbe {
  const doc = JSON.parse(rawJson) as Record<string, unknown>;
  const ctx: BuildCtx = { raw: rawJson, cursor: 0 };
  const root = nodeRegion(ctx, doc, "", "oas", 0);
  root.label = `OpenAPI ${(doc["openapi"] as string) ?? "3.1"} document`;
  root.value = `info.title=${preview((doc["info"] as Record<string, unknown>)?.["title"])}`;
  return buildProbe(root, rawJson.length);
}

// ----------------------------------------------------------------------------
// probe assembly (shared shape)
// ----------------------------------------------------------------------------

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  // de-dupe ids defensively (repeated keys at different paths already differ by path)
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
