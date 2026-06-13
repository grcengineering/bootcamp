/**
 * Visual-engine TRACE + MAP suite (Wave-4): the orderable-card / drop-zone surfaces and their
 * stateful counterparts. Two layers, both asserting observable outcomes over REAL state:
 *
 *   1. HOST (DOM-free state model) — keyboard reorder (moveTraceCard), pool↔order moves, routing
 *      overrides, the real protocol alert on a wrong move, the IaaS/PaaS/SaaS slider re-deriving
 *      the cited key, and the THROUGHOUT multi-zone card. Each assertion runs the SAME verifier
 *      primitives the Lab Player runs (sequence_matches / sim_alert_is / mapping_correct), so a
 *      green test means a real check would pass/fail for the real reason.
 *
 *   2. SURFACE (React island) — rendered with react-dom/server's renderToStaticMarkup (no browser
 *      DOM needed) to assert the data-testid + ARIA contract module agents drive: participant
 *      nodes, the roving-tabindex listbox (role=listbox / role=option / aria-grabbed), the routing
 *      selects, the slider (role=slider), the labeled drop-zones (aria-dropeffect), and the sim
 *      consequence panel. LOOK is then verified in real Chrome via Interceptor (per the rules).
 *
 * Honesty: the sim's end-state/alert is the real RFC-9293 TCP state machine's verdict; the MAP
 * verdict is the cited authoritative key. No value or "correct" is authored.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisualHost } from "../src/components/lab/sessions/visual-host";
import { buildVisualOptions, type FixtureSet, type PacketFixture } from "../src/lib/visual-seed";
import { runCheck, type AnyCheckParams, type VerifyContext } from "../src/verifiers/registry";
import VisualSurface from "../src/components/lab/VisualSurface";
import type { ExerciseSpec } from "../src/lib/exercise-spec";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/net");
function fixtureSet(): FixtureSet {
  const set: FixtureSet = {};
  for (const n of readdirSync(ASSETS)) if (n.endsWith(".json")) set[n] = JSON.parse(readFileSync(join(ASSETS, n), "utf8")) as PacketFixture;
  return set;
}
const set = fixtureSet();
const handshake = set["google-search-tcp-handshake.json"] as PacketFixture;
const clientHelloHex = (set["google-search-clienthello.json"] as PacketFixture).hex!;

/** A VerifyContext from a host, exactly as LabPlayer builds it for the visual surface. */
function ctx(host: VisualHost): VerifyContext {
  return { expectations: {}, expectationKey: "x:0", parseTree: host.parseTree(), visual: host.visualAction(), trace: host.traceProbe(), map: host.mapProbe() };
}
function check(host: VisualHost, raw: AnyCheckParams) {
  return runCheck(host.probeSession(), raw, ctx(host));
}

function traceHost(): VisualHost {
  return new VisualHost(buildVisualOptions("trace", "pkt", handshake, set));
}

function specFor(mode: string): ExerciseSpec {
  // Minimal spec stub — only spec.visual.mode is read by the surface dispatcher.
  return { visual: { mode, oracle: "pkt", artifact: { kind: "pcap", from: "x" } } } as unknown as ExerciseSpec;
}
function renderSurface(host: VisualHost, mode: string): string {
  return renderToStaticMarkup(createElement(VisualSurface, { host, spec: specFor(mode), onChanged: () => {} }));
}

