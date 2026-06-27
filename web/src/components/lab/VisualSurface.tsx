/**
 * Visual surface (Wave-4 — the Inspect-&-Assemble island; VISUAL-ENGINE-SPEC §1).
 *
 * A DOM-based, keyboard-operable, screen-reader-navigable surface — NEVER a canvas. Three modes:
 *   PEEL  — nested byte-range regions as a roving-tabindex tree; selecting a region reveals the
 *           oracle's REAL decoded value; child layers stay gated until their selector byte is read.
 *   TRACE — participant nodes + orderable message/packet cards (a roving-tabindex listbox with
 *           keyboard reorder + aria-grabbed); a stateful sim runs the REAL protocol state machine
 *           and emits the real alert/RST on an out-of-order / mis-routed move (wired to TraceProbe).
 *   MAP   — keyboard-assignable item cards + labeled drop-zones, the IaaS/PaaS/SaaS service-model
 *           slider, and the THROUGHOUT multi-zone card; placements scored against the cited key
 *           (MapProbe). Diff-the-Trace reuses the PEEL tree across aligned panels.
 *
 * Honesty: every value/verdict shown is the host's oracle output over real bytes/records — the
 * dissector parse tree (PEEL), the real state machine (TRACE), the cited matrix (MAP). The
 * component never decodes/judges anything itself; it asks the host.
 *
 * A11y / automation: every interactive node carries a stable `data-testid` + ARIA so an
 * Interceptor/browser check (and the replay test) can drive it headlessly. Animations respect
 * prefers-reduced-motion (a CSS guard).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseSpec } from "../../lib/exercise-spec";
import type { VisualHost } from "./sessions/visual-host";
import type { ParseRegion } from "../../engines/visual/pkt";
import { blockFallbackMode, currentVisualTarget, type VisualTaskTarget } from "./sessions/visual-task-mode";

interface VisualSurfaceProps {
  host: VisualHost;
  spec: ExerciseSpec;
  /** Fired after any selection/label/order/assign change (the player re-verifies + persists). */
  onChanged: () => void;
  /**
   * The current task's inferred surface target (mode + TRACE deck) — the player passes the
   * first-incomplete task's target so a MIXED exercise renders the surface the CURRENT task needs
   * (Wave-4 Bug #4). When omitted (e.g. the host's own render tests), the target is inferred from
   * the spec's tasks against `completed` (or the block's default mode if there are no tasks).
   */
  activeTarget?: VisualTaskTarget;
  /** Which task ids are already recorded (used only when `activeTarget` is not supplied). */
  completed?: (taskId: string) => boolean;
}

/** Flatten the visible tree (respecting gating) into a roving-tabindex order. */
function visibleNodes(host: VisualHost, panelId: string, region: ParseRegion, depth: number, out: Array<{ region: ParseRegion; depth: number }>): void {
  out.push({ region, depth });
  // children render only when this region is revealed AND each child's gate (if any) is open
  if (host.isRevealed(panelId, region.id)) {
    for (const c of region.children) {
      if (host.isAvailable(panelId, c.id)) visibleNodes(host, panelId, c, depth + 1, out);
    }
  }
}


const REVEAL_STYLE = `
  @keyframes grcb-reveal { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  .grcb-region-new { animation: grcb-reveal .22s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .grcb-region-new { animation: none; } }
`;

export default function VisualSurface({ host, spec, onChanged, activeTarget, completed }: VisualSurfaceProps) {
  // The surface renders for the CURRENT TASK's mode, not the exercise's single block mode (Bug #4).
  // The player passes `activeTarget` (the first-incomplete task's inferred mode + deck); without it
  // we infer from the spec's tasks (or fall back to the block mode) so the host's own tests still
  // render a sensible surface.
  const fallback = blockFallbackMode(spec.visual?.mode);
  const target: VisualTaskTarget =
    activeTarget ??
    currentVisualTarget(spec.tasks ?? [], completed ?? (() => false), fallback);

  // A TRACE task names the deck it assembles; select it on the host so the surface renders + the
  // verifier reads the RIGHT deck (a mixed host holds several at once).
  useEffect(() => {
    if (target.mode === "trace" && target.deck) host.setActiveDeck(target.deck);
  }, [host, target.mode, target.deck]);
  if (target.mode === "trace" && target.deck) host.setActiveDeck(target.deck);

  if (target.mode === "trace") return <TraceSurface host={host} onChanged={onChanged} />;
  if (target.mode === "map") return <MapSurface host={host} onChanged={onChanged} />;
  return <PeelSurface host={host} onChanged={onChanged} />;
}

