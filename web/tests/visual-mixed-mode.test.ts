/**
 * Mixed-mode visual surface suite (Wave-4 Bug #4): the architecture fix that lets ONE exercise
 * render TRACE / MAP / PEEL surfaces PER TASK rather than the single block mode.
 *
 * The bug: VisualSurface dispatched on `spec.visual.mode`, so modules 21/22/23/24/25 — which carry
 * TRACE (sequence_matches/sim_alert_is) and/or MAP (mapping_correct) tasks under one peel/diff
 * block — could only ever render ONE surface; their TRACE/MAP tasks were uncompletable in the
 * browser, and the host's single-trace seed could not hold two protocols' decks at once.
 *
 * Two layers, both observable:
 *   1. MODE INFERENCE — `currentVisualTarget` selects the surface for the CURRENT task from its
 *      verify PRIMITIVES (the closed registry is the source of truth), and VisualSurface renders
 *      that surface (proven by the rendered data-testids).
 *   2. END-TO-END (module 24) — the host is built EXACTLY as the browser builds it (from the synced
 *      lab bundle's `visual` options, which carry BOTH the `example.com` delegation deck and the
 *      `tls13-full-handshake` deck simultaneously). The rendered TraceSurface is then DRIVEN through
 *      real DOM events (happy-dom: pool-card clicks + keyboard reorder on the roving listbox) — NOT
 *      by calling the host directly — and t7/t8 are shown to complete through the SAME verifier the
 *      Lab Player runs, reading the active deck's real state-machine verdict.
 *
 * Honesty: every deck's `canonical` is the committed sim's accepted order (canonicalDelegation /
 * canonicalHandshake), serialized as data; the surface drives the host, the host runs the real
 * state machine, and the verifier reads that verdict. No value or "correct" is authored.
 */
