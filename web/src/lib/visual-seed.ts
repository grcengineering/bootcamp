/**
 * Visual-seed normalizer (Wave-4): turns a committed real-bytes fixture
 * (.ci/fixtures/assets/net/*.json) + the spec's visual mode into the VisualHost's panel
 * list. Shared by scripts/sync-content.ts (build time) and the replay test, so the browser
 * and the test see byte-identical panels. Pure + DOM-free.
 *
 * The fixture is the source of truth: this only SELECTS which real frames become panels for
 * a given mode (PEEL → the exemplar frame; Diff-the-Trace → the clean/broken pairs). It never
 * authors bytes.
 */
import type { VisualHostOptions, VisualMode } from "../components/lab/sessions/visual-host";
import type { LinkType } from "../engines/visual/pkt";

/** A committed packet/artifact fixture (the shapes under .ci/fixtures/assets/). */
export interface PacketFixture {
  id: string;
  linktype?: string;
  hex?: string;
  frames?: Array<{ seq: number; from: string; to: string; type?: string; flags?: string[]; flags_byte?: string; hex: string }>;
  pairs?: Array<{
    id: string;
    control_claim: string;
    clean: { label: string; hex?: string; hex_ref?: string };
    broken: { label: string; hex?: string; hex_ref?: string };
  }>;
  /**
   * TRACE seed — an explicit message sequence (when a module's protocol has no packet frames to
   * carry the order, e.g. OAuth/DNS-resolution/log-pipeline). Each step is one orderable card. The
   * canonical accepted sequence is the steps in declared order; `participants` are the nodes the
   * cards route between; `alert` is the real RFC alert the sim raises on a wrong move (defaults to
   * TCP RST); `assign_routing` turns on per-card from/to assignment.
   */
  trace?: {
    participants: string[];
    steps: Array<{ from: string; to: string; type: string; fields?: Record<string, string> }>;
    alert?: { name: string; code?: number };
    assign_routing?: boolean;
  };
  /**
   * MAP seed — zones + classifiable item cards keyed against a cited authoritative matrix. Items
   * may carry a THROUGHOUT `keyZones` set (logging on every tier) or a `keyByModel` map (the cited
   * key re-derived per IaaS/PaaS/SaaS slider position). The `slider` declares the service-model
   * positions when present. Every item's zone assignment carries its citation in `keyRef`.
   */
  map?: {
    zones: string[];
    items: Array<{
      id: string;
      label: string;
      keyZone: string;
      keyRef?: string;
      keyZones?: string[];
      keyByModel?: Record<string, string>;
    }>;
    slider?: { options: string[]; initial?: string };
  };
}

/** A bundle of fixtures keyed by their `from` path so cross-references (hex_ref) resolve. */
export type FixtureSet = Record<string, PacketFixture>;

const ETH: LinkType = "ethernet";

function linkOf(fx: PacketFixture): LinkType {
  return /SLL2|cooked/i.test(fx.linktype ?? "") ? "sll2" : ETH;
}

/** Resolve a `hex_ref` like "google-search-clienthello.json#hex" against the fixture set. */
function resolveHex(ref: string | undefined, hex: string | undefined, set: FixtureSet): string {
  if (hex) return hex;
  if (!ref) throw new Error("visual panel needs hex or hex_ref");
  const [file, frag] = ref.split("#");
  const fx = set[file] ?? Object.values(set).find((f) => f.id === file.replace(/\.json$/, ""));
  if (!fx) throw new Error(`visual hex_ref names unknown fixture: ${file}`);
  if (frag === "hex" && fx.hex) return fx.hex;
  throw new Error(`visual hex_ref fragment unsupported: ${ref}`);
}

/**
 * Build the VisualHost options for a spec from its primary fixture + the fixture set.
 * `primary` is the fixture named by visual.artifact.from; `set` lets pairs resolve hex_refs.
 */
