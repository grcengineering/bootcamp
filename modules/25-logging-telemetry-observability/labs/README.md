# Lab — The Field That Proves It (the Inspect-&-Assemble PEEL/TRACE/MAP surface)

This module's lab is **interactive in the browser**, not a shell script. There is no `setup.sh`
to run and no log collector to stand up: the lab loads the **real RFC 5424 example log lines** and
renders each as nested, clickable named regions (the PEEL surface, `engine: visual`) — the OSI move
applied to a log line.

## What runs

- **The artifact:** the four RFC 5424 §6.5 example lines, committed verbatim at
  `.ci/fixtures/assets/logging/syslog-5424-examples.json`, plus the Diff-the-Trace clean/broken pair
  (a real auth-failure line and a real instance of it with only the PRIVAL downgraded `<34>`→`<39>`).
- **The oracle:** the RFC 5424 parser `web/src/engines/visual/syslog.ts` tokenizes those real
  characters into a nested parse tree and computes the PRI bit-unpack (PRIVAL = Facility × 8 +
  Severity). Every region boundary and decoded value the surface shows is computed from the real
  line — there is no answer key.
- **The verification:** the tasks in `exercises/exercise.yaml` are machine-gated by the Wave-4
  verifier primitives (`region_labeled_correctly`, `field_value_is`, `sequence_matches`,
  `mapping_correct`) reading that parse tree, the pipeline sim, and the cited control key. The
  golden/anti transcripts in `exercises/transcripts/` replay the learner's select/read/order/place
  actions through the same surface the player drives.

## Why this is honest

The parser's output is fidelity-checked against the RFC's own worked decode
(`web/tests/syslog-fidelity.test.ts`): PRIVAL 34 → Facility 4 (security/authorization), Severity 2
(Critical); PRIVAL 165 → Facility 20 (local4), Severity 5 (Notice). A syslog line is RFC text, not
capturable wire bytes, so the honest source is the RFC's normative examples (`match:
authored-with-citation`); the PRI arithmetic, NILVALUE handling, and SD-ELEMENT walk are the parser's
computation over those exact characters, never an authored answer key. See
`.ci/fixtures/assets/logging/README.md` for the full provenance. The parse tree over the real
characters IS the oracle.
