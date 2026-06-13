/**
 * packet-dissector (engine id: `pkt`) — the networking module's oracle.
 *
 * Pure, DOM-free TypeScript: parses REAL captured frame bytes into a nested parse tree
 * (a ParseTreeProbe). It covers the encapsulation stack the canary teaches —
 * Ethernet (and the Linux "any"/SLL2 cooked link-type) → IPv4 → TCP/UDP (and ARP) →
 * the TLS record header — by reading each field at its RFC-fixed byte offset. The parse
 * tree IS the oracle: every region boundary and decoded value the PEEL surface shows is
 * computed from the real bytes, never authored.
 *
 * Honesty doctrine: the dissector is fidelity-checked against tshark's decode of the same
 * frames (web/tests/pkt-fidelity.test.ts) — field values equal the RFC-true values that
 * .ci/fixtures/assets/net/*.json record off real captures. Field meanings cite:
 *   RFC 791 (IPv4), RFC 9293 (TCP), RFC 768 (UDP), RFC 826 (ARP), RFC 8446 §5.1 (TLS
 *   record), IEEE 802.3 (Ethernet), IANA EtherTypes + Protocol Numbers.
 */

/** Inclusive-exclusive byte range [start, end). */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * One region of the parse tree — a labeled byte-range with the oracle's decoded value and
 * the OSI/layer tag the learner is asked to confirm. Regions nest via `children`.
 */
export interface ParseRegion {
  /** Stable id (e.g. "ipv4.protocol") — the {node_id} a verifier may target. */
  id: string;
  start: number;
  end: number;
  /** Human field name ("Protocol", "EtherType", "ContentType"). */
  label: string;
  /** OSI/teaching layer tag ("L2","L3","L4","L6","L7") or a structural tag. */
  layer?: string;
  /** The oracle's real decoded value (string form — what the learner reads). */
  value: string;
  /** RFC citation for the field meaning. */
  rfc?: string;
  /**
   * Gated child layers: a child stays collapsed until the learner reads this region's
   * selector byte (EtherType → IPv4, Protocol → TCP). `gates` names the child id this
   * region unlocks; the surface keeps that child collapsed until this region is selected.
   */
  gates?: string;
  children: ParseRegion[];
}

/**
 * The read-only probe the closed verifier registry interrogates for PEEL/Diff tasks.
 * Mirrors the wave-2 probe pattern (structural, engine-owned): verifiers see only this
 * surface, never the raw buffer or parser internals.
 */
export interface ParseTreeProbe {
  /** Flattened region list (every node, depth-first) for region/field lookups. */
  regions: ParseRegion[];
  /** The single root region (the whole frame). */
  root: ParseRegion;
  /** Total frame length in bytes. */
  byteLength: number;
  /** Look up a region by id (null if absent). */
  region(id: string): ParseRegion | null;
  /** The oracle's decoded value for an exact byte-range, or null if no region matches it. */
  decode(range: ByteRange): string | null;
  /** The region whose boundary exactly equals a byte-range, or null. */
  regionAt(range: ByteRange): ParseRegion | null;
}

// ----------------------------------------------------------------------------
// byte helpers
// ----------------------------------------------------------------------------

/** Parse a contiguous hex string (no separators) into bytes. Throws on malformed input. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length === 0) throw new Error("empty hex");
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex (${clean.length})`);
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error("non-hex characters in input");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function hex2(b: number): string {
  return "0x" + b.toString(16).padStart(2, "0");
}

function u16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function macStr(b: Uint8Array, o: number): string {
  return Array.from(b.slice(o, o + 6), (x) => x.toString(16).padStart(2, "0")).join(":");
}

function ipv4Str(b: Uint8Array, o: number): string {
  return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
}

// ----------------------------------------------------------------------------
// IANA / RFC registries (the cited meanings — closed, small, sufficient for the canary)
// ----------------------------------------------------------------------------

/** IANA EtherTypes (the few the canary touches). */
export const ETHERTYPES: Record<number, string> = {
  0x0800: "IPv4",
  0x0806: "ARP",
  0x86dd: "IPv6",
};

/** IANA IP Protocol Numbers (the few the canary touches). */
export const IP_PROTOCOLS: Record<number, string> = {
  1: "ICMP",
  6: "TCP",
  17: "UDP",
};

/** RFC 8446 §5.1 TLS record ContentType. */
export const TLS_CONTENT_TYPES: Record<number, string> = {
  20: "change_cipher_spec",
  21: "alert",
  22: "handshake",
  23: "application_data",
  24: "heartbeat",
};

/** TCP flag bits, high-to-low (RFC 9293 §3.1; CWR/ECE are the high two of the byte). */
const TCP_FLAG_BITS: Array<[number, string]> = [
  [0x80, "CWR"],
  [0x40, "ECE"],
  [0x20, "URG"],
  [0x10, "ACK"],
  [0x08, "PSH"],
  [0x04, "RST"],
  [0x02, "SYN"],
  [0x01, "FIN"],
];

