/**
 * dns-1035 (engine id: `dns`) — the how-the-internet-works module's DNS-message oracle.
 *
 * Pure, DOM-free TypeScript: parses REAL DNS wire bytes (RFC 1035 §4.1) into the SAME nested
 * ParseTreeProbe shape the packet-dissector produces, so the PEEL surface and the closed
 * verifier registry treat it identically to `pkt`. It reads each field at its RFC-fixed byte
 * offset: the 12-byte header (ID, the flags word bit-unpacked into QR/Opcode/AA/TC/RD/RA/
 * RCODE, and the four section counts QDCOUNT/ANCOUNT/NSCOUNT/ARCOUNT), the QNAME length-
 * prefixed label decoder (07 'example' 03 'com' 00 → example.com), QTYPE/QCLASS, and a
 * Resource-Record walker (NAME — including RFC 1035 §4.1.4 compression pointers — TYPE/CLASS/
 * TTL/RDLENGTH/RDATA, with A-record RDATA decoded to a dotted quad). The parse tree IS the
 * oracle: every region boundary and decoded value the surface shows is computed from the real
 * bytes, never authored.
 *
 * Honesty doctrine: the fixtures are REAL bytes — the 29-byte example.com A query is the
 * canonical RFC 1035 §4.1 message (built and verified locally; its decode matches `dig`'s
 * `;example.com. IN A` question), and the response is a live 61-byte answer captured off the
 * wire from 1.1.1.1 (two A records, name compression). The parser is fidelity-checked against
 * those committed values in web/tests/dns-protocol.test.ts. Field meanings cite RFC 1035 §4.1.1
 * (header), §4.1.2 (question), §4.1.3 (RR), §4.1.4 (compression), and the IANA DNS Parameters
 * registry (TYPE/CLASS/RCODE).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

// ----------------------------------------------------------------------------
// byte helpers (DNS is big-endian / network order, RFC 1035 §2.3.2)
// ----------------------------------------------------------------------------

function u16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function u32(b: Uint8Array, o: number): number {
  // unsigned 32-bit; TTL is a 31-bit value in practice but we read the full word
  return (b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]) >>> 0;
}

function hex4(n: number): string {
  return "0x" + n.toString(16).padStart(4, "0");
}

// ----------------------------------------------------------------------------
// IANA DNS Parameters (the few the module touches — closed, cited)
// ----------------------------------------------------------------------------

/** IANA DNS RR TYPEs (RFC 1035 §3.2.2 + IANA registry). */
export const DNS_TYPES: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  12: "PTR",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  257: "CAA",
};

/** IANA DNS CLASSes (RFC 1035 §3.2.4). */
export const DNS_CLASSES: Record<number, string> = {
  1: "IN",
  3: "CH",
  4: "HS",
};

/** DNS Opcodes (RFC 1035 §4.1.1). */
export const DNS_OPCODES: Record<number, string> = {
  0: "QUERY",
  1: "IQUERY",
  2: "STATUS",
};

/** DNS RCODEs (RFC 1035 §4.1.1 + IANA). */
export const DNS_RCODES: Record<number, string> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED",
};

// ----------------------------------------------------------------------------
// the flags word (RFC 1035 §4.1.1) — the bit layout the surface unpacks
// ----------------------------------------------------------------------------

export interface DnsFlags {
  qr: number;
  opcode: number;
  aa: number;
  tc: number;
  rd: number;
  ra: number;
  /** bit 6 of the flags word — DNSSEC AD ("authentic data") per RFC 4035. */
  ad: number;
  rcode: number;
}

/** Decode the 16-bit flags word at header offset 2 (RFC 1035 §4.1.1; AD per RFC 4035). */
export function decodeFlags(word: number): DnsFlags {
  return {
    qr: (word >> 15) & 0x1,
    opcode: (word >> 11) & 0xf,
    aa: (word >> 10) & 0x1,
    tc: (word >> 9) & 0x1,
    rd: (word >> 8) & 0x1,
    ra: (word >> 7) & 0x1,
    ad: (word >> 5) & 0x1,
    rcode: word & 0xf,
  };
}

function flagsSummary(f: DnsFlags): string {
  const set: string[] = [];
  if (f.qr) set.push("QR"); else set.push("query");
  if (f.aa) set.push("AA");
  if (f.tc) set.push("TC");
  if (f.rd) set.push("RD");
  if (f.ra) set.push("RA");
  if (f.ad) set.push("AD");
  return set.join(" ");
}

// ----------------------------------------------------------------------------
// QNAME / NAME decoder (RFC 1035 §3.1 labels + §4.1.4 compression pointers)
// ----------------------------------------------------------------------------

/** The result of walking a (possibly compressed) NAME: the dotted name + bytes consumed at `start`. */
export interface NameWalk {
  /** The decoded domain name ("example.com"; "." for the root). */
  name: string;
  /** Bytes consumed at the literal `start` offset (a pointer consumes 2, never the pointee). */
  consumed: number;
  /** True if the name terminated via a compression pointer (RFC 1035 §4.1.4). */
  compressed: boolean;
}

