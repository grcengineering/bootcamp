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

/** A committed packet fixture (the shapes under .ci/fixtures/assets/net/). */
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
  if (mode === "peel" || mode === "trace") {
    if (mode === "trace" && primary.frames) {
      // TRACE seed (canary stubs the surface; the TCP RFC-9293 sim is wired in the host).
      const cards = primary.frames.map((f) => ({ from: f.from, to: f.to, type: namedType(f) }));
      const canonical = { [primary.id]: cards.map((c) => ({ from: c.from, to: c.to, type: c.type })) };
      const participants = [...new Set(primary.frames.flatMap((f) => [f.from, f.to]))];
      return {
        mode,
        oracle,
        panels: primary.frames.map((f) => ({ id: `card-${f.seq}`, label: `${f.from}→${f.to}`, hex: f.hex, linkType: linkOf(primary) })),
        trace: { canonical, cards, participants },
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
  // map / build-and-break: the canary doesn't use these for the visual artifact; stub.
  if (primary.hex) return { mode, oracle, panels: [{ id: "frame", label: primary.id, hex: primary.hex, linkType: linkOf(primary) }] };
  throw new Error(`visual mode ${mode} unsupported for fixture ${primary.id}`);
}

function namedType(f: { type?: string; flags?: string[] }): string {
  if (f.type) return f.type;
  if (f.flags && f.flags.length) return f.flags.join("+");
  return "message";
}
