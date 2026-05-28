# Voice & Style Guide

The curriculum has one voice. Authors and review agents conform to it; `module.md` 01 is the
canonical exemplar. This guide is the spec the editorial gate (and `.ci/style-lint.ts`) enforces.

## Voice

- **Second person to the learner, present tense.** "You type into a terminal emulator…"
- **First principles before syntax.** Teach the *idea* (the mental model) before any command.
  The learner should understand *why* a thing exists before they memorize *how* to invoke it.
- **Plain language. Demolish jargon on first use.** When a term is unavoidable, define it from
  its origin (e.g., a "terminal" is an *endpoint* — the device at the end of the wire).
- **Varied rhythm.** Short declarative sentences for the load-bearing ideas; longer ones to
  develop them. Paragraphs do the work; bullets are for genuinely parallel items.
- **GRC framing in every concept.** Every skill connects to the irreducible loop
  (UNDERSTAND → LOCATE → QUERY → EVALUATE → EVIDENCE → MONITOR → OWN). When a learner asks
  "why am I learning this?", the answer is always a loop stage, never "because the stack says so."

## Objectives (§1) — non-negotiable

- **Measurable, Bloom-aligned, falsifiable by the §7 assessment.** Each leads with a bold verb:
  **Explain · Describe · Navigate · Compose · Diagnose · Produce · Configure · Build · Map…**
- **Banned (unmeasurable) verbs:** understand, know, be familiar with, learn about, be aware of,
  appreciate, grasp. Enforced by `.ci/style-lint.ts` (see `banned-verbs.txt`).
- 3–7 objectives per module; each must be the thing the assessment actually checks.

## Originality (the contract, in two lines)

- §1–7 are **100% original prose** in our voice. We own the explanation, not the facts.
- **All third-party links live only under §8 Supplemental Learning Material**, always optional,
  never load-bearing. A learner who clicks zero links still meets every objective. Enforced by
  `.ci/originality-lint.ts`. Never paraphrase a third-party source and present it as original
  (no laundering) — if framing came from somewhere, cite it in §8.

## Worked examples & labs

- Examples are **ours**: our scenarios, our data, GRC-framed end-to-end. Show representative
  output and say so ("your exact output will differ").
- Labs produce an **artifact** and ship a scripted happy path (`labs/happy-path.sh`) that CI
  reproduces from clean. The lab *is* a test.

## Assessment (§7)

- An **artifact + rubric**, never a trivia quiz. The artifact is something the learner *produces*;
  the rubric maps each row to an objective and, on a miss, to the specific concept section.

## Mechanics

- Markdown only (no raw HTML except `<details>`/`<aside>`). Code in fenced blocks with a language.
- Reference the loop stage(s) under the title. Keep section numbering and titles exactly per the
  9-section anatomy so `anatomy-lint` passes.
