/**
 * HTTP-header oracles (engine id: `hdr`) — RFC 7239 Forwarded / RFC 6265 Set-Cookie /
 * RFC 9111 Cache-Control parsers over RFC LITERAL example bytes.
 *
 * Pure, DOM-free TypeScript. Each parser turns a real header value into the SHARED parse tree
 * (the same `ParseTreeProbe` the other oracles produce), so the PEEL surface and the closed
 * verifier registry treat headers exactly like packet/contract bytes. The character span of each
 * token in the raw header IS its "byte range".
 *
 * Honesty doctrine: the parser IS the oracle. Every token boundary and decoded value is computed
 * from the real header string per the RFC grammar — no authored answer key. Fixtures use the RFC
 * literal examples (match: authored-with-citation).
 *
 * Cited: RFC 7239 §4 (Forwarded for/by/host/proto); RFC 6265 §4.1 (Set-Cookie cookie-av:
 * Secure/HttpOnly/SameSite); RFC 9111 §5.2 (Cache-Control) + §5.1 (Age).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

/** Span of a substring within a header value (best-effort, monotonic via fromOffset). */
function span(raw: string, token: string, from = 0): ByteRange {
  const idx = raw.indexOf(token, from);
  if (idx < 0) return { start: 0, end: 0 };
  return { start: idx, end: idx + token.length };
}

// ----------------------------------------------------------------------------
// RFC 7239 — Forwarded
// ----------------------------------------------------------------------------

/**
 * Parse a `Forwarded` header value (RFC 7239 §4): one or more forwarded-elements, each a set of
 * `token=value` pairs (for / by / host / proto). The proto= parameter is the load-bearing field
 * for "which protocol did the CLIENT use" after upstream TLS termination.
 */
export function parseForwarded(value: string): ParseTreeProbe {
  const root: ParseRegion = {
    id: "fwd",
    start: 0,
    end: value.length,
    label: "Forwarded",
    layer: "header",
    value,
    rfc: "RFC 7239 §4",
    children: [],
  };
  // forwarded-elements are comma-separated; params within an element are semicolon-separated
  let cursor = 0;
  value.split(",").forEach((element, ei) => {
    const elTrim = element.trim();
    const elStart = value.indexOf(elTrim, cursor);
    const el: ParseRegion = {
      id: `fwd.el${ei}`,
      start: elStart,
      end: elStart + elTrim.length,
      label: `forwarded-element ${ei + 1}`,
      layer: "element",
      value: elTrim,
      rfc: "RFC 7239 §4",
      children: [],
    };
    let pcursor = elStart;
    for (const pair of elTrim.split(";")) {
      const t = pair.trim();
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim().toLowerCase();
      const val = t.slice(eq + 1).trim().replace(/^"|"$/g, "");
      const ps = span(value, t, pcursor);
      pcursor = ps.end || pcursor;
      el.children.push({
        id: `fwd.el${ei}.${key}`,
        start: ps.start,
        end: ps.end,
        label: key,
        layer: "param",
        value: val,
        rfc: "RFC 7239 §4 (forwarded-pair)",
        children: [],
      });
    }
    cursor = elStart + elTrim.length;
    root.children.push(el);
  });
  return buildProbe(root, value.length);
}

// ----------------------------------------------------------------------------
// RFC 6265 — Set-Cookie
// ----------------------------------------------------------------------------

/**
 * Parse a `Set-Cookie` header value (RFC 6265 §4.1): the name=value pair plus cookie-av attributes
 * (Path, Domain, Secure, HttpOnly, SameSite, Max-Age, Expires). Secure / HttpOnly are flag
 * attributes (no value); the others are name=value. Missing Secure/HttpOnly is the control gap the
 * Diff surface clicks — the parser reports which safety attributes are PRESENT vs ABSENT.
 */
export function parseSetCookie(value: string): ParseTreeProbe {
  const root: ParseRegion = {
    id: "cookie",
    start: 0,
    end: value.length,
    label: "Set-Cookie",
    layer: "header",
    value,
    rfc: "RFC 6265 §4.1",
    children: [],
  };
  const parts = value.split(";");
  let cursor = 0;
  const presentAttrs = new Set<string>();
  parts.forEach((part, pi) => {
    const t = part.trim();
    const ps = span(value, t, cursor);
    cursor = ps.end || cursor;
    if (pi === 0) {
      // the cookie-pair name=value
      const eq = t.indexOf("=");
      root.children.push({
        id: "cookie.pair",
        start: ps.start,
        end: ps.end,
        label: "cookie-pair",
        layer: "pair",
        value: eq >= 0 ? `${t.slice(0, eq)} = ${t.slice(eq + 1)}` : t,
        rfc: "RFC 6265 §4.1.1",
        children: [],
      });
      return;
    }
    const eq = t.indexOf("=");
    const av = (eq >= 0 ? t.slice(0, eq) : t).trim();
    const avLower = av.toLowerCase();
    presentAttrs.add(avLower);
    root.children.push({
      id: `cookie.av.${avLower}`,
      start: ps.start,
      end: ps.end,
      label: av,
      layer: "cookie-av",
      value: eq >= 0 ? t.slice(eq + 1).trim() : "(flag attribute — present)",
      rfc: "RFC 6265 §4.1.2",
      children: [],
    });
  });
  // a summary region naming which safety attributes are present/absent (the control read)
  const safe = ["secure", "httponly", "samesite"];
  const missing = safe.filter((a) => !presentAttrs.has(a));
  root.children.push({
    id: "cookie.safety",
    start: 0,
    end: 0,
    label: "session-safety attributes",
    layer: "control",
    value: `present: ${safe.filter((a) => presentAttrs.has(a)).join(", ") || "(none)"} · absent: ${missing.join(", ") || "(none)"}`,
    rfc: "RFC 6265 §4.1.2",
    children: [],
  });
  return buildProbe(root, value.length);
}

// ----------------------------------------------------------------------------
// RFC 9111 — Cache-Control + Age
// ----------------------------------------------------------------------------

/**
 * Parse a `Cache-Control` header value (RFC 9111 §5.2): the comma-separated directives
 * (no-store, no-cache, private, public, max-age=N, …). The "private, no-store" pair is the
 * control truth for "sensitive responses are not cached"; an `X-Cache: HIT` + `Age: 142` pair on
 * the same response is the break. Pass the optional `age` to fold the Age header in (§5.1).
 */
export function parseCacheControl(value: string, age?: string): ParseTreeProbe {
  const root: ParseRegion = {
    id: "cache",
    start: 0,
    end: value.length,
    label: "Cache-Control",
    layer: "header",
    value,
    rfc: "RFC 9111 §5.2",
    children: [],
  };
  let cursor = 0;
  for (const dir of value.split(",")) {
    const t = dir.trim();
    if (!t) continue;
    const ps = span(value, t, cursor);
    cursor = ps.end || cursor;
    const eq = t.indexOf("=");
    const name = (eq >= 0 ? t.slice(0, eq) : t).trim().toLowerCase();
    root.children.push({
      id: `cache.${name}`,
      start: ps.start,
      end: ps.end,
      label: name,
      layer: "directive",
      value: eq >= 0 ? t.slice(eq + 1).trim() : "(present)",
      rfc: "RFC 9111 §5.2",
      children: [],
    });
  }
  if (age !== undefined) {
    root.children.push({
      id: "cache.age",
      start: 0,
      end: 0,
      label: "Age",
      layer: "header",
      value: `${age} seconds — a cache served this response (RFC 9111 §5.1)`,
      rfc: "RFC 9111 §5.1",
      children: [],
    });
  }
  return buildProbe(root, value.length);
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
