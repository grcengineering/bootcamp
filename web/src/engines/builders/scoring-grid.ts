/**
 * Module 14 scoring-grid + decision-memo model (web ISA ISC-86) — the seven-loop-stage
 * BUILD/BUY/HYBRID scoring table whose validation rules are EXACTLY the module's
 * happy-path.sh assertions (all 7 stages present, each carrying a valid call, count == 7),
 * emitting the same `scoring-table.tsv` byte format, plus the five-part decision-memo
 * assembler the module's lab deliverable describes.
 */
import type { LearnerArtifact, LoopStage } from "./types";
import { LOOP_STAGES } from "./types";

export type BuildBuyCall = "BUILD" | "BUY" | "HYBRID";
export const VALID_CALLS: readonly BuildBuyCall[] = ["BUILD", "BUY", "HYBRID"];

/** The deciding questions exactly as the module's reference table words them (§5.3). */
export const DECIDING_QUESTIONS: Record<LoopStage, string> = {
  UNDERSTAND: "Who is this control for / what is our context?",
  LOCATE: "Where does the access truth live (IdP, DB, cloud)?",
  QUERY: "Pull the raw grant state",
  EVALUATE: "Is a grant compliant per OUR policy?",
  EVIDENCE: "Store durable, dated, audit-ready proof",
  MONITOR: "Alert when a grant outlives its shift",
  OWN: "Backlog, metrics, the boundary itself",
};

/** The reference calls the CI happy-path emits (the module's worked example, not "the answer"). */
export const REFERENCE_CALLS: Record<LoopStage, BuildBuyCall> = {
  UNDERSTAND: "BUILD",
  LOCATE: "BUY",
  QUERY: "BUY",
  EVALUATE: "BUILD",
  EVIDENCE: "HYBRID",
  MONITOR: "BUY",
  OWN: "BUILD",
};

export interface GridValidation {
  pass: boolean;
  /** Diagnostic strings reusing happy-path.sh's own FAIL wording (UX pattern 2). */
  failures: string[];
}

export class ScoringGrid {
  private calls: Map<LoopStage, string>;
  private rationales: Map<LoopStage, string>;

  // Explicit constructor: bun's coverage counts implicit field-initializer ctors as unhittable.
  constructor() {
    this.calls = new Map();
    this.rationales = new Map();
  }

  setCall(stage: LoopStage, call: string, rationale?: string): void {
    if (!LOOP_STAGES.includes(stage)) throw new Error(`unknown loop stage: ${stage}`);
    this.calls.set(stage, call);
    if (rationale !== undefined) this.rationales.set(stage, rationale);
  }

  call(stage: LoopStage): string | undefined {
    return this.calls.get(stage);
  }

  rationale(stage: LoopStage): string | undefined {
    return this.rationales.get(stage);
  }

  /** The happy-path.sh assertion set, verbatim failure wording. */
  validate(): GridValidation {
    const failures: string[] = [];
    for (const s of LOOP_STAGES) {
      const call = this.calls.get(s);
      if (call === undefined) {
        failures.push(`FAIL: scoring table missing loop stage '${s}'`);
        continue;
      }
      if (!VALID_CALLS.includes(call as BuildBuyCall)) {
        failures.push(`FAIL: stage '${s}' has no valid BUILD/BUY/HYBRID call (got '${call}')`);
      }
    }
    const scored = LOOP_STAGES.filter((s) => this.calls.has(s)).length;
    if (scored !== 7) {
      failures.push(`FAIL: expected all 7 loop stages scored, got ${scored}`);
    }
    return { pass: failures.length === 0, failures };
  }

  /** scoring-table.tsv — byte format of the happy-path heredoc (only scored stages emit rows). */
  toTsv(): string {
    let out = "stage\tdeciding_question\tcall\n";
    for (const s of LOOP_STAGES) {
      const call = this.calls.get(s);
      if (call === undefined) continue;
      out += `${s}\t${DECIDING_QUESTIONS[s]}\t${call}\n`;
    }
    return out;
  }

  /** Pre-fill with the module's reference example (the worked §5.3 table). */
  applyReference(): void {
    for (const s of LOOP_STAGES) this.calls.set(s, REFERENCE_CALLS[s]);
  }

  reset(): void {
    this.calls.clear();
    this.rationales.clear();
  }

  snapshot(): { version: 1; calls: Record<string, string>; rationales: Record<string, string> } {
    return {
      version: 1,
      calls: Object.fromEntries(this.calls),
      rationales: Object.fromEntries(this.rationales),
    };
  }

  restore(snap: { version: 1; calls: Record<string, string>; rationales: Record<string, string> }): void {
    this.calls = new Map(Object.entries(snap.calls) as [LoopStage, string][]);
    this.rationales = new Map(Object.entries(snap.rationales) as [LoopStage, string][]);
  }
}

export function createScoringGrid(): ScoringGrid {
  return new ScoringGrid();
}

// ---------------------------------------------------------------------------
// Decision memo — the lab's five-part deliverable, assembled from builder state.
// ---------------------------------------------------------------------------

export interface MemoParts {
  /** 1. The control-as-product card (customers, owner, metric). */
  productCard: string;
  /** 2. The quantified exposure (mean + tail from the ported expected_loss). */
  exposure: string;
  /** 3. The seven-stage scoring table (TSV from the grid). */
  scoringTable: string;
  /** 4. The build/buy boundary argument. */
  boundary: string;
  /** 5. The recommendation. */
  recommendation: string;
}

export interface MemoValidation {
  pass: boolean;
  missing: (keyof MemoParts)[];
}

const MEMO_SECTIONS: Array<{ key: keyof MemoParts; heading: string }> = [
  { key: "productCard", heading: "## Control as a product" },
  { key: "exposure", heading: "## Quantified loss exposure" },
  { key: "scoringTable", heading: "## Seven-stage build/buy/hybrid scoring" },
  { key: "boundary", heading: "## The boundary argument" },
  { key: "recommendation", heading: "## Recommendation" },
];

export function validateMemo(parts: Partial<MemoParts>): MemoValidation {
  const missing = MEMO_SECTIONS.map((s) => s.key).filter(
    (k) => !parts[k] || parts[k]!.trim().length === 0,
  );
  return { pass: missing.length === 0, missing };
}

/** Render decision-memo.md; throws if a part is missing (validate first). */
export function renderMemo(parts: MemoParts, title = "Build-vs-Buy Decision Memo"): string {
  const v = validateMemo(parts);
  if (!v.pass) throw new Error(`memo incomplete: missing ${v.missing.join(", ")}`);
  let out = `# ${title}\n`;
  for (const s of MEMO_SECTIONS) {
    const body = s.key === "scoringTable" ? "```tsv\n" + parts[s.key].trimEnd() + "\n```" : parts[s.key].trim();
    out += `\n${s.heading}\n\n${body}\n`;
  }
  return out;
}

/** The memo as a cross-module artifact (capstone portfolio shape, ISC-131). */
export function memoArtifact(parts: MemoParts): LearnerArtifact {
  return {
    name: "decision-memo.md",
    content: renderMemo(parts),
    module: "14-product-ownership-build-vs-buy",
  };
}