/** Decode a TCP flags byte into the set names (e.g. 0x12 → "SYN+ACK"). RFC 9293 §3.1. */
export function decodeTcpFlags(flagsByte: number): string {
  const names = TCP_FLAG_BITS.filter(([bit]) => (flagsByte & bit) !== 0).map(([, name]) => name);
  return names.length ? names.join("+") : "(none)";
}

// ----------------------------------------------------------------------------
// link-layer detection
// ----------------------------------------------------------------------------

export type LinkType = "ethernet" | "sll2";

/**
 * Heuristic link-layer pick for an isolated frame buffer (the fixtures carry their own
 * declared linktype; this is the fallback when only bytes are handed in). A true Ethernet
 * II frame has its EtherType (offset 12-13) in the known set; the Linux SLL2 cooked header
 * (from `tcpdump -i any`) leads with a 2-byte protocol type at offset 0 and is 20 bytes.
 */
export function sniffLinkType(b: Uint8Array): LinkType {
  if (b.length >= 14 && ETHERTYPES[u16(b, 12)] !== undefined) return "ethernet";
  if (b.length >= 20 && ETHERTYPES[u16(b, 0)] !== undefined) return "sll2";
  return "ethernet";
}

// ----------------------------------------------------------------------------
// the dissector
// ----------------------------------------------------------------------------

export interface DissectOptions {
  /** Force a link type (the fixtures declare theirs); default sniffs. */
  linkType?: LinkType;
}

/**
 * Parse one real frame's bytes into a ParseTreeProbe. Total function: an unparseable layer
 * stops descent and is recorded as a `payload` region rather than throwing (a forensic tool
 * never hides bytes). Throws only on an empty buffer (no frame at all).
 */
export function dissect(bytes: Uint8Array, opts: DissectOptions = {}): ParseTreeProbe {
  if (bytes.length === 0) throw new Error("empty frame");
  const link = opts.linkType ?? sniffLinkType(bytes);

  const root: ParseRegion = {
    id: "frame",
    start: 0,
    end: bytes.length,
    label: "Frame",
    layer: "frame",
    value: `${bytes.length} bytes`,
    children: [],
  };

  // ---- L2: link layer ------------------------------------------------------
  let l3Start: number;
  let etherType: number;
  if (link === "ethernet") {
    etherType = u16(bytes, 12);
    const eth: ParseRegion = {
      id: "eth",
      start: 0,
      end: 14,
      label: "Ethernet II",
      layer: "L2",
      value: `dst ${macStr(bytes, 0)} ← src ${macStr(bytes, 6)}`,
      rfc: "IEEE 802.3",
      children: [
        { id: "eth.dst", start: 0, end: 6, label: "Destination MAC", layer: "L2", value: macStr(bytes, 0), rfc: "IEEE 802.3", children: [] },
        { id: "eth.src", start: 6, end: 12, label: "Source MAC", layer: "L2", value: macStr(bytes, 6), rfc: "IEEE 802.3", children: [] },
        {
          id: "eth.ethertype",
          start: 12,
          end: 14,
          label: "EtherType",
          layer: "L2",
          value: `${hex4(etherType)} = ${ETHERTYPES[etherType] ?? "unknown"}`,
          rfc: "IANA EtherTypes",
          gates: "ipv4",
          children: [],
        },
      ],
    };
    root.children.push(eth);
    l3Start = 14;
  } else {
    // Linux SLL2 cooked header (tcpdump -i any): 20 bytes, protocol type at offset 0-1.
    etherType = u16(bytes, 0);
    const sll: ParseRegion = {
      id: "sll2",
      start: 0,
      end: 20,
      label: "Linux SLL2 (cooked)",
      layer: "L2",
      value: `protocol ${hex4(etherType)} = ${ETHERTYPES[etherType] ?? "unknown"}`,
      rfc: "tcpdump LINKTYPE_LINUX_SLL2",
      children: [
        { id: "sll2.proto", start: 0, end: 2, label: "Protocol type", layer: "L2", value: `${hex4(etherType)} = ${ETHERTYPES[etherType] ?? "unknown"}`, rfc: "LINKTYPE_LINUX_SLL2", gates: "ipv4", children: [] },
      ],
    };
    root.children.push(sll);
    l3Start = 20;
  }

  // ---- L3: network layer ---------------------------------------------------
  if (etherType === 0x0806) {
    dissectArp(bytes, l3Start, root);
    return buildProbe(root, bytes.length);
  }
  if (etherType !== 0x0800 || bytes.length < l3Start + 20) {
    payload(root, l3Start, bytes.length, "Unparsed L3 payload");
    return buildProbe(root, bytes.length);
  }

  const ipStart = l3Start;
  const versionIhl = bytes[ipStart];
  const version = versionIhl >> 4;
  const ihl = versionIhl & 0x0f;
  const ipHeaderLen = ihl * 4;
  const totalLen = u16(bytes, ipStart + 2);
  const protocol = bytes[ipStart + 9];

  const ipv4: ParseRegion = {
    id: "ipv4",
    start: ipStart,
    end: ipStart + ipHeaderLen,
    label: "IPv4",
    layer: "L3",
    value: `${ipv4Str(bytes, ipStart + 12)} → ${ipv4Str(bytes, ipStart + 16)}`,
    rfc: "RFC 791",
    children: [
      { id: "ipv4.version", start: ipStart, end: ipStart + 1, label: "Version + IHL", layer: "L3", value: `version ${version}, IHL ${ihl} (${ipHeaderLen}-byte header)`, rfc: "RFC 791", children: [] },
      { id: "ipv4.total_length", start: ipStart + 2, end: ipStart + 4, label: "Total Length", layer: "L3", value: `${totalLen} bytes`, rfc: "RFC 791", children: [] },
      {
        id: "ipv4.protocol",
        start: ipStart + 9,
        end: ipStart + 10,
        label: "Protocol",
        layer: "L3",
        value: `${hex2(protocol)} = ${protocol} = ${IP_PROTOCOLS[protocol] ?? "unknown"}`,
        rfc: "RFC 791 + IANA Protocol Numbers",
        gates: protocol === 6 ? "tcp" : protocol === 17 ? "udp" : undefined,
        children: [],
      },
      { id: "ipv4.src", start: ipStart + 12, end: ipStart + 16, label: "Source Address", layer: "L3", value: ipv4Str(bytes, ipStart + 12), rfc: "RFC 791", children: [] },
      { id: "ipv4.dst", start: ipStart + 16, end: ipStart + 20, label: "Destination Address", layer: "L3", value: ipv4Str(bytes, ipStart + 16), rfc: "RFC 791", children: [] },
    ],
  };
  root.children.push(ipv4);

  // ---- L4: transport layer -------------------------------------------------
  const l4Start = ipStart + ipHeaderLen;
  if (protocol === 6 && bytes.length >= l4Start + 20) {
    dissectTcp(bytes, l4Start, ipv4);
  } else if (protocol === 17 && bytes.length >= l4Start + 8) {
    dissectUdp(bytes, l4Start, ipv4);
  } else {
    payload(ipv4, l4Start, Math.min(ipStart + totalLen, bytes.length), "Unparsed L4 payload");
  }

  return buildProbe(root, bytes.length);
}

