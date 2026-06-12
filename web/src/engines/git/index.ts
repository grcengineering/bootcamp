/**
 * Git engine adapter — isomorphic-git over an in-memory fs, with synthesized porcelain
 * (web ISA ISC-66; honest class: synthesized-porcelain-over-real-plumbing).
 *
 *  - State semantics (objects, refs, index, trees, SHAs) are REAL: isomorphic-git.
 *  - CLI text is synthesized by porcelain.ts, templated from real-git captures
 *    (.ci/fixtures/captured/m05-git-*.json) and byte-verified for the scripted
 *    module-05 reference flow. SHAs are pinned: identical author/committer identity +
 *    timestamps reproduce the real captures' commit ids exactly.
 *  - Learner free-form flows are verified by REPO STATE (branches, head, file contents,
 *    log shape) via the probe surface below — never by string-matching synthesized text.
 *  - Sim boundaries are explicit: unsupported subcommands and non-fast-forward merges
 *    return labeled lab-boundary messages, never invented git output.
 */
import * as git from "isomorphic-git";
import { type EngineAdapter, type EngineRunResult, errorMessage } from "../adapters";
import { MemFs } from "./memfs";
import {
  countLines,
  diffLineCounts,
  renderAlreadyUpToDate,
  renderBranchList,
  renderCommit,
  renderInit,
  renderLogOneline,
  renderMergeFastForward,
  renderStatus,
  renderSwitch,
  type DiffStatEntry,
  type LogEntry,
  type StatusState,
} from "./porcelain";
import { GIT_IDENTITY } from "./referenceFlow";

export interface GitClock {
  (): { timestamp: number; timezoneOffset: number };
}

export interface GitAdapterOptions {
  /** Worktree directory inside the VFS (default: the module-05 lab dir). */
  dir?: string;
  /** Commit identity (default: the module canon, analyst@workstation). */
  author?: { name: string; email: string };
  /** Commit-time clock — injected so the sim epoch (ISC-132) owns time, not Date.now. */
  clock?: GitClock;
}

export interface GitRepoState {
  branch: string | undefined;
  branches: string[];
  headSha: string | null;
  /** Newest-first commit log: oid + subject + parent count. */
  commits: Array<{ oid: string; subject: string; parents: number }>;
}

const dec = new TextDecoder();

function subjectOf(message: string): string {
  return message.split("\n")[0];
}

export class GitEngineAdapter implements EngineAdapter {
  readonly id = "git";
  readonly fs = new MemFs();
  readonly dir: string;
  private author: { name: string; email: string };
  private clock: GitClock;

  constructor(opts: GitAdapterOptions = {}) {
    this.dir = opts.dir ?? "/home/analyst/lab05";
    this.author = opts.author ?? { ...GIT_IDENTITY };
    this.clock = opts.clock ?? (() => ({ timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 }));
    this.fs.mkdirp(this.dir);
  }

  /** isomorphic-git is bundled JS — nothing to fetch; kept for interface uniformity. */
  async load(): Promise<void> {}

  setClock(clock: GitClock): void {
    this.clock = clock;
  }

  /** Write a worktree file (learner edit; the Lab Player routes editor saves here). */
  writeFile(path: string, content: string): void {
    const full = path.startsWith("/") ? path : `${this.dir}/${path}`;
    const parent = full.slice(0, full.lastIndexOf("/"));
    this.fs.mkdirp(parent);
    this.fs.writeFile(full, content);
  }

  /** Probe: read a worktree file (null when absent). */
  readFile(path: string): string | null {
    const full = path.startsWith("/") ? path : `${this.dir}/${path}`;
    if (!this.fs.exists(full)) return null;
    return this.fs.readFile(full, "utf8") as string;
  }

  /** Probe surface for state-based verifiers (free-form learner flows — ISC-66). */
  async state(): Promise<GitRepoState> {
    const branch = ((await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) ?? undefined) as
      | string
      | undefined;
    const branches = await git.listBranches({ fs: this.fs, dir: this.dir });
    let headSha: string | null = null;
    try {
      headSha = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
    } catch {
      headSha = null;
    }
    const commits: GitRepoState["commits"] = [];
    if (headSha) {
      for (const c of await git.log({ fs: this.fs, dir: this.dir })) {
        commits.push({ oid: c.oid, subject: subjectOf(c.commit.message), parents: c.commit.parent.length });
      }
    }
    return { branch, branches, headSha, commits };
  }

