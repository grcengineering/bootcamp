/**
 * API-oracle panel-tree builder (Wave-4) — the SERIALIZABLE seam between the build step and the
 * browser. Functions don't survive JSON, so (exactly like the `pkt` canary serializes `hex` and
 * re-dissects in the browser) the api panels serialize a small `ApiPanelSource` descriptor — the
 * raw contract string / the gRPC exchange parts / the GraphQL query — and BOTH sync-content and the
 * VisualHost constructor rebuild the live ParseTreeProbe from it via `buildApiPanelTree`.
 *
 * Pure + DOM-free, and dependency-free of VisualHost (no import cycle): it only produces the shared
 * ParseTreeProbe from the contract/wire oracles. The parser/decoder over the real artifact IS the
 * oracle; the source descriptor carries only the real bytes/records, never a parse tree.
 */
import type { ParseTreeProbe } from "./pkt";
import { parseOpenApi } from "./oas";
import { parseSdl } from "./sdl";
import { parseProto } from "./proto";
import { parseWsdl, parseSoapSecurity } from "./wsdl";
import { decodeGrpcExchange, type FieldMap, type Http2Header } from "./pbwire";
import { maxSelectionDepth, isIntrospection } from "./gqlsim";
import { buildOciPanelTree, type OciPanelSource } from "./oci";
import { parseForwarded, parseSetCookie, parseCacheControl } from "./hdr";
import { buildJwtProbe } from "./jwt";
import { buildCertProbe, hexToBytes } from "./x509";
import { parseDnsHex } from "./dns";
import { parseSyslog } from "./syslog";
import { parseSamlAssertion } from "./saml";
import { buildTransformProbe, type TransformName } from "./xform";

/** A serializable description of one api/visual panel's REAL artifact + which oracle parses it. */
export type ApiPanelSource =
  | { oracle: "oas" | "sdl" | "proto"; raw: string }
  | { oracle: "wsdl"; raw: string }
  | { oracle: "soap"; envelope: string; password: string }
  | { oracle: "pbwire"; requestHeaders: Http2Header[]; frameHex: string; responseTrailers: Http2Header[]; fieldMap: FieldMap }
  | { oracle: "gqlsim"; query: string }
  // Wave-4 module 21 (containers): the OCI image reader's serializable source (manifest + config +
  // the pre-gunzipped layer tar hex). Same build↔browser seam as the contract/wire oracles above.
  | OciPanelSource
  // Wave-4 header/crypto/identity/logging oracles (modules 18, 22-25): each panel carries the REAL
  // header string / JWT token / cert DER hex / DNS hex / syslog line / SAML XML / transform cards,
  // and the browser re-runs the SAME parser the build step used. The parser over the real bytes IS
  // the oracle; the source descriptor carries only the real input, never a parse tree.
  | { oracle: "forwarded"; header: string }
  | { oracle: "set-cookie"; header: string }
  | { oracle: "cache-control"; header: string; age?: string }
  | { oracle: "jwt"; token: string }
  | { oracle: "x509"; derHex: string }
  | { oracle: "dns"; hex: string }
  | { oracle: "syslog"; line: string }
  | { oracle: "saml"; xml: string }
  | { oracle: "xform"; cards: Array<{ id: string; input: string; transform: TransformName }> };

/** Rebuild the live parse tree for one panel from its serializable source. The oracle is truth. */
export function buildApiPanelTree(source: ApiPanelSource): ParseTreeProbe {
  switch (source.oracle) {
    case "oas":
      return parseOpenApi(source.raw);
    case "sdl":
      return parseSdl(source.raw);
    case "proto":
      return parseProto(source.raw);
    case "wsdl":
      return parseWsdl(source.raw);
    case "soap":
      return parseSoapSecurity(source.envelope, source.password);
    case "pbwire":
      return decodeGrpcExchange({
        requestHeaders: source.requestHeaders,
        frameHex: source.frameHex,
        responseTrailers: source.responseTrailers,
        fields: source.fieldMap,
      });
    case "gqlsim":
      return queryAsTree(source.query);
    case "oci":
      return buildOciPanelTree(source);
    case "forwarded":
      return parseForwarded(source.header);
    case "set-cookie":
      return parseSetCookie(source.header);
    case "cache-control":
      return parseCacheControl(source.header, source.age);
    case "jwt":
      return buildJwtProbe(source.token);
    case "x509":
      return buildCertProbe(hexToBytes(source.derHex));
    case "dns":
      return parseDnsHex(source.hex);
    case "syslog":
      return parseSyslog(source.line);
    case "saml":
      return parseSamlAssertion(source.xml);
    case "xform":
      return buildTransformProbe(source.cards);
  }
}

/**
 * A minimal parse tree over a GraphQL query string for the diff leg: the whole query as the root,
 * plus the two control-relevant computed regions the limiter reports (max depth, introspection
 * presence). The numbers are the REAL `gqlsim` analysis — the click target is the computed
 * divergence, not an answer key.
 */
function queryAsTree(query: string): ParseTreeProbe {
  const depth = maxSelectionDepth(query);
  const intro = isIntrospection(query);
  const root = {
    id: "gql",
    start: 0,
    end: query.length,
    label: "GraphQL query",
    layer: "document",
    value: query.length > 80 ? query.slice(0, 77) + "…" : query,
    rfc: "GraphQL Specification",
    children: [
      { id: "gql.depth", start: 0, end: 0, label: "max selection depth", layer: "control", value: String(depth), rfc: "OWASP GraphQL Cheat Sheet", children: [] },
      { id: "gql.introspection", start: 0, end: 0, label: "introspection present", layer: "control", value: intro ? "true (__schema/__type selected)" : "false", rfc: "OWASP GraphQL Cheat Sheet", children: [] },
    ],
  };
  const regions = [root, ...root.children];
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map<string, (typeof regions)[number]>();
  for (const r of regions) if (!byRange.has(`${r.start}:${r.end}`)) byRange.set(`${r.start}:${r.end}`, r);
  return {
    regions,
    root,
    byteLength: query.length,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