import { describe, expect, test, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A real DOM (happy-dom) so React client rendering + DOM events drive the surface like a browser.
beforeAll(() => {
  if (typeof document === "undefined") GlobalRegistrator.register();
  // silence React's act() environment warning — we wrap mutations in act() ourselves.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VisualSurface from "../src/components/lab/VisualSurface";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { currentVisualTarget, visualTaskTarget, inheritedTraceDeck } from "../src/components/lab/sessions/visual-task-mode";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { parse } from "yaml";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const WEB = join(ROOT, "web");

/** The synced lab bundle — what the browser hands LabPlayer (spec + the resolved visual options). */
interface LabBundle {
  spec: ExerciseSpec;
  visual: VisualHostOptions;
}
function loadBundle(module: string): LabBundle {
  return JSON.parse(readFileSync(join(WEB, "src/content/labs", `${module}.json`), "utf8")) as LabBundle;
}

/** Mount VisualSurface for the current task (its inferred target) into a real DOM root. */
function mountSurface(
  host: VisualHost,
  spec: ExerciseSpec,
  completed: (id: string) => boolean,
): { container: HTMLElement; root: Root; rerender: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChanged = () => {}; // the surface re-renders itself on host mutation via its own force-state
  const render = () =>
    act(() => {
      root.render(
        createElement(VisualSurface, {
          host,
          spec,
          onChanged,
          activeTarget: currentVisualTarget(spec.tasks, completed, "peel"),
        }),
      );
    });
  render();
  return { container, root, rerender: render };
}

/** A VerifyContext for a TRACE task on the host's ACTIVE deck — exactly as LabPlayer builds it. */
function traceCtxFor(host: VisualHost, deck: string, taskId: string, i: number): VerifyContext {
  return {
    expectations: {},
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace: host.traceProbeFor(deck),
    map: host.mapProbe(),
  };
}

/** Run one task's whole verify list against the active-deck context (LabPlayer's per-task sweep). */
function taskPasses(host: VisualHost, spec: ExerciseSpec, taskId: string): boolean {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  const tgt = visualTaskTarget(task);
  // a TRACE task (incl. a deckless break-round) resolves its deck the SAME way LabPlayer does.
  const deck = tgt.mode === "trace" ? inheritedTraceDeck(spec.tasks, taskId) : null;
  if (deck) host.setActiveDeck(deck);
  return task.verify.every((chk, i) => {
    const ctx = deck
      ? traceCtxFor(host, deck, taskId, i)
      : { expectations: {}, expectationKey: `${taskId}:${i}`, parseTree: host.parseTree(), visual: host.visualAction(), trace: host.traceProbe(), map: host.mapProbe() };
    return runCheck(host.probeSession(), chk as AnyCheckParams, ctx).pass;
  });
}

// ---------------------------------------------------------------------------------------------
// 1. MODE INFERENCE — a mixed exercise renders the surface the CURRENT task needs.
// ---------------------------------------------------------------------------------------------

describe("mode inference: a mixed exercise renders TRACE for a trace task and MAP for a map task", () => {
  // A minimal mixed host holding a peel panel, a TRACE deck, AND map data simultaneously — the very
  // shape the single-block-mode dispatcher could not serve.
  function mixedHost(): VisualHost {
    return new VisualHost({
      mode: "diff-the-trace",
      oracle: "pkt",
      panels: [],
      traces: [
        {
          name: "demo-handshake",
          participants: ["client", "server"],
          cards: [
            { from: "client", to: "server", type: "SYN" },
            { from: "server", to: "client", type: "SYN+ACK" },
            { from: "client", to: "server", type: "ACK" },
          ],
          canonical: {
            "demo-handshake": [
              { from: "client", to: "server", type: "SYN" },
              { from: "server", to: "client", type: "SYN+ACK" },
              { from: "client", to: "server", type: "ACK" },
            ],
          },
          alert: { name: "RST" },
        },
      ],
      map: {
        zones: ["you", "provider"],
        items: [{ id: "patch-os", label: "Patch the OS", keyZone: "you", keyRef: "AWS SR" }],
      },
    });
  }

  // A spec whose tasks span all three modes — the surface must follow the CURRENT task.
  function mixedSpec(): ExerciseSpec {
    return {
      tasks: [
        { id: "t1", type: "action", verify: [{ check: "region_labeled_correctly", node_id: "x" }] }, // PEEL
        { id: "t2", type: "action", verify: [{ check: "sequence_matches", canonical_ref: "demo-handshake" }] }, // TRACE
        { id: "t3", type: "action", verify: [{ check: "mapping_correct" }] }, // MAP
      ],
      visual: { mode: "diff-the-trace", oracle: "pkt", artifact: { kind: "pcap", from: "x" } },
    } as unknown as ExerciseSpec;
  }

  test("the TRACE task renders the TraceSurface (its named deck's cards + participants)", () => {
    const host = mixedHost();
    const spec = mixedSpec();
    // t1 done → t2 (TRACE) is current.
    const done = new Set(["t1"]);
    const { container, root } = mountSurface(host, spec, (id) => done.has(id));
    const html = container.innerHTML;
    expect(html).toContain('data-testid="visual-trace"'); // TRACE surface, not PEEL or MAP
    expect(html).not.toContain('data-testid="visual-map"');
    expect(html).toContain('data-testid="visual-trace-participant-client"');
    expect(html).toContain('data-testid="visual-trace-participant-server"');
    // the active deck is the task's named deck, and its cards are in the pool
    expect(host.activeDeckName()).toBe("demo-handshake");
    expect(container.querySelector('[data-testid="visual-trace-pool-card-0"]')).not.toBeNull();
    act(() => root.unmount());
  });

  test("the MAP task renders the MapSurface (its zones + items)", () => {
    const host = mixedHost();
    const spec = mixedSpec();
    // t1 + t2 done → t3 (MAP) is current.
    const done = new Set(["t1", "t2"]);
    const { container, root } = mountSurface(host, spec, (id) => done.has(id));
    const html = container.innerHTML;
    expect(html).toContain('data-testid="visual-map"'); // MAP surface
    expect(html).not.toContain('data-testid="visual-trace"');
    expect(html).toContain('data-testid="visual-map-zone-you"');
    expect(html).toContain('data-testid="visual-map-zone-provider"');
    expect(html).toContain('data-testid="visual-map-item-patch-os"');
    act(() => root.unmount());
  });

  test("the first (PEEL) task renders neither TRACE nor MAP (the proven canary path is preserved)", () => {
    // A real peel panel so the tree renders.
    const host = new VisualHost({
      mode: "diff-the-trace",
      oracle: "dns",
      panels: [{ id: "dns-query", label: "DNS query", source: { oracle: "dns", hex: loadBundle("24-how-the-internet-works").visual.panels[0].source ? (loadBundle("24-how-the-internet-works").visual.panels[0].source as { hex: string }).hex : "" } }],
    });
    const spec = mixedSpec();
    const { container, root } = mountSurface(host, spec, () => false); // nothing done → t1 (PEEL) current
    const html = container.innerHTML;
    expect(html).toContain('data-testid="visual-tree"'); // PEEL tree
    expect(html).not.toContain('data-testid="visual-trace"');
    expect(html).not.toContain('data-testid="visual-map"');
    act(() => root.unmount());
  });
});

// ---------------------------------------------------------------------------------------------
// 2. END-TO-END (module 24) — t7/t8 complete through the RENDERED TraceSurface, both decks held.
// ---------------------------------------------------------------------------------------------

describe("module 24 mixed exercise: t7 (DNS delegation) + t8 (TLS) complete through the rendered surface", () => {
  const bundle = loadBundle("24-how-the-internet-works");
  // Sanity: the synced bundle carries BOTH decks simultaneously (the single-trace limitation is gone).
  test("the synced lab bundle carries both real decks alongside the peel spine", () => {
    expect(bundle.visual.traces?.map((d) => d.name).sort()).toEqual(["example.com", "tls13-full-handshake"]);
    expect(bundle.visual.panels.map((p) => p.id)).toContain("dns-query");
    expect(bundle.visual.panels.map((p) => p.id)).toContain("cert-leaf");
  });

  const spec = ExerciseSpecSchema.parse(
    parse(readFileSync(join(ROOT, "modules/24-how-the-internet-works/exercises/exercise.yaml"), "utf8")),
  );

  /** Build the host EXACTLY as LabPlayer does: `new VisualHost(bundle.visual)`. */
  function browserHost(): VisualHost {
    return new VisualHost(bundle.visual);
  }

  /**
   * Drive the rendered TraceSurface to assemble `order` (seed-card indices) by clicking the pool
   * cards in sequence — the SAME DOM affordance a learner uses. (Pool click → host.appendTraceCard
   * runs inside the surface's onClick; we never call the host's trace methods from the test.)
   */
  function assembleViaSurface(container: HTMLElement, order: number[]): void {
    for (const idx of order) {
      const poolCard = container.querySelector(`[data-testid="visual-trace-pool-card-${idx}"]`) as HTMLElement | null;
      expect(poolCard).not.toBeNull();
      act(() => poolCard!.click());
    }
  }

  test("t7: order the DNS delegation deck on the rendered surface → the dnsres state machine reaches the answer", () => {
    const host = browserHost();
    // progress so t7 (the DNS delegation TRACE) is the current task.
    const doneThrough = new Set(["t1", "t2", "t3", "t4", "t5", "t6"]);
    const { container, root } = mountSurface(host, spec, (id) => doneThrough.has(id));

    // the rendered surface is the TRACE surface for the `example.com` delegation deck
    expect(container.innerHTML).toContain('data-testid="visual-trace"');
    expect(host.activeDeckName()).toBe("example.com");
    expect(container.querySelector('[data-testid="visual-trace-participant-stub"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="visual-trace-participant-authoritative"]')).not.toBeNull();

    // BEFORE assembling: t7 does not pass (no sequence yet)
    expect(taskPasses(host, spec, "t7")).toBe(false);

    // DRIVE the surface: click the 8 delegation cards in canonical order (the cards are seeded in
    // canonical order, so 0..7 is the legal hand-off chain the real state machine accepts).
    assembleViaSurface(container, [0, 1, 2, 3, 4, 5, 6, 7]);

    // the surface drove the host; the real dnsres-sim verdict (via traceProbeFor) now reaches the
    // end-state, so t7's sequence_matches (check_routing:true) passes through the SAME verifier.
    const probe = host.traceProbeFor("example.com")!;
    expect(probe.reachedEndState).toBe(true);
    expect(probe.orderedMessages.length).toBe(8);
    expect(taskPasses(host, spec, "t7")).toBe(true);
    act(() => root.unmount());
  });

  test("t8: order the TLS 1.3 deck on the rendered surface → the tls13 state machine reaches established", () => {
    const host = browserHost();
    const doneThrough = new Set(["t1", "t2", "t3", "t4", "t5", "t6", "t7"]);
    const { container, root } = mountSurface(host, spec, (id) => doneThrough.has(id));

    // t8 is current → the surface switched the active deck to the TLS handshake deck.
    expect(host.activeDeckName()).toBe("tls13-full-handshake");
    expect(container.innerHTML).toContain('data-testid="visual-trace"');
    expect(container.querySelector('[data-testid="visual-trace-participant-client"]')).not.toBeNull();

    expect(taskPasses(host, spec, "t8")).toBe(false);
    // the 7 canonical handshake cards are seeded first (index 0..6); index 7 is the illegal early
    // ApplicationData break card (left in the pool — t9's round uses it). Assemble 0..6.
    assembleViaSurface(container, [0, 1, 2, 3, 4, 5, 6]);

    const probe = host.traceProbeFor("tls13-full-handshake")!;
    expect(probe.reachedEndState).toBe(true);
    expect(taskPasses(host, spec, "t8")).toBe(true);
    act(() => root.unmount());
  });

  test("t9: injecting the ApplicationData break card on the rendered TLS surface raises unexpected_message(10)", () => {
    const host = browserHost();
    const doneThrough = new Set(["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]);
    const { container, root } = mountSurface(host, spec, (id) => doneThrough.has(id));
    expect(host.activeDeckName()).toBe("tls13-full-handshake");

    // Drive an illegal early-data move: ClientHello, ServerHello, then ApplicationData (card 7)
    // before any Finished — the real RFC 8446 §6.2 consequence is unexpected_message(10).
    assembleViaSurface(container, [0, 1, 7]);
    const probe = host.traceProbeFor("tls13-full-handshake")!;
    expect(probe.reachedEndState).toBe(false);
    expect(probe.lastAlert).toEqual({ name: "unexpected_message", code: 10 });
    expect(taskPasses(host, spec, "t9")).toBe(true);
    act(() => root.unmount());
  });

  test("the two decks are independent: assembling one does not disturb the other", () => {
    const host = browserHost();
    // assemble the TLS deck while it's active …
    host.setActiveDeck("tls13-full-handshake");
    host.appendTraceCard(0);
    host.appendTraceCard(1);
    // … then switch to the delegation deck — its order is still empty (per-deck state).
    host.setActiveDeck("example.com");
    expect(host.traceOrderIds()).toEqual([]);
    // and the TLS deck's order survived the switch.
    host.setActiveDeck("tls13-full-handshake");
    expect(host.traceOrderIds()).toEqual(["card-0", "card-1"]);
  });
});
