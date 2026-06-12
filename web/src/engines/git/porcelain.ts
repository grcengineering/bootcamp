/**
 * Git porcelain renderer (web ISA ISC-66; RedTeam finding 6) — class: synthesized-porcelain.
 *
 * isomorphic-git provides REAL state semantics but prints no CLI text. These pure functions
 * synthesize the porcelain over that real state, templated from REAL git captures made with
 * pinned identity/dates (.ci/fixtures/captured/m05-git-*.json — git 2.50.1, see capture
 * provenance). The reference flow byte-matches the captures under `bun test`
 * (tests/engines-git.test.ts); learner free-form flows are state-verified, never
 * string-matched against synthesized text.
 *
 * Honesty boundary: nothing here is invented — every template line exists verbatim in a
 * capture. Diffstat bar scaling beyond the captured widths (git compresses bars on huge
 * diffs) is NOT implemented; lab diffs are orders of magnitude below that threshold.
 */

export interface StatusState {
  branch: string;
  hasCommits: boolean;
  stagedNew: string[];
  stagedModified: string[];
  stagedDeleted: string[];
  unstagedModified: string[];
  unstagedDeleted: string[];
  untracked: string[];
}

export interface DiffStatEntry {
  path: string;
  ins: number;
  del: number;
  created: boolean;
}

export interface LogEntry {
  /** Full 40-char sha. */
  oid: string;
  /** First line of the commit message. */
  subject: string;
}

const LABEL_WIDTH = 12; // "new file:   " / "modified:   " / "deleted:    " (capture-verified)

function label(text: string): string {
  return `${text}:`.padEnd(LABEL_WIDTH, " ");
}

export function renderInit(gitdirPath: string): string {
  return `Initialized empty Git repository in ${gitdirPath}\n`;
}

export function renderStatus(s: StatusState): string {
  let out = `On branch ${s.branch}\n`;
  if (!s.hasCommits) out += "\nNo commits yet\n\n";

  const staged = [
    ...s.stagedNew.map((f) => `\t${label("new file")}${f}\n`),
    ...s.stagedModified.map((f) => `\t${label("modified")}${f}\n`),
    ...s.stagedDeleted.map((f) => `\t${label("deleted")}${f}\n`),
  ];
  if (staged.length) {
    out += "Changes to be committed:\n";
    out += s.hasCommits
      ? '  (use "git restore --staged <file>..." to unstage)\n'
      : '  (use "git rm --cached <file>..." to unstage)\n';
    out += staged.join("") + "\n";
  }

  const unstaged = [
    ...s.unstagedModified.map((f) => `\t${label("modified")}${f}\n`),
    ...s.unstagedDeleted.map((f) => `\t${label("deleted")}${f}\n`),
  ];
  if (unstaged.length) {
    out += "Changes not staged for commit:\n";
    out += '  (use "git add <file>..." to update what will be committed)\n';
    out += '  (use "git restore <file>..." to discard changes in working directory)\n';
    out += unstaged.join("") + "\n";
  }

  if (s.untracked.length) {
    out += "Untracked files:\n";
    out += '  (use "git add <file>..." to include in what will be committed)\n';
    out += s.untracked.map((f) => `\t${f}\n`).join("") + "\n";
  }

  if (staged.length === 0) {
    if (unstaged.length > 0) {
      out += 'no changes added to commit (use "git add" and/or "git commit -a")\n';
    } else if (s.untracked.length > 0) {
      out += 'nothing added to commit but untracked files present (use "git add" to track)\n';
    } else if (s.hasCommits) {
      out += "nothing to commit, working tree clean\n";
    } else {
      out += 'nothing to commit (create/copy files and use "git add" to track)\n';
    }
  }
  return out;
}

/** ` 2 files changed, 28 insertions(+)` — git's shortstat line (capture-verified). */
export function renderShortStat(stats: DiffStatEntry[]): string {
  const files = stats.length;
  const ins = stats.reduce((a, s) => a + s.ins, 0);
  const del = stats.reduce((a, s) => a + s.del, 0);
  let out = ` ${files} file${files === 1 ? "" : "s"} changed`;
  if (ins === 0 && del === 0) return out + ", 0 insertions(+), 0 deletions(-)\n";
  if (ins > 0) out += `, ${ins} insertion${ins === 1 ? "" : "s"}(+)`;
  if (del > 0) out += `, ${del} deletion${del === 1 ? "" : "s"}(-)`;
  return out + "\n";
}

/** ` create mode 100644 <file>` lines for newly added files (sorted, capture-verified). */
export function renderCreateModes(stats: DiffStatEntry[]): string {
  return stats
    .filter((s) => s.created)
    .map((s) => ` create mode 100644 ${s.path}\n`)
    .join("");
}

/** Per-file `name | count bars` block as printed by `git merge` fast-forward. */
export function renderDiffStatBars(stats: DiffStatEntry[]): string {
  const sorted = [...stats].sort((a, b) => (a.path < b.path ? -1 : 1));
  const nameWidth = Math.max(...sorted.map((s) => s.path.length));
  const countWidth = Math.max(...sorted.map((s) => String(s.ins + s.del).length));
  return sorted
    .map((s) => {
      const bars = "+".repeat(s.ins) + "-".repeat(s.del);
      return ` ${s.path.padEnd(nameWidth)} | ${String(s.ins + s.del).padStart(countWidth)} ${bars}\n`;
    })
    .join("");
}

export function renderCommit(
  branch: string,
  sha: string,
  subject: string,
  rootCommit: boolean,
  stats: DiffStatEntry[],
): string {
  const head = `[${branch}${rootCommit ? " (root-commit)" : ""} ${sha.slice(0, 7)}] ${subject}\n`;
  return head + renderShortStat(stats) + renderCreateModes(stats);
}

export function renderLogOneline(entries: LogEntry[], graph: boolean): string {
  // Linear history renders as `* ` rows under --graph (capture m05-git-log-graph[-merged]).
  return entries.map((e) => `${graph ? "* " : ""}${e.oid.slice(0, 7)} ${e.subject}\n`).join("");
}

export function renderBranchList(branches: string[], current: string): string {
  return [...branches]
    .sort()
    .map((b) => `${b === current ? "* " : "  "}${b}\n`)
    .join("");
}

/** `git switch` talks on stderr (capture m05-git-switch-*). */
export function renderSwitch(branch: string, created: boolean): string {
  return created ? `Switched to a new branch '${branch}'\n` : `Switched to branch '${branch}'\n`;
}

export function renderMergeFastForward(fromSha: string, toSha: string, stats: DiffStatEntry[]): string {
  return (
    `Updating ${fromSha.slice(0, 7)}..${toSha.slice(0, 7)}\n` +
    "Fast-forward\n" +
    renderDiffStatBars(stats) +
    renderShortStat(stats) +
    renderCreateModes(stats)
  );
}

export function renderAlreadyUpToDate(): string {
  return "Already up to date.\n";
}

// ---- line-diff counting (insertions/deletions for diffstat) -----------------------------

/** Lines of a blob the way git counts them (trailing unterminated line counts as one). */
export function countLines(text: string): number {
  if (text === "") return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

/** Minimal LCS line diff → {ins, del}; lab-scale files only (quadratic, intentionally simple). */
export function diffLineCounts(a: string, b: string): { ins: number; del: number } {
  const A = a === "" ? [] : a.replace(/\n$/, "").split("\n");
  const B = b === "" ? [] : b.replace(/\n$/, "").split("\n");
  const m = A.length;
  const n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = dp[m][n];
  return { ins: n - lcs, del: m - lcs };
}
