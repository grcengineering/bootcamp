# Module 14 — Assessment

*Competency artifact, not a quiz. You demonstrate ownership by producing the thing an owner produces: a defensible build-vs-buy decision memo. The rubric is in `rubric.md`; every row maps to a §1 objective and, on a miss, back to a specific concept section.*

---

## The artifact: a build-vs-buy decision memo for one control area

You will be given (or you choose, if you already own one) **a single control area**. Within **120 minutes, unaided**, you produce one Markdown document, `decision-memo.md`, that an owner could take to a funding conversation. It must contain all five parts below. A part that is present but hand-wavy fails its rubric row — owners get held to "would a finance partner and an auditor both accept this," not "did you write something in each section."

### Part 1 — Product card (Objective O1)

Reframe the control as a product. State, concretely:

- **Owner:** exactly one accountable human (not a team, not a committee).
- **Customers, in priority order:** name the real customer *types* for this control (typically some mix of engineer, auditor, business/exec, customer-trust) and put them in a deliberate priority order. The priority order is the point — it records whose needs win when they conflict.
- **Backlog:** a ranked list of at least three of the control's real defects/improvements, with the *highest-risk* item (not the easiest) at or near the top.
- **UX target:** one sentence describing the experience you're driving toward; credit is highest when it's "evidence as a by-product" — doing the work correctly is what produces the proof.
- **Metrics:** at least four observable metrics, one of which is the loss exposure the control buys down (Part 2 supplies the number).

### Part 2 — Loss-exposure quantification (Objective O2)

Pick one gap from your backlog and price it. You must:

- Estimate **loss event frequency** (events/year) and **loss magnitude** ($/event) **separately**, each as a **range**, not a point — and say in one line why you estimated them separately (different evidence sources).
- Run the ranges through a **sampling calculation** (use `labs/expected_loss.ts`, or any tool, or reproduce the math) and report a **mean** *and* a **tail percentile** (e.g., 95th). A single point estimate, or a red/amber/green cell, fails this row outright.
- State, in one sentence, why the **tail** — not the mean — is the figure the executive actually cares about.

### Part 3 — Seven-stage build/buy/hybrid scoring table (Objective O3)

Score the control across the full loop. A table with all seven stages, each row carrying its deciding question and your call:

| Stage | Deciding question | Call (BUILD / BUY / HYBRID) | One-line reason |
|---|---|---|---|
| UNDERSTAND | | | |
| LOCATE | | | |
| QUERY | | | |
| EVALUATE | | | |
| EVIDENCE | | | |
| MONITOR | | | |
| OWN | | | |

The deciding question for each stage is "is this undifferentiated breadth (lean buy) or our specific judgment/accountability (lean build)?" Every call needs a defensible reason; "we just want to own it" is not a reason.

### Part 4 — The owned-vs-vendor boundary (Objective O4)

One paragraph that draws the explicit line: which stages are vendor-owned, which are yours, and — specifically — your call on the **EVALUATE / policy-and-evidence layer**, because that is the contested boundary. You must include **both**:

- one **honest case where the vendor abstraction wins** for this control (where building it yourself would be a worse, slower copy of undifferentiated heavy lifting), and
- one **honest case where owning the policy/evidence library wins** (where a generic vendor check flattens exactly the nuance your real risk posture requires).

A memo that only argues one direction fails this row — that's NIH or vendor-worship, the failure this module exists to prevent.

### Part 5 — Risk-quantified recommendation (Objective O5)

Close with one paragraph that ties the boundary decision **explicitly to the loss-exposure number from Part 2**, in finance-legible terms — e.g., "we own EVALUATE for this control because the ~\$Xk/yr expected loss (with a ~\$Yk tail) lives in a posture the generic check can't model, and the one-time \$Z to own that logic is dwarfed by the recurring exposure it lets us reason about." The recommendation must be a *decision*, not a summary.

---

## Conditions

- **Time:** 120 minutes, unaided. The fixture/calculator in `labs/` are allowed — they are tools, not answers.
- **Reproducibility:** if a reviewer re-runs your Part-2 numbers from your stated ranges, they must land in the same band. Numbers you can't reproduce fail Part 2.
- **Honesty bar:** the memo is graded as if a CFO and an auditor will both read it. Vagueness, single-direction boundary arguments, and colored-cell "quantification" are the common failure modes — they map to specific rubric rows.

## Scoring

Each rubric row is **Pass / Not-yet**; all five must be Pass. A "Not-yet" routes you back to the named concept section (see `rubric.md`), not to the whole module. Per-criterion pass-rates are the curriculum's own telemetry (maintenance Loop 3): the **Quantified gap** and **Boundary judgment** rows are the early-warning rows that fail first when the continuous-compliance platform market shifts, and a sustained dip there auto-flags this module for revision.
