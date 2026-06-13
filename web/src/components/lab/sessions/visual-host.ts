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
import { buildApiPanelTree, type ApiPanelSource } from "../../../engines/visual/api-oracle";
import type { ProbeSession, TraceProbe, MapProbe, VisualActionProbe, ValidatorRunProbe } from "../../../verifiers/registry";

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
  /**
   * One or more real artifacts as panels. Exactly one of `hex` | `source` | `tree` per panel —
   * the host rebuilds (or accepts) a ParseTreeProbe and treats all three identically downstream:
   *  - `hex` — the `pkt` canary: the packet-dissector parses the bytes (re-dissected here, so the
   *    serialized lab bundle only carries the hex string, never functions);
   *  - `source` — the Wave-4 contract/wire oracles (oas/wsdl/sdl/proto/pbwire/gqlsim): a
   *    SERIALIZABLE descriptor of the real artifact that buildApiPanelTree re-parses here, the
   *    same way `hex` is re-dissected — so the bundle survives JSON round-trips to the browser;
   *  - `tree` — an already-built ParseTreeProbe (tests that construct the host in-process).
   */
  panels: Array<{ id: string; label: string; hex?: string; source?: ApiPanelSource; tree?: ParseTreeProbe; linkType?: LinkType }>;
  /**
   * Build-and-break seed (Wave-4 gqlsim): a real validator run + an operation-count trace the
   * sim produced for the learner's constructed query. The state machine is the consequence;
   * `validator_passes` reads `validatorRun`, `sequence_matches` reads the trace (set on `trace`).
   */
  buildAndBreak?: { validatorRun: ValidatorRunProbe };
  /** TRACE seed: canonical sequence(s) the sim accepts + the orderable cards. */
  trace?: {
    canonical: TraceProbe["canonical"];
    cards: Array<{ from: string; to: string; type: string; fields?: Record<string, string> }>;
    participants: string[];
    /**
     * The real protocol alert the stateful sim raises on the first out-of-order/mis-routed move
     * (sim_alert_is reads it). Defaults to TCP's `RST` (the canary). A module agent's sim names
     * its protocol's real alert here — e.g. `{ name: "unexpected_message", code: 10 }` (TLS 1.3,
     * RFC 8446) or `{ name: "invalid_request" }` (OAuth, RFC 6749). The state machine raising it
     * is the consequence; the name is the RFC's, never authored "try again".
     */
    alert?: { name: string; code?: number };
    /**
     * Require the learner to route each card from→to the canonical participants (folds in
     * participant_routing_correct). When false (default) only ORDER is asserted, so cards carry
     * their canonical routing pre-set; when true the surface exposes from/to selects and the sim
     * checks routing on every move (web-app WAF-bypass leg).
     */
    assign_routing?: boolean;
  };
  /** MAP seed: the cited authoritative key + the cards/zones. */
  map?: {
    zones: string[];
    items: Array<{
      id: string;
      label: string;
      /** The single authoritative zone (mapping_correct reads it). */
      keyZone: string;
      /** Citation for this item's zone assignment (NIST/SOC2/AWS/CSA/CIS/OWASP). */
      keyRef?: string;
      /**
       * THROUGHOUT multi-zone card (e.g. "logging on every tier"): the item is correct only when
       * placed in EVERY listed zone. When present it supersedes keyZone for correctness.
       */
      keyZones?: string[];
      /**
       * Service-model-dependent key (IaaS/PaaS/SaaS slider): the authoritative zone re-derived per
       * slider position. When present and a slider value is set, the cited key for THIS item is
       * keyByModel[value] — so a control card visibly migrates across the you/provider boundary as
       * the slider moves (the boundary is a movable line; the cited matrix re-derives placement).
       */
      keyByModel?: Record<string, string>;
    }>;
    /**
     * Service-model slider (cloud shared-responsibility): the ordered positions (e.g.
     * ["IaaS","PaaS","SaaS"]). When present, items' keyByModel re-derives placement per position.
     */
    slider?: { options: string[]; initial?: string };
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
  /** TRACE: the learner's per-card routing overrides (assign_routing leg). */
  traceRouting?: Record<string, { from?: string; to?: string }>;
  /** MAP: itemId → placedZone (scalar mirror of the multi-set). */
  placements?: Record<string, string | null>;
  /** MAP: itemId → placed zones (THROUGHOUT multi-zone cards). */
  multiPlacements?: Record<string, string[]>;
  /** MAP: the current service-model slider position (IaaS/PaaS/SaaS). */
  sliderValue?: string | null;
}

export class VisualHost {
  readonly mode: VisualMode;
  readonly oracle: string;
  readonly panels: VisualPanel[];
  private selections: Record<string, string | null> = {};
  private revealed: Record<string, Set<string>> = {};
  private activePanel: string | null = null;
  private action: VisualActionProbe | null = null;

