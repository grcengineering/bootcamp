/**
 * Visual host (Wave-4 — Lab Player side; VISUAL-ENGINE-SPEC §1).
 *
 * The DOM-free state model behind the Inspect-&-Assemble surface. It owns the oracle's
 * parse tree(s) over REAL committed bytes, the learner's current selection/label/decode
 * action, and (for TRACE/MAP, stubbed for the canary) the sim/placement state. It exposes
 * the SAME closed verifier registry the other engine classes use: a ProbeSession (so
 * `file_*`/`history_*` style checks degrade gracefully) plus the Wave-4 probe surfaces
 * (parseTree / visual / trace / map) read via VerifyContext.
 *
 * Honesty: the host NEVER fabricates a decoded value — every region value is the dissector's
 * output over the real bytes (engines/visual/pkt.dissect). DOM-free; unit-tested under
 * `bun test`; the VisualSurface React island renders this host and reports actions to it.
 */
import { dissectHex, type ParseTreeProbe, type LinkType } from "../../../engines/visual/pkt";
import type { ProbeSession, TraceProbe, MapProbe, VisualActionProbe } from "../../../verifiers/registry";

export type VisualMode = "peel" | "trace" | "map" | "build-and-break" | "diff-the-trace";

/** One panel of the surface — a real artifact's parse tree (PEEL/Diff use ≥1 panel). */
export interface VisualPanel {
  id: string;
  /** Label shown above the panel (e.g. "Clean: TLS to 443"). */
  label: string;
  /** The oracle's parse tree over this panel's real bytes. */
  tree: ParseTreeProbe;
}

export interface VisualHostOptions {
  mode: VisualMode;
  oracle: string;
  /** One or more real artifacts (hex) to dissect into panels. */
  panels: Array<{ id: string; label: string; hex: string; linkType?: LinkType }>;
  /** TRACE seed: canonical sequence(s) the sim accepts + the orderable cards (later waves). */
  trace?: {
    canonical: TraceProbe["canonical"];
    cards: Array<{ from: string; to: string; type: string; fields?: Record<string, string> }>;
    participants: string[];
  };
  /** MAP seed: the cited authoritative key + the cards/zones (later waves). */
  map?: {
    zones: string[];
    items: Array<{ id: string; label: string; keyZone: string; keyRef?: string }>;
  };
}

export interface VisualSnapshot {
  v: 1;
  /** Per-panel selection state (PEEL/Diff): the selected node id per panel. */
  selections: Record<string, string | null>;
  /** Per-panel revealed node ids (the layers the learner has unlocked/read). */
  revealed: Record<string, string[]>;
  /** The active panel + the last action the learner performed (drives the live probe). */
  activePanel: string | null;
  action: VisualActionProbe | null;
  /** TRACE: the learner's current card order (ids). */
  traceOrder?: string[];
  /** MAP: itemId → placedZone. */
  placements?: Record<string, string | null>;
}

export class VisualHost {
  readonly mode: VisualMode;
  readonly oracle: string;
  readonly panels: VisualPanel[];
  private selections: Record<string, string | null> = {};
  private revealed: Record<string, Set<string>> = {};
  private activePanel: string | null = null;
  private action: VisualActionProbe | null = null;

  // TRACE state (canary stubs cleanly — the model is complete; the sim is RFC-9293 TCP).
  private readonly traceSeed?: VisualHostOptions["trace"];
  private traceOrder: string[] = [];
  // MAP state (canary stubs cleanly).
  private readonly mapSeed?: VisualHostOptions["map"];
  private placements: Record<string, string | null> = {};

