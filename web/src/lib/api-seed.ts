/**
 * API-paradigms visual seed (Wave-4) — turns the committed real api fixtures
 * (.ci/fixtures/assets/api/*) + a spec's visual mode into VisualHost panels, using the
 * contract/wire oracles (oas/wsdl/sdl/proto/pbwire/gqlsim/hdr) the same way `lib/visual-seed`
 * uses the packet-dissector for the net pcaps. Pure + DOM-free; shared by the build step and the
 * module-19 replay test so the browser and the test see byte-identical panels.
 *
 * The fixture is the source of truth: this only SELECTS which real artifact each panel parses and
 * dispatches to the right oracle. It never authors bytes/records — the oracle's parse tree over
 * the real artifact IS the panel.
 */
import type { VisualHostOptions, VisualMode } from "../components/lab/sessions/visual-host";
import type { FieldMap, Http2Header } from "../engines/visual/pbwire";
import type { ApiPanelSource } from "../engines/visual/api-oracle";
import { validateQuery, type GqlLimiterConfig } from "../engines/visual/gqlsim";

/** A committed api fixture file (the contracts + payloads + wire + diff bundles). */
export interface ApiFixture {
  id: string;
  kind: string;
  // contract / payload bundles carry their bytes inline; the loader reads raw contract files too
  raw?: string;
  // grpc-http2 exchange
  request_headers?: Http2Header[];
  frame_hex?: string;
  response_trailers?: Http2Header[];
  field_map?: Record<string, FieldMapEntryJson>;
  // diff-the-trace pairs
  pairs?: ApiDiffPair[];
}

interface FieldMapEntryJson {
  name: string;
  type: string;
  sub?: Record<string, FieldMapEntryJson>;
}

export interface ApiDiffPair {
  id: string;
  paradigm: string;
  oracle: string;
  control_claim: string;
  owasp: string;
  framework_ref: string;
  discriminating_node: string;
  clean: ApiDiffLeg;
  broken: ApiDiffLeg;
}
interface ApiDiffLeg {
  label: string;
  artifact?: unknown; // REST JSON
  query?: string; // GraphQL
  envelope?: string; // SOAP XML
  frame_hex?: string; // gRPC
  request_headers?: Http2Header[];
  response_trailers?: Http2Header[];
  ws?: Record<string, string>;
}

export type ApiFixtureSet = Record<string, ApiFixture>;

/** JSON field-map (string keys) → the numeric FieldMap the pbwire decoder consumes. */
export function toFieldMap(json: Record<string, FieldMapEntryJson> | undefined): FieldMap {
  const out: FieldMap = {};
  for (const [k, v] of Object.entries(json ?? {})) {
    out[Number(k)] = { name: v.name, type: v.type, sub: v.sub ? toFieldMap(v.sub) : undefined };
  }
  return out;
}

/** A contract-file oracle id → its serializable panel source descriptor. */
function contractSource(oracle: string, raw: string): ApiPanelSource {
  switch (oracle) {
    case "oas":
    case "sdl":
    case "proto":
    case "wsdl":
      return { oracle, raw };
    default:
      throw new Error(`contractSource: unknown contract oracle '${oracle}'`);
  }
}

/** The shared 8-user proto field map for the gRPC paradigm (the committed contract's shape). */
const USER_FIELD_MAP: FieldMap = {
  1: {
    name: "users",
    type: "message",
    sub: { 1: { name: "email", type: "string" }, 2: { name: "mfa_enabled", type: "bool" }, 3: { name: "role", type: "string" } },
  },
};

/** Default GraphQL limiter config for the build-and-break leg (OWASP-aligned). */
export const GQL_LIMITER: GqlLimiterConfig = { maxDepth: 6, maxNodes: 60, noIntrospection: false };

/**
 * Build the VisualHost options for the api-paradigms module. `oracle` selects the surface family:
 *  - oas/sdl/proto/wsdl (PEEL the four contracts) — `contracts` fixture set supplies raw files;
 *  - pbwire (PEEL the gRPC frame) — the grpc-listusers exchange fixture;
 *  - gqlsim (build-and-break) — the limiter run over the seed query;
 *  - diff-the-trace — the four-paradigm pairs (each parsed by its own oracle).
 */