export function buildVisualOptions(
  mode: VisualMode,
  oracle: string,
  primary: PacketFixture,
  set: FixtureSet,
): VisualHostOptions {
  if (mode === "peel" || mode === "trace" || mode === "build-and-break") {
    // TRACE / Build-and-Break from real packet frames (TCP handshake, TLS records): each frame is
    // one orderable card; the canonical sequence is the captured order, the panels carry the bytes.
    if (mode !== "peel" && primary.frames) {
      const cards = primary.frames.map((f) => ({ from: f.from, to: f.to, type: namedType(f), fields: framesFields(f) }));
      const canonical = { [primary.id]: cards.map((c) => ({ from: c.from, to: c.to, type: c.type })) };
      const participants = [...new Set(primary.frames.flatMap((f) => [f.from, f.to]))];
      return {
        mode,
        oracle,
        panels: primary.frames.map((f) => ({ id: `card-${f.seq}`, label: `${f.from}→${f.to}`, hex: f.hex, linkType: linkOf(primary) })),
        trace: { canonical, cards, participants, ...(primary.trace?.alert ? { alert: primary.trace.alert } : {}), ...(primary.trace?.assign_routing ? { assign_routing: true } : {}) },
      };
    }
    // TRACE / Build-and-Break from an explicit step list (protocols with no packet frames to carry
    // the order — OAuth dance, DNS-resolution treasure-hunt, log pipeline). The steps in declared
    // order ARE the canonical accepted sequence the real state-machine sim checks against.
    if (mode !== "peel" && primary.trace) {
      const cards = primary.trace.steps.map((s) => ({ from: s.from, to: s.to, type: s.type, fields: s.fields }));
      const canonical = { [primary.id]: cards.map((c) => ({ from: c.from, to: c.to, type: c.type })) };
      return {
        mode,
        oracle,
        // a step-only TRACE has no per-card byte panel; the panel list stays empty (cards are data).
        panels: primary.hex ? [{ id: "frame", label: primary.id, hex: primary.hex, linkType: linkOf(primary) }] : [],
        trace: { canonical, cards, participants: primary.trace.participants, ...(primary.trace.alert ? { alert: primary.trace.alert } : {}), ...(primary.trace.assign_routing ? { assign_routing: true } : {}) },
      };
    }
    // PEEL: the single exemplar frame.
    if (!primary.hex) throw new Error(`PEEL fixture ${primary.id} has no hex frame`);
    return { mode, oracle, panels: [{ id: "frame", label: primary.id, hex: primary.hex, linkType: linkOf(primary) }] };
  }
  if (mode === "diff-the-trace") {
    if (!primary.pairs) throw new Error(`diff fixture ${primary.id} has no pairs`);
    const panels: VisualHostOptions["panels"] = [];
    for (const pair of primary.pairs) {
      panels.push({ id: `${pair.id}-clean`, label: `${pair.id} · clean: ${pair.clean.label}`, hex: resolveHex(pair.clean.hex_ref, pair.clean.hex, set), linkType: ETH });
      panels.push({ id: `${pair.id}-broken`, label: `${pair.id} · broken: ${pair.broken.label}`, hex: resolveHex(pair.broken.hex_ref, pair.broken.hex, set), linkType: ETH });
    }
    return { mode, oracle, panels };
  }
  if (mode === "map") {
    // MAP from an explicit map seed (control cards onto tiers; slider + THROUGHOUT). The cited key
    // (keyZone / keyByModel) is the oracle; the surface only records placements.
    if (primary.map) {
      return {
        mode,
        oracle,
        // an optional reference frame may accompany the board (e.g. the request the controls guard).
        panels: primary.hex ? [{ id: "frame", label: primary.id, hex: primary.hex, linkType: linkOf(primary) }] : [],
        map: { zones: primary.map.zones, items: primary.map.items, ...(primary.map.slider ? { slider: primary.map.slider } : {}) },
      };
    }
    // a bare hex frame stubs to a single PEEL-style panel (no board) — kept for the canary's tests.
    if (primary.hex) return { mode, oracle, panels: [{ id: "frame", label: primary.id, hex: primary.hex, linkType: linkOf(primary) }] };
    throw new Error(`visual mode ${mode} unsupported for fixture ${primary.id}`);
  }
  throw new Error(`visual mode ${mode} unsupported for fixture ${primary.id}`);
}

/** Carry a frame's decoded flags forward as card fields (the real protocol bytes on each card). */
function framesFields(f: { flags?: string[]; flags_byte?: string }): Record<string, string> | undefined {
  const fields: Record<string, string> = {};
  if (f.flags_byte) fields.flags_byte = f.flags_byte;
  if (f.flags && f.flags.length) fields.flags = f.flags.join("+");
  return Object.keys(fields).length ? fields : undefined;
}

function namedType(f: { type?: string; flags?: string[] }): string {
  if (f.type) return f.type;
  if (f.flags && f.flags.length) return f.flags.join("+");
  return "message";
}