describe("VisualHost TRACE — keyboard reorder, pool↔order, routing, real-alert consequence", () => {
  test("canonical order reaches end-state; sequence_matches passes; no alert", () => {
    const h = traceHost();
    h.appendTraceCard(0); // SYN
    h.appendTraceCard(1); // SYN+ACK
    h.appendTraceCard(2); // ACK
    expect(h.traceOrderIds()).toEqual(["card-0", "card-1", "card-2"]);
    expect(h.tracePoolIndices()).toEqual([]); // all placed
    const probe = h.traceProbe()!;
    expect(probe.reachedEndState).toBe(true);
    expect(probe.lastAlert).toBeNull();
    const ref = Object.keys(probe.canonical)[0];
    const out = check(h, { check: "sequence_matches", canonical_ref: ref, check_routing: true } as AnyCheckParams);
    expect(out.pass).toBe(true);
  });

  test("moveTraceCard reorders (the keyboard reorder primitive) and re-runs the real sim", () => {
    const h = traceHost();
    // assemble out of order: SYN, ACK, SYN+ACK
    h.appendTraceCard(0);
    h.appendTraceCard(2);
    h.appendTraceCard(1);
    expect(h.traceProbe()!.reachedEndState).toBe(false);
    expect(h.traceProbe()!.lastAlert).toEqual({ name: "RST" }); // real TCP consequence
    const ref = Object.keys(h.traceProbe()!.canonical)[0];
    expect(check(h, { check: "sim_alert_is", alert: "RST" } as AnyCheckParams).pass).toBe(true);
    // swap positions 1 and 2 (ACK ↔ SYN+ACK) → canonical order → sim now reaches end-state
    h.moveTraceCard(1, 2);
    expect(h.traceOrderIds()).toEqual(["card-0", "card-1", "card-2"]);
    expect(h.traceProbe()!.reachedEndState).toBe(true);
    expect(check(h, { check: "sequence_matches", canonical_ref: ref } as AnyCheckParams).pass).toBe(true);
  });

  test("moveTraceCard clamps out-of-range and ignores no-op moves", () => {
    const h = traceHost();
    h.appendTraceCard(0);
    h.appendTraceCard(1);
    h.moveTraceCard(5, 0); // from out of range → ignored
    h.moveTraceCard(0, 0); // no-op
    expect(h.traceOrderIds()).toEqual(["card-0", "card-1"]);
    h.moveTraceCard(0, 9); // to clamps to last
    expect(h.traceOrderIds()).toEqual(["card-1", "card-0"]);
  });

  test("removeTraceCard returns a placed card to the pool", () => {
    const h = traceHost();
    h.appendTraceCard(0);
    h.appendTraceCard(1);
    h.removeTraceCard(0);
    expect(h.traceOrderIds()).toEqual(["card-1"]);
    expect(h.tracePoolIndices()).toContain(0);
    h.appendTraceCard(99); // out-of-range index ignored
    expect(h.traceOrderIds()).toEqual(["card-1"]);
  });

  test("assign_routing: a mis-routed card fails sequence_matches with check_routing and raises the named alert", () => {
    const opts = buildVisualOptions("trace", "pkt", handshake, set);
    opts.trace!.assign_routing = true;
    opts.trace!.alert = { name: "unexpected_message", code: 10 }; // a module sim's real RFC alert
    const h = new VisualHost(opts);
    h.appendTraceCard(0);
    h.appendTraceCard(1);
    h.appendTraceCard(2);
    expect(h.traceAssignsRouting()).toBe(true);
    // route card-0 (SYN) backwards: server→client (the canonical is client→server)
    h.setTraceRouting(0, "server", "client");
    const probe = h.traceProbe()!;
    expect(probe.orderedMessages[0]).toMatchObject({ from: "server", to: "client" });
    expect(probe.reachedEndState).toBe(false);
    const ref = Object.keys(probe.canonical)[0];
    const routed = check(h, { check: "sequence_matches", canonical_ref: ref, check_routing: true } as AnyCheckParams);
    expect(routed.pass).toBe(false);
    expect(routed.gap).toMatch(/routed server→client/);
    // the seed's alert name surfaces through the probe (sim_alert_is)
    expect(check(h, { check: "sim_alert_is", alert: "unexpected_message", code: 10 } as AnyCheckParams).pass).toBe(true);
    // correct the routing → canonical → end-state
    h.setTraceRouting(0, "client", "server");
    expect(h.traceProbe()!.reachedEndState).toBe(true);
    expect(h.traceRoutingFor(0)).toEqual({ from: "client", to: "server" });
    h.setTraceRouting(99, "x", "y"); // out-of-range index ignored
  });

  test("snapshot/restore round-trips order + routing", () => {
    const opts = buildVisualOptions("trace", "pkt", handshake, set);
    opts.trace!.assign_routing = true;
    const h = new VisualHost(opts);
    h.appendTraceCard(0);
    h.setTraceRouting(0, "client", "server");
    const snap = h.snapshot();
    const h2 = new VisualHost(opts);
    h2.restore(snap);
    expect(h2.traceOrderIds()).toEqual(["card-0"]);
    expect(h2.traceRoutingFor(0)).toEqual({ from: "client", to: "server" });
    h2.resetTrace();
    expect(h2.traceOrderIds()).toEqual([]);
    expect(h2.traceRoutingFor(0)).toBeUndefined();
  });
});