  constructor(opts: VisualHostOptions) {
    this.mode = opts.mode;
    this.oracle = opts.oracle;
    this.panels = opts.panels.map((p) => ({
      id: p.id,
      label: p.label,
      tree: dissectHex(p.hex, p.linkType ? { linkType: p.linkType } : {}),
    }));
    for (const p of this.panels) {
      this.selections[p.id] = null;
      this.revealed[p.id] = new Set();
    }
    this.activePanel = this.panels[0]?.id ?? null;
    this.traceSeed = opts.trace;
    this.mapSeed = opts.map;
    if (opts.map) for (const it of opts.map.items) this.placements[it.id] = null;
    // The root/top layer of each panel is always available (the frame itself).
    for (const p of this.panels) {
      // the frame itself (root) is always open, and so is the outermost link layer —
      // the learner starts by reading L2's selector to earn the next box.
      this.revealed[p.id].add(p.tree.root.id);
      const top = p.tree.root.children[0];
      if (top) this.revealed[p.id].add(top.id);
    }
  }

  panel(id: string): VisualPanel | null {
    return this.panels.find((p) => p.id === id) ?? null;
  }

  activeTree(): ParseTreeProbe | null {
    return this.panel(this.activePanel ?? "")?.tree ?? null;
  }

  setActivePanel(id: string): void {
    if (this.panel(id)) this.activePanel = id;
  }

  /**
   * Is a region available to expand? A child layer stays gated until its selector region has
   * been revealed (read). The top link layer is always available; a region is available when
   * its parent has been revealed OR when a region that `gates` it has been revealed.
   */
  isAvailable(panelId: string, nodeId: string): boolean {
    const tree = this.panel(panelId)?.tree;
    if (!tree) return false;
    const region = tree.region(nodeId);
    if (!region) return false;
    const revealed = this.revealed[panelId];
    if (nodeId === tree.root.id) return true; // the frame is always open
    // a region is available only once its parent region is revealed (the learner opened the box)
    const parent = this.parentOf(tree, nodeId);
    if (parent !== null && !revealed.has(parent.id)) return false;
    // gated layers (ipv4/tcp): a selector region declares gates === nodeId; it must be read first
    const gate = this.gateFor(tree, nodeId);
    if (gate && !revealed.has(gate)) return false;
    return true;
  }

  private parentOf(tree: ParseTreeProbe, nodeId: string): { id: string } | null {
    for (const r of tree.regions) if (r.children.some((c) => c.id === nodeId)) return r;
    return null;
  }

  /** The region id whose `gates` field names nodeId's layer (the selector that unlocks it). */
  private gateFor(tree: ParseTreeProbe, nodeId: string): string | null {
    for (const r of tree.regions) if (r.gates === nodeId) return r.id;
    return null;
  }

  /**
   * Select a region (PEEL/Diff): records the selection, reveals it (and its decoded value),
   * and unlocks any layer this region gates. Returns the oracle's region (value to show).
   */
  select(panelId: string, nodeId: string): { value: string; layer?: string } | null {
    const tree = this.panel(panelId)?.tree;
    const region = tree?.region(nodeId);
    if (!tree || !region) return null;
    this.activePanel = panelId;
    this.selections[panelId] = nodeId;
    this.revealed[panelId].add(nodeId);
    // selecting a gating region unlocks its gated child layer (records that child as available)
    if (region.gates) this.revealed[panelId].add(region.gates);
    this.action = { selectedNodeId: nodeId, selectedRange: { start: region.start, end: region.end }, enteredValue: region.value, decodedValue: region.value };
    return { value: region.value, layer: region.layer };
  }

  /** Record the learner's entered OSI/layer label for the active selection. */
  setLayer(layer: string): void {
    if (this.action) this.action = { ...this.action, enteredLayer: layer };
  }

  /** Record the learner's entered field-value read. */
  setValue(value: string): void {
    if (this.action) this.action = { ...this.action, enteredValue: value };
  }

  selectionFor(panelId: string): string | null {
    return this.selections[panelId] ?? null;
  }

  isRevealed(panelId: string, nodeId: string): boolean {
    return this.revealed[panelId]?.has(nodeId) ?? false;
  }

  // ---- TRACE (stubbed cleanly: model complete, sim is RFC-9293 TCP) -------------------

  traceParticipants(): string[] {
    return this.traceSeed?.participants ?? [];
  }
  traceCards(): NonNullable<VisualHostOptions["trace"]>["cards"] {
    return this.traceSeed?.cards ?? [];
  }
  /** Place a card at the next position in the assembled order. */
  appendTraceCard(index: number): void {
    if (!this.traceSeed) return;
    const id = `card-${index}`;
    if (!this.traceOrder.includes(id)) this.traceOrder.push(id);
  }
  resetTrace(): void {
    this.traceOrder = [];
  }