function hex4(n: number): string {
  return "0x" + n.toString(16).padStart(4, "0");
}

function dissectTcp(bytes: Uint8Array, o: number, parent: ParseRegion): void {
  const srcPort = u16(bytes, o);
  const dstPort = u16(bytes, o + 2);
  const dataOffsetWords = bytes[o + 12] >> 4;
  const tcpHeaderLen = dataOffsetWords * 4;
  const flagsByte = bytes[o + 13];
  const seq = (bytes[o + 4] * 0x1000000) + (bytes[o + 5] << 16) + (bytes[o + 6] << 8) + bytes[o + 7];

  const tcp: ParseRegion = {
    id: "tcp",
    start: o,
    end: o + tcpHeaderLen,
    label: "TCP",
    layer: "L4",
    value: `${srcPort} → ${dstPort}`,
    rfc: "RFC 9293",
    children: [
      { id: "tcp.src_port", start: o, end: o + 2, label: "Source Port", layer: "L4", value: String(srcPort), rfc: "RFC 9293", children: [] },
      { id: "tcp.dst_port", start: o + 2, end: o + 4, label: "Destination Port", layer: "L4", value: String(dstPort), rfc: "RFC 9293 + IANA Service Names", children: [] },
      { id: "tcp.seq", start: o + 4, end: o + 8, label: "Sequence Number", layer: "L4", value: String(seq >>> 0), rfc: "RFC 9293", children: [] },
      {
        id: "tcp.flags",
        start: o + 13,
        end: o + 14,
        label: "Flags",
        layer: "L4",
        value: `${hex2(flagsByte)} = ${decodeTcpFlags(flagsByte)}`,
        rfc: "RFC 9293 §3.1",
        children: [],
      },
    ],
  };
  parent.children.push(tcp);

  // ---- L6: TLS record header (the first record in the segment, if present) -
  const tlsStart = o + tcpHeaderLen;
  if (bytes.length >= tlsStart + 5 && TLS_CONTENT_TYPES[bytes[tlsStart]] !== undefined && bytes[tlsStart + 1] === 0x03) {
    dissectTlsRecord(bytes, tlsStart, tcp);
  } else if (bytes.length > tlsStart) {
    // Real cleartext payload (e.g. an HTTP start-line) — surfaced honestly, not hidden.
    payload(tcp, tlsStart, bytes.length, "Application payload (cleartext)", "L7");
  }
}

