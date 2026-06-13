# Module 16 — On the Wire: Where a Control's Truth Travels

*Loop stages: LOCATE · QUERY · EVALUATE · EVIDENCE/MONITOR (taught as the segue). Tier-1, IT-foundations band. Original content; third-party material is confined to §8. A control is a claim about a system — and this is the module where you learn to read that claim where it physically moves: as bytes, on the wire, at a fixed offset you can point to.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, encapsulation as nesting — one captured frame is literally Ethernet{IPv4{TCP{TLS{HTTP}}}}, and *frame*, *packet*, and *segment* name the same bytes at different layers — mapping each real header to its OSI layer (Ethernet=L2, IPv4=L3, TCP/UDP=L4, TLS≈L6, HTTP=L7) with the honest caveat that the wire runs TCP/IP and OSI is the teaching scaffold.
2. **Locate** where a given control claim's truth physically lives on the wire — which layer, header, and byte holds it: MAC=hop-truth (L2), IP=end-to-end-truth (L3), port=service-exposure-truth (L4), TLS ContentType=in-transit-encryption-truth (L6), HTTP start-line=application-intent-truth (L7).
3. **Query** a real packet by reading the actual bytes — decode the EtherType, the IPv4 Protocol, src/dst IP, TCP ports and flag bits, and the TLS ContentType from their RFC-fixed offsets — and answer a control question directly from the field values.
4. **Describe** the TCP three-way handshake as a real state transition readable in the flag bits, and contrast TCP vs UDP and MAC-vs-IP addressing scope by reading the same packet at two hops.
5. **Compose** the 5-tuple (src IP, dst IP, protocol, src port, dst port) from a peeled packet and express the three most-audited network controls as predicates over those fields — segmentation (SC-7), encryption-in-transit (SC-8), port-exposure (CM-7).
6. **Diagnose**, in a forensic Diff-the-Trace of two real captures, the single field/byte where evidence contradicts a control claim, and name the control it breaks and the framework reference.

Each objective is checked by the Assessment in §7. If you can already produce the §7 Wire Evidence Findings unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Every control you will ever assess is a claim about a system. "Data is encrypted in transit." "Only port 443 is exposed." "Production is segmented from corporate." Up to now you have read those claims where they sit still — in a config file, a registry value, an API response. But a great many of the most important claims are claims about *movement*: about what happens to data between two machines, on a path you do not own, through hops you cannot log into. The truth of those claims does not live in a file. It lives on the wire, in bytes, for a few microseconds at a time — and either you can read those bytes or you are taking someone's word for it.

This is the module where **LOCATE** stops meaning "find the file" and starts meaning "find the layer, the header, and the byte." Where **QUERY** stops being a shell pipe and becomes reading a field at an offset the RFC fixed decades ago. Where **EVALUATE** is a predicate over five numbers you pulled off a real packet. And where the segue to **EVIDENCE/MONITOR** is the realization that a firewall rule, an IDS signature, and a flow log are all just programs reading these same bytes on a schedule. An auditor who can peel a packet is an auditor who can never again be told "trust me, it's encrypted" — because they know exactly which byte would prove it, and exactly how to read it.

The discipline this builds is the GRC mindset in its purest form: the owner *claims*, the wire is *ground truth*, and the gap between them is your finding.

---

## 3. The Mental Model

Picture mailing a letter inside a box, inside a bigger box, inside a shipping crate. The crate has a shipping label the dockworkers read; inside, the box has an address the courier reads; inside that, the letter has a "Dear So-and-so" the recipient reads. Nobody reading the outer label cares about the letter, and the letter does not care how it shipped. Each layer wraps the one inside it, adds exactly the addressing *its* handlers need, and hands it on. That nesting — each layer ignorant of the others' contents, each adding its own header — is **encapsulation**, and it is the single idea that makes a global network out of dumb, independent hops.

