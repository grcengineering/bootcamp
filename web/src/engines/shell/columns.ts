/**
 * GNU ls -C columnization (web ISC-123): width-parameterized, column-major layout with
 * per-column widths and tab-based gap filling (tabsize 8) — byte-matched against
 * `ls -C -wN` captures at widths 45/80/120.
 */

const MIN_COLUMN_WIDTH = 3;
const TABSIZE = 8;

export function columnize(names: string[], lineLength: number): string {
  if (names.length === 0) return "";
  const n = names.length;
  const maxCols = Math.max(1, Math.min(n, Math.floor(lineLength / MIN_COLUMN_WIDTH)));

  // pick the largest column count whose layout fits strictly within lineLength
  let cols = 1;
  let widths: number[] = [Math.max(MIN_COLUMN_WIDTH, ...names.map((s) => s.length))];
  for (let candidate = maxCols; candidate >= 1; candidate--) {
    const rows = Math.ceil(n / candidate);
    const actualCols = Math.ceil(n / rows); // trailing fully-empty columns collapse
    if (actualCols !== candidate) continue;
    const w: number[] = [];
    for (let j = 0; j < candidate; j++) {
      let max = MIN_COLUMN_WIDTH;
      for (let idx = j * rows; idx < Math.min((j + 1) * rows, n); idx++) {
        const real = names[idx]!.length + (j === candidate - 1 ? 0 : 2);
        if (real > max) max = real;
      }
      w.push(max);
    }
    const total = w.reduce((a, b) => a + b, 0);
    if (total < lineLength || candidate === 1) {
      cols = candidate;
      widths = w;
      break;
    }
  }

  const rows = Math.ceil(n / cols);
  let out = "";
  for (let r = 0; r < rows; r++) {
    let pos = 0;
    for (let j = 0; j < cols; j++) {
      const idx = j * rows + r;
      if (idx >= n) break;
      const name = names[idx]!;
      out += name;
      const isLastInRow = j === cols - 1 || j * rows + rows + r >= n;
      if (!isLastInRow) {
        const from = pos + name.length;
        const to = pos + widths[j]!;
        out += indent(from, to);
      }
      pos += widths[j]!;
    }
    out += "\n";
  }
  return out;
}

/** GNU ls indent(): tabs where a whole tab stop fits, spaces otherwise. */
export function indent(from: number, to: number): string {
  let out = "";
  let f = from;
  while (f < to) {
    if (Math.floor(to / TABSIZE) > Math.floor((f + 1) / TABSIZE)) {
      out += "\t";
      f += TABSIZE - (f % TABSIZE);
    } else {
      out += " ";
      f++;
    }
  }
  return out;
}