/**
 * Decode a length-prefixed label sequence starting at `start`. Follows §4.1.4 compression
 * pointers (top two bits 11 → 14-bit offset into the message). Total: a malformed/looping
 * name stops and returns what it decoded (a forensic parser never hangs or hides bytes).
 */
export function walkName(b: Uint8Array, start: number): NameWalk {
  const labels: string[] = [];
  let o = start;
  let consumed = 0;
  let compressed = false;
  let jumps = 0;
  let countingConsumed = true;
  // guard against pointer loops: a message can have at most b.length pointers
  while (o < b.length && jumps <= b.length) {
    const len = b[o];
    if (len === 0) {
      // root terminator: the single zero octet
      if (countingConsumed) consumed += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      // compression pointer (RFC 1035 §4.1.4): 2 bytes, 14-bit offset
      const ptr = ((len & 0x3f) << 8) | b[o + 1];
      if (countingConsumed) {
        consumed += 2;
        countingConsumed = false; // bytes past the first pointer are NOT consumed at `start`
      }
      compressed = true;
      o = ptr;
      jumps += 1;
      continue;
    }
    if ((len & 0xc0) !== 0) break; // reserved label type — stop (forensic honesty)
    const label = String.fromCharCode(...b.slice(o + 1, o + 1 + len));
    labels.push(label);
    o += 1 + len;
    if (countingConsumed) consumed += 1 + len;
  }
  return { name: labels.length ? labels.join(".") : ".", consumed, compressed };
}

// ----------------------------------------------------------------------------
// the parser
// ----------------------------------------------------------------------------

function region(id: string, start: number, end: number, label: string, value: string, rfc: string, children: ParseRegion[] = []): ParseRegion {
  return { id, start, end, label, layer: "dns", value, rfc, children };
}

/**
 * Parse one real DNS message's bytes into a ParseTreeProbe. Total function: a truncated/
 * malformed section stops descent and records what it parsed rather than throwing. Throws only
 * on a buffer too short to hold the 12-byte header (no message at all).
 */