A real captured frame is exactly those nested boxes. The outermost wrapper is **Ethernet** (Layer 2): two MAC addresses and a two-byte tag that says what's inside. That tag — the **EtherType** — reading `0x0800` means "the next box is IPv4." Open it and you find the **IPv4** packet (Layer 3): source and destination *IP* addresses, and a one-byte **Protocol** field that says what's inside *it* — `0x06` means TCP, `0x11` (17) means UDP. Open that and you find the **TCP** segment (Layer 4): source and destination *ports*, sequence numbers, and a byte of flag bits that carry the connection's state. Open *that* and, on a secure connection, you find a **TLS record** (≈Layer 6) whose very first byte — the **ContentType** — tells you whether what follows is a cleartext handshake or opaque, encrypted application data. And inside *that*, finally, the **HTTP** request (Layer 7): the actual "GET /search" intent.

Notice the trick each layer plays: it reads one selector byte to know how to open the next box, and refuses to guess. The EtherType *selects* the L3 parser. The Protocol byte *selects* the L4 parser. This is not decoration — it is how the same wire carries a thousand different protocols without confusion, and it is why you can stand at any layer and answer a different control question. *Frame*, *packet*, and *segment* are not three different things; they are the same bytes named from three different boxes.

The OSI seven-layer model you may have seen on a poster is a teaching scaffold, and an honest one only if you say so: the real wire runs TCP/IP, which collapses OSI's session/presentation layers and never cleanly separated them. We use the layer names because they let us *point* — "that claim lives at L4," "that one at L6" — not because the wire files its bytes into seven labeled drawers. What is real is the nesting and the offsets. Everything in this module, you will read off real bytes at offsets the RFCs fixed and that a reference dissector confirms. There is no answer key. The packet is the answer key.

---

## 4. Concepts

### 4.1 Encapsulation is nesting, and the selector byte opens the next box

A frame is layers wrapped around layers, outermost first. Each layer's header ends with (or contains) a *selector* that names the layer inside it, and the parser refuses to descend until it reads that selector. Ethernet's EtherType at byte offset 12–13 is the first selector: `0x0800` → IPv4, `0x0806` → ARP. IPv4's Protocol field at its own offset 9 is the next: `0x06` → TCP, `0x11` → UDP, `0x01` → ICMP. Reading the selector is the act of choosing which decoder runs next — protocol selection made tangible. When you peel a packet, you are walking the same selectors the network walked, one box at a time, and a layer you have not earned the right to open (because you have not read its selector) stays closed.

### 4.2 Addresses have scope: MAC is hop-truth, IP is end-to-end-truth

Two of the addresses in a packet answer different questions, and conflating them is a classic attribution error. The **MAC address** (L2, Ethernet) is *hop-local*: it identifies the next physical interface on this segment, and a router **rewrites it at every hop**. The **IP address** (L3) is *end-to-end*: it identifies the original sender and final recipient, and it is **preserved across hops**. So if a log shows a source MAC, it tells you only the last router that forwarded the frame — useless for attributing the originating host across a routed boundary. The source IP is the one that attributes. You can *see* this by capturing the same logical packet at two adjacent hops: the L2 MAC regions differ; the L3 IP regions are byte-for-byte identical. Scope is not abstract — it is which bytes change when the packet moves.

### 4.3 Ports are service-exposure, and the 5-tuple is the firewall's whole worldview

A TCP or UDP **port** (L4) names a service endpoint, not a machine: 443 is "the HTTPS service here," 80 is "the cleartext HTTP service here." The destination port is where the control claim "only 443 is exposed" lives — `dst_port == 443` is the predicate, and a packet to `0x0050` (80) when the claim says 443 is a finding you can point to. A packet filter — a firewall rule — decides on exactly five fields, the **5-tuple**: source IP, destination IP, protocol, source port, destination port. That is the firewall's entire worldview. Once you can peel those five fields off a real packet, you can read any firewall rule as a predicate over them, and write the audit question the same way.