describe("VisualHost MAP — slider re-derives the cited key, THROUGHOUT multi-zone, mapping_correct", () => {
  function mapHost(): VisualHost {
    return new VisualHost({
      mode: "map",
      oracle: "pkt",
      panels: [],
      map: {
        zones: ["you", "provider", "app-tier", "data-tier", "edge-tier"],
        slider: { options: ["IaaS", "PaaS", "SaaS"], initial: "IaaS" },
        items: [
          // a control whose owner migrates as the service model moves (the boundary is movable)
          { id: "patch-os", label: "Patch the OS", keyZone: "you", keyRef: "AWS Shared Responsibility", keyByModel: { IaaS: "you", PaaS: "provider", SaaS: "provider" } },
          // a static control (always the customer's) — no keyByModel
          { id: "iam-users", label: "Manage IAM users", keyZone: "you", keyRef: "CSA CCM IAM-01" },
          // a THROUGHOUT card: logging belongs on every tier
          { id: "logging", label: "Centralized logging", keyZone: "app-tier", keyZones: ["app-tier", "data-tier", "edge-tier"], keyRef: "NIST 800-53 AU-2" },
        ],
      },
    });
  }

  test("the slider re-derives the cited key per IaaS/PaaS/SaaS", () => {
    const h = mapHost();
    expect(h.mapSlider()).toBe("IaaS");
    expect(h.keyZoneFor("patch-os")).toBe("you"); // IaaS: you patch the OS
    h.setMapSlider("SaaS");
    expect(h.keyZoneFor("patch-os")).toBe("provider"); // SaaS: the provider patches
    expect(h.keyZoneFor("iam-users")).toBe("you"); // static control unaffected by the slider
    h.setMapSlider("nope"); // not a slider option → ignored
    expect(h.mapSlider()).toBe("SaaS");
  });

  test("mapping_correct tracks the slider: a placement right at IaaS becomes wrong at SaaS", () => {
    const h = mapHost();
    h.place("patch-os", "you"); // correct at IaaS
    h.place("iam-users", "you");
    h.toggleZone("logging", "app-tier");
    h.toggleZone("logging", "data-tier");
    h.toggleZone("logging", "edge-tier");
    // all three correct at IaaS
    expect(check(h, { check: "mapping_correct" } as AnyCheckParams).pass).toBe(true);
    // slide to SaaS: patch-os should now be "provider"; the existing "you" placement is wrong
    h.setMapSlider("SaaS");
    const out = check(h, { check: "mapping_correct" } as AnyCheckParams);
    expect(out.pass).toBe(false);
    expect(out.gap).toMatch(/patch-os/); // the gap names the now-misplaced control, not the answer
  });

  test("THROUGHOUT card is correct only when every required zone is covered; an extra zone is wrong", () => {
    const h = mapHost();
    h.place("patch-os", "you");
    h.place("iam-users", "you");
    expect(h.isThroughout("logging")).toBe(true);
    // only one of three zones placed → mapping_correct fails, naming the unfinished THROUGHOUT card
    h.toggleZone("logging", "app-tier");
    let out = check(h, { check: "mapping_correct" } as AnyCheckParams);
    expect(out.pass).toBe(false);
    expect(out.gap).toMatch(/logging/);
    // cover the remaining required zones → correct
    h.toggleZone("logging", "data-tier");
    h.toggleZone("logging", "edge-tier");
    expect(check(h, { check: "mapping_correct" } as AnyCheckParams).pass).toBe(true);
    expect(h.zonesFor("logging").sort()).toEqual(["app-tier", "data-tier", "edge-tier"]);
    // adding a zone OUTSIDE the key set makes it wrong again (over-placement)
    h.toggleZone("logging", "you");
    out = check(h, { check: "mapping_correct" } as AnyCheckParams);
    expect(out.pass).toBe(false);
    // toggling that wrong zone back off restores correctness (toggle is idempotent pair)
    h.toggleZone("logging", "you");
    expect(check(h, { check: "mapping_correct" } as AnyCheckParams).pass).toBe(true);
  });

  test("place(null) clears; unknown items are ignored; snapshot/restore round-trips slider + zones", () => {
    const h = mapHost();
    h.toggleZone("logging", "app-tier");
    h.place("patch-os", "you");
    h.setMapSlider("PaaS");
    h.place("patch-os", null); // clear
    expect(h.zonesFor("patch-os")).toEqual([]);
    h.place("ghost", "you"); // unknown item → ignored
    h.toggleZone("ghost", "you"); // unknown item → ignored
    const snap = h.snapshot();
    const h2 = mapHost();
    h2.restore(snap);
    expect(h2.mapSlider()).toBe("PaaS");
    expect(h2.zonesFor("logging")).toEqual(["app-tier"]);
  });

  test("a host with no slider reports an empty slider surface (single-board MAP)", () => {
    const h = new VisualHost({ mode: "map", oracle: "pkt", panels: [], map: { zones: ["a", "b"], items: [{ id: "x", label: "X", keyZone: "a" }] } });
    expect(h.mapSliderOptions()).toEqual([]);
    expect(h.mapSlider()).toBeNull();
    h.setMapSlider("a"); // no slider → ignored, stays null
    expect(h.mapSlider()).toBeNull();
    expect(h.isThroughout("x")).toBe(false);
    expect(h.keyZoneFor("ghost")).toBe(""); // unknown item → empty key (total function)
  });
});

