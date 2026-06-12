/**
 * Git engine acceptance (web ISA ISC-66, class synthesized-porcelain-over-real-plumbing):
 *
 *  1. REFERENCE FLOW — replays the scripted module-05 flow through the isomorphic-git
 *     engine and byte-diffs every porcelain output against REAL git captures
 *     (.ci/fixtures/captured/m05-git-*.json, pinned identity/dates). Commit SHAs must
 *     equal the real captures' SHAs — the object-model honesty proof.
 *  2. FREE-FORM FLOWS — learner-shaped sequences verified by REPO STATE (probe surface),
 *     never by string-matching synthesized text.
 *  3. Boundary honesty — unsupported surface returns labeled lab-boundary messages.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { GitEngineAdapter, tokenize } from "../src/engines/git";
import { MemFs, normalizePath } from "../src/engines/git/memfs";
import {
  countLines,
  diffLineCounts,
  renderShortStat,
  renderStatus,
} from "../src/engines/git/porcelain";
import { COMMIT_1, COMMIT_2, REFERENCE_FLOW, REPO_DIR } from "../src/engines/git/referenceFlow";

const CAPTURES = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/captured");
const DIR = `/home/analyst/${REPO_DIR}`;

interface Capture {
  id: string;
  cmd: string;
  stdout: string;
  stderr: string;
  exit: number;
  provenance: { ground_truth: string; captured_with: string };
}

function capture(id: string): Capture {
  return JSON.parse(readFileSync(join(CAPTURES, `m05-git-${id}.json`), "utf8"));
}

describe("reference flow byte-diffs real-git captures", () => {
  const clockQueue = [COMMIT_1, COMMIT_2];
  const adapter = new GitEngineAdapter({
    dir: DIR,
    clock: () => {
      const c = clockQueue.length > 1 ? clockQueue.shift()! : clockQueue[0];
      return { timestamp: c.timestamp, timezoneOffset: c.timezoneOffset };
    },
  });

  for (const step of REFERENCE_FLOW) {
    test(`m05-git-${step.id}: ${step.cmd}`, async () => {
      const fx = capture(step.id);
      expect(fx.provenance.captured_with).toBe("capture-git.ts v1");
      for (const [path, content] of Object.entries(step.writes ?? {})) adapter.writeFile(path, content);
      const got = await adapter.run(step.cmd);
      const wantStdout = fx.stdout.replace("{{repo_path}}", `${DIR}/.git/`);
      expect(got.stdout).toBe(wantStdout);
      expect(got.stderr).toBe(fx.stderr);
      expect(got.exit).toBe(fx.exit);
    });
  }

  test("commit SHAs equal the real captures' SHAs (object-model proof)", async () => {
    const state = await adapter.state();
    const rootSha = capture("commit-initial").stdout.match(/root-commit\) ([0-9a-f]{7})/)![1];
    const featSha = capture("commit-feature").stdout.match(/malformed ([0-9a-f]{7})/)![1];
    expect(state.commits.map((c) => c.oid.slice(0, 7))).toEqual([featSha, rootSha]);
    expect(state.headSha!.slice(0, 7)).toBe(featSha);
    expect(state.branch).toBe("main");
    expect(state.branches.sort()).toEqual(["handle-malformed", "main"]);
  });
});

describe("free-form learner flows are state-verified", () => {
  test("init → edit → add → commit → state probes", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.load(); // interface uniformity no-op
    expect(await a.run("git init").then((r) => r.exit)).toBe(0);
    // learner takes a different path than the reference: files via run()'s uniform param
    const r = await a.run("git add check.py", { "check.py": "print('ok')\n" });
    expect(r.exit).toBe(0);
    const c = await a.run('git commit -m "My own path"');
    expect(c.exit).toBe(0);
    expect(c.artifacts?.sha).toMatch(/^[0-9a-f]{40}$/);
    const s = await a.state();
    expect(s.commits).toHaveLength(1);
    expect(s.commits[0].subject).toBe("My own path");
    expect(s.commits[0].parents).toBe(0);
    expect(a.readFile("check.py")).toBe("print('ok')\n");
    expect(a.readFile("missing.py")).toBeNull();
  });

  test("modify + delete states appear in status (state mapping)", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.run("git init");
    a.writeFile("a.txt", "one\n");
    a.writeFile("b.txt", "two\n");
    await a.run("git add a.txt b.txt");
    await a.run('git commit -m "seed"');
    a.writeFile("a.txt", "one\nmore\n"); // unstaged modify
    a.fs.unlink(`${a.dir}/b.txt`); // unstaged delete
    const st = await a.run("git status");
    expect(st.stdout).toContain("modified:   a.txt");
    expect(st.stdout).toContain("deleted:    b.txt");
    expect(st.stdout).toContain("no changes added to commit");
    // stage the modification AND the deletion (add routes deletions to git.remove)
    await a.run("git add a.txt b.txt");
    const st2 = await a.run("git status");
    expect(st2.stdout).toContain("Changes to be committed:");
    expect(st2.stdout).toContain('  (use "git restore --staged <file>..." to unstage)\n');
    expect(st2.stdout).toContain("modified:   a.txt");
    expect(st2.stdout).toContain("deleted:    b.txt");
    const c = await a.run('git commit -m "modify and delete"');
    expect(c.stdout).toContain("2 files changed, 1 insertion(+), 1 deletion(-)");
  });

  test("staged-then-modified-again file shows in both lists (stage==3)", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.run("git init");
    a.writeFile("f.txt", "v1\n");
    await a.run("git add f.txt");
    a.writeFile("f.txt", "v2\n");
    const st = await a.run("git status");
    expect(st.stdout).toContain("new file:   f.txt");
    expect(st.stdout).toContain("modified:   f.txt");
  });

  test("merge of an already-merged branch reports Already up to date", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.run("git init");
    await a.run("git add f.txt", { "f.txt": "x\n" });
    await a.run('git commit -m "seed"');
    await a.run("git switch -c feature");
    await a.run("git switch main");
    const r = await a.run("git merge feature");
    expect(r.stdout).toBe("Already up to date.\n");
    expect(r.exit).toBe(0);
  });

  test("commit with nothing staged re-renders status and exits 1 (git behavior)", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.run("git init");
    const r = await a.run('git commit -m "nothing"');
    expect(r.exit).toBe(1);
    expect(r.stdout).toContain("nothing to commit");
  });

  test("switch to a nonexistent branch fails as git fails", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.run("git init");
    await a.run("git add f.txt", { "f.txt": "x\n" });
    await a.run('git commit -m "seed"');
    const r = await a.run("git switch nope");
    expect(r.exit).toBe(128);
    expect(r.stderr).toBe("fatal: invalid reference: nope\n");
  });

  test("log before any commit fails as git fails", async () => {
    const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });
    await a.run("git init");
    const r = await a.run("git log --oneline");
    expect(r.exit).toBe(128);
    expect(r.stderr).toContain("does not have any commits yet");
  });

  test("setClock swaps the commit clock (sim epoch owns time, ISC-132)", async () => {
    const a = new GitEngineAdapter();
    await a.run("git init");
    a.setClock(() => ({ timestamp: 1780304400, timezoneOffset: 0 }));
    await a.run("git add f.txt", { "f.txt": "x\n" });
    const r1 = await a.run('git commit -m "pinned"');
    const b = new GitEngineAdapter({ clock: () => ({ timestamp: 1780304400, timezoneOffset: 0 }) });
    await b.run("git init");
    await b.run("git add f.txt", { "f.txt": "x\n" });
    const r2 = await b.run('git commit -m "pinned"');
    expect(r1.artifacts?.sha).toBe(r2.artifacts?.sha); // determinism under pinned clock
  });
});

describe("boundary honesty (no invented git output)", () => {
  const a = new GitEngineAdapter({ clock: () => ({ timestamp: 1780305000, timezoneOffset: 0 }) });

  test("non-git input names the surface", async () => {
    const r = await a.run("ls -la");
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("expected a git command");
  });

  test("unsupported subcommand routes to the real-machine lab", async () => {
    await a.run("git init");
    const r = await a.run("git rebase main");
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("real-machine lab");
  });

  test("commit without -m is a labeled sim boundary", async () => {
    await a.run("git init");
    const r = await a.run("git commit");
    expect(r.stderr).toContain("commit requires -m");
  });

  test("long-form log is a labeled boundary (uncaptured porcelain)", async () => {
    await a.run("git add f.txt", { "f.txt": "x\n" });
    await a.run('git commit -m "seed"');
    const r = await a.run("git log");
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("--oneline");
  });

  test("non-fast-forward merge is a labeled boundary", async () => {
    await a.run("git switch -c side");
    await a.run("git add s.txt", { "s.txt": "s\n" });
    await a.run('git commit -m "side"');
    await a.run("git switch main");
    await a.run("git add m.txt", { "m.txt": "m\n" });
    await a.run('git commit -m "diverge"');
    const r = await a.run("git merge side");
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("isn't a fast-forward");
  });

  test("add with no paths / switch with no branch / merge with no branch", async () => {
    expect((await a.run("git add")).stderr).toContain("Nothing specified");
    expect((await a.run("git switch")).stderr).toContain("needs a branch name");
    expect((await a.run("git merge")).stderr).toContain("needs a branch name");
  });

  test("commands before git init fail as real git fails", async () => {
    const fresh = new GitEngineAdapter();
    const r = await fresh.run("git add f.txt", { "f.txt": "x\n" });
    expect(r.exit).toBe(128);
    expect(r.stderr).toBe("fatal: not a git repository (or any of the parent directories): .git\n");
  });
});

describe("porcelain helpers", () => {
  test("tokenize honors quotes", () => {
    expect(tokenize('git commit -m "two words"')).toEqual(["git", "commit", "-m", "two words"]);
    expect(tokenize("git commit -m 'single quoted'")).toEqual(["git", "commit", "-m", "single quoted"]);
  });

  test("shortstat plural/singular/zero forms match git", () => {
    expect(renderShortStat([{ path: "a", ins: 1, del: 0, created: true }])).toBe(
      " 1 file changed, 1 insertion(+)\n",
    );
    expect(renderShortStat([{ path: "a", ins: 0, del: 1, created: false }])).toBe(
      " 1 file changed, 1 deletion(-)\n",
    );
    expect(renderShortStat([{ path: "a", ins: 0, del: 0, created: true }])).toBe(
      " 1 file changed, 0 insertions(+), 0 deletions(-)\n",
    );
    expect(
      renderShortStat([
        { path: "a", ins: 2, del: 1, created: false },
        { path: "b", ins: 1, del: 1, created: false },
      ]),
    ).toBe(" 2 files changed, 3 insertions(+), 2 deletions(-)\n");
  });

  test("line counting matches git semantics (unterminated final line counts)", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
  });

  test("diffLineCounts on modification", () => {
    expect(diffLineCounts("a\nb\nc\n", "a\nX\nc\nd\n")).toEqual({ ins: 2, del: 1 });
    expect(diffLineCounts("", "a\n")).toEqual({ ins: 1, del: 0 });
    expect(diffLineCounts("a\n", "")).toEqual({ ins: 0, del: 1 });
  });

  test("status with staged-deletion-only renders the staged section", () => {
    const out = renderStatus({
      branch: "main",
      hasCommits: true,
      stagedNew: [],
      stagedModified: [],
      stagedDeleted: ["gone.txt"],
      unstagedModified: [],
      unstagedDeleted: [],
      untracked: [],
    });
    expect(out).toContain("deleted:    gone.txt");
    expect(out).not.toContain("nothing to commit");
  });
});

describe("memfs contract (isomorphic-git's required errors)", () => {
  const fs = new MemFs();

  test("normalizePath collapses dots and slashes", () => {
    expect(normalizePath("/a/b/../c/./d")).toBe("/a/c/d");
    expect(normalizePath("a//b/")).toBe("/a/b");
  });

  test("ENOENT / EEXIST / ENOTDIR / ENOTEMPTY / EISDIR codes", async () => {
    expect(() => fs.readFile("/nope")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    fs.mkdir("/d");
    expect(() => fs.mkdir("/d")).toThrow(expect.objectContaining({ code: "EEXIST" }));
    expect(() => fs.mkdir("/nope/child")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    fs.writeFile("/d/f", "x");
    expect(() => fs.readdir("/d/f")).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
    expect(() => fs.rmdir("/d")).toThrow(expect.objectContaining({ code: "ENOTEMPTY" }));
    expect(() => fs.rmdir("/d/f")).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
    expect(() => fs.rmdir("/gone")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(() => fs.readFile("/d")).toThrow(expect.objectContaining({ code: "EISDIR" }));
    expect(() => fs.writeFile("/d", "x")).toThrow(expect.objectContaining({ code: "EISDIR" }));
    expect(() => fs.unlink("/d")).toThrow(expect.objectContaining({ code: "EISDIR" }));
    expect(() => fs.unlink("/gone")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(() => fs.stat("/gone")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(() => fs.mkdir("/d/f/x")).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
    expect(() => fs.writeFile("/gone/f", "x")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  test("file/dir/symlink stats + readlink + rename", async () => {
    fs.writeFile("/d/g", "hello");
    const st = fs.stat("/d/g");
    expect(st.isFile()).toBe(true);
    expect(st.isDirectory()).toBe(false);
    expect(st.size).toBe(5);
    expect(fs.stat("/d").isDirectory()).toBe(true);
    fs.symlink("/d/g", "/link");
    expect(fs.stat("/link").isSymbolicLink()).toBe(true);
    expect(fs.readlink("/link")).toBe("/d/g");
    expect(fs.readFile("/link", "utf8")).toBe("hello"); // follows target
    expect(() => fs.readlink("/d/g")).toThrow(expect.objectContaining({ code: "EINVAL" }));
    expect(() => fs.readlink("/gone")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(() => fs.symlink("/x", "/link")).toThrow(expect.objectContaining({ code: "EEXIST" }));
    // rename file and dir (recursive key move)
    fs.rename("/d/g", "/d/h");
    expect(fs.exists("/d/g")).toBe(false);
    expect(fs.readFile("/d/h", "utf8")).toBe("hello");
    fs.rename("/d", "/e");
    expect(fs.readFile("/e/h", "utf8")).toBe("hello");
    expect(() => fs.rename("/gone", "/x")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  test("promises facade round-trips (the surface isomorphic-git consumes)", async () => {
    await fs.promises.mkdir("/p");
    await fs.promises.writeFile("/p/f", "data");
    expect(await fs.promises.readFile("/p/f", "utf8")).toBe("data");
    expect((await fs.promises.readFile("/p/f")) instanceof Uint8Array).toBe(true);
    expect(await fs.promises.readdir("/p")).toEqual(["f"]);
    expect((await fs.promises.stat("/p/f")).isFile()).toBe(true);
    expect((await fs.promises.lstat("/p/f")).isFile()).toBe(true);
    await fs.promises.symlink("/p/f", "/p/l");
    expect(await fs.promises.readlink("/p/l")).toBe("/p/f");
    await fs.promises.rename("/p/f", "/p/g");
    await fs.promises.unlink("/p/g");
    await fs.promises.unlink("/p/l");
    await fs.promises.rmdir("/p");
    expect(fs.exists("/p")).toBe(false);
  });

  test("readdir on root lists top-level entries only", () => {
    const fresh = new MemFs();
    fresh.mkdirp("/a/b");
    fresh.writeFile("/top.txt", "x");
    expect(fresh.readdir("/")).toEqual(["a", "top.txt"]);
    expect(fresh.readdir("/a")).toEqual(["b"]);
  });
});