### 4.4 The TCP three-way handshake is a state machine you can read in one byte

TCP opens a connection in three messages, and the connection's *state* is literally readable in one byte — the flags byte at TCP offset 13. The client sends **SYN** (flags `0x02`): "let's talk, my sequence starts at X." The server answers **SYN+ACK** (`0x12`): "agreed, my sequence starts at Y, and I acknowledge X+1." The client sends **ACK** (`0x10`): "acknowledged Y+1." Now the connection is ESTABLISHED. The flag bits share one byte, high to low: CWR, ECE, URG, ACK, PSH, RST, SYN, FIN. Read the byte, read the state. Send these out of order against a real TCP counterpart and it does not say "try again" — it sends a **RST** and refuses, because the state machine is real. (UDP, by contrast, has no handshake and no flags byte: it is fire-and-forget, which is why DNS and other ask-once protocols ride it.)

### 4.5 TLS makes "encrypted in transit" a byte, not a vibe

The claim "encrypted in transit" has a precise home: the **TLS record ContentType**, the very first byte of every TLS record (≈L6). `0x16` (22) is *handshake* — the negotiation, still readable. `0x17` (23) is *application_data* — opaque, encrypted payload. So "is this connection actually protecting the application data?" is answered by reading one byte. Crucially, this is a *different layer* from the 5-tuple: a packet on port 443 with the right IPs can still be cleartext if the application never wrapped its bytes in TLS — the port is a promise, the ContentType is the proof. "It's on 443" is exposure; "the ContentType is 0x17" is encryption. They are not the same claim, and they do not live at the same offset. That distinction is the single most common place a real "encrypted in transit" control is quietly false.

### 4.6 ARP is the trust assumption underneath L2

Before a host can send a frame to an IP on its own segment, it must learn that IP's MAC address, and it does so with **ARP** (Address Resolution Protocol): a broadcast **request** ("who has 192.168.1.1?", opcode 1) answered by a **reply** ("192.168.1.1 is at this MAC", opcode 2). The trust assumption is the vulnerability: a host will generally accept an *unsolicited* reply — an opcode-2 ARP with no matching request — and update its table, which is how an attacker on the segment redirects traffic (ARP spoofing). For GRC this is the L2 analogue of every "we trust the network" assumption: a reply with no request (a *gratuitous* ARP) is, on the wire, exactly opcode 2 with nothing that asked for it, and reading the opcode tells you which you are looking at.

### 4.7 A control is a predicate over bytes — which is why a packet is evidence

Pull the threads together. SC-7 (segmentation) is a predicate over IP ranges — does traffic from the prod subnet ever reach the corporate subnet? SC-8 (encryption in transit) is a predicate over the TLS ContentType — is the application payload `0x17`, or is it a cleartext start-line? CM-7 (least functionality / port exposure) is a predicate over the destination port — is anything but 443 reachable? Each control claim names a layer, a field, and an expected value. The evidence is a real packet whose bytes either satisfy the predicate or violate it. That is the whole game: an owner makes a claim, the wire carries the truth, and your finding is the single byte where they disagree. This is the bridge to MONITOR — a flow log, an IDS, a firewall counter are all just this same predicate, evaluated continuously, on bytes nobody had to screenshot.

---

## 5. Worked Examples

> These are illustrative and GRC-framed, using one real captured frame from a `curl` request to `www.google.com` over TLS. The byte values shown are the real frame's, confirmed against a reference dissector (`tshark`). (Worked examples are Tier-B content — reviewed when capture conventions or RFC errata shift.)

### 5.1 LOCATE + QUERY: peel one real frame, layer by layer

