/**
 * Matching/mapping widget model (web ISA ISC-82/83) — the crosswalk builder (module 10:
 * profile requirement → spine control + relationship) and the threat-coverage map
 * (module 11: threat → control + mitigation) share one model: rows with fixed left-hand
 * identity columns and learner-assigned (target, label) pairs.
 *
 * The model's ONLY output is the CSV the module's real validator consumes — machine
 * scoring is the ported validator itself (one source of truth), with an optional
 * answer-key diff for per-row UI feedback.
 */

export interface MappingRow {
  /** Fixed identity columns (e.g. ["SOC2","CC6.1"] or ["T-1486","Data encrypted for ransom"]). */
  left: string[];
  /** Learner-assigned target (spine_control / control_id). Empty = unmapped. */
  target: string;
  /** Learner-assigned label (relationship / mitigation). */
  label: string;
}

export interface MappingModelOptions {
  /** CSV header, e.g. ["profile","profile_control","spine_control","relationship"]. */
  header: string[];
  rows: MappingRow[];
  /** Closed target vocabulary offered by the widget (e.g. controls in scope). */
  targets?: string[];
  /** Closed label vocabulary (e.g. exact|broader|narrower|partial). */
  labels?: string[];
}

export interface RowScore {
  index: number;
  targetOk: boolean;
  labelOk: boolean;
  correct: boolean;
}

export class MappingModel {
  readonly header: string[];
  readonly targets: string[];
  readonly labels: string[];
  private seedRows: MappingRow[];
  private rows: MappingRow[];

  constructor(opts: MappingModelOptions) {
    this.header = [...opts.header];
    this.targets = [...(opts.targets ?? [])];
    this.labels = [...(opts.labels ?? [])];
    this.seedRows = opts.rows.map((r) => ({ ...r, left: [...r.left] }));
    this.rows = this.seedRows.map((r) => ({ ...r, left: [...r.left] }));
  }

  rowCount(): number {
    return this.rows.length;
  }

  row(i: number): MappingRow {
    const r = this.rows[i];
    if (!r) throw new Error(`no mapping row ${i}`);
    return { ...r, left: [...r.left] };
  }

  /**
   * Assign target + label. The widget surfaces the closed vocabularies, but the model does
   * NOT block free entry — rejecting a dishonest label is the validator's lesson to teach.
   */
  setMapping(i: number, target: string, label: string): void {
    const r = this.rows[i];
    if (!r) throw new Error(`no mapping row ${i}`);
    r.target = target;
    r.label = label;
  }

  /** Add a learner row (e.g. extending the crosswalk with a new profile requirement). */
  addRow(row: MappingRow): void {
    this.rows.push({ ...row, left: [...row.left] });
  }

  removeRow(i: number): void {
    if (i < 0 || i >= this.rows.length) throw new Error(`no mapping row ${i}`);
    this.rows.splice(i, 1);
  }

  /** The exact CSV the module's validator consumes (header + naive comma join + trailing \n). */
  toCsv(): string {
    const lines = [this.header.join(",")];
    for (const r of this.rows) lines.push([...r.left, r.target, r.label].join(","));
    return lines.join("\n") + "\n";
  }

  /** Per-row diff against an answer key (UI feedback; the validator stays the gate). */
  scoreAgainstKey(key: Array<{ target: string; label: string }>): RowScore[] {
    return this.rows.map((r, index) => {
      const k = key[index];
      const targetOk = k !== undefined && r.target === k.target;
      const labelOk = k !== undefined && r.label === k.label;
      return { index, targetOk, labelOk, correct: targetOk && labelOk };
    });
  }

  reset(): void {
    this.rows = this.seedRows.map((r) => ({ ...r, left: [...r.left] }));
  }

  snapshot(): { version: 1; rows: MappingRow[] } {
    return { version: 1, rows: this.rows.map((r) => ({ ...r, left: [...r.left] })) };
  }

  restore(snap: { version: 1; rows: MappingRow[] }): void {
    this.rows = snap.rows.map((r) => ({ ...r, left: [...r.left] }));
  }
}

/** Parse a seed CSV (e.g. the committed crosswalk.csv) into a MappingModel. */
export function mappingModelFromCsv(
  csv: string,
  opts: { leftCols: number; targets?: string[]; labels?: string[] },
): MappingModel {
  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("empty CSV: no header row");
  const header = lines[0].split(",").map((c) => c.trim());
  const rows: MappingRow[] = lines.slice(1).map((l) => {
    const cells = l.split(",").map((c) => c.trim());
    return {
      left: cells.slice(0, opts.leftCols),
      target: cells[opts.leftCols] ?? "",
      label: cells[opts.leftCols + 1] ?? "",
    };
  });
  return new MappingModel({ header, rows, targets: opts.targets, labels: opts.labels });
}