describe("visual-seed normalizer — TRACE step list + MAP seed (no-frame protocols)", () => {
  test("a step-list TRACE fixture builds cards + canonical without packet panels", () => {
    const fx: PacketFixture = {
      id: "oauth-dance",
      trace: {
        participants: ["client", "authz-server", "resource"],
        steps: [
          { from: "client", to: "authz-server", type: "AuthorizationRequest" },
          { from: "authz-server", to: "client", type: "AuthorizationCode" },
          { from: "client", to: "authz-server", type: "TokenExchange" },
          { from: "client", to: "resource", type: "ResourceCall" },
        ],
        alert: { name: "invalid_request" },
        assign_routing: true,
      },
    };
    const opts = buildVisualOptions("trace", "pkt", fx, { [fx.id]: fx });
    expect(opts.panels.length).toBe(0); // no byte panels — cards are pure data
    expect(opts.trace!.cards.map((c) => c.type)).toEqual(["AuthorizationRequest", "AuthorizationCode", "TokenExchange", "ResourceCall"]);
    expect(opts.trace!.participants).toEqual(["client", "authz-server", "resource"]);
    expect(opts.trace!.alert).toEqual({ name: "invalid_request" });
    expect(opts.trace!.assign_routing).toBe(true);
    // the host runs the real sim over the assembled order
    const h = new VisualHost(opts);
    h.appendTraceCard(0); h.appendTraceCard(1); h.appendTraceCard(2); h.appendTraceCard(3);
    expect(h.traceProbe()!.reachedEndState).toBe(true);
  });

  test("a MAP seed fixture builds zones + items + slider", () => {
    const fx: PacketFixture = {
      id: "shared-resp",
      map: {
        zones: ["you", "provider"],
        slider: { options: ["IaaS", "SaaS"] },
        items: [{ id: "encrypt-rest", label: "Encrypt at rest", keyZone: "you", keyByModel: { IaaS: "you", SaaS: "provider" }, keyRef: "AWS SR matrix" }],
      },
    };
    const opts = buildVisualOptions("map", "pkt", fx, { [fx.id]: fx });
    expect(opts.map!.zones).toEqual(["you", "provider"]);
    expect(opts.map!.slider!.options).toEqual(["IaaS", "SaaS"]);
    const h = new VisualHost(opts);
    expect(h.mapSlider()).toBe("IaaS"); // first option when no initial
    expect(h.keyZoneFor("encrypt-rest")).toBe("you");
  });

  test("build-and-break reuses the frame-card TRACE path", () => {
    const opts = buildVisualOptions("build-and-break", "pkt", handshake, set);
    expect(opts.trace!.cards.length).toBe(3);
    expect(opts.panels.length).toBe(3);
  });
});

