# Visual-Puzzle Modality — the reusable surface for abstract IT-foundations concepts

> BeCreative output (2026-06-13). The owner wants abstract concepts taught through *visual
> representations + interactive puzzles*, simulation-first, with the OSI-packet-on-a-Google-search
> as the exemplar. This designs ONE reusable surface that covers ~8 of the 10 modules, plus two
> specialized mechanics, all under the wave-2 honesty doctrine (real artifacts / real engines,
> never invented) and machine-verifiable.

## The unifying surface: **Inspect-&-Assemble** (`visual` engine, new Lab Player surface)

The insight that unifies almost every abstract topic: each concept is one of three shapes —
a **layered/nested real artifact**, a **sequence/flow of messages between participants**, or a
**mapping of items onto a structure**. One data-driven React island with three composable modes
covers all of them. It is DOM-based (regions and cards are real DOM nodes with ARIA), so it is
keyboard-operable and screen-reader-navigable — not a canvas.

### Mode 1 — PEEL (inspect a layered/nested real artifact)
A **real** artifact is rendered as nested, expandable, selectable regions; a **real parser ported
to TS** computes the true structure from the actual bytes, and the puzzle is generated *from the
parse tree* — so the learner can never be shown invented structure (honest by construction, the
artifact-equivalent of wave-2's fixture-verified output).
- **Covers:** OSI/packet layers (N1 — the exemplar: real pcap bytes → dissector → peel L2/L3/L4/L7), JWT (R1 — real `header.payload.signature`, base64url-decoded live), TLS certificate (R2 — real PEM → x.509 fields + chain), HTTP message (R3/N3 — real start-line/headers/body), container image (R6 — real manifest + layer digests), a SAML assertion / OSCAL doc (R1/12 — real XML/JSON nodes).
- **Interaction:** click/keyboard-select a byte-range or node → "which layer is this? / what does this field assert? / which control does it evidence?" Selecting reveals the real decoded value.
- **Auto-verify (new registry primitives):** `region_labeled_correctly` (the selected range maps to the parser's true layer/field), `field_value_is` (learner read the real value correctly), `decoded_artifact_matches` (learner's base64url/hex decode equals the real decode).
- **Honest because:** truth = the parser's output over real bytes. No answer key to fake; the dissector IS the oracle (ship it as a tested engine, fidelity-checked against a reference dissector's output the same way wave-2 fixtures are).

### Mode 2 — TRACE (assemble a sequence/flow between participants)
Participant nodes (browser, resolver, root/TLD/authoritative NS, server, IdP, SP, CA…) plus real
protocol-message cards the learner orders into the correct sequence between the right participants.
Wrong order has **honest consequences** — a stateful simulated counterpart rejects an out-of-order
message with the *real* protocol alert/error (not "try again").
- **Covers:** TLS handshake (R2), OAuth2/OIDC + SAML SSO dances (R1), DNS resolution root→TLD→authoritative (R3), the full request lifecycle type-to-render (R3), web-tier request tracing client→CDN→LB→app→DB (N3).
- **Auto-verify:** `sequence_matches` (ordered messages == canonical protocol sequence), `participant_routing_correct` (each message from/to the right node), plus the stateful sim's accept/reject as a real consequence.
- **Honest because:** message cards carry the real protocol fields/values; the counterpart follows the real state machine (e.g., application data before TLS Finished → real `unexpected_message` alert).

### Mode 3 — MAP (place/classify items onto a structure)
Drag/keyboard-assign items to zones; the key is derived from an authoritative source, cited.
- **Covers:** cloud shared-responsibility (R5 — you/provider × IaaS/PaaS/SaaS, key from the AWS/CSP doc), controls-onto-web-tiers (N3), hash-vs-encrypt-vs-encode sorting (R2 — key = the actual algorithm class), data-model fit (N2 — which store for which access pattern).
- **Auto-verify:** `mapping_correct` (every item in its authoritative zone), with partial-credit gap messages naming the misplaced item.
- **Honest because:** the zone key cites a real standard/doc; for the crypto sort, each string's class is verifiable by running the real transform.

## Runner-up 1 — **Build-and-Break** live protocol sandbox (TRACE with teeth)
For R1/R2/R3 where it's worth the build: a stateful simulated counterpart (server / IdP / resolver)
that responds to the learner's constructed messages with **real protocol responses including real
error/alert codes**. The learner builds a ClientHello (picks cipher suites), the sim ServerHello
answers; skip cert validation → the sim demonstrates the real MITM consequence. This is the owner's
"highly realistic simulation" ideal applied to protocols. Verified by the sandbox reaching the
correct end-state; honest because it runs the real protocol state machine. Higher build cost —
reserve for the 2–3 highest-value protocol modules.

## Runner-up 2 — **Diff-the-Trace** forensic inspector (the EVALUATE-stage assessment modality)
Two **real** captures side by side — one clean, one with a real control failure (expired cert,
downgraded TLS, `alg:none` JWT, MFA-bypassed SAML, traffic to port 80 not 443, a public S3 ACL) —
the learner must find the one field/byte that breaks the control. This distills the GRC mindset:
spot the control failure in real evidence. Verified by clicking the exact differing field;
honest because both traces are real and the "bad" one is a real instance of the misconfiguration.
Doubles as a reusable **assessment** across modules and maps cleanly to the EVALUATE loop stage.

## Why this is the right call
- **One surface, ~8 modules** — the same Inspect-&-Assemble island (3 modes) + the two specialized
  mechanics cover every abstract topic, so we build a modality once and reuse it, exactly like the
  wave-2 engine seam.
- **Honesty carries over verbatim:** PEEL truth = real parser over real bytes; TRACE truth = real
  protocol state machine; MAP truth = cited authoritative key; Diff truth = two real captures. No
  invented structure anywhere — the wave-2 doctrine, applied to artifacts instead of command output.
- **Accessible by construction:** DOM regions with ARIA, keyboard-operable reorder/assign (aria-grabbed/
  aria-dropeffect or a roving-tabindex listbox), no canvas.
- **Machine-verifiable:** four new verifier primitives (`region_labeled_correctly`, `field_value_is`,
  `sequence_matches`, `mapping_correct`) extend the closed registry; the golden/anti-transcript +
  fails_check discrimination gate from wave-2 applies unchanged.