export function buildApiVisualOptions(
  mode: VisualMode,
  oracle: string,
  primary: ApiFixture,
  contracts: Record<string, string>,
): VisualHostOptions {
  if (mode === "peel" && oracle === "pbwire") {
    if (!primary.frame_hex) throw new Error("pbwire PEEL needs a grpc-http2 fixture with frame_hex");
    const source: ApiPanelSource = {
      oracle: "pbwire",
      requestHeaders: primary.request_headers ?? [],
      frameHex: primary.frame_hex,
      responseTrailers: primary.response_trailers ?? [],
      fieldMap: toFieldMap(primary.field_map),
    };
    return { mode, oracle, panels: [{ id: "grpc", label: "gRPC/HTTP-2 ListUsers", source }] };
  }

  if (mode === "peel" && (oracle === "oas" || oracle === "sdl" || oracle === "proto" || oracle === "wsdl")) {
    // PEEL the four contracts: one panel per paradigm contract (the learner switches tabs).
    const order: Array<{ oracle: string; file: string; label: string }> = [
      { oracle: "oas", file: "users.openapi.json", label: "REST · OpenAPI 3.1" },
      { oracle: "wsdl", file: "users.wsdl", label: "SOAP · WSDL + WS-SecurityPolicy" },
      { oracle: "sdl", file: "users.graphql", label: "GraphQL · SDL" },
      { oracle: "proto", file: "users.proto", label: "gRPC · .proto" },
    ];
    const panels = order.map((o) => {
      const raw = contracts[o.file];
      if (raw === undefined) throw new Error(`contract file missing from the fixture set: ${o.file}`);
      return { id: o.oracle, label: o.label, source: contractSource(o.oracle, raw) };
    });
    return { mode, oracle, panels };
  }

  if (mode === "diff-the-trace") {
    if (!primary.pairs) throw new Error(`diff fixture ${primary.id} has no pairs`);
    const panels: VisualHostOptions["panels"] = [];
    // First, the four real CONTRACTS as PEELable panels (LOCATE the truth-field in each — O1).
    // The contract is the first place a control's truth lives; it precedes the payload pairs.
    const contractPanels: Array<{ id: string; oracle: string; file: string; label: string }> = [
      { id: "contract-oas", oracle: "oas", file: "users.openapi.json", label: "Contract · REST OpenAPI 3.1" },
      { id: "contract-wsdl", oracle: "wsdl", file: "users.wsdl", label: "Contract · SOAP WSDL + WS-SecurityPolicy" },
      { id: "contract-sdl", oracle: "sdl", file: "users.graphql", label: "Contract · GraphQL SDL" },
      { id: "contract-proto", oracle: "proto", file: "users.proto", label: "Contract · gRPC .proto" },
    ];
    for (const c of contractPanels) {
      const raw = contracts[c.file];
      if (raw === undefined) throw new Error(`contract file missing from the fixture set: ${c.file}`);
      panels.push({ id: c.id, label: c.label, source: contractSource(c.oracle, raw) });
    }
    // Then the four clean/broken payload pairs (QUERY/EVALUATE/EVIDENCE — O2..O6).
    let graphqlBrokenQuery: string | undefined;
    for (const pair of primary.pairs) {
      panels.push({ id: `${pair.id}-clean`, label: `${pair.paradigm} · clean: ${pair.clean.label}`, source: diffLegSource(pair.oracle, pair.clean) });
      panels.push({ id: `${pair.id}-broken`, label: `${pair.paradigm} · broken: ${pair.broken.label}`, source: diffLegSource(pair.oracle, pair.broken) });
      if (pair.oracle === "gqlsim" && pair.broken.query) graphqlBrokenQuery = pair.broken.query;
    }
    // Build-and-break (O4): the GraphQL broken query run through the REAL limiter — its rejection
    // (exit 1, depth-limit error) is the consequence `validator_passes` reads. The limiter is the
    // oracle; the verdict is protocol-true.
    const buildAndBreak = graphqlBrokenQuery ? buildGqlBuildAndBreak(graphqlBrokenQuery, GQL_LIMITER) : undefined;
    return { mode, oracle, panels, buildAndBreak };
  }

  throw new Error(`buildApiVisualOptions: unsupported mode/oracle '${mode}'/'${oracle}'`);
}

/** One diff-the-trace leg → its serializable panel source descriptor (the pair's oracle). */
function diffLegSource(oracle: string, leg: ApiDiffLeg): ApiPanelSource {
  if (oracle === "oas") {
    // REST response payload PEELed by the OpenAPI/JSON oracle (the response JSON is the artifact).
    return { oracle: "oas", raw: JSON.stringify(leg.artifact, null, 2) };
  }
  if (oracle === "wsdl") {
    if (!leg.envelope) throw new Error("SOAP diff leg needs an envelope");
    // The SOAP diff clicks wsu:Created (stale → replay) and recomputes the digest; the password
    // is the cited OASIS example value the fixture carries (never read off the wire).
    return { oracle: "soap", envelope: leg.envelope, password: leg.ws?.password ?? "taadtaadpstcsm" };
  }
  if (oracle === "pbwire") {
    if (!leg.frame_hex) throw new Error("gRPC diff leg needs frame_hex");
    return {
      oracle: "pbwire",
      requestHeaders: leg.request_headers ?? [],
      frameHex: leg.frame_hex,
      responseTrailers: leg.response_trailers ?? [],
      fieldMap: USER_FIELD_MAP,
    };
  }
  if (oracle === "gqlsim") {
    if (!leg.query) throw new Error("GraphQL diff leg needs a query");
    return { oracle: "gqlsim", query: leg.query };
  }
  throw new Error(`diffLegSource: unknown oracle '${oracle}'`);
}

/** Run the GraphQL build-and-break limiter for the seed query, returning host options. */
export function buildGqlBuildAndBreak(query: string, cfg: GqlLimiterConfig = GQL_LIMITER): VisualHostOptions["buildAndBreak"] {
  return { validatorRun: validateQuery(query, cfg) };
}
