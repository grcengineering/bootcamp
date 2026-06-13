/**
 * dns-1035 + dns-resolve-sim behavior + fidelity suite (Wave-4 honesty doctrine).
 *
 * The parser over REAL DNS wire bytes IS the oracle, and the delegation sim runs the REAL
 * iterative-resolution state machine. This suite asserts:
 *   - the parser's decode equals the committed rfc_field_truth (the fixture cannot drift):
 *     the canonical 29-byte example.com A query (built from RFC 1035 §4.1, matching `dig`'s
 *     question), and the live 61-byte response captured off the wire from 1.1.1.1 (two A
 *     records, RFC 1035 §4.1.4 name compression);
 *   - the QNAME label decoder, the flags-word bit-unpack, and the RR walker reproduce the
 *     real values; and
 *   - the dnsres-sim emits the REAL referral when a leaf query is routed to root/TLD, and only
 *     the authoritative server's answer in canonical order reaches the end state — out-of-order
 *     inputs yield the real consequence (assert it).
 *
 * Every assertion's right-hand side is the dissector's decode of the committed real bytes / the
 * cited delegation data — no authored answer key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  parseDnsHex,
  parseDnsMessage,
  dnsHexToBytes,
  walkName,
  decodeFlags,
  DNS_TYPES,
  DNS_CLASSES,
  DNS_RCODES,
  DNS_OPCODES,
} from "../src/engines/visual/dns";
import {
  canonicalDelegation,
  runDelegation,
  type DnsDelegationData,
  type DnsResMessage,
} from "../src/engines/visual/dnsres-sim";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/net");
const query = JSON.parse(readFileSync(join(ASSETS, "dns-query-example-com.json"), "utf8"));
const response = JSON.parse(readFileSync(join(ASSETS, "dns-response-example-com.json"), "utf8"));
const delegation = JSON.parse(readFileSync(join(ASSETS, "dns-delegation.json"), "utf8"));

describe("dns-1035 parser — real example.com A query (RFC 1035 §4.1)", () => {
  const probe = parseDnsHex(query.hex);

  test("the 29-byte query decodes to its committed rfc_field_truth", () => {
    const t = query.rfc_field_truth;
    expect(probe.byteLength).toBe(t.length);
    expect(probe.region("dns.id")!.value).toBe(t["header.id"].value);
    expect(probe.region("dns.qdcount")!.value).toBe(String(t["header.qdcount"].value));
    expect(probe.region("dns.qname")!.value).toBe(t.qname.value);
    expect(probe.region("dns.qtype")!.value).toContain(t.qtype.name);
    expect(probe.region("dns.qclass")!.value).toContain(t.qclass.name);
  });

  test("the flags word bit-unpacks to a recursive query (QR 0, RD 1)", () => {
    const flags = decodeFlags(0x0100);
    expect(flags.qr).toBe(0);
    expect(flags.rd).toBe(1);
    expect(flags.opcode).toBe(0);
    expect(probe.region("dns.flags")!.value).toContain("QR 0");
    expect(probe.region("dns.flags")!.value).toContain("RD 1");
  });

  test("the QNAME label decoder walks 07 'example' 03 'com' 00 → example.com", () => {
    // the QNAME starts at byte 12 in the query
    const bytes = dnsHexToBytes(query.hex);
    const nw = walkName(bytes, 12);
    expect(nw.name).toBe("example.com");
    expect(nw.compressed).toBe(false);
    expect(nw.consumed).toBe(13); // 1+7 + 1+3 + 1 terminator
  });

  test("regionAt / decode expose the parse tree read-only at the QNAME boundary", () => {
    const qname = probe.region("dns.qname")!;
    expect(probe.regionAt({ start: qname.start, end: qname.end })!.id).toBe("dns.qname");
    expect(probe.decode({ start: qname.start, end: qname.end })).toBe("example.com");
    expect(probe.decode({ start: 999, end: 1000 })).toBeNull();
    expect(probe.region("nope")).toBeNull();
  });
});

describe("dns-1035 parser — real live response captured from 1.1.1.1 (two A records + compression)", () => {
  const probe = parseDnsHex(response.hex);

  test("the 61-byte response decodes to its committed rfc_field_truth", () => {
    const t = response.rfc_field_truth;
    expect(probe.region("dns.flags")!.value).toContain("QR 1");
    expect(probe.region("dns.flags")!.value).toContain("RA 1");
    expect(probe.region("dns.flags")!.value).toContain("NOERROR");
    expect(probe.region("dns.ancount")!.value).toBe(String(t["header.ancount"].value));
    expect(probe.region("dns.answer.0.rdata")!.value).toBe(t["answer.0.rdata"].value);
    expect(probe.region("dns.answer.1.rdata")!.value).toBe(t["answer.1.rdata"].value);
    expect(probe.region("dns.answer.0.ttl")!.value).toBe(`${t["answer.0.ttl"].value} seconds`);
  });

  test("the Answer RR NAME is decoded through the RFC 1035 §4.1.4 compression pointer", () => {
    // the answer name uses 0xc00c → it points back to the QNAME at offset 12
    expect(probe.region("dns.answer.0.name")!.value).toBe("example.com (compressed)");
    expect(probe.region("dns.answer.0.type")!.value).toContain("A");
    expect(probe.region("dns.answer.0.class")!.value).toContain("IN");
  });

  test("the response decode equals a manual byte read (no value invented)", () => {
    const bytes = dnsHexToBytes(response.hex);
    // header: id at 0-1, flags at 2-3, ancount at 6-7
    expect((bytes[0] << 8) | bytes[1]).toBe(0x1234);
    expect((bytes[6] << 8) | bytes[7]).toBe(2);
    // first answer RDATA at the end: 104.20.23.154
    expect(probe.region("dns.answer.0.rdata")!.value.split(".").map(Number)).toEqual([104, 20, 23, 154]);
  });

  test("registries cite the module's selector meanings", () => {
    expect(DNS_TYPES[1]).toBe("A");
    expect(DNS_TYPES[2]).toBe("NS");
    expect(DNS_TYPES[28]).toBe("AAAA");
    expect(DNS_CLASSES[1]).toBe("IN");
    expect(DNS_RCODES[0]).toBe("NOERROR");
    expect(DNS_RCODES[3]).toBe("NXDOMAIN");
    expect(DNS_OPCODES[0]).toBe("QUERY");
  });
});

describe("dns-1035 parser — totality and edge decodes", () => {
  test("a message shorter than the 12-byte header is the one hard error", () => {
    expect(() => parseDnsMessage(new Uint8Array(5))).toThrow(/12-byte header/);
  });

  test("hexToBytes rejects malformed input", () => {
    expect(() => dnsHexToBytes("")).toThrow("empty hex");
    expect(() => dnsHexToBytes("abc")).toThrow("odd-length");
    expect(() => dnsHexToBytes("zz")).toThrow("non-hex");
  });

  test("walkName terminates on a malformed name rather than looping (forensic totality)", () => {
    // a name with a reserved label type (0x80) stops; a self-referential pointer loop is bounded
    const reserved = new Uint8Array([0x80, 0x00]);
    expect(walkName(reserved, 0).name).toBe(".");
    // a pointer at offset 0 pointing to itself (0xc000) must not hang
    const loop = new Uint8Array([0xc0, 0x00]);
    const nw = walkName(loop, 0);
    expect(nw.compressed).toBe(true);
    expect(nw.consumed).toBe(2);
  });

  test("an AAAA-record RDATA decodes to colon-separated hextets", () => {
    const aaaa = parseDnsHex(
      // id flags qd=0 an=1 ns=0 ar=0
      "00008180" + "0000" + "0001" + "0000" + "0000" +
        // NAME root(00) TYPE=28(001c) CLASS=1 TTL=300 RDLEN=16 RDATA=2001:db8::1
        "00" + "001c" + "0001" + "0000012c" + "0010" + "20010db8000000000000000000000001",
    );
    expect(aaaa.region("dns.answer.0.type")!.value).toContain("AAAA");
    expect(aaaa.region("dns.answer.0.rdata")!.value).toContain("2001:db8");
  });

  test("an NS-record RDATA decodes as a domain name (RFC 1035 §3.3.11)", () => {
    const ns = parseDnsHex(
      // id flags qd=0 an=1 ns=0 ar=0
      "00008180" + "0000" + "0001" + "0000" + "0000" +
        // NAME root(00) TYPE=2(0002 NS) CLASS=1 TTL=21594 RDLEN=4 RDATA='ns'+root (02 6e 73 00)
        "00" + "0002" + "0001" + "0000545a" + "0004" + "026e7300",
    );
    expect(ns.region("dns.answer.0.type")!.value).toContain("NS");
    expect(ns.region("dns.answer.0.rdata")!.value).toBe("ns");
    expect(ns.region("dns.answer.0.ttl")!.value).toBe("21594 seconds");
  });

  test("an unknown RR type's RDATA is reported honestly as a byte count (not faked)", () => {
    const txt = parseDnsHex(
      // id flags qd=0 an=1 ns=0 ar=0
      "00008180" + "0000" + "0001" + "0000" + "0000" +
        // NAME root(00) TYPE=16(0010 TXT) CLASS=1 TTL=300 RDLEN=3 RDATA=02 'hi'
        "00" + "0010" + "0001" + "0000012c" + "0003" + "026869",
    );
    expect(txt.region("dns.answer.0.type")!.value).toContain("TXT");
    expect(txt.region("dns.answer.0.rdata")!.value).toBe("3 bytes");
  });
});

describe("dns-resolve-sim — real root→TLD→authoritative delegation state machine", () => {
  const data: DnsDelegationData = delegation.delegation;

  test("the cited delegation data is the real IANA/live values (provenance honesty)", () => {
    expect(data.root.server).toBe("a.root-servers.net");
    expect(data.root.ip).toBe("198.41.0.4");
    expect(data.tld.zone).toBe("com");
    expect(data.tld.server).toBe("a.gtld-servers.net");
    expect(data.tld.ip).toBe("192.5.6.30");
    expect(data.authoritative.zone).toBe("example.com");
  });

  test("the canonical order reaches the full resolution end state (root refers, TLD refers, authoritative answers)", () => {
    const canon = canonicalDelegation(data);
    const { probe, consequence } = runDelegation(data, canon);
    expect(probe.reachedEndState).toBe(true);
    expect(probe.lastAlert).toBeNull();
    expect(consequence).toBeNull();
    // the shape: 8 acts, the root's act is a referral, the authoritative's is an answer
    expect(canon.length).toBe(8);
    expect(canon.find((m) => m.from === "root")!.type).toBe("referral");
    expect(canon.find((m) => m.from === "authoritative")!.type).toBe("answer");
  });

  test("OUT OF ORDER: routing the leaf query to root and expecting an answer yields the REAL referral", () => {
    // the learner has the recursive resolver ASK root and then claims root ANSWERED the leaf
    const bad: DnsResMessage[] = [
      { from: "stub", to: "recursive", type: "query" },
      { from: "recursive", to: "root", type: "query" },
      { from: "root", to: "recursive", type: "answer", fields: { address: "104.20.23.154" } }, // root never answers!
    ];
    const { probe, consequence } = runDelegation(data, bad);
    expect(probe.reachedEndState).toBe(false);
    expect(consequence).not.toBeNull();
    expect(consequence!.name).toBe("referral");
    expect(probe.lastAlert!.name).toBe("referral");
    expect(consequence!.detail).toContain("root");
    expect(consequence!.detail).toContain("never answers a leaf");
  });

  test("OUT OF ORDER: skipping the hand-off and jumping straight to the authoritative server is out_of_order", () => {
    const bad: DnsResMessage[] = [
      { from: "stub", to: "recursive", type: "query" },
      { from: "recursive", to: "authoritative", type: "query" }, // skipped root + TLD referrals
    ];
    const { probe, consequence } = runDelegation(data, bad);
    expect(probe.reachedEndState).toBe(false);
    expect(consequence!.name).toBe("out_of_order");
    expect(consequence!.detail).toContain("referred");
  });

  test("OUT OF ORDER: claiming the TLD answered the leaf yields the TLD referral", () => {
    const bad: DnsResMessage[] = [
      { from: "stub", to: "recursive", type: "query" },
      { from: "recursive", to: "root", type: "query" },
      { from: "root", to: "recursive", type: "referral", fields: { to_zone: "com" } },
      { from: "recursive", to: "tld", type: "query" },
      { from: "tld", to: "recursive", type: "answer", fields: { address: "104.20.23.154" } }, // TLD never answers!
    ];
    const { consequence } = runDelegation(data, bad);
    expect(consequence!.name).toBe("referral");
    expect(consequence!.detail).toContain("TLD server delegates");
  });

  test("querying root for the leaf (when a referral is due) still yields a referral", () => {
    // a learner who asks root again (a query) when the protocol owes a referral
    const bad: DnsResMessage[] = [
      { from: "stub", to: "recursive", type: "query" },
      { from: "recursive", to: "root", type: "query" },
      { from: "recursive", to: "root", type: "query" }, // re-query root where a referral was due
    ];
    const { consequence } = runDelegation(data, bad);
    expect(consequence!.name).toBe("referral");
  });
});