  /**
   * Execute one `git …` command line. `files` are worktree writes applied first
   * (uniform adapter contract — the terminal/editor surface uses writeFile directly).
   */
  async run(input: string, files?: Record<string, string>): Promise<EngineRunResult> {
    for (const [p, content] of Object.entries(files ?? {})) this.writeFile(p, content);
    const argv = tokenize(input);
    if (argv[0] !== "git") {
      return boundary(`lab git surface: expected a git command, got '${argv[0] ?? ""}'`);
    }
    if (argv[1] !== "init" && !this.fs.exists(`${this.dir}/.git`)) {
      // real-git text, captured locally on git 2.50.1 (`git status` in an empty dir)
      return {
        stdout: "",
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        exit: 128,
      };
    }
    try {
      switch (argv[1]) {
        case "init":
          return await this.init();
        case "status":
          return await this.status();
        case "add":
          return await this.add(argv.slice(2));
        case "commit":
          return await this.commit(argv.slice(2));
        case "log":
          return await this.log(argv.slice(2));
        case "branch":
          return await this.branchList();
        case "switch":
          return await this.switch(argv.slice(2));
        case "merge":
          return await this.merge(argv.slice(2));
        default:
          return boundary(
            `lab git surface: '${argv[1] ?? ""}' isn't part of this exercise ` +
              "(supported: init, status, add, commit, log, branch, switch, merge — the full CLI lives in the real-machine lab)",
          );
      }
    } catch (e) {
      return { stdout: "", stderr: `fatal: ${errorMessage(e)}\n`, exit: 128 };
    }
  }

  private async init(): Promise<EngineRunResult> {
    await git.init({ fs: this.fs, dir: this.dir, defaultBranch: "main" });
    return { stdout: renderInit(`${this.dir}/.git/`), stderr: "", exit: 0 };
  }