// =====================================================================================
// PEEL / Diff-the-Trace — nested byte-range regions (the proven canary surface)
// =====================================================================================

function PeelSurface({ host, onChanged }: { host: VisualHost; onChanged: () => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [focusIndex, setFocusIndex] = useState(0);
  const [activePanel, setActivePanel] = useState(host.panels[0]?.id ?? "");
  const treeRef = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => {
    const panel = host.panel(activePanel);
    if (!panel) return [];
    const out: Array<{ region: ParseRegion; depth: number }> = [];
    visibleNodes(host, activePanel, panel.tree.root, 0, out);
    return out;
    // re-derive on every render (selection/reveal changes the visible set)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, activePanel, focusIndex]);

  const selectRegion = useCallback(
    (panelId: string, region: ParseRegion) => {
      host.setActivePanel(panelId);
      host.select(panelId, region.id);
      rerender();
      onChanged();
    },
    [host, onChanged, rerender],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const max = flat.length - 1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(max, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusIndex(max);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const node = flat[focusIndex];
        if (node) selectRegion(activePanel, node.region);
      }
    },
    [flat, focusIndex, activePanel, selectRegion],
  );

  const setLayer = useCallback(
    (layer: string) => {
      host.setLayer(layer);
      rerender();
      onChanged();
    },
    [host, onChanged, rerender],
  );

  const selectedId = host.selectionFor(activePanel);
  const selectedRegion = selectedId ? host.panel(activePanel)?.tree.region(selectedId) ?? null : null;

  return (
    <div data-testid="visual-surface">
      <style>{REVEAL_STYLE}</style>

      {/* panel switcher (Diff-the-Trace shows multiple aligned panels) */}
      {host.panels.length > 1 && (
        <div role="tablist" aria-label="Captures" className="flex flex-wrap gap-2 mb-4">
          {host.panels.map((p) => (
            <button
              key={p.id}
              role="tab"
              type="button"
              aria-selected={p.id === activePanel}
              data-testid={`visual-panel-tab-${p.id}`}
              className={
                "px-3 py-1.5 rounded-lg text-xs font-mono border " +
                (p.id === activePanel
                  ? "bg-gradient-brand text-white border-transparent"
                  : "bg-[color:var(--tint)] text-ink-soft border-[color:var(--hairline)] hover:border-orange/40")
              }
              onClick={() => {
                setActivePanel(p.id);
                host.setActivePanel(p.id);
                setFocusIndex(0);
                rerender();
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ---- the PEEL tree ---- */}
        <div
          ref={treeRef}
          role="tree"
          aria-label="Packet byte-range regions"
          data-testid="visual-tree"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="glass rounded-xl p-3 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-orange/50"
        >
          {flat.map((node, i) => {
            const { region, depth } = node;
            const isSelected = region.id === selectedId;
            const isFocused = i === focusIndex;
            const gated = !!region.gates;
            const childUnlocked = gated && host.isRevealed(activePanel, region.gates!);
            return (
              <div
                key={region.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={isSelected}
                aria-label={`${region.label}, bytes ${region.start} to ${region.end}${region.layer ? `, layer ${region.layer}` : ""}`}
                data-testid={`visual-region-${region.id}`}
                data-region-id={region.id}
                data-start={region.start}
                data-end={region.end}
                tabIndex={isFocused ? 0 : -1}
                onClick={() => {
                  setFocusIndex(i);
                  selectRegion(activePanel, region);
                }}
                className={
                  "grcb-region-new cursor-pointer rounded px-2 py-1.5 flex items-center gap-2 " +
                  (isSelected ? "bg-orange/15 border border-orange/40" : "hover:bg-[color:var(--tint)] border border-transparent") +
                  (isFocused ? " ring-1 ring-blue/50" : "")
                }
                style={{ marginLeft: depth * 16 }}
              >
                <span className="text-ink-dim text-[10px] tabular-nums">{region.start}–{region.end}</span>
                <span className="text-ink font-semibold">{region.label}</span>
                {region.layer && region.layer.startsWith("L") && (
                  <span className="text-[10px] px-1 rounded bg-blue/10 text-blue-bright">{region.layer}</span>
                )}
                {gated && (
                  <span className="text-[10px] text-ink-dim" aria-hidden="true">
                    {childUnlocked ? "▾ unlocked" : "▸ gated — read this byte"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- the inspector: reveals the oracle's real decode for the selection ---- */}
        <div className="glass rounded-xl p-4" data-testid="visual-inspector" aria-live="polite">
          {selectedRegion === null ? (
            <p className="text-sm text-ink-dim">
              Select a region (click, or focus the tree and press Enter) to read the byte's real decoded value.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-dim uppercase tracking-wide">{selectedRegion.label}</p>
              <p className="mt-1 font-mono text-sm text-ink break-words" data-testid="visual-decoded-value">
                {selectedRegion.value}
              </p>
              <p className="mt-1 text-[11px] text-ink-dim">
                bytes {selectedRegion.start}–{selectedRegion.end}
                {selectedRegion.rfc ? ` · ${selectedRegion.rfc}` : ""}
              </p>

              {/* Layer/class label entry (region_labeled_correctly with expect_layer reads this).
                  Choices are DERIVED from the panel's real region layers — OSI layers for a packet,
                  HASH/ENCODE for the crypto sort, config/layer for an OCI image — never hardcoded. */}
              {host.labelChoices(activePanel).length > 0 && (
              <fieldset className="mt-4">
                <legend className="text-xs text-ink-soft">Which layer / class is this?</legend>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Region layer or class">
                  {host.labelChoices(activePanel).map((l) => {
                    const chosen = host.visualAction()?.enteredLayer === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        data-testid={`visual-layer-${l}`}
                        className={
                          "px-2.5 py-1 rounded text-xs font-mono border " +
                          (chosen
                            ? "bg-gradient-brand text-white border-transparent"
                            : "bg-[color:var(--tint)] text-ink-soft border-[color:var(--hairline)] hover:border-orange/40")
                        }
                        onClick={() => setLayer(l)}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              )}
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-dim">
        Every value here is the oracle's own decode of the real committed artifact — fidelity-checked in CI
        against a reference decoder. The parser/engine is the source of truth; nothing on screen is invented.
      </p>
    </div>
  );
}

// =====================================================================================
// TRACE / Build-and-Break — orderable message cards + the real protocol state machine
// =====================================================================================

function TraceSurface({ host, onChanged }: { host: VisualHost; onChanged: () => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => { force((n) => n + 1); onChanged(); }, [force, onChanged]);

  // The grabbed card's id, when a card is "held" for keyboard reorder (aria-grabbed). null = none.
  const [grabbed, setGrabbed] = useState<number | null>(null);
  // Roving focus across the assembled order (-1 = focus is on the pool).
  const [orderFocus, setOrderFocus] = useState(0);
  const [poolFocus, setPoolFocus] = useState(0);

  const cards = host.traceCards();
  const orderIds = host.traceOrderIds();
  const orderIdx = orderIds.map((id) => Number(id.replace("card-", "")));
  const pool = host.tracePoolIndices();
  const participants = host.traceParticipants();
  const assignRouting = host.traceAssignsRouting();
  const probe = host.traceProbe();

  const reorder = useCallback((from: number, to: number) => { host.moveTraceCard(from, to); rerender(); }, [host, rerender]);
  const addCard = useCallback((index: number) => { host.appendTraceCard(index); rerender(); }, [host, rerender]);
  const removeCard = useCallback((index: number) => { host.removeTraceCard(index); rerender(); }, [host, rerender]);

  // Keyboard model on the assembled listbox: Arrow moves focus; Enter/Space grabs/drops; while
  // grabbed, Arrow reorders the held card; Delete/Backspace returns it to the pool.
  const onOrderKey = useCallback(
    (e: React.KeyboardEvent) => {
      const n = orderIds.length;
      if (n === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        if (grabbed !== null) { const pos = Math.min(n - 1, orderFocus + 1); reorder(orderFocus, pos); setOrderFocus(pos); }
        else setOrderFocus((i) => Math.min(n - 1, i + 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (grabbed !== null) { const pos = Math.max(0, orderFocus - 1); reorder(orderFocus, pos); setOrderFocus(pos); }
        else setOrderFocus((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const idx = orderIdx[orderFocus];
        setGrabbed((g) => (g === idx ? null : idx)); // toggle grab on the focused card
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const idx = orderIdx[orderFocus];
        if (idx !== undefined) { removeCard(idx); setGrabbed(null); setOrderFocus((i) => Math.max(0, Math.min(i, n - 2))); }
      }
    },
    [orderIds.length, orderIdx, orderFocus, grabbed, reorder, removeCard],
  );

  // Keyboard model on the pool: Arrow moves focus; Enter/Space sends the card to the end of order.
  const onPoolKey = useCallback(
    (e: React.KeyboardEvent) => {
      const n = pool.length;
      if (n === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setPoolFocus((i) => Math.min(n - 1, i + 1)); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setPoolFocus((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const idx = pool[poolFocus];
        if (idx !== undefined) { addCard(idx); setPoolFocus((i) => Math.max(0, Math.min(i, n - 2))); }
      }
    },
    [pool, poolFocus, addCard],
  );

  return (
    <div data-testid="visual-trace">
      <style>{REVEAL_STYLE}</style>

      {/* participant nodes — the endpoints the cards route between */}
      <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Participants">
        {participants.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span
              data-testid={`visual-trace-participant-${p}`}
              className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-[color:var(--tint)] text-ink border-[color:var(--hairline)]"
            >
              {p}
            </span>
            {i < participants.length - 1 && <span className="text-ink-dim" aria-hidden="true">↔</span>}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ---- the assembled order (roving-tabindex listbox, keyboard reorder) ---- */}
        <div>
          <p className="text-xs text-ink-soft mb-2">
            Assembled sequence — focus a card and press Enter to grab it, then Arrow keys to reorder; Delete returns it.
          </p>
          <div
            role="listbox"
            aria-label="Assembled message sequence"
            aria-orientation="vertical"
            data-testid="visual-trace-order"
            tabIndex={0}
            onKeyDown={onOrderKey}
            className="glass rounded-xl p-3 min-h-[4rem] outline-none focus-visible:ring-2 focus-visible:ring-orange/50 space-y-1.5"
          >
            {orderIds.length === 0 && <p className="text-sm text-ink-dim">No cards placed yet — add one from the pool.</p>}
            {orderIdx.map((idx, pos) => {
              const c = cards[idx];
              const route = host.traceRoutingFor(idx);
              const from = route?.from ?? c.from;
              const to = route?.to ?? c.to;
              const isGrabbed = grabbed === idx;
              const isFocused = pos === orderFocus;
              return (
                <div
                  key={idx}
                  role="option"
                  aria-selected={isFocused}
                  aria-grabbed={isGrabbed}
                  data-testid={`visual-trace-card-${idx}`}
                  data-card-index={idx}
                  data-card-type={c.type}
                  data-card-pos={pos}
                  tabIndex={-1}
                  onClick={() => { setOrderFocus(pos); setGrabbed((g) => (g === idx ? null : idx)); }}
                  className={
                    "grcb-region-new rounded-lg px-3 py-2 border flex items-center gap-2 cursor-pointer font-mono text-[13px] " +
                    (isGrabbed ? "bg-orange/20 border-orange/60 ring-1 ring-orange/50" : "bg-[color:var(--tint)] border-[color:var(--hairline)]") +
                    (isFocused ? " ring-1 ring-blue/50" : "")
                  }
                >
                  <span className="text-ink-dim text-[10px] tabular-nums w-5">{pos + 1}</span>
                  <span className="text-ink font-semibold">{c.type}</span>
                  <span className="text-ink-dim text-[11px]">{from} → {to}</span>
                  {c.fields?.flags_byte && <span className="text-[10px] px-1 rounded bg-blue/10 text-blue-bright">{c.fields.flags_byte}</span>}
                  {isGrabbed && <span className="ml-auto text-[10px] text-orange" aria-hidden="true">grabbed</span>}
                </div>
              );
            })}
          </div>

          {/* per-card routing assignment (assign_routing leg only) */}
          {assignRouting && orderIdx.length > 0 && (
            <div className="mt-3 space-y-2" role="group" aria-label="Route each card">
              {orderIdx.map((idx) => {
                const c = cards[idx];
                const route = host.traceRoutingFor(idx);
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-ink-soft w-24 truncate">{c.type}</span>
                    <label className="sr-only" htmlFor={`route-from-${idx}`}>from</label>
                    <select
                      id={`route-from-${idx}`}
                      data-testid={`visual-trace-route-from-${idx}`}
                      value={route?.from ?? ""}
                      onChange={(e) => { host.setTraceRouting(idx, e.target.value || undefined, route?.to); rerender(); }}
                      className="rounded border border-[color:var(--hairline)] bg-[color:var(--tint)] px-1.5 py-1 font-mono"
                    >
                      <option value="">from…</option>
                      {participants.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <span className="text-ink-dim" aria-hidden="true">→</span>
                    <label className="sr-only" htmlFor={`route-to-${idx}`}>to</label>
                    <select
                      id={`route-to-${idx}`}
                      data-testid={`visual-trace-route-to-${idx}`}
                      value={route?.to ?? ""}
                      onChange={(e) => { host.setTraceRouting(idx, route?.from, e.target.value || undefined); rerender(); }}
                      className="rounded border border-[color:var(--hairline)] bg-[color:var(--tint)] px-1.5 py-1 font-mono"
                    >
                      <option value="">to…</option>
                      {participants.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- the pool of unplaced cards + the sim consequence ---- */}
        <div className="space-y-4">
          <div>
            <p className="text-xs text-ink-soft mb-2">Card pool — press Enter to add to the sequence.</p>
            <div
              role="listbox"
              aria-label="Unplaced message cards"
              data-testid="visual-trace-pool"
              tabIndex={0}
              onKeyDown={onPoolKey}
              className="glass rounded-xl p-3 min-h-[3rem] outline-none focus-visible:ring-2 focus-visible:ring-orange/50 space-y-1.5"
            >
              {pool.length === 0 && <p className="text-sm text-ink-dim">All cards placed.</p>}
              {pool.map((idx, pos) => {
                const c = cards[idx];
                return (
                  <div
                    key={idx}
                    role="option"
                    aria-selected={pos === poolFocus}
                    aria-grabbed={false}
                    data-testid={`visual-trace-pool-card-${idx}`}
                    data-card-index={idx}
                    data-card-type={c.type}
                    tabIndex={-1}
                    onClick={() => { setPoolFocus(pos); addCard(idx); }}
                    className={
                      "rounded-lg px-3 py-2 border flex items-center gap-2 cursor-pointer font-mono text-[13px] bg-[color:var(--tint)] border-[color:var(--hairline)] hover:border-orange/40 " +
                      (pos === poolFocus ? "ring-1 ring-blue/50" : "")
                    }
                  >
                    <span className="text-ink font-semibold">{c.type}</span>
                    <span className="text-ink-dim text-[11px]">{c.from} → {c.to}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* the stateful sim's real consequence (sequence_matches / sim_alert_is read the same probe) */}
          <div className="glass rounded-xl p-4" data-testid="visual-trace-sim" aria-live="polite">
            <p className="text-xs text-ink-dim uppercase tracking-wide">Stateful sim</p>
            {probe && probe.orderedMessages.length === 0 && (
              <p className="mt-1 text-sm text-ink-dim">Assemble the sequence to run the real protocol state machine.</p>
            )}
            {probe && probe.reachedEndState && (
              <p className="mt-1 text-sm text-[color:var(--status-pass-fg)]" data-testid="visual-trace-endstate">
                ✓ The sequence reached the protocol end-state — the sim accepted every message in order.
              </p>
            )}
            {probe && !probe.reachedEndState && probe.lastAlert && (
              <p className="mt-1 text-sm text-[color:var(--status-fail-fg)]" data-testid="visual-trace-alert">
                The sim raised <span className="font-mono font-semibold">{probe.lastAlert.name}
                {probe.lastAlert.code !== undefined ? `(${probe.lastAlert.code})` : ""}</span> — a real protocol
                consequence of an out-of-order or mis-routed message, not a hint.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-dim">
        The counterpart runs the real protocol state machine: an out-of-order or mis-routed message produces the
        actual RFC alert/RST. The sim is the consequence engine — there is no authored "try again".
      </p>
    </div>
  );
}

// =====================================================================================
// MAP — keyboard-assignable item cards onto labeled zones (slider + THROUGHOUT)
// =====================================================================================

function MapSurface({ host, onChanged }: { host: VisualHost; onChanged: () => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => { force((n) => n + 1); onChanged(); }, [force, onChanged]);

  const items = host.mapItems();
  const zones = host.mapZones();
  const sliderOptions = host.mapSliderOptions();
  const slider = host.mapSlider();

  // The currently-selected item card (the one a zone assignment lands on). null = none.
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [itemFocus, setItemFocus] = useState(0);

  const assign = useCallback(
    (itemId: string, zone: string) => {
      if (host.isThroughout(itemId)) host.toggleZone(itemId, zone);
      else host.place(itemId, zone);
      rerender();
    },
    [host, rerender],
  );

  const onItemsKey = useCallback(
    (e: React.KeyboardEvent) => {
      const n = items.length;
      if (n === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setItemFocus((i) => Math.min(n - 1, i + 1)); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setItemFocus((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const it = items[itemFocus];
        if (it) setSelectedItem((s) => (s === it.id ? null : it.id));
      } else if (/^[1-9]$/.test(e.key)) {
        // number hotkeys assign the selected card to the Nth zone (keyboard-only path)
        e.preventDefault();
        const zone = zones[Number(e.key) - 1];
        const it = items[itemFocus];
        if (zone && it) { setSelectedItem(it.id); assign(it.id, zone); }
      }
    },
    [items, itemFocus, zones, assign],
  );

  return (
    <div data-testid="visual-map">
      <style>{REVEAL_STYLE}</style>

      {/* service-model slider (IaaS / PaaS / SaaS) — moves the cited responsibility boundary */}
      {sliderOptions.length > 0 && (
        <div className="mb-4" data-testid="visual-map-slider-group">
          <p className="text-xs text-ink-soft mb-2">Service model — the responsibility boundary moves as you slide.</p>
          <div
            role="slider"
            aria-label="Service model"
            aria-valuemin={0}
            aria-valuemax={sliderOptions.length - 1}
            aria-valuenow={Math.max(0, sliderOptions.indexOf(slider ?? ""))}
            aria-valuetext={slider ?? undefined}
            data-testid="visual-map-slider"
            data-slider-value={slider ?? ""}
            tabIndex={0}
            onKeyDown={(e) => {
              const i = sliderOptions.indexOf(slider ?? "");
              if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); const v = sliderOptions[Math.min(sliderOptions.length - 1, i + 1)]; host.setMapSlider(v); rerender(); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); const v = sliderOptions[Math.max(0, i - 1)]; host.setMapSlider(v); rerender(); }
            }}
            className="inline-flex gap-1 rounded-lg border border-[color:var(--hairline)] p-1 bg-[color:var(--tint)] outline-none focus-visible:ring-2 focus-visible:ring-orange/50"
          >
            {sliderOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                data-testid={`visual-map-slider-${opt}`}
                aria-pressed={opt === slider}
                onClick={() => { host.setMapSlider(opt); rerender(); }}
                className={
                  "px-3 py-1 rounded text-xs font-mono " +
                  (opt === slider ? "bg-gradient-brand text-white" : "text-ink-soft hover:text-ink")
                }
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* ---- item cards (select one, then assign to a zone) ---- */}
        <div>
          <p className="text-xs text-ink-soft mb-2">
            Control cards — focus one and press Enter to select, then a zone (or number key) to assign.
          </p>
          <div
            role="listbox"
            aria-label="Control cards"
            data-testid="visual-map-items"
            tabIndex={0}
            onKeyDown={onItemsKey}
            className="glass rounded-xl p-3 space-y-1.5 outline-none focus-visible:ring-2 focus-visible:ring-orange/50"
          >
            {items.map((it, pos) => {
              const placed = host.isThroughout(it.id) ? host.zonesFor(it.id) : (host.zonesFor(it.id).slice(0, 1));
              return (
                <div
                  key={it.id}
                  role="option"
                  aria-selected={selectedItem === it.id}
                  aria-grabbed={selectedItem === it.id}
                  data-testid={`visual-map-item-${it.id}`}
                  data-item-id={it.id}
                  data-throughout={host.isThroughout(it.id) ? "true" : "false"}
                  tabIndex={-1}
                  onClick={() => { setItemFocus(pos); setSelectedItem((s) => (s === it.id ? null : it.id)); }}
                  className={
                    "grcb-region-new rounded-lg px-3 py-2 border cursor-pointer text-[13px] " +
                    (selectedItem === it.id ? "bg-orange/20 border-orange/60 ring-1 ring-orange/50" : "bg-[color:var(--tint)] border-[color:var(--hairline)] hover:border-orange/40") +
                    (pos === itemFocus ? " ring-1 ring-blue/50" : "")
                  }
                >
                  <span className="text-ink font-semibold">{it.label}</span>
                  {host.isThroughout(it.id) && <span className="ml-2 text-[10px] px-1 rounded bg-blue/10 text-blue-bright">THROUGHOUT</span>}
                  {placed.length > 0 && <span className="ml-2 text-[11px] text-ink-dim">→ {placed.join(", ")}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- the labeled drop-zones ---- */}
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Zones">
          {zones.map((zone) => {
            const here = items.filter((it) => host.zonesFor(it.id).includes(zone));
            return (
              <div
                key={zone}
                data-testid={`visual-map-zone-${zone}`}
                data-zone={zone}
                aria-dropeffect="move"
                aria-label={`Zone ${zone}`}
                onClick={() => { if (selectedItem) assign(selectedItem, zone); }}
                className="glass rounded-xl p-3 min-h-[5rem] cursor-pointer border border-[color:var(--hairline)] hover:border-orange/40"
              >
                <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">{zone}</p>
                <div className="space-y-1">
                  {here.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      data-testid={`visual-map-placed-${it.id}-${zone}`}
                      onClick={(e) => { e.stopPropagation(); assign(it.id, zone); }}
                      className="block w-full text-left rounded px-2 py-1 text-[12px] font-mono bg-orange/10 text-ink border border-orange/30"
                    >
                      {it.label}{host.isThroughout(it.id) ? " ⊕" : ""}
                    </button>
                  ))}
                  {here.length === 0 && <p className="text-[11px] text-ink-dim">drop a card here</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-dim">
        Placement is scored against a cited authoritative matrix (NIST / SOC 2 / AWS / CSA / CIS / OWASP), not an
        opinion. As the service-model slider moves, the cited key re-derives each card's correct zone — the
        responsibility boundary is a movable line, and the matrix is the oracle.
      </p>
    </div>
  );
}
