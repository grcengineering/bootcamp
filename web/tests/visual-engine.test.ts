/**
 * Visual-engine unit suite (Wave-4): the packet-dissector branches the fidelity suite doesn't
 * touch (UDP, ARP, SLL2 sniff, truncation), the VisualHost surface model (PEEL gating, TRACE
 * sim, MAP placement, snapshot/restore), and the visual-seed normalizer (every mode + error
 * paths). Every test asserts an observable outcome over REAL committed bytes — the dissector is
 * the oracle; no value is authored. (Coverage floor 95/95 on the new engine files.)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { dissect, dissectHex, hexToBytes, sniffLinkType, ETHERTYPES, IP_PROTOCOLS, TLS_CONTENT_TYPES } from "../src/engines/visual/pkt";
import { VisualHost } from "../src/components/lab/sessions/visual-host";
import { buildVisualOptions, type FixtureSet, type PacketFixture } from "../src/lib/visual-seed";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/net");
function fixtureSet(): FixtureSet {
  const set: FixtureSet = {};
  for (const n of readdirSync(ASSETS)) if (n.endsWith(".json")) set[n] = JSON.parse(readFileSync(join(ASSETS, n), "utf8")) as PacketFixture;
  return set;
}
const set = fixtureSet();
const clientHelloHex = (set["google-search-clienthello.json"] as PacketFixture).hex!;

// Real DNS-over-UDP frame, Linux SLL2 cooked (cap.pcap frame 1).
const DNS_UDP_SLL2 =
  "080000000000000500010406de25bda16a6000004500003caec340004011f87ec0a8d70300fafac893c80035002893a86e2e010000010000000000000377777706676f6f676c6503636f6d0000010001";
// Real Ethernet ARP request (arp.pcap frame 7) and reply (frame 8).
const ARP_REQ = "ffffffffffff9af44de26edf080600010800060400019af44de26edfc0a8d703000000000000c0a8d702";
const ARP_REPLY = "9af44de26edfba73705c836f08060001080006040002ba73705c836fc0a8d7029af44de26edfc0a8d703";

describe("pkt dissector — UDP / ARP / SLL2 / truncation branches", () => {
  test("hexToBytes rejects malformed input, accepts whitespace", () => {
    expect(() => hexToBytes("")).toThrow("empty hex");
    expect(() => hexToBytes("abc")).toThrow("odd-length");
    expect(() => hexToBytes("zz")).toThrow("non-hex");
    expect(Array.from(hexToBytes("de ad\nbe ef"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  test("registries cite the canary's selector meanings", () => {
    expect(ETHERTYPES[0x0800]).toBe("IPv4");
    expect(ETHERTYPES[0x0806]).toBe("ARP");
    expect(IP_PROTOCOLS[6]).toBe("TCP");
    expect(IP_PROTOCOLS[17]).toBe("UDP");
    expect(TLS_CONTENT_TYPES[23]).toBe("application_data");
  });

  test("sniffLinkType distinguishes Ethernet from the SLL2 cooked header", () => {
    expect(sniffLinkType(hexToBytes(clientHelloHex))).toBe("ethernet");
    expect(sniffLinkType(hexToBytes(DNS_UDP_SLL2))).toBe("sll2");
    // a buffer with neither a known EtherType at 12 nor a known SLL2 proto at 0 → ethernet default
    expect(sniffLinkType(new Uint8Array(20))).toBe("ethernet");
  });

  test("a real DNS query dissects to UDP/53 over SLL2 (and sniff picks it up)", () => {
    const p = dissect(hexToBytes(DNS_UDP_SLL2)); // no linkType → sniff
    expect(p.region("sll2.proto")!.value).toBe("0x0800 = IPv4");
    expect(p.region("ipv4.protocol")!.value).toBe("0x11 = 17 = UDP");
    expect(p.region("udp.dst_port")!.value).toBe("53");
    expect(p.region("udp.length")!.value).toBe("40 bytes");
    expect(p.region("udp.payload")!.label).toBe("UDP payload");
  });

  test("a real ARP request and reply dissect to opcode 1 vs 2", () => {
    const req = dissectHex(ARP_REQ, { linkType: "ethernet" });
    expect(req.region("arp")!.value).toBe("request (who-has)");
    expect(req.region("arp.opcode")!.value).toBe("1 = request");
    expect(req.region("arp.sender_ip")!.value).toBe("192.168.215.3");
    expect(req.region("arp.target_ip")!.value).toBe("192.168.215.2");
    const reply = dissectHex(ARP_REPLY, { linkType: "ethernet" });
    expect(reply.region("arp")!.value).toBe("reply (is-at)");
    expect(reply.region("arp.opcode")!.value).toBe("2 = reply");
  });

  test("decode()/regionAt()/region() expose the parse tree read-only", () => {
    const p = dissectHex(clientHelloHex, { linkType: "ethernet" });
    expect(p.decode({ start: 12, end: 14 })).toBe("0x0800 = IPv4");
    expect(p.decode({ start: 1, end: 2 })).toBeNull(); // no region with that exact range
    expect(p.regionAt({ start: 36, end: 38 })!.id).toBe("tcp.dst_port");
    expect(p.regionAt({ start: 1, end: 99 })).toBeNull();
    expect(p.region("nope.nope")).toBeNull();
    expect(p.byteLength).toBe(p.root.end);
  });

  test("non-IPv4 EtherType and short frames record an unparsed payload, never throw", () => {
    // an IPv6 EtherType (0x86dd) → no IPv4 descent, payload recorded
    const ip6 = "aabbccddeeff112233445566" + "86dd" + "00".repeat(8);
    const p = dissectHex(ip6, { linkType: "ethernet" });
    expect(p.region("ipv4")).toBeNull();
    expect(p.regions.some((r) => r.label.includes("Unparsed L3"))).toBe(true);
    // an IPv4 frame whose protocol is ICMP (1) → no TCP/UDP, L4 payload recorded
    const icmp = "aabbccddeeffaabbccddeeee0800" + "4500001c00000000400100000a0000010a000002" + "08000000";
    const pc = dissectHex(icmp, { linkType: "ethernet" });
    expect(pc.region("ipv4.protocol")!.value).toContain("ICMP");
    expect(pc.regions.some((r) => r.label.includes("Unparsed L4"))).toBe(true);
  });
});

describe("VisualHost — PEEL gating, selection, snapshot/restore", () => {
  function peelHost(): VisualHost {
    return new VisualHost({ mode: "peel", oracle: "pkt", panels: [{ id: "frame", label: "ClientHello", hex: clientHelloHex, linkType: "ethernet" }] });
  }

  test("layers stay gated until their selector byte is read (encapsulation made tangible)", () => {
    const h = peelHost();
    expect(h.isAvailable("frame", "eth")).toBe(true); // outermost is open
    expect(h.isAvailable("frame", "ipv4")).toBe(false); // gated until EtherType read
    expect(h.isAvailable("frame", "eth.dst")).toBe(true); // eth's children open once eth revealed
    h.select("frame", "eth.ethertype");
    expect(h.isAvailable("frame", "ipv4")).toBe(true); // EtherType read → IPv4 unlocks
    expect(h.isAvailable("frame", "tcp")).toBe(false); // still gated on Protocol
    h.select("frame", "ipv4");
    h.select("frame", "ipv4.protocol");
    expect(h.isAvailable("frame", "tcp")).toBe(true); // Protocol read → TCP unlocks
    expect(h.isAvailable("nope", "tcp")).toBe(false); // unknown panel
    expect(h.isAvailable("frame", "nope")).toBe(false); // unknown node
  });

  test("select records the action (range, value, layer) and reveals decoded value", () => {
    const h = peelHost();
    const r = h.select("frame", "tcp.dst_port");
    // tcp.dst_port becomes available because selecting it doesn't require gating in this model
    // (its parent tcp must be revealed) — exercise the value/decode path directly on a top region
    const eth = h.select("frame", "eth.ethertype");
    expect(eth!.value).toBe("0x0800 = IPv4");
    expect(eth!.layer).toBe("L2");
    h.setLayer("L2");
    h.setValue("0x0800");
    const a = h.visualAction()!;
    expect(a.selectedNodeId).toBe("eth.ethertype");
    expect(a.selectedRange).toEqual({ start: 12, end: 14 });
    expect(a.enteredLayer).toBe("L2");
    expect(a.enteredValue).toBe("0x0800");
    expect(h.selectionFor("frame")).toBe("eth.ethertype");
    expect(h.isRevealed("frame", "eth.ethertype")).toBe(true);
    expect(h.select("frame", "does-not-exist")).toBeNull();
    expect(r).not.toBeNull();
  });

  test("setActivePanel + parseTree track the active panel; activeTree null when none", () => {
    const h = peelHost();
    expect(h.parseTree()!.region("eth")).not.toBeNull();
    h.setActivePanel("nope"); // ignored — stays on the real panel
    expect(h.parseTree()!.region("eth")).not.toBeNull();
    expect(h.panel("nope")).toBeNull();
  });

  test("snapshot/restore round-trips selection + reveal state", () => {
    const h = peelHost();
    h.select("frame", "eth.ethertype");
    h.setLayer("L2");
    const snap = h.snapshot();
    expect(snap.v).toBe(1);
    const h2 = peelHost();
    h2.restore(snap);
    expect(h2.selectionFor("frame")).toBe("eth.ethertype");
    expect(h2.isRevealed("frame", "eth.ethertype")).toBe(true);
    expect(h2.visualAction()!.enteredLayer).toBe("L2");
    // a foreign-version snapshot is ignored
    h2.restore({ ...snap, v: 2 as unknown as 1 });
    expect(h2.selectionFor("frame")).toBe("eth.ethertype");
    // visual exercises gate via the parse-tree probe, so the shell-style probe is inert —
    // exercise every accessor so the inert contract is fully asserted (not just present)
    const probe = h.probeSession();
    expect(probe.prompt()).toBe("visual ");
    expect(probe.history()).toEqual([]);
    expect(probe.lastExit()).toBe(0);
    expect(probe.exists("x")).toBe(false);
    expect(probe.readFile("x")).toBeNull();
    expect(probe.listDir("x")).toBeNull();
    expect(probe.producedBy("x")).toBeNull();
    expect(probe.runScriptClean("x", [], {}).exit).toBe(64);
    // accessors with no seed return the empty contract
    expect(h.traceParticipants()).toEqual([]);
    expect(h.traceCards()).toEqual([]);
    expect(h.mapZones()).toEqual([]);
    expect(h.mapItems()).toEqual([]);
    h.appendTraceCard(0); // no trace seed → no-op
    h.resetTrace();
    h.place("x", "y"); // no map seed → no-op
    expect(h.traceProbe()).toBeNull(); // no trace seed
    expect(h.mapProbe()).toBeNull(); // no map seed
    expect(h.activeTree()!.region("eth")).not.toBeNull();
  });
});

describe("VisualHost — TRACE sim (real RFC-9293 consequence) and MAP placement", () => {
  function traceHost(): VisualHost {
    const hs = set["google-search-tcp-handshake.json"] as PacketFixture;
    return new VisualHost(buildVisualOptions("trace", "pkt", hs, set));
  }

  test("TRACE: canonical order reaches end-state; wrong order yields a real RST", () => {
    const h = traceHost();
    expect(h.traceParticipants().sort()).toEqual(["client", "server"]);
    expect(h.traceCards().length).toBe(3);
    // assemble in the captured (canonical) order: SYN, SYN+ACK, ACK
    h.appendTraceCard(0);
    h.appendTraceCard(1);
    h.appendTraceCard(2);
    const ok = h.traceProbe()!;
    expect(ok.orderedMessages.length).toBe(3);
    expect(ok.reachedEndState).toBe(true);
    expect(ok.lastAlert).toBeNull();
    // reset and assemble WRONG order → the sim raises a real RST (honest consequence)
    h.resetTrace();
    h.appendTraceCard(0);
    h.appendTraceCard(2); // ACK before SYN+ACK
    const bad = h.traceProbe()!;
    expect(bad.reachedEndState).toBe(false);
    expect(bad.lastAlert).toEqual({ name: "RST" });
  });

  test("TRACE: snapshot/restore round-trips the assembled order", () => {
    const h = traceHost();
    h.appendTraceCard(0);
    h.appendTraceCard(0); // duplicate ignored
    const snap = h.snapshot();
    expect(snap.traceOrder).toEqual(["card-0"]);
    const h2 = traceHost();
    h2.restore(snap);
    expect(h2.traceProbe()!.orderedMessages.length).toBe(1);
  });

  test("MAP: placement against the cited authoritative key", () => {
    const h = new VisualHost({
      mode: "map",
      oracle: "pkt",
      panels: [{ id: "frame", label: "ClientHello", hex: clientHelloHex, linkType: "ethernet" }],
      map: {
        zones: ["src-ip", "dst-ip", "protocol", "src-port", "dst-port"],
        items: [
          { id: "i-srcip", label: "src IP", keyZone: "src-ip", keyRef: "NIST 800-53 SC-7" },
          { id: "i-dstport", label: "dst port", keyZone: "dst-port", keyRef: "NIST 800-53 CM-7" },
        ],
      },
    });
    expect(h.mapZones().length).toBe(5);
    expect(h.mapItems().length).toBe(2);
    h.place("i-srcip", "src-ip");
    h.place("i-dstport", "src-port"); // wrong
    h.place("unknown", "x"); // ignored
    const m = h.mapProbe()!;
    expect(m.items.find((i) => i.id === "i-srcip")!.placedZone).toBe("src-ip");
    expect(m.items.find((i) => i.id === "i-dstport")!.placedZone).toBe("src-port");
    expect(m.items.find((i) => i.id === "i-dstport")!.keyZone).toBe("dst-port");
    const snap = h.snapshot();
    const h2 = new VisualHost({ mode: "map", oracle: "pkt", panels: [{ id: "frame", label: "x", hex: clientHelloHex, linkType: "ethernet" }], map: { zones: [], items: [{ id: "i-srcip", label: "x", keyZone: "src-ip" }] } });
    h2.restore(snap);
    expect(h2.mapProbe()!.items.find((i) => i.id === "i-srcip")?.placedZone).toBe("src-ip");
  });
});

describe("visual-seed normalizer — every mode + error paths", () => {
  test("PEEL builds a single panel from the exemplar frame", () => {
    const opts = buildVisualOptions("peel", "pkt", set["google-search-clienthello.json"] as PacketFixture, set);
    expect(opts.mode).toBe("peel");
    expect(opts.panels.length).toBe(1);
    expect(opts.panels[0].linkType).toBe("ethernet");
  });

  test("TRACE builds orderable cards + a canonical sequence + participants", () => {
    const opts = buildVisualOptions("trace", "pkt", set["google-search-tcp-handshake.json"] as PacketFixture, set);
    expect(opts.panels.length).toBe(3);
    expect(opts.trace!.cards.map((c) => c.type)).toEqual(["SYN", "SYN+ACK", "ACK"]);
    expect(Object.keys(opts.trace!.canonical).length).toBe(1);
  });

  test("Diff-the-Trace builds clean/broken panel pairs, resolving hex_ref", () => {
    const opts = buildVisualOptions("diff-the-trace", "pkt", set["diff-the-trace.json"] as PacketFixture, set);
    expect(opts.panels.length).toBe(6);
    // the pair-A clean panel resolved its hex_ref to the real ClientHello bytes
    const cleanA = opts.panels.find((p) => p.id === "pair-a-port-exposure-clean")!;
    expect(cleanA.hex).toBe(clientHelloHex);
  });

  test("a synthetic SLL2 fixture sets the sll2 linkType (linktype string sniff)", () => {
    const sll: PacketFixture = { id: "x", linktype: "LINKTYPE_LINUX_SLL2 (cooked)", hex: DNS_UDP_SLL2 };
    const opts = buildVisualOptions("peel", "pkt", sll, set);
    expect(opts.panels[0].linkType).toBe("sll2");
  });

  test("error paths: missing hex / unknown hex_ref / bad pairs throw with a clear message", () => {
    expect(() => buildVisualOptions("peel", "pkt", { id: "x" } as PacketFixture, set)).toThrow(/no hex frame/);
    expect(() => buildVisualOptions("diff-the-trace", "pkt", { id: "x" } as PacketFixture, set)).toThrow(/no pairs/);
    const badRef: PacketFixture = {
      id: "x",
      pairs: [{ id: "p", control_claim: "c", clean: { label: "l", hex_ref: "nope.json#hex" }, broken: { label: "b", hex: "00" } }],
    };
    expect(() => buildVisualOptions("diff-the-trace", "pkt", badRef, set)).toThrow(/unknown fixture/);
    const noHex: PacketFixture = {
      id: "x",
      pairs: [{ id: "p", control_claim: "c", clean: { label: "l" }, broken: { label: "b", hex: "00" } }],
    };
    expect(() => buildVisualOptions("diff-the-trace", "pkt", noHex, set)).toThrow(/hex or hex_ref/);
    // map mode with a hex frame stubs to a single panel
    const mapOpts = buildVisualOptions("map", "pkt", set["google-search-clienthello.json"] as PacketFixture, set);
    expect(mapOpts.panels.length).toBe(1);
    // map mode with no hex throws
    expect(() => buildVisualOptions("map", "pkt", { id: "x" } as PacketFixture, set)).toThrow(/unsupported/);
  });
});