  private async hasCommits(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
      return true;
    } catch {
      return false;
    }
  }

  private async statusState(): Promise<StatusState> {
    const branch =
      ((await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) as string | undefined) ?? "main";
    const hasCommits = await this.hasCommits();
    const rows = await git.statusMatrix({ fs: this.fs, dir: this.dir });
    const s: StatusState = {
      branch,
      hasCommits,
      stagedNew: [],
      stagedModified: [],
      stagedDeleted: [],
      unstagedModified: [],
      unstagedDeleted: [],
      untracked: [],
    };
    for (const [filepath, head, workdir, stage] of rows) {
      if (head === 0 && workdir === 2 && stage === 0) s.untracked.push(filepath);
      else if (head === 0 && stage >= 2) {
        s.stagedNew.push(filepath);
        if (stage === 3) s.unstagedModified.push(filepath);
      } else if (head === 1 && workdir === 0 && stage === 0) s.stagedDeleted.push(filepath);
      else if (head === 1 && workdir === 0 && stage === 1) s.unstagedDeleted.push(filepath);
      else if (head === 1 && stage >= 2) {
        s.stagedModified.push(filepath);
        if (stage === 3) s.unstagedModified.push(filepath);
      } else if (head === 1 && workdir === 2 && stage === 1) s.unstagedModified.push(filepath);
    }
    return s;
  }

  private async status(): Promise<EngineRunResult> {
    return { stdout: renderStatus(await this.statusState()), stderr: "", exit: 0 };
  }

  private async add(paths: string[]): Promise<EngineRunResult> {
    if (paths.length === 0) {
      return boundary("Nothing specified, nothing added.", 1);
    }
    for (const p of paths) {
      const full = `${this.dir}/${p}`;
      if (this.fs.exists(full)) await git.add({ fs: this.fs, dir: this.dir, filepath: p });
      else await git.remove({ fs: this.fs, dir: this.dir, filepath: p });
    }
    return { stdout: "", stderr: "", exit: 0 };
  }

  private async commit(args: string[]): Promise<EngineRunResult> {
    const mIdx = args.indexOf("-m");
    const message = mIdx >= 0 ? args[mIdx + 1] : undefined;
    if (!message) {
      return boundary("lab git surface: commit requires -m \"<message>\" (no editor in the sim)", 1);
    }
    const staged = await this.statusState();
    if (staged.stagedNew.length + staged.stagedModified.length + staged.stagedDeleted.length === 0) {
      return { stdout: renderStatus(staged), stderr: "", exit: 1 };
    }
    const when = this.clock();
    const sha = await git.commit({
      fs: this.fs,
      dir: this.dir,
      message,
      author: { ...this.author, ...when },
      committer: { ...this.author, ...when },
    });
    const [head] = await git.log({ fs: this.fs, dir: this.dir, depth: 1 });
    const parent = head.commit.parent[0] ?? null;
    const stats = await this.diffStats(parent, sha);
    const branch =
      ((await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) as string | undefined) ?? "main";
    return {
      stdout: renderCommit(branch, sha, subjectOf(message), parent === null, stats),
      stderr: "",
      exit: 0,
      artifacts: { sha },
    };
  }

  private async log(flags: string[]): Promise<EngineRunResult> {
    if (!(await this.hasCommits())) {
      return {
        stdout: "",
        stderr: `fatal: your current branch '${
          (await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) ?? "main"
        }' does not have any commits yet\n`,
        exit: 128,
      };
    }
    const entries: LogEntry[] = (await git.log({ fs: this.fs, dir: this.dir })).map((c) => ({
      oid: c.oid,
      subject: subjectOf(c.commit.message),
    }));
    if (!flags.includes("--oneline")) {
      return boundary("lab git surface: use git log --oneline (the long form lives in the real-machine lab)", 1);
    }
    return { stdout: renderLogOneline(entries, flags.includes("--graph")), stderr: "", exit: 0 };
  }

  private async branchList(): Promise<EngineRunResult> {
    const branches = await git.listBranches({ fs: this.fs, dir: this.dir });
    const current =
      ((await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) as string | undefined) ?? "";
    return { stdout: renderBranchList(branches, current), stderr: "", exit: 0 };
  }

  private async switch(args: string[]): Promise<EngineRunResult> {
    const create = args[0] === "-c";
    const ref = create ? args[1] : args[0];
    if (!ref) return boundary("lab git surface: switch needs a branch name", 1);
    if (create) {
      await git.branch({ fs: this.fs, dir: this.dir, ref, checkout: true });
    } else {
      const branches = await git.listBranches({ fs: this.fs, dir: this.dir });
      if (!branches.includes(ref)) {
        return { stdout: "", stderr: `fatal: invalid reference: ${ref}\n`, exit: 128 };
      }
      await git.checkout({ fs: this.fs, dir: this.dir, ref });
    }
    return { stdout: "", stderr: renderSwitch(ref, create), exit: 0 };
  }

  private async merge(args: string[]): Promise<EngineRunResult> {
    const theirs = args[0];
    if (!theirs) return boundary("lab git surface: merge needs a branch name", 1);
    const ours =
      ((await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) as string | undefined) ?? "main";
    const oldHead = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
    const result = await git.merge({
      fs: this.fs,
      dir: this.dir,
      ours,
      theirs,
      fastForwardOnly: true, // non-FF porcelain is uncaptured — honest boundary below
      author: { ...this.author, ...this.clock() },
    }).catch((e: unknown) => ({ error: errorMessage(e) }));
    if ("error" in result) {
      return boundary(
        `lab git surface: this merge isn't a fast-forward (${result.error}) — three-way merges live in the real-machine lab`,
        1,
      );
    }
    if (result.alreadyMerged) return { stdout: renderAlreadyUpToDate(), stderr: "", exit: 0 };
    await git.checkout({ fs: this.fs, dir: this.dir, ref: ours, force: true });
    const newHead = (await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" })) as string;
    const stats = await this.diffStats(oldHead, newHead);
    return {
      stdout: renderMergeFastForward(oldHead, newHead, stats),
      stderr: "",
      exit: 0,
      artifacts: { from: oldHead, to: newHead },
    };
  }

  /** Tree-diff between two commits (old may be null = root) → diffstat entries. */
  private async diffStats(oldOid: string | null, newOid: string): Promise<DiffStatEntry[]> {
    const stats: DiffStatEntry[] = [];
    const trees = oldOid ? [git.TREE({ ref: oldOid }), git.TREE({ ref: newOid })] : [git.TREE({ ref: newOid })];
    await git.walk({
      fs: this.fs,
      dir: this.dir,
      trees,
      map: async (filepath, entries) => {
        if (filepath === ".") return true;
        const [a, b] = oldOid ? entries! : [null, entries![0]];
        const type = (await (b ?? a)?.type()) as string | undefined;
        if (type !== "blob") return true;
        if (a && b && (await a.oid()) === (await b.oid())) return true;
        const aText = a ? dec.decode((await a.content()) as Uint8Array) : "";
        const bText = b ? dec.decode((await b.content()) as Uint8Array) : "";
        if (!a) stats.push({ path: filepath, ins: countLines(bText), del: 0, created: true });
        else if (!b) stats.push({ path: filepath, ins: 0, del: countLines(aText), created: false });
        else {
          const { ins, del } = diffLineCounts(aText, bText);
          stats.push({ path: filepath, ins, del, created: false });
        }
        return true;
      },
    });
    return stats.sort((x, y) => (x.path < y.path ? -1 : 1));
  }
}

/** Labeled sim-boundary message (honesty rule: never fake unfixtured git output). */
function boundary(message: string, exit = 1): EngineRunResult {
  return { stdout: "", stderr: `${message}\n`, exit };
}

/** Tokenize a git command line, honoring single/double quotes (commit -m "…"). */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