  // TRACE state — the assembled order (ids `card-<seedIndex>`), the learner's per-card routing
  // overrides (assign_routing leg), and the sim's real protocol alert.
  private readonly traceSeed?: VisualHostOptions["trace"];
  private traceOrder: string[] = [];
  private traceRouting: Record<string, { from?: string; to?: string }> = {};
  // MAP state — itemId → placed zone(s) (THROUGHOUT cards hold a set) + the service-model slider.
  private readonly mapSeed?: VisualHostOptions["map"];
  private placements: Record<string, string | null> = {};
  private multiPlacements: Record<string, Set<string>> = {};
  private sliderValue: string | null = null;
  // Build-and-break state (gqlsim): the sim's real validator run for the learner's query.
  private readonly buildAndBreak?: VisualHostOptions["buildAndBreak"];

  constructor(opts: VisualHostOptions) {
    this.mode = opts.mode;
    this.oracle = opts.oracle;
    this.buildAndBreak = opts.buildAndBreak;
    this.panels = opts.panels.map((p) => {
      // Oracle dispatch (parallel to the `pkt` canary's re-dissect-from-hex): rebuild the parse
      // tree from the serializable source, dissect the hex, or accept a pre-built tree.
      if (p.source) return { id: p.id, label: p.label, tree: buildApiPanelTree(p.source) };
      if (p.hex !== undefined) return { id: p.id, label: p.label, tree: dissectHex(p.hex, p.linkType ? { linkType: p.linkType } : {}) };
      if (p.tree) return { id: p.id, label: p.label, tree: p.tree };
      throw new Error(`visual panel ${p.id} needs a hex frame, an api source, or a pre-built parse tree`);
    });
    for (const p of this.panels) {
      this.selections[p.id] = null;
      this.revealed[p.id] = new Set();
    }
    this.activePanel = this.panels[0]?.id ?? null;
    this.traceSeed = opts.trace;
    this.mapSeed = opts.map;
    if (opts.map) {
      for (const it of opts.map.items) {
        this.placements[it.id] = null;
        this.multiPlacements[it.id] = new Set();
      }
      this.sliderValue = opts.map.slider?.initial ?? opts.map.slider?.options[0] ?? null;
    }
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

  /**
   * The label radiogroup's choices for a panel — the distinct, non-empty region-layer values
   * the oracle's parse tree actually carries, in tree-walk order. DERIVED from real regions,
   * never a hardcoded list: a packet yields its OSI layers (L2/L3/L4/L7), the crypto-sort panel
   * yields HASH/ENCODE, an OCI image yields its config/layer labels, etc. This is the fix for the
   * hardcoded-OSI bug where `expect_layer: HASH` was unreachable in the browser (the replay test
   * bypassed the UI by calling the host directly).
   */
  labelChoices(panelId: string | null = this.activePanel): string[] {
    const tree = panelId ? this.panel(panelId)?.tree ?? null : null;
    if (!tree) return [];
    const seen: string[] = [];
    for (const r of tree.regions) {
      const l = (r.layer ?? "").trim();
      if (l !== "" && !seen.includes(l)) seen.push(l);
    }
    return seen;
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

  /**
   * Record the learner's LIVE decode (base64url / hex / protobuf-byte / recomputed-digest walk) —
   * `decoded_artifact_matches` reads this. Distinct from setValue so a learner can read the right
   * region but produce a WRONG decode (the encoding-≠-protection / digest-recompute discrimination):
   * selecting a node defaults decodedValue to the oracle's decode, and an explicit setDecode lets a
   * near-miss transcript disagree with the transform.
   */
  setDecode(value: string): void {
    if (this.action) this.action = { ...this.action, decodedValue: value };
  }

  selectionFor(panelId: string): string | null {
    return this.selections[panelId] ?? null;
  }

  isRevealed(panelId: string, nodeId: string): boolean {
    return this.revealed[panelId]?.has(nodeId) ?? false;
  }

  // ---- TRACE (orderable message cards driving the real protocol state machine) --------

  traceParticipants(): string[] {
    return this.traceSeed?.participants ?? [];
  }
  traceCards(): NonNullable<VisualHostOptions["trace"]>["cards"] {
    return this.traceSeed?.cards ?? [];
  }
  /** Does this TRACE require the learner to route each card (assign_routing leg)? */
  traceAssignsRouting(): boolean {
    return this.traceSeed?.assign_routing ?? false;
  }
  /** The assembled order, as `card-<seedIndex>` ids (left→right / top→bottom). */
  traceOrderIds(): string[] {
    return [...this.traceOrder];
  }
  /** Seed-card indices NOT yet placed in the assembled order (the pool the listbox draws from). */
  tracePoolIndices(): number[] {
    const placed = new Set(this.traceOrder.map((id) => Number(id.replace("card-", ""))));
    return (this.traceSeed?.cards ?? []).map((_, i) => i).filter((i) => !placed.has(i));
  }
  /** Place a seed card at the next position in the assembled order (append). */
  appendTraceCard(index: number): void {
    if (!this.traceSeed) return;
    if (index < 0 || index >= this.traceSeed.cards.length) return;
    const id = `card-${index}`;
    if (!this.traceOrder.includes(id)) this.traceOrder.push(id);
  }
  /** Remove a placed card back into the pool. */
  removeTraceCard(index: number): void {
    this.traceOrder = this.traceOrder.filter((id) => id !== `card-${index}`);
  }
  /**
   * Move the card currently at `from` to `to` in the assembled order (keyboard reorder: the
   * roving listbox swaps a grabbed card up/down). Out-of-range positions are clamped/ignored.
   */
  moveTraceCard(from: number, to: number): void {
    const n = this.traceOrder.length;
    if (from < 0 || from >= n) return;
    const dest = Math.max(0, Math.min(n - 1, to));
    if (dest === from) return;
    const [card] = this.traceOrder.splice(from, 1);
    this.traceOrder.splice(dest, 0, card);
  }
  /** Record the learner's routing choice for a card (assign_routing leg). */
  setTraceRouting(index: number, from: string | undefined, to: string | undefined): void {
    if (!this.traceSeed) return;
    if (index < 0 || index >= this.traceSeed.cards.length) return;
    this.traceRouting[`card-${index}`] = { from, to };
  }
  /** The learner's routing override for a placed card (assign_routing leg), or undefined. */
  traceRoutingFor(index: number): { from?: string; to?: string } | undefined {
    return this.traceRouting[`card-${index}`];
  }
  resetTrace(): void {
    this.traceOrder = [];
    this.traceRouting = {};
  }

  // ---- MAP (keyboard-assignable cards onto labeled zones; slider + THROUGHOUT) ---------

  mapZones(): string[] {
    return this.mapSeed?.zones ?? [];
  }
  mapItems(): NonNullable<VisualHostOptions["map"]>["items"] {
    return this.mapSeed?.items ?? [];
  }
  /** The service-model slider options (IaaS/PaaS/SaaS), or [] when there is no slider. */
  mapSliderOptions(): string[] {
    return this.mapSeed?.slider?.options ?? [];
  }
  /** The current slider position, or null when there is no slider. */
  mapSlider(): string | null {
    return this.sliderValue;
  }
  /** Move the service-model slider; placements stay, but the cited key re-derives per position. */
  setMapSlider(value: string): void {
    if (this.mapSeed?.slider?.options.includes(value)) this.sliderValue = value;
  }
  /** Is this a THROUGHOUT multi-zone card (logging on every tier)? */
  isThroughout(itemId: string): boolean {
    const it = this.mapSeed?.items.find((i) => i.id === itemId);
    return !!it?.keyZones && it.keyZones.length > 1;
  }
  /** The zones a THROUGHOUT card is currently placed in (a set), for surface rendering. */
  zonesFor(itemId: string): string[] {
    return [...(this.multiPlacements[itemId] ?? new Set<string>())];
  }
  /** Place a single-zone card (null clears). Records both the scalar + the multi-set mirror. */
  place(itemId: string, zone: string | null): void {
    if (!this.mapSeed?.items.some((i) => i.id === itemId)) return;
    this.placements[itemId] = zone;
    const set = (this.multiPlacements[itemId] ??= new Set());
    set.clear();
    if (zone !== null) set.add(zone);
  }
  /** Toggle a THROUGHOUT card's membership in a zone (multi-zone placement). */
  toggleZone(itemId: string, zone: string): void {
    if (!this.mapSeed?.items.some((i) => i.id === itemId)) return;
    const set = (this.multiPlacements[itemId] ??= new Set());
    if (set.has(zone)) set.delete(zone);
    else set.add(zone);
    // keep the scalar placement coherent for non-THROUGHOUT consumers (first zone, or null)
    this.placements[itemId] = set.size ? [...set][0] : null;
  }
  /**
   * The cited authoritative zone for an item AT the current slider position. For a slider item the
   * key re-derives from keyByModel[slider]; otherwise it is the static keyZone. This is the oracle
   * the MapProbe compares against — the cited matrix, never an authored per-render answer.
   */
  keyZoneFor(itemId: string): string {
    const it = this.mapSeed?.items.find((i) => i.id === itemId);
    if (!it) return "";
    if (it.keyByModel && this.sliderValue && it.keyByModel[this.sliderValue]) return it.keyByModel[this.sliderValue];
    return it.keyZone;
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

  /** TRACE probe — sequence_matches / sim_alert_is read this. */
  traceProbe(): TraceProbe | null {
    if (!this.traceSeed) return null;
    const assignRouting = this.traceSeed.assign_routing ?? false;
    const ordered = this.traceOrder.map((id) => {
      const idx = Number(id.replace("card-", ""));
      const c = this.traceSeed!.cards[idx];
      // assign_routing leg: the learner's routing override stands; otherwise the card's canonical
      // routing (cards carry their from/to pre-set when only ORDER is being assessed).
      const route = assignRouting ? this.traceRouting[id] : undefined;
      return { from: route?.from ?? c.from, to: route?.to ?? c.to, type: c.type, fields: c.fields };
    });
    // run the real protocol state machine against the assembled order. The end-state is reached
    // only when every message matches the canonical sequence in type AND from/to routing — the
    // sim's verdict, not an authored "correct".
    const canon = this.traceSeed.canonical;
    const ref = Object.keys(canon)[0];
    const expected = ref ? canon[ref] : [];
    const reachedEndState =
      ordered.length === expected.length &&
      ordered.every((m, i) => m.type === expected[i].type && m.from === expected[i].from && m.to === expected[i].to);
    // honest consequence: the first out-of-order/mis-routed move makes the sim raise its real
    // protocol alert (TCP RST by default; a module agent's sim names its RFC alert in the seed).
    const alert = this.traceSeed.alert ?? { name: "RST" };
    let lastAlert: TraceProbe["lastAlert"] = null;
    if (ordered.length > 0 && !reachedEndState) lastAlert = { ...alert };
    return { orderedMessages: ordered, reachedEndState, lastAlert, canonical: canon };
  }

  /**
   * MAP probe — mapping_correct reads this. Each row reports the learner's placement against the
   * cited authoritative zone AT the current slider position (keyZoneFor re-derives per IaaS/PaaS/
   * SaaS). A THROUGHOUT multi-zone card is reported correct (placedZone := keyZone) only when EVERY
   * required zone is covered; otherwise placedZone is the first wrong zone (or null when a required
   * zone is still missing) so mapping_correct's gap names the item without leaking the answer.
   */
  mapProbe(): MapProbe | null {
    if (!this.mapSeed) return null;
    return {
      items: this.mapSeed.items.map((it) => {
        const keyZone = this.keyZoneFor(it.id);
        if (it.keyZones && it.keyZones.length > 1) {
          const placed = this.multiPlacements[it.id] ?? new Set<string>();
          const missing = it.keyZones.find((z) => !placed.has(z));
          const extra = [...placed].find((z) => !it.keyZones!.includes(z));
          // covered iff all required zones present and no extra zone — report keyZone on success,
          // the extra (wrong) zone when over-placed, else null (a required zone still missing).
          const placedZone = missing === undefined && extra === undefined ? it.keyZone : extra ?? null;
          return { id: it.id, placedZone, keyZone: it.keyZone, keyRef: it.keyRef };
        }
        return { id: it.id, placedZone: this.placements[it.id] ?? null, keyZone, keyRef: it.keyRef };
      }),
    };
  }

  /**
   * Build-and-break probe (gqlsim) — `validator_passes` reads this. The run is the GraphQL
   * limiter's REAL verdict over the learner's constructed query (exit 0 accepted / 1 rejected),
   * never an authored "try again". Null when the seed carries no build-and-break run.
   */
  validatorRun(): ValidatorRunProbe | null {
    return this.buildAndBreak?.validatorRun ?? null;
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
      traceRouting: { ...this.traceRouting },
      placements: { ...this.placements },
      multiPlacements: Object.fromEntries(Object.entries(this.multiPlacements).map(([k, v]) => [k, [...v]])),
      sliderValue: this.sliderValue,
    };
  }

  restore(snap: VisualSnapshot): void {
    if (snap.v !== 1) return;
    this.selections = { ...snap.selections };
    this.revealed = Object.fromEntries(Object.entries(snap.revealed).map(([k, v]) => [k, new Set(v)]));
    this.activePanel = snap.activePanel;
    this.action = snap.action;
    this.traceOrder = snap.traceOrder ? [...snap.traceOrder] : [];
    this.traceRouting = snap.traceRouting ? { ...snap.traceRouting } : {};
    this.placements = snap.placements ? { ...snap.placements } : {};
    this.multiPlacements = snap.multiPlacements
      ? Object.fromEntries(Object.entries(snap.multiPlacements).map(([k, v]) => [k, new Set(v)]))
      : {};
    this.sliderValue = snap.sliderValue ?? this.mapSeed?.slider?.initial ?? this.mapSeed?.slider?.options[0] ?? null;
  }
}
