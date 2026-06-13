/**
 * packet-dissector fidelity gate (Wave-4 honesty doctrine; root ISA ISC-53 analogue for the
 * visual engine). The parse tree over REAL captured bytes IS the oracle — this suite asserts
 * the dissector's field values equal the RFC-true, tshark-confirmed values recorded in
 * .ci/fixtures/assets/net/*.json. If the dissector ever drifts from reality (or someone edits
 * the fixtures), CI fails. There is no authored answer key: every assertion's right-hand side
 * was cross-checked against `tshark` 4.x's decode of the same frame at capture time.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { dissectHex, dissect, hexToBytes, decodeTcpFlags } from "../src/engines/visual/pkt";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/net");
const clientHello = JSON.parse(readFileSync(join(ASSETS, "google-search-clienthello.json"), "utf8"));
const handshake = JSON.parse(readFileSync(join(ASSETS, "google-search-tcp-handshake.json"), "utf8"));
const diff = JSON.parse(readFileSync(join(ASSETS, "diff-the-trace.json"), "utf8"));

describe("packet-dissector fidelity — real bytes vs RFC/tshark ground truth", () => {
  const probe = dissectHex(clientHello.hex, { linkType: "ethernet" });

  test("the captured frame is the real google.com ClientHello (Ethernet → IPv4 → TCP → TLS)", () => {
    // L2 — Ethernet EtherType selects IPv4 (IANA EtherTypes)
    expect(probe.region("eth.ethertype")!.value).toBe("0x0800 = IPv4");
    expect(probe.regionAt({ start: 12, end: 14 })!.id).toBe("eth.ethertype");

    // L3 — IPv4 version/IHL/protocol/addresses (RFC 791 + IANA Protocol Numbers)
    expect(probe.region("ipv4.version")!.value).toBe("version 4, IHL 5 (20-byte header)");
    expect(probe.region("ipv4.total_length")!.value).toBe("569 bytes");
    expect(probe.region("ipv4.protocol")!.value).toBe("0x06 = 6 = TCP");
    expect(probe.regionAt({ start: 23, end: 24 })!.id).toBe("ipv4.protocol");
    expect(probe.region("ipv4.src")!.value).toBe("192.168.215.3");
    expect(probe.region("ipv4.dst")!.value).toBe("142.251.152.119");

    // L4 — TCP ports + 32-byte header (RFC 9293)
    expect(probe.region("tcp.src_port")!.value).toBe("55888");
    expect(probe.region("tcp.dst_port")!.value).toBe("443");
    expect(probe.region("tcp")!.end - probe.region("tcp")!.start).toBe(32);

    // L6 — TLS record header (RFC 8446 §5.1): handshake ContentType, length 512
    expect(probe.region("tls.content_type")!.value).toBe("0x16 = 22 = handshake");
    expect(probe.region("tls.version")!.value).toBe("0x0301");
    expect(probe.region("tls.length")!.value).toBe("512 bytes");
  });

  test("dissector output equals the committed rfc_field_truth (the fixture cannot silently drift)", () => {
    const t = clientHello.rfc_field_truth;
    expect(probe.region("eth.ethertype")!.value).toContain(t["ethernet.ethertype"].value);
    expect(probe.region("ipv4.protocol")!.value).toContain(t["ipv4.protocol"].value === 6 ? "6" : "");
    expect(probe.region("ipv4.src")!.value).toBe(t["ipv4.src"].value);
    expect(probe.region("ipv4.dst")!.value).toBe(t["ipv4.dst"].value);
    expect(probe.region("tcp.dst_port")!.value).toBe(String(t["tcp.dst_port"].value));
    expect(probe.region("tls.length")!.value).toBe(`${t["tls.record.length"].value} bytes`);
  });

  test("the TCP 3-way handshake flag bytes decode to the RFC 9293 states", () => {
    const expectFlags: Record<number, string> = {};
    for (const f of handshake.frames) {
      const p = dissectHex(f.hex, { linkType: "ethernet" });
      const flagsRegion = p.region("tcp.flags")!;
      // the hex flags byte is unambiguous ground truth (tshark: 0x02 / 0x12 / 0x10)
      expect(flagsRegion.value.startsWith(f.flags_byte)).toBe(true);
      // and the decoded flag SET equals the captured truth (order-independent)
      const got = new Set(flagsRegion.value.split("=")[1].trim().split("+"));
      for (const name of f.flags) expect(got.has(name)).toBe(true);
      expect(got.size).toBe(f.flags.length);
      expectFlags[f.seq] = f.flags_byte;
    }
    expect(expectFlags).toEqual({ 0: "0x02", 1: "0x12", 2: "0x10" });
  });

  test("decodeTcpFlags is a pure RFC 9293 §3.1 bit decode", () => {
    expect(new Set(decodeTcpFlags(0x12).split("+"))).toEqual(new Set(["SYN", "ACK"]));
    expect(decodeTcpFlags(0x02)).toBe("SYN");
    expect(decodeTcpFlags(0x10)).toBe("ACK");
    expect(decodeTcpFlags(0x04)).toBe("RST");
    expect(decodeTcpFlags(0x00)).toBe("(none)");
    expect(decodeTcpFlags(0x18).split("+").sort()).toEqual(["ACK", "PSH"]);
  });

  test("Diff-the-Trace legs decode to their real divergent fields", () => {
    // Pair A — port exposure: clean 443 vs broken 80
    const aClean = dissectHex(clientHello.hex, { linkType: "ethernet" });
    const aBroken = dissectHex(diff.pairs[0].broken.hex, { linkType: "ethernet" });
    expect(aClean.region("tcp.dst_port")!.value).toBe("443");
    expect(aBroken.region("tcp.dst_port")!.value).toBe("80");

    // Pair B — encryption in transit: clean TLS record vs broken cleartext start-line
    const bBroken = dissectHex(diff.pairs[1].broken.hex, { linkType: "ethernet" });
    expect(aClean.region("tls.content_type")).not.toBeNull();
    expect(bBroken.region("tls")).toBeNull(); // no TLS record — it's cleartext HTTP
    expect(bBroken.region("tcp.payload")!.label).toContain("cleartext");

    // Pair C — L2 trust: clean ARP request (opcode 1) vs broken ARP reply (opcode 2)
    const cClean = dissectHex(diff.pairs[2].clean.hex, { linkType: "ethernet" });
    const cBroken = dissectHex(diff.pairs[2].broken.hex, { linkType: "ethernet" });
    expect(cClean.region("arp.opcode")!.value).toBe("1 = request");
    expect(cBroken.region("arp.opcode")!.value).toBe("2 = reply");
  });

  test("the SLL2 (-i any cooked) link-type path is honest about its own L2", () => {
    // a real SLL2-framed ClientHello from the -i any capture (cap.pcap frame 8)
    const sll =
      "080000000000000500010406de25bda16a60000045000239212140004006537fc0a8d7038efb9d77d57001bbf57468b8bcf6100c8018003fc64a00000101080aa1e9560555d232a21603010200010001fc";
    const p = dissect(hexToBytes(sll), { linkType: "sll2" });
    expect(p.region("sll2.proto")!.value).toBe("0x0800 = IPv4");
    expect(p.region("ipv4.protocol")!.value).toBe("0x06 = 6 = TCP");
    expect(p.region("tcp.dst_port")!.value).toBe("443");
    expect(p.region("tls.content_type")!.value).toBe("0x16 = 22 = handshake");
  });

  test("dissector is total: degraded/truncated frames record a payload region, never throw", () => {
    // an Ethernet+IPv4 header with no transport bytes — descent stops, payload recorded
    const truncated = clientHello.hex.slice(0, (14 + 20) * 2);
    const p = dissectHex(truncated, { linkType: "ethernet" });
    expect(p.region("ipv4")).not.toBeNull();
    expect(p.region("tcp")).toBeNull();
    // an empty buffer is the one hard error (no frame at all)
    expect(() => dissectHex("")).toThrow();
  });
});