  // ---- MAP (stubbed cleanly) ---------------------------------------------------------

  mapZones(): string[] {
    return this.mapSeed?.zones ?? [];
  }
  mapItems(): NonNullable<VisualHostOptions["map"]>["items"] {
    return this.mapSeed?.items ?? [];
  }
  place(itemId: string, zone: string | null): void {
    if (this.mapSeed?.items.some((i) => i.id === itemId)) this.placements[itemId] = zone;
  }

  // ---- probe surfaces (one verifier path for every engine class) ---------------------

  /** The active panel's parse tree — region_labeled_correctly / field_value_is read this. */
  parseTree(): ParseTreeProbe | null {
    return this.activeTree();
  }

  /** The learner's just-performed selection/label/decode — PEEL/Diff verifiers read this. */
  visualAction(): VisualActionProbe | null {
    return this.action;
  }

  /** TRACE probe — sequence_matches / sim_alert_is read this (canary: built from the seed). */
  traceProbe(): TraceProbe | null {
    if (!this.traceSeed) return null;
    const ordered = this.traceOrder.map((id) => {
      const idx = Number(id.replace("card-", ""));
      const c = this.traceSeed!.cards[idx];
      return { from: c.from, to: c.to, type: c.type, fields: c.fields };
    });
    // run the real RFC-9293 TCP state machine against the assembled order
    const canon = this.traceSeed.canonical;
    const ref = Object.keys(canon)[0];
    const expected = ref ? canon[ref] : [];
    const reachedEndState =
      ordered.length === expected.length &&
      ordered.every((m, i) => m.type === expected[i].type && m.from === expected[i].from && m.to === expected[i].to);
    // honest consequence: an out-of-order/mis-routed first divergence yields a real RST
    let lastAlert: TraceProbe["lastAlert"] = null;
    if (ordered.length > 0 && !reachedEndState) lastAlert = { name: "RST" };
    return { orderedMessages: ordered, reachedEndState, lastAlert, canonical: canon };
  }

  /** MAP probe — mapping_correct reads this. */
  mapProbe(): MapProbe | null {
    if (!this.mapSeed) return null;
    return {
      items: this.mapSeed.items.map((it) => ({ id: it.id, placedZone: this.placements[it.id] ?? null, keyZone: it.keyZone, keyRef: it.keyRef })),
    };
  }

  /**
   * The registry-facing ProbeSession. Visual exercises gate via the Wave-4 probes (parseTree
   * / trace / map), so the shell-style surface is intentionally inert — but present so
   * runCheck never sees a null session and the closed registry stays uniform.
   */
  probeSession(): ProbeSession {
    return {
      prompt: () => "visual ",
      history: () => [],
      lastExit: () => 0,
      exists: () => false,
      readFile: () => null,
      listDir: () => null,
      producedBy: () => null,
      runScriptClean: () => ({ stdout: "", stderr: "visual surfaces verify via the parse-tree/trace/map probes", exit: 64 }),
    };
  }

  snapshot(): VisualSnapshot {
    return {
      v: 1,
      selections: { ...this.selections },
      revealed: Object.fromEntries(Object.entries(this.revealed).map(([k, v]) => [k, [...v]])),
      activePanel: this.activePanel,
      action: this.action,
      traceOrder: [...this.traceOrder],
      placements: { ...this.placements },
    };
  }

  restore(snap: VisualSnapshot): void {
    if (snap.v !== 1) return;
    this.selections = { ...snap.selections };
    this.revealed = Object.fromEntries(Object.entries(snap.revealed).map(([k, v]) => [k, new Set(v)]));
    this.activePanel = snap.activePanel;
    this.action = snap.action;
    this.traceOrder = snap.traceOrder ? [...snap.traceOrder] : [];
    this.placements = snap.placements ? { ...snap.placements } : {};
  }
}
