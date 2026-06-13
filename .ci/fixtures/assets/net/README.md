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