function dissectUdp(bytes: Uint8Array, o: number, parent: ParseRegion): void {
  const srcPort = u16(bytes, o);
  const dstPort = u16(bytes, o + 2);
  const len = u16(bytes, o + 4);
  const udp: ParseRegion = {
    id: "udp",
    start: o,
    end: o + 8,
    label: "UDP",
    layer: "L4",
    value: `${srcPort} → ${dstPort}`,
    rfc: "RFC 768",
    children: [
      { id: "udp.src_port", start: o, end: o + 2, label: "Source Port", layer: "L4", value: String(srcPort), rfc: "RFC 768", children: [] },
      { id: "udp.dst_port", start: o + 2, end: o + 4, label: "Destination Port", layer: "L4", value: String(dstPort), rfc: "RFC 768 + IANA Service Names", children: [] },
      { id: "udp.length", start: o + 4, end: o + 6, label: "Length", layer: "L4", value: `${len} bytes`, rfc: "RFC 768", children: [] },
    ],
  };
  parent.children.push(udp);
  if (bytes.length > o + 8) payload(udp, o + 8, bytes.length, "UDP payload", "L7");
}

function dissectTlsRecord(bytes: Uint8Array, o: number, parent: ParseRegion): void {
  const contentType = bytes[o];
  const version = u16(bytes, o + 1);
  const length = u16(bytes, o + 3);
  const tls: ParseRegion = {
    id: "tls",
    start: o,
    end: o + 5,
    label: "TLS record header",
    layer: "L6",
    value: `${TLS_CONTENT_TYPES[contentType] ?? "unknown"} record`,
    rfc: "RFC 8446 §5.1",
    children: [
      {
        id: "tls.content_type",
        start: o,
        end: o + 1,
        label: "ContentType",
        layer: "L6",
        value: `${hex2(contentType)} = ${contentType} = ${TLS_CONTENT_TYPES[contentType] ?? "unknown"}`,
        rfc: "RFC 8446 §5.1",
        children: [],
      },
      { id: "tls.version", start: o + 1, end: o + 3, label: "Legacy record version", layer: "L6", value: hex4(version), rfc: "RFC 8446 §5.1", children: [] },
      { id: "tls.length", start: o + 3, end: o + 5, label: "Length", layer: "L6", value: `${length} bytes`, rfc: "RFC 8446 §5.1", children: [] },
    ],
  };
  parent.children.push(tls);
}

function dissectArp(bytes: Uint8Array, o: number, root: ParseRegion): void {
  const opcode = u16(bytes, o + 6);
  const arp: ParseRegion = {
    id: "arp",
    start: o,
    end: Math.min(o + 28, bytes.length),
    label: "ARP",
    layer: "L3",
    value: opcode === 1 ? "request (who-has)" : opcode === 2 ? "reply (is-at)" : `opcode ${opcode}`,
    rfc: "RFC 826",
    children: [
      {
        id: "arp.opcode",
        start: o + 6,
        end: o + 8,
        label: "Opcode",
        layer: "L3",
        value: `${opcode} = ${opcode === 1 ? "request" : opcode === 2 ? "reply" : "other"}`,
        rfc: "RFC 826",
        children: [],
      },
      { id: "arp.sender_mac", start: o + 8, end: o + 14, label: "Sender MAC", layer: "L3", value: macStr(bytes, o + 8), rfc: "RFC 826", children: [] },
      { id: "arp.sender_ip", start: o + 14, end: o + 18, label: "Sender IP", layer: "L3", value: ipv4Str(bytes, o + 14), rfc: "RFC 826", children: [] },
      { id: "arp.target_ip", start: o + 24, end: o + 28, label: "Target IP", layer: "L3", value: ipv4Str(bytes, o + 24), rfc: "RFC 826", children: [] },
    ],
  };
  root.children.push(arp);
}

function payload(parent: ParseRegion, start: number, end: number, label: string, layer = "payload"): void {
  if (end <= start) return;
  // First few bytes as a readable preview (ASCII where printable) — honest, not decoded.
  parent.children.push({
    id: `${parent.id}.payload`,
    start,
    end,
    label,
    layer,
    value: `${end - start} bytes`,
    children: [],
  });
}

// ----------------------------------------------------------------------------
// probe assembly
// ----------------------------------------------------------------------------

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map(regions.map((r) => [`${r.start}:${r.end}`, r]));
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}

/** Convenience: dissect straight from a committed hex fixture string. */
export function dissectHex(hex: string, opts: DissectOptions = {}): ParseTreeProbe {
  return dissect(hexToBytes(hex), opts);
}