describe("VisualSurface render contract — the data-testid + ARIA seam module agents drive", () => {
  test("TRACE surface emits participants, the roving listbox, cards with aria-grabbed, and the sim panel", () => {
    const h = traceHost();
    h.appendTraceCard(0); // one placed card so the order listbox + a pool card both render
    const html = renderSurface(h, "trace");
    expect(html).toContain('data-testid="visual-trace"');
    expect(html).toContain('data-testid="visual-trace-participant-client"');
    expect(html).toContain('data-testid="visual-trace-participant-server"');
    expect(html).toContain('data-testid="visual-trace-order"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('data-testid="visual-trace-card-0"');
    expect(html).toContain('aria-grabbed="false"'); // the placed card is not grabbed at rest
    expect(html).toContain('data-testid="visual-trace-pool"');
    expect(html).toContain('data-testid="visual-trace-pool-card-1"'); // SYN+ACK still in the pool
    expect(html).toContain('data-testid="visual-trace-sim"');
    expect(html).toContain('data-card-type="SYN"');
  });

  test("TRACE assign_routing surface renders per-card from/to routing selects", () => {
    const opts = buildVisualOptions("trace", "pkt", handshake, set);
    opts.trace!.assign_routing = true;
    const h = new VisualHost(opts);
    h.appendTraceCard(0);
    const html = renderSurface(h, "trace");
    expect(html).toContain('data-testid="visual-trace-route-from-0"');
    expect(html).toContain('data-testid="visual-trace-route-to-0"');
  });

  test("TRACE surface shows the real end-state on the canonical order and the real alert otherwise", () => {
    const h = traceHost();
    h.appendTraceCard(0); h.appendTraceCard(1); h.appendTraceCard(2);
    expect(renderSurface(h, "trace")).toContain('data-testid="visual-trace-endstate"');
    h.resetTrace();
    h.appendTraceCard(0); h.appendTraceCard(2); // wrong order
    expect(renderSurface(h, "trace")).toContain('data-testid="visual-trace-alert"');
  });

  test("MAP surface emits the slider, item listbox, labeled drop-zones, and THROUGHOUT marker", () => {
    const h = new VisualHost({
      mode: "map",
      oracle: "pkt",
      panels: [],
      map: {
        zones: ["you", "provider"],
        slider: { options: ["IaaS", "PaaS", "SaaS"] },
        items: [
          { id: "patch-os", label: "Patch the OS", keyZone: "you", keyByModel: { IaaS: "you", SaaS: "provider" } },
          { id: "logging", label: "Logging", keyZone: "you", keyZones: ["you", "provider"] },
        ],
      },
    });
    h.toggleZone("logging", "you"); // place the THROUGHOUT card into one zone so it renders placed
    const html = renderSurface(h, "map");
    expect(html).toContain('data-testid="visual-map"');
    expect(html).toContain('data-testid="visual-map-slider"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('data-testid="visual-map-slider-IaaS"');
    expect(html).toContain('data-testid="visual-map-items"');
    expect(html).toContain('data-testid="visual-map-item-patch-os"');
    expect(html).toContain('data-throughout="true"'); // the logging card is THROUGHOUT
    expect(html).toContain('data-testid="visual-map-zone-you"');
    expect(html).toContain('data-testid="visual-map-zone-provider"');
    expect(html).toContain('aria-dropeffect="move"');
    expect(html).toContain('data-testid="visual-map-placed-logging-you"');
  });

  test("MAP surface with no slider omits the slider group (single-board MAP)", () => {
    const h = new VisualHost({ mode: "map", oracle: "pkt", panels: [], map: { zones: ["a"], items: [{ id: "x", label: "X", keyZone: "a" }] } });
    const html = renderSurface(h, "map");
    expect(html).not.toContain('data-testid="visual-map-slider"');
    expect(html).toContain('data-testid="visual-map-zone-a"');
  });

  test("PEEL surface still renders its tree (the proven canary path is unchanged)", () => {
    const h = new VisualHost({ mode: "peel", oracle: "pkt", panels: [{ id: "frame", label: "ClientHello", hex: clientHelloHex, linkType: "ethernet" }] });
    const html = renderSurface(h, "peel");
    expect(html).toContain('data-testid="visual-surface"');
    expect(html).toContain('data-testid="visual-tree"');
    expect(html).toContain('role="tree"');
  });
});