Here is the start of the real captured frame (hex, the first bytes of each layer; the full bytes are the lab's seeded artifact):

```
Ethernet : e6 d8 e7 88 45 bf  e6 c9 6d a1 e0 3c  08 00      dst MAC · src MAC · EtherType 0x0800 → IPv4
IPv4     : 45 00 02 39 …                                    version 4, IHL 5; offset 9 = 06 → TCP
           … c0 a8 d7 03  8e fb 98 77                       src 192.168.215.3 → dst 142.251.152.119
TCP      : da 50  01 bb  …                                  src port 55888 → dst port 0x01bb = 443
           … 80 …                                            data-offset nibble 8 → 32-byte TCP header
TLS rec  : 16 03 01 02 00                                   ContentType 0x16 = handshake; length 512
```

Read it as the §3 model: the EtherType `0x0800` *selects* the IPv4 parser; IPv4's Protocol byte `0x06` *selects* TCP; the TCP header's data-offset says where the TLS record starts; the TLS ContentType `0x16` says "handshake, still cleartext negotiation." Every value is at a fixed offset, and every one was confirmed against `tshark`'s decode of the same frame. Nothing is authored — the packet is the answer key.

### 5.2 EVALUATE: answer three control claims from those fields

- *"Only 443 is exposed."* → read the destination port: `0x01bb` = 443. **Satisfied.** A packet to `0x0050` (80) would be the finding (CM-7 / SC-7).
- *"Encrypted in transit."* → this does **not** live in the 5-tuple. It lives at the TLS ContentType. On the encrypted leg the application data is `0x17`; a cleartext `GET / HTTP/1.1` start-line where you expected `0x17` is the SC-8 break. The port being 443 does not prove it — the ContentType does.
- *"Production is segmented."* → read the IP range: is `c0 a8 d7 03` (192.168.215.3) inside the subnet the claim says is isolated? SC-7 is a predicate over those L3 bytes.

Notice the trap in the middle claim: two of the three are predicates over the 5-tuple; one is a byte at a *different layer*. Reaching for the port to prove encryption is the classic mistake, and reading the ContentType is the fix.

### 5.3 The three-way handshake, read in the flag byte

The same connection's first three frames carry these flags bytes at TCP offset 13: `0x02` (SYN), `0x12` (SYN+ACK), `0x10` (ACK). Decode the bits high-to-low (CWR ECE URG ACK PSH RST SYN FIN) and the states fall out: SYN opens, SYN+ACK accepts-and-proposes, ACK confirms — ESTABLISHED. The ack numbers prove the order: the SYN+ACK's acknowledgment equals the SYN's sequence + 1. Reorder these against a real TCP counterpart and it answers with a RST — the consequence is real because the state machine is real.

### 5.4 DIAGNOSE: the byte where the claim breaks

Put a clean capture beside a real broken one and the finding is a single divergent field. Clean: destination port `0x01bb` (443). Broken (a real port-80 exchange): `0x0050` (80) — the exposure claim (CM-7/SC-7) is violated, and you can point to the exact two bytes. Clean: a TLS record. Broken (a real cleartext HTTP capture): the TCP payload begins `47 45 54` = "GET" — a readable start-line where confidentiality should have made it opaque (SC-8). The discriminating byte is not your opinion; it is the dissector's computed difference over two real captures. Your Wire Evidence Finding names the field, both values, the broken control, and the framework reference — and anyone can re-derive it from the same bytes.

---

## 6. Guided Lab

> Original lab. ~45–75 minutes. Tier-B content (capture conventions drift). This lab runs entirely in your browser on the bootcamp site (Module 16 → Interactive lab) — no install, no host packet capture needed.

**Scenario.** You are handed one real captured frame from a `curl` request to `www.google.com` over TLS and asked to read its control-relevant truth directly off the bytes, then to diagnose a control failure in a forensic capture pair.

> **Interactive lab.** The lab is the Inspect-&-Assemble surface: the real frame rendered as nested, keyboard-selectable byte-range regions. Each layer stays collapsed until you read the selector byte that justifies opening the next one (read the EtherType `0x0800` to unlock IPv4; read the Protocol `0x06` to unlock TCP). Selecting a region reveals the dissector's real decoded value — the same value `tshark` produces from the same bytes. Every task is machine-verified against that parse tree.

**Tasks (performed on the surface).**

1. Select the **EtherType** region (the 2 bytes at Ethernet offset 12–13). Label it with its OSI layer and read the value that tells the dissector the payload is IPv4. *(Objectives 1, 3)*
2. Descend into IPv4. Select the **Protocol** field (IPv4 offset 9), label the IPv4 region, and read which L4 parser this byte selects. *(Objectives 1, 3)*
3. Select the **destination IP** region and read the end-to-end address; state why this — not the MAC — is what attributes the host across a routed boundary. *(Objectives 2, 4)*
4. Select the **TCP destination port** and read it; state which control claim ("only 443 is exposed") this field decides and which it does *not*. *(Objectives 2, 3, 5)*
5. Descend to the **TLS record** and select the **ContentType** byte. Label its layer and state, from the value alone, whether the payload is the still-cleartext handshake or opaque encrypted data — and why the port could not have told you that. *(Objectives 2, 3)*
6. **Diff-the-Trace.** Switch to the broken capture and find the single byte where a real port-80 exchange contradicts the "only 443" claim. *(Objective 6)*

**Deliverable.** A short written Wire Evidence Finding for the Diff: the field, the clean value, the broken value, the control claim broken, and the framework reference (SC-7, SC-8, or CM-7).

---

## 7. Assessment

**Competency artifact (not a quiz).** From real captures provided at assessment time, the learner must, unaided:

- **Peel** a real frame and read, off the bytes at their RFC-fixed offsets, the EtherType, the IPv4 Protocol, the source and destination IP, the TCP destination port, and the TLS ContentType — each verified against the dissector's parse tree (`region_labeled_correctly`, `field_value_is`).
- **Compose** the 5-tuple from the peeled fields and state, for three control claims (segmentation, encryption-in-transit, port-exposure), which field at which layer decides each — including the trap that "encrypted in transit" lives at the TLS ContentType, not the 5-tuple.
- **Diff-the-Trace**: given a clean capture and a real broken twin, click the single field/byte where evidence contradicts the control claim (`region_labeled_correctly` against the dissector's computed divergence), then write a **Wire Evidence Finding** naming the field, both values, the broken control, and the framework reference (NIST 800-53 SC-7 / SC-8 / CM-7; SOC 2 CC6.6 / CC6.7).

Every shown value is the dissector's output over real captured bytes, fidelity-checked against `tshark`. A single byte read wrong, or a control mapped to the wrong layer, routes the learner back to the specific concept section — not the whole module.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These offer a different voice or more breadth, and none of it is load-bearing.*

- **Wireshark — User's Guide and Sample Captures** — the canonical packet analyzer and a library of real captures to peel yourself. https://www.wireshark.org/docs/ and https://wiki.wireshark.org/SampleCaptures — *use to repeat §5's peel against your own capture and confirm the offsets by hand.*
- **RFC 791 (IPv4), RFC 9293 (TCP), RFC 768 (UDP), RFC 826 (ARP)** — the authoritative byte-layout references this module reads from. https://www.rfc-editor.org/rfc/rfc791 · https://www.rfc-editor.org/rfc/rfc9293 · https://www.rfc-editor.org/rfc/rfc768 · https://www.rfc-editor.org/rfc/rfc826 — *use as the lookup when you want to confirm a field's offset and meaning from the source.*
- **RFC 8446 (TLS 1.3)** — the record-layer and ContentType definitions behind §4.5. https://www.rfc-editor.org/rfc/rfc8446 — *use for a deeper, second treatment of why the ContentType is where "encrypted in transit" lives.*
- **IANA registries — EtherTypes and Protocol Numbers** — the cited source for the selector-byte meanings. https://www.iana.org/assignments/ieee-802-numbers and https://www.iana.org/assignments/protocol-numbers — *use to look up any EtherType or IP protocol number you encounter beyond the few taught here.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
