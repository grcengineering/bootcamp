# Logging fixtures — RFC 5424 syslog lines (honesty doctrine)

A syslog line is normative RFC text, not bytes you can capture off a wire. So the honest source
here is the RFC itself: the lines are transcribed **verbatim from RFC 5424 §6.5**, and the
decode is the parser's computation over those exact characters — never an authored answer key.
This is the documented `authored-with-citation` capture mode for artifacts that have no on-wire
form.

## What is committed, and from where

- **When:** transcribed 2026-06-13.
- **Source:** RFC 5424 (The Syslog Protocol):
  - §6.5 Examples 1–4 → the four `lines[]` entries.
  - §6.2.1 Table 1 (Facility) + Table 2 (Severity) → the parser's code registries.
  - §6.2.x field definitions, §6.3 STRUCTURED-DATA, §6.4 MSG/BOM → the tokenizer/walker.
- **What:** `syslog-5424-examples.json` holds each line's `raw` text (the BOM placeholder the
  RFC prints in ex1/ex3 is rendered as the real U+FEFF / EF BB BF byte sequence), a
  `rfc_field_truth` block per line, and one Diff-the-Trace `diff_pairs` entry (a Critical
  auth-failure vs the same line with its PRIVAL changed so the severity downgrades to Debug).

## The PRI arithmetic, verified

PRIVAL = Facility × 8 + Severity (§6.2.1). Verified locally with `python3` (`divmod`):

- `34  = 4×8 + 2` → Facility **4** (security/authorization = auth), Severity **2** (Critical).
- `165 = 20×8 + 5` → Facility **20** (local4), Severity **5** (Notice) — matching the RFC's own
  worked statement ("a 'local use 4' message with a Severity of Notice = 165").
- `39  = 4×8 + 7` → Facility 4, Severity **7** (Debug) — the diff-pair's broken leg.

## Why this is the oracle, not an answer key

The TS RFC 5424 parser (`web/src/engines/visual/syslog.ts`) tokenizes the HEADER, bit-unpacks the
PRI, treats NILVALUE `-` as a real "absent", and walks the SD-ELEMENTs. The parse tree is the
oracle the PEEL surface shows and the verifiers gate against. `web/tests/syslog-fidelity.test.ts`
asserts the parser's decode equals the `rfc_field_truth` recorded here, so the parser cannot
drift from RFC 5424 without CI failing. A learner can paste any `raw` line into a reference
RFC 5424 parser (rsyslog/syslog-ng harness) — or compute the offsets by hand against §6 — and get
the identical decode. That reproducibility is the whole point.