export function parseDnsMessage(bytes: Uint8Array): ParseTreeProbe {
  if (bytes.length < 12) throw new Error("DNS message shorter than the 12-byte header");

  const id = u16(bytes, 0);
  const flagsWord = u16(bytes, 2);
  const flags = decodeFlags(flagsWord);
  const qd = u16(bytes, 4);
  const an = u16(bytes, 6);
  const ns = u16(bytes, 8);
  const ar = u16(bytes, 10);

  const root: ParseRegion = {
    id: "dns",
    start: 0,
    end: bytes.length,
    label: "DNS message",
    layer: "dns",
    value: `${flags.qr ? "response" : "query"} id ${hex4(id)} — ${qd}Q ${an}A ${ns}NS ${ar}AR`,
    rfc: "RFC 1035 §4.1",
    children: [],
  };

  // ---- header (RFC 1035 §4.1.1) --------------------------------------------
  const header: ParseRegion = region("dns.header", 0, 12, "Header", `id ${hex4(id)}, ${flagsSummary(flags)}, RCODE ${DNS_RCODES[flags.rcode] ?? flags.rcode}`, "RFC 1035 §4.1.1", [
    region("dns.id", 0, 2, "ID", hex4(id), "RFC 1035 §4.1.1"),
    region(
      "dns.flags",
      2,
      4,
      "Flags",
      `${hex4(flagsWord)} = QR ${flags.qr} · Opcode ${DNS_OPCODES[flags.opcode] ?? flags.opcode} · AA ${flags.aa} · TC ${flags.tc} · RD ${flags.rd} · RA ${flags.ra} · AD ${flags.ad} · RCODE ${DNS_RCODES[flags.rcode] ?? flags.rcode}`,
      "RFC 1035 §4.1.1 (AD: RFC 4035)",
    ),
    region("dns.qdcount", 4, 6, "QDCOUNT", String(qd), "RFC 1035 §4.1.1"),
    region("dns.ancount", 6, 8, "ANCOUNT", String(an), "RFC 1035 §4.1.1"),
    region("dns.nscount", 8, 10, "NSCOUNT", String(ns), "RFC 1035 §4.1.1"),
    region("dns.arcount", 10, 12, "ARCOUNT", String(ar), "RFC 1035 §4.1.1"),
  ]);
  root.children.push(header);

  let o = 12;

  // ---- question section (RFC 1035 §4.1.2) ----------------------------------
  for (let i = 0; i < qd && o + 5 <= bytes.length; i++) {
    const nameStart = o;
    const nw = walkName(bytes, o);
    const nameEnd = o + nw.consumed;
    if (nameEnd + 4 > bytes.length) break;
    const qtype = u16(bytes, nameEnd);
    const qclass = u16(bytes, nameEnd + 2);
    const qIdx = i === 0 ? "" : String(i);
    const question = region(`dns.question${qIdx}`, nameStart, nameEnd + 4, `Question${qIdx ? ` #${i + 1}` : ""}`, `${nw.name} ${DNS_CLASSES[qclass] ?? qclass} ${DNS_TYPES[qtype] ?? qtype}`, "RFC 1035 §4.1.2", [
      region(`dns.qname${qIdx}`, nameStart, nameEnd, "QNAME", nw.name, "RFC 1035 §3.1 (labels)"),
      region(`dns.qtype${qIdx}`, nameEnd, nameEnd + 2, "QTYPE", `${qtype} = ${DNS_TYPES[qtype] ?? "unknown"}`, "RFC 1035 §3.2.2"),
      region(`dns.qclass${qIdx}`, nameEnd + 2, nameEnd + 4, "QCLASS", `${qclass} = ${DNS_CLASSES[qclass] ?? "unknown"}`, "RFC 1035 §3.2.4"),
    ]);
    root.children.push(question);
    o = nameEnd + 4;
  }

  // ---- resource-record sections (RFC 1035 §4.1.3) --------------------------
  const sections: Array<[string, number]> = [["answer", an], ["authority", ns], ["additional", ar]];
  for (const [sectionName, count] of sections) {
    for (let i = 0; i < count; i++) {
      if (o + 1 > bytes.length) break;
      const rrStart = o;
      const nw = walkName(bytes, o);
      const afterName = o + nw.consumed;
      if (afterName + 10 > bytes.length) break;
      const type = u16(bytes, afterName);
      const klass = u16(bytes, afterName + 2);
      const ttl = u32(bytes, afterName + 4);
      const rdlength = u16(bytes, afterName + 8);
      const rdStart = afterName + 10;
      const rdEnd = rdStart + rdlength;
      if (rdEnd > bytes.length) break;
      const rdataValue = decodeRdata(bytes, rdStart, rdlength, type);
      const rrId = `dns.${sectionName}.${i}`;
      const rr = region(rrId, rrStart, rdEnd, `${sectionName[0].toUpperCase()}${sectionName.slice(1)} RR #${i + 1}`, `${nw.name} ${ttl} ${DNS_CLASSES[klass] ?? klass} ${DNS_TYPES[type] ?? type} ${rdataValue}`, "RFC 1035 §4.1.3", [
        region(`${rrId}.name`, rrStart, afterName, "NAME", nw.compressed ? `${nw.name} (compressed)` : nw.name, "RFC 1035 §4.1.4 (compression)"),
        region(`${rrId}.type`, afterName, afterName + 2, "TYPE", `${type} = ${DNS_TYPES[type] ?? "unknown"}`, "RFC 1035 §3.2.2"),
        region(`${rrId}.class`, afterName + 2, afterName + 4, "CLASS", `${klass} = ${DNS_CLASSES[klass] ?? "unknown"}`, "RFC 1035 §3.2.4"),
        region(`${rrId}.ttl`, afterName + 4, afterName + 8, "TTL", `${ttl} seconds`, "RFC 1035 §4.1.3"),
        region(`${rrId}.rdlength`, afterName + 8, afterName + 10, "RDLENGTH", `${rdlength} bytes`, "RFC 1035 §4.1.3"),
        region(`${rrId}.rdata`, rdStart, rdEnd, "RDATA", rdataValue, "RFC 1035 §4.1.3"),
      ]);
      root.children.push(rr);
      o = rdEnd;
    }
  }

  return buildProbe(root, bytes.length);
}

/** Decode RDATA for the RR types the module reads; otherwise a byte-count (honest, not faked). */
function decodeRdata(b: Uint8Array, start: number, len: number, type: number): string {
  if (type === 1 && len === 4) return `${b[start]}.${b[start + 1]}.${b[start + 2]}.${b[start + 3]}`; // A
  if (type === 28 && len === 16) {
    // AAAA — eight colon-separated hextets
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) parts.push(u16(b, start + i).toString(16));
    return parts.join(":");
  }
  if (type === 2 || type === 5 || type === 12) {
    // NS / CNAME / PTR RDATA is a domain name (may be compressed)
    return walkName(b, start).name;
  }
  return `${len} bytes`;
}

// ----------------------------------------------------------------------------
// probe assembly (mirrors pkt.buildProbe — one verifier path for both oracles)
// ----------------------------------------------------------------------------

function flatten(r: ParseRegion, out: ParseRegion[]): void {
  out.push(r);
  for (const c of r.children) flatten(c, out);
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
    regionAt: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}

/** Parse a contiguous hex string (no separators) into bytes. Throws on malformed input. */
export function dnsHexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length === 0) throw new Error("empty hex");
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex (${clean.length})`);
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error("non-hex characters in input");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Convenience: parse straight from a committed hex fixture string. */
export function parseDnsHex(hex: string): ParseTreeProbe {
  return parseDnsMessage(dnsHexToBytes(hex));
}
