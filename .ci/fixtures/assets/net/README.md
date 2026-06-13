# Networking fixtures — real packet bytes (honesty doctrine)

Every byte in this directory came off a real wire. Nothing here is authored or invented.

## What was captured, how, and when

- **When:** 2026-06-13 ~18:47Z.
- **How:** `tcpdump` inside a throwaway `ubuntu:24.04` container with `--cap-add=NET_RAW --cap-add=NET_ADMIN`
  (host sudo avoided). The container's real `eth0` (LINKTYPE_ETHERNET) was the capture interface, so the
  frames are true Ethernet II frames with a real EtherType — exactly what the module's PEEL exemplar teaches.
- **What:**
  - `eth.pcap` — `curl -s https://www.google.com`: the TCP 3-way handshake + the TLS ClientHello.
  - `http.pcap` — `curl -s http://neverssl.com`: a real cleartext HTTP/1.1 GET on port 80 (the SC-8 "bad" leg).
  - `arp.pcap` — forced by flushing the neighbour cache and pinging in-subnet hosts: real ARP request/reply.
  - `cap.pcap` — an earlier `-i any` (LINKTYPE_LINUX_SLL2) capture kept for provenance; the canary uses the
    true-Ethernet `eth.pcap` so the EtherType-at-offset-12 pedagogy is honest.

## The derived fixtures (hex + RFC-verified field truth)

- `google-search-clienthello.json` — the PEEL exemplar frame (Ethernet{IPv4{TCP{TLS-record{ClientHello}}}}).
- `google-search-tcp-handshake.json` — the three TRACE handshake cards (SYN 0x02, SYN+ACK 0x12, ACK 0x10).
- `diff-the-trace.json` — three real clean/broken pairs for the assessment.

## How-the-internet-works fixtures (DNS + TLS, oracles `dns` / `dnsres` / `tls13`)

- `dns-query-example-com.json` — the canonical 29-byte RFC 1035 example.com A query (oracle `dns`,
  PEEL). match: authored-with-citation — built from RFC 1035 §4.1, its decode matches `dig`'s
  `;example.com. IN A` question; the QNAME label bytes `076578616d706c6503636f6d00` decode to
  example.com by hand.
- `dns-response-example-com.json` — a REAL 61-byte response captured live off the wire from
  1.1.1.1 (2026-06-13): two A records (104.20.23.154, 172.66.147.243), RFC 1035 §4.1.4 name
  compression (the 0xc00c pointer). match: byte-exact.
- `dns-delegation.json` — the REAL root→.com TLD→authoritative delegation (oracle `dnsres`, TRACE):
  IANA root list (a.root-servers.net 198.41.0.4), live .com TLD NS (a.gtld-servers.net 192.5.6.30,
  TTL 11246), example.com's authoritative NS (cloudflare). The sim is the consequence engine —
  root refers, TLD refers, only authoritative answers.
- `tls13-handshake.json` — the RFC 8446 §4.1.1 full-handshake cards (oracle `tls13`,
  build-and-break). match: authored-with-citation — the message NAMES + alert CODES (10/40/42/45/70)
  are RFC 8446 §6.2 / IANA literal values; the §A.1 state machine raises them on wrong moves.

## Why this is the oracle, not an answer key

Each fixture's `rfc_field_truth` block lists the field, its byte offset, the value, and the RFC that fixes it
(RFC 791 IPv4, RFC 9293 TCP, RFC 8446 TLS records, IANA EtherType/Protocol registries, IEEE 802.3 Ethernet).
Every one of those values was **cross-checked against `tshark`'s decode of the same frame** — the reference
dissector. The TS packet-dissector (`web/src/engines/visual/pkt.ts`) parses these exact bytes; the parse
tree is the oracle the PEEL surface shows and the verifiers gate against. `web/tests/pkt-fidelity.test.ts`
asserts the dissector's output equals these tshark-confirmed, RFC-true values, so the dissector cannot drift
from reality without failing CI.

The bytes are committed verbatim. A learner can paste any hex line into `tshark -r` (or compute the offsets by
hand against the RFC) and get the identical decode — that reproducibility is the whole point.
