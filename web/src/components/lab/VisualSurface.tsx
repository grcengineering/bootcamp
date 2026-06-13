/**
 * Visual surface (Wave-4 — the Inspect-&-Assemble island; VISUAL-ENGINE-SPEC §1).
 *
 * A DOM-based, keyboard-operable, screen-reader-navigable surface — NEVER a canvas. For the
 * networking canary it implements PEEL fully (nested byte-range regions as a roving-tabindex
 * tree; selecting a region reveals the oracle's REAL decoded value; child layers stay gated
 * until their selector byte is read). TRACE/MAP are stubbed cleanly (later modules fill them).
 *
 * Honesty: every value shown is the dissector's output over real captured bytes — the host's
 * parse tree (VisualHost). The component never decodes anything itself; it asks the host.
 *
 * A11y / automation: the tree is a real `role="tree"` with roving tabindex (Arrow keys move,
 * Enter/Space selects, Right expands a gated layer once unlocked); every region carries a
 * stable `data-testid` and aria-label so an Interceptor/browser check can drive selections.
 * Animations respect prefers-reduced-motion (a CSS guard, like LabPlayer's check-pop).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { ExerciseSpec } from "../../lib/exercise-spec";
import type { VisualHost } from "./sessions/visual-host";
import type { ParseRegion } from "../../engines/visual/pkt";

interface VisualSurfaceProps {
  host: VisualHost;
  spec: ExerciseSpec;
  /** Fired after any selection/label change (the player re-verifies + persists). */
  onChanged: () => void;
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

const LAYER_CHOICES = ["L2", "L3", "L4", "L6", "L7"];

export default function VisualSurface({ host, spec, onChanged }: VisualSurfaceProps) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [focusIndex, setFocusIndex] = useState(0);
  const [activePanel, setActivePanel] = useState(host.panels[0]?.id ?? "");
  const treeRef = useRef<HTMLDivElement>(null);

  const mode = spec.visual?.mode ?? "peel";

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

  if (mode !== "peel" && mode !== "diff-the-trace") {
    // TRACE / MAP / build-and-break are stubbed cleanly for the canary (later modules fill them).
    return (
      <div className="glass-card p-6" data-testid="visual-surface-stub">
        <h3 className="text-lg font-semibold text-ink">This mode lands in a later wave</h3>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed">
          The <span className="font-mono">{mode}</span> surface (orderable cards + the real protocol state machine, or
          drag-to-zone mapping) is scaffolded but ships with the modules that need it. The PEEL surface — nested
          byte-range regions over the real captured packet — is live below in the modules that use it.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="visual-surface">
      <style>{`
        @keyframes grcb-reveal { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
        .grcb-region-new { animation: grcb-reveal .22s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .grcb-region-new { animation: none; } }
      `}</style>

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

              {/* OSI/layer label entry (region_labeled_correctly with expect_layer reads this) */}
              <fieldset className="mt-4">
                <legend className="text-xs text-ink-soft">Which OSI layer is this?</legend>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="OSI layer">
                  {LAYER_CHOICES.map((l) => {
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
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-dim">
        Every value here is the packet dissector's own output over the real captured bytes — fidelity-checked
        against tshark's decode of the same frame. The dissector is the oracle; nothing on screen is invented.
      </p>
    </div>
  );
}
