/**
 * Engine semantics suite — covers what fixtures cannot (web ISA ISC-35..52, 115..128):
 * interactive stdin (pending/feed/eof/interrupt), history recall, tab completion,
 * snapshot/restore, producedBy provenance, runScriptClean perturbation, zsh glob errors,
 * heredoc continuation, large-output and runaway-loop budget behavior — plus behavioral
 * tests for the taught builtin/coreutil surface.
 */
import { describe, expect, test } from "bun:test";
import { createShellEngine } from "../src/engines/shell";
import type { ShellSession, ShellSessionOptions, ExecResult } from "../src/engines/shell/types";

const engine = createShellEngine();

const EPOCH = "2026-06-01T09:00:00Z";

function mkSession(over: Partial<ShellSessionOptions> = {}): ShellSession {
  return engine.create({
    variant: "bash-linux",
    seed: {
      files: [
        { path: "~/evidence", dir: true },
        { path: "~/evidence/access.csv", content: "user,role\nalice,admin\nbob,viewer\nerin,admin\n" },
        { path: "~/notes.txt", content: "alpha\nbeta\n" },
      ],
      tools: {
        "collect-encryption-status": '#!/usr/bin/env bash\necho "laptop-01: encrypted"\necho "WARN: host db-07 unreachable" >&2\n',
      },
    },
    epoch: EPOCH,
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: "/home/analyst",
    ...over,
  });
}

function drain(r: ExecResult): { stdout: string; stderr: string; exit: number } {
  const stdout = r.events.filter((e) => e.stream === "stdout").map((e) => e.text).join("");
  const stderr = r.events.filter((e) => e.stream === "stderr").map((e) => e.text).join("");
  return { stdout, stderr, exit: r.state === "done" ? r.exit : -1 };
}

function run(s: ShellSession, line: string): { stdout: string; stderr: string; exit: number } {
  let r = s.exec(line);
  if (r.state === "pending") r = s.eof();
  return drain(r);
}

// ---------------------------------------------------------------------------
// pending stdin (ISC-122)
// ---------------------------------------------------------------------------

describe("interactive stdin", () => {
  test("bare cat suspends, echoes fed input, and finishes on EOF with status 0", () => {
    const s = mkSession();
    const r1 = s.exec("cat");
    expect(r1.state).toBe("pending");
    const r2 = s.feedStdin("hello\n");
    expect(r2.state).toBe("pending");
    expect(drain(r2).stdout).toBe("hello\n");
    const r3 = s.eof();
    expect(r3).toEqual({ state: "done", events: [], exit: 0 });
    expect(s.lastExit()).toBe(0);
  });

  test("cat > file collects stdin into the file on EOF", () => {
    const s = mkSession();
    expect(s.exec("cat > collected.txt").state).toBe("pending");
    s.feedStdin("one\n");
    s.feedStdin("two\n");
    const r = s.eof();
    expect(r.state).toBe("done");
    expect(s.readFile("collected.txt")).toBe("one\ntwo\n");
  });

  test("pending pipeline (cat | wc -l) runs with the collected stdin on EOF", () => {
    const s = mkSession();
    expect(s.exec("cat | wc -l").state).toBe("pending");
    s.feedStdin("a\n");
    s.feedStdin("b\n");
    const r = s.eof();
    expect(drain(r)).toEqual({ stdout: "2\n", stderr: "", exit: 0 });
  });

  test("interrupt cancels pending input with a ^C event and exit 130", () => {
    const s = mkSession();
    expect(s.exec("cat").state).toBe("pending");
    const r = s.interrupt();
    expect(r.state).toBe("done");
    expect(drain(r)).toEqual({ stdout: "^C\n", stderr: "", exit: 130 });
    expect(s.lastExit()).toBe(130);
    // session is usable again
    expect(run(s, "echo back")).toEqual({ stdout: "back\n", stderr: "", exit: 0 });
    expect(run(s, "echo $?").stdout).toBe("0\n");
  });

  test("interrupt at an empty prompt sets $? to 130", () => {
    const s = mkSession();
    expect(drain(s.interrupt())).toEqual({ stdout: "^C\n", stderr: "", exit: 130 });
    expect(run(s, "echo $?").stdout).toBe("130\n");
  });

  test("grep with no file argument waits for stdin", () => {
    const s = mkSession();
    expect(s.exec("grep admin").state).toBe("pending");
    s.feedStdin("alice,admin\nbob,viewer\n");
    expect(drain(s.eof())).toEqual({ stdout: "alice,admin\n", stderr: "", exit: 0 });
  });

  test("eof/feedStdin with nothing pending are inert", () => {
    const s = mkSession();
    run(s, "true");
    expect(s.eof()).toEqual({ state: "done", events: [], exit: 0 });
    expect(s.feedStdin("x")).toEqual({ state: "done", events: [], exit: 0 });
  });
});

// ---------------------------------------------------------------------------
// heredocs (ISC-50)
// ---------------------------------------------------------------------------

describe("heredocs", () => {
  test("interactive heredoc creates the file once the delimiter line arrives", () => {
    const s = mkSession();
    expect(s.exec("cat > h.txt << 'EOF'").state).toBe("pending");
    expect(s.feedStdin("line one").state).toBe("pending");
    expect(s.feedStdin("line $HOME").state).toBe("pending");
    const r = s.feedStdin("EOF");
    expect(r.state).toBe("done");
    // quoted delimiter → no expansion in the body
    expect(s.readFile("h.txt")).toBe("line one\nline $HOME\n");
    expect(s.producedBy("h.txt")).toContain("cat > h.txt");
  });

  test("unquoted heredoc delimiter expands variables in the body", () => {
    const s = mkSession();
    s.exec("cat << EOF");
    s.feedStdin("home=$HOME");
    const r = s.feedStdin("EOF");
    expect(drain(r).stdout).toBe("home=/home/analyst\n");
  });

  test("EOF before the delimiter emits the bash warning and still runs", () => {
    const s = mkSession();
    s.exec("cat << EOF");
    s.feedStdin("partial");
    const r = s.eof();
    const d = drain(r);
    expect(d.stderr).toBe("bash: warning: here-document at line 1 delimited by end-of-file (wanted `EOF')\n");
    expect(d.stdout).toBe("partial\n");
    expect(d.exit).toBe(0);
  });

  test("multi-line continuation: incomplete while loop accepts more lines", () => {
    const s = mkSession();
    expect(s.exec("for f in a b c; do").state).toBe("pending");
    expect(s.feedStdin("echo item $f").state).toBe("pending");
    const r = s.feedStdin("done");
    expect(drain(r).stdout).toBe("item a\nitem b\nitem c\n");
  });

  test("EOF mid-continuation is a syntax error like bash", () => {
    const s = mkSession();
    expect(s.exec("while true; do").state).toBe("pending");
    const r = s.eof();
    expect(drain(r).stderr).toBe("bash: syntax error: unexpected end of file\n");
    expect(drain(r).exit).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// history (ISC-44)
// ---------------------------------------------------------------------------

describe("history", () => {
  test("up/down recall walks entries and returns null past the newest", () => {
    const s = mkSession();
    run(s, "echo one");
    run(s, "echo two");
    expect(s.historyUp()).toBe("echo two");
    expect(s.historyUp()).toBe("echo one");
    expect(s.historyUp()).toBe("echo one"); // stays at oldest
    expect(s.historyDown()).toBe("echo two");
    expect(s.historyDown()).toBeNull(); // back at the draft line
    expect(s.history()).toEqual(["echo one", "echo two"]);
  });

  test("empty history returns null; blank lines are not recorded", () => {
    const s = mkSession();
    expect(s.historyUp()).toBeNull();
    expect(s.historyDown()).toBeNull();
    run(s, "   ");
    expect(s.history()).toEqual([]);
  });

  test("history builtin prints numbered entries including itself", () => {
    const s = mkSession();
    run(s, "pwd");
    expect(run(s, "history").stdout).toBe("    1  pwd\n    2  history\n");
  });
});

// ---------------------------------------------------------------------------
// tab completion (ISC-45)
// ---------------------------------------------------------------------------

describe("completion", () => {
  test("command completion offers matching commands and builtins", () => {
    const s = mkSession();
    const r = s.complete("gre");
    expect(r.replacePrefix).toBe("gre");
    expect(r.completions).toContain("grep");
    const r2 = s.complete("ec");
    expect(r2.completions).toContain("echo");
  });

  test("PATH tools (seed scripts) complete as commands", () => {
    const s = mkSession();
    expect(s.complete("collect-enc").completions).toEqual(["collect-encryption-status"]);
  });

  test("path completion lists matching entries with trailing slash on dirs", () => {
    const s = mkSession();
    const r = s.complete("cat ev");
    expect(r.replacePrefix).toBe("ev");
    expect(r.completions).toEqual(["evidence/"]);
    const r2 = s.complete("cat evidence/ac");
    expect(r2.completions).toEqual(["evidence/access.csv"]);
  });

  test("command position resets after pipes and separators", () => {
    const s = mkSession();
    expect(s.complete("cat access.csv | gr").completions).toContain("grep");
    expect(s.complete("true && ech").completions).toContain("echo");
  });

  test("hidden files only complete when the prefix starts with a dot", () => {
    const s = mkSession();
    run(s, "touch .secret visible.txt");
    expect(s.complete("cat .se").completions).toEqual([".secret"]);
    expect(s.complete("cat ").completions).not.toContain(".secret");
  });

  test("nonexistent directory yields no completions", () => {
    const s = mkSession();
    expect(s.complete("cat nosuch/pre").completions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// snapshot / restore (ISC-92/135)
// ---------------------------------------------------------------------------

describe("snapshot/restore", () => {
  test("full session state round-trips through snapshot()", () => {
    const s = mkSession();
    run(s, "cd evidence");
    run(s, "export AUDIT_TAG=q2-review");
    run(s, "echo finding > finding.txt");
    run(s, "false");
    const snap = s.snapshot();
    expect(snap.version).toBe(1);
    expect(snap.elapsedMs).toBeGreaterThanOrEqual(0);

    const r = engine.restore(JSON.parse(JSON.stringify(snap)), {
      variant: "bash-linux",
      seed: { files: [], tools: {} },
      epoch: EPOCH,
      cols: 80,
      user: "analyst",
      host: "workstation",
      home: "/home/analyst",
    });
    expect(r.prompt()).toBe("analyst@workstation:~/evidence$ ");
    expect(r.readFile("finding.txt")).toBe("finding\n");
    expect(r.producedBy("finding.txt")).toBe("echo finding > finding.txt");
    expect(r.history()).toEqual(s.history());
    expect(r.lastExit()).toBe(1);
    expect(run(r, "echo $AUDIT_TAG").stdout).toBe("q2-review\n");
    // cd - still knows the previous directory across the restore
    expect(run(r, "cd -").stdout).toBe("/home/analyst\n");
  });
});

// ---------------------------------------------------------------------------
// session extensions: cols, editor writes, lab-file restore (ISC-117/123)
// ---------------------------------------------------------------------------

describe("session extensions", () => {
  test("setCols re-parameterizes ls columnization live (ISC-123)", () => {
    const s = mkSession();
    run(s, "mkdir lab && cd lab && touch alpha.txt beta.txt gamma-longer-name.txt delta.txt");
    expect(run(s, "ls").stdout).toBe("alpha.txt  beta.txt  delta.txt\tgamma-longer-name.txt\n"); // GNU tab fill at col 32
    s.setCols(45);
    expect(run(s, "ls").stdout).toBe("alpha.txt  delta.txt\nbeta.txt   gamma-longer-name.txt\n");
  });

  test("writeFileAs stores editor output with honest provenance", () => {
    const s = mkSession();
    s.writeFileAs!("draft.txt", "edited in nano\n", "nano draft.txt");
    expect(s.readFile("draft.txt")).toBe("edited in nano\n");
    expect(s.producedBy("draft.txt")).toBe("nano draft.txt");
    expect(run(s, "cat draft.txt").stdout).toBe("edited in nano\n");
  });

  test("reseedFiles restores lab files without touching history, cwd, or learner files (ISC-117)", () => {
    const s = mkSession();
    run(s, "cd evidence");
    run(s, "echo corrupted > access.csv");
    run(s, "echo mine > my-work.txt");
    run(s, "rm ../notes.txt");
    const historyBefore = s.history();
    s.reseedFiles!({
      files: [
        { path: "~/evidence", dir: true },
        { path: "~/evidence/access.csv", content: "user,role\nalice,admin\nbob,viewer\nerin,admin\n" },
        { path: "~/notes.txt", content: "alpha\nbeta\n" },
      ],
      tools: { "lab-tool": "#!/usr/bin/env bash\necho restored-tool\n" },
    });
    expect(s.readFile("access.csv")).toBe("user,role\nalice,admin\nbob,viewer\nerin,admin\n");
    expect(s.readFile("/home/analyst/notes.txt")).toBe("alpha\nbeta\n");
    expect(s.readFile("my-work.txt")).toBe("mine\n"); // learner work preserved
    expect(s.history()).toEqual(historyBefore); // history untouched
    expect(s.prompt()).toBe("analyst@workstation:~/evidence$ "); // cwd untouched
    expect(s.producedBy("access.csv")).toBeNull(); // stale provenance cleared
    expect(run(s, "lab-tool").stdout).toBe("restored-tool\n");
  });
});

// ---------------------------------------------------------------------------
// producedBy provenance (ISC-126)
// ---------------------------------------------------------------------------

describe("producedBy provenance", () => {
  test("redirection records the exact input line", () => {
    const s = mkSession();
    run(s, "echo alpha > direct.txt");
    expect(s.producedBy("direct.txt")).toBe("echo alpha > direct.txt");
    expect(s.producedBy("/home/analyst/direct.txt")).toBe("echo alpha > direct.txt");
  });

  test("pipelines and stderr redirects record the full composed line", () => {
    const s = mkSession();
    const line = "cat evidence/access.csv | grep admin | wc -l > count.txt 2> errs.log";
    run(s, line);
    expect(s.producedBy("count.txt")).toBe(line);
    expect(s.producedBy("errs.log")).toBe(line);
    expect(s.readFile("count.txt")).toBe("2\n");
  });

  test("tool-mediated writes (tee, cp, mv, touch) record provenance", () => {
    const s = mkSession();
    run(s, "echo x | tee teed.txt");
    expect(s.producedBy("teed.txt")).toBe("echo x | tee teed.txt");
    run(s, "cp teed.txt copied.txt");
    expect(s.producedBy("copied.txt")).toBe("cp teed.txt copied.txt");
    run(s, "mv copied.txt moved.txt");
    expect(s.producedBy("moved.txt")).toBe("mv copied.txt moved.txt");
    run(s, "touch fresh.txt");
    expect(s.producedBy("fresh.txt")).toBe("touch fresh.txt");
    expect(s.producedBy("never-written.txt")).toBeNull();
  });

  test("appending re-records the appending line as the last writer", () => {
    const s = mkSession();
    run(s, "echo one > log.txt");
    run(s, "echo two >> log.txt");
    expect(s.producedBy("log.txt")).toBe("echo two >> log.txt");
    expect(s.readFile("log.txt")).toBe("one\ntwo\n");
  });
});

// ---------------------------------------------------------------------------
// runScriptClean (ISC-127)
// ---------------------------------------------------------------------------

describe("runScriptClean", () => {
  test("a date-contaminated script produces DIFFERENT output across two perturbed runs", () => {
    const s = mkSession();
    run(s, "printf 'date\\n' > clock-dirty.sh");
    const r1 = s.runScriptClean("clock-dirty.sh", []);
    const r2 = s.runScriptClean("clock-dirty.sh", []);
    expect(r1.exit).toBe(0);
    expect(r2.exit).toBe(0);
    expect(r1.stdout).not.toBe(r2.stdout);
  });

  test("an entropy-contaminated script (mktemp) also diverges across runs", () => {
    const s = mkSession();
    run(s, "printf 'mktemp\\n' > tmp-dirty.sh");
    const r1 = s.runScriptClean("tmp-dirty.sh", []);
    const r2 = s.runScriptClean("tmp-dirty.sh", []);
    expect(r1.stdout).not.toBe(r2.stdout);
  });

  test("a deterministic script is byte-identical across perturbed runs", () => {
    const s = mkSession();
    run(s, "printf 'grep -c admin \"$1\"\\n' > stable.sh");
    const r1 = s.runScriptClean("stable.sh", ["evidence/access.csv"]);
    const r2 = s.runScriptClean("stable.sh", ["evidence/access.csv"]);
    expect(r1).toEqual({ stdout: "2\n", stderr: "", exit: 0 });
    expect(r2).toEqual(r1);
  });

  test("clean runs are isolated: writes do not leak into the session VFS", () => {
    const s = mkSession();
    run(s, "printf 'echo leaked > leak.txt\\n' > writer.sh");
    expect(s.runScriptClean("writer.sh", []).exit).toBe(0);
    expect(s.exists("leak.txt")).toBe(false);
  });

  test("perturb:false keeps the session clock (deterministic scripts unaffected)", () => {
    const s = mkSession();
    run(s, "printf 'echo fixed\\n' > fixed.sh");
    expect(s.runScriptClean("fixed.sh", [], { perturb: false })).toEqual({ stdout: "fixed\n", stderr: "", exit: 0 });
  });

  test("missing script reports No such file or directory with exit 127", () => {
    const s = mkSession();
    const r = s.runScriptClean("ghost.sh", []);
    expect(r.exit).toBe(127);
    expect(r.stderr).toBe("bash: ghost.sh: No such file or directory\n");
  });

  test("a runaway script is cut off by the budget in clean runs too", () => {
    const s = mkSession();
    run(s, "printf 'while true; do :; done\\n' > spin.sh");
    const r = s.runScriptClean("spin.sh", []);
    expect(r.exit).toBe(124);
    expect(r.stderr).toContain("grc-lab: script exceeded simulated execution budget");
  });
});

// ---------------------------------------------------------------------------
// globbing variants (ISC-40)
// ---------------------------------------------------------------------------

describe("globbing", () => {
  test("bash: unmatched glob falls back to the literal pattern", () => {
    const s = mkSession();
    expect(run(s, "echo *.does-not-exist")).toEqual({ stdout: "*.does-not-exist\n", stderr: "", exit: 0 });
  });

  test("zsh: unmatched glob errors with `no matches found`", () => {
    const z = mkSession({ variant: "zsh-macos" });
    const r = run(z, "echo *.does-not-exist");
    expect(r.stderr).toBe("zsh: no matches found: *.does-not-exist\n");
    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("");
  });

  test("glob expands sorted, ? and [...] match single characters, dotfiles stay hidden", () => {
    const s = mkSession();
    run(s, "touch b.log a.log c.txt .hidden.log");
    expect(run(s, "echo *.log").stdout).toBe("a.log b.log\n");
    expect(run(s, "echo ?.log").stdout).toBe("a.log b.log\n");
    expect(run(s, "echo [ab].log").stdout).toBe("a.log b.log\n");
    expect(run(s, "echo [!a].log").stdout).toBe("b.log\n");
    expect(run(s, "echo .h*").stdout).toBe(".hidden.log\n");
  });

  test("globs traverse directories and quoted metas stay literal", () => {
    const s = mkSession();
    expect(run(s, "echo evidence/*.csv").stdout).toBe("evidence/access.csv\n");
    expect(run(s, "echo '*.log'").stdout).toBe("*.log\n");
    expect(run(s, "echo */").stdout).toBe("evidence/\n");
  });
});

// ---------------------------------------------------------------------------
// budgets: large output + runaway loops (ISC-123)
// ---------------------------------------------------------------------------

describe("execution budget", () => {
  test("a 10k-line loop completes and returns without hanging", () => {
    const s = mkSession();
    run(s, "printf 'i=0\\nwhile [ $i -lt 10000 ]; do echo line $i; i=$((i+1)); done\\n' > big.sh");
    const r = run(s, "bash big.sh");
    expect(r.exit).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines.length).toBe(10001); // 10k lines + trailing ""
    expect(lines[0]).toBe("line 0");
    expect(lines[9999]).toBe("line 9999");
  });

  test("a runaway while-true loop in a script is cut off with the honest budget message", () => {
    const s = mkSession();
    run(s, "printf 'while true; do :; done\\n' > runaway.sh");
    const r = run(s, "bash runaway.sh");
    expect(r.stderr).toBe("grc-lab: script exceeded simulated execution budget\n");
    expect(r.exit).toBe(124);
  });

  test("an interactive runaway loop is also capped deterministically", () => {
    const s = mkSession();
    const r = run(s, "while true; do true; done");
    expect(r.stderr).toBe("grc-lab: script exceeded simulated execution budget\n");
    expect(r.exit).toBe(124);
    // and the session still works afterwards
    expect(run(s, "echo ok").stdout).toBe("ok\n");
  });
});

// ---------------------------------------------------------------------------
// prompt + navigation (ISC-43/46)
// ---------------------------------------------------------------------------

describe("prompt and cd", () => {
  test("bash prompt abbreviates $HOME and tracks cd live", () => {
    const s = mkSession();
    expect(s.prompt()).toBe("analyst@workstation:~$ ");
    run(s, "cd evidence");
    expect(s.prompt()).toBe("analyst@workstation:~/evidence$ ");
    run(s, "cd /");
    expect(s.prompt()).toBe("analyst@workstation:/$ ");
  });

  test("zsh prompt uses the macOS convention", () => {
    const z = mkSession({ variant: "zsh-macos", host: "mac" });
    expect(z.prompt()).toBe("analyst@mac ~ % ");
    run(z, "cd /tmp");
    expect(z.prompt()).toBe("analyst@mac tmp % ");
    run(z, "cd /");
    expect(z.prompt()).toBe("analyst@mac / % ");
  });

  test("cd with no argument returns home; cd - swaps and prints", () => {
    const s = mkSession();
    run(s, "cd evidence");
    run(s, "cd /tmp");
    expect(run(s, "cd -")).toEqual({ stdout: "/home/analyst/evidence\n", stderr: "", exit: 0 });
    run(s, "cd");
    expect(run(s, "pwd").stdout).toBe("/home/analyst\n");
    expect(run(s, "echo $OLDPWD").stdout).toBe("/home/analyst/evidence\n");
  });

  test("cd to a file and dot-dot navigation", () => {
    const s = mkSession();
    expect(run(s, "cd notes.txt")).toEqual({ stdout: "", stderr: "bash: cd: notes.txt: Not a directory\n", exit: 1 });
    run(s, "cd evidence");
    run(s, "cd ..");
    expect(run(s, "pwd").stdout).toBe("/home/analyst\n");
    run(s, "cd ~/evidence");
    expect(run(s, "pwd").stdout).toBe("/home/analyst/evidence\n");
  });

  test("zsh cd error message uses the zsh form", () => {
    const z = mkSession({ variant: "zsh-macos" });
    expect(run(z, "cd nope").stderr).toBe("cd: no such file or directory: nope\n");
  });
});

// ---------------------------------------------------------------------------
// negative space + sim boundary honesty (ISC-120)
// ---------------------------------------------------------------------------

describe("honest boundaries", () => {
  test("absent commands fail exactly like the pinned box", () => {
    const s = mkSession();
    expect(run(s, "vim")).toEqual({ stdout: "", stderr: "bash: vim: command not found\n", exit: 127 });
    expect(run(s, "python3")).toEqual({ stdout: "", stderr: "bash: python3: command not found\n", exit: 127 });
    const z = mkSession({ variant: "zsh-macos" });
    expect(run(z, "frobnicate").stderr).toBe("zsh: command not found: frobnicate\n");
  });

  test("installed-but-unsimulated commands declare the sim boundary (exit 64), never fake output", () => {
    const s = mkSession();
    const r = run(s, "sed s/a/b/ notes.txt");
    expect(r.stderr).toBe("grc-sim: sed: command is outside this lab's simulated surface — run it on a real machine to explore\n");
    expect(r.exit).toBe(64);
    expect(r.stdout).toBe("");
  });

  test("unimplemented flags on simulated commands declare the boundary", () => {
    const s = mkSession();
    const r = run(s, "ls -t");
    expect(r.stderr).toBe("grc-sim: ls: option -t is outside this lab's simulated surface — run it on a real machine to explore\n");
    expect(r.exit).toBe(64);
    expect(run(s, "ls --color").exit).toBe(64);
    expect(run(s, "uname -a").exit).toBe(64);
    expect(run(s, "date -d yesterday").exit).toBe(64);
  });

  test("--help is served only from captured fixtures", () => {
    const s = mkSession();
    const help = run(s, "grep --help");
    expect(help.stdout).toStartWith("Usage: grep [OPTION]... PATTERNS [FILE]...");
    expect(help.exit).toBe(0);
    expect(run(s, "wc --help").exit).toBe(64); // no fixture → boundary, not invented text
  });

  test("man renders a clearly-labeled CONDENSED page for taught commands only", () => {
    const s = mkSession();
    const r = run(s, "man grep");
    expect(r.stdout).toContain("CONDENSED — curriculum reference, not the full manual");
    expect(r.stdout).toContain("grep - print lines that match patterns");
    expect(r.exit).toBe(0);
    expect(run(s, "man frobnicate")).toEqual({ stdout: "", stderr: "No manual entry for frobnicate\n", exit: 16 });
    expect(run(s, "man").exit).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scripts + exec bits (ISC-42/49)
// ---------------------------------------------------------------------------

describe("script execution", () => {
  test("./script requires the exec bit; chmod +x unlocks it", () => {
    const s = mkSession();
    run(s, "printf '#!/usr/bin/env bash\\necho ran $1\\n' > job.sh");
    expect(run(s, "./job.sh")).toEqual({ stdout: "", stderr: "bash: ./job.sh: Permission denied\n", exit: 126 });
    run(s, "chmod +x job.sh");
    expect(run(s, "./job.sh fast")).toEqual({ stdout: "ran fast\n", stderr: "", exit: 0 });
    expect(run(s, "bash job.sh slow").stdout).toBe("ran slow\n"); // bash path needs no exec bit
  });

  test("numeric and symbolic chmod modes are reflected in ls -l", () => {
    const s = mkSession();
    run(s, "touch m.sh");
    run(s, "chmod 700 m.sh");
    expect(run(s, "ls -l m.sh").stdout).toContain("-rwx------");
    run(s, "chmod 644 m.sh");
    run(s, "chmod u+x,g-r m.sh");
    expect(run(s, "ls -l m.sh").stdout).toContain("-rwx---r--");
    expect(run(s, "chmod bogus m.sh").exit).toBe(1);
    expect(run(s, "chmod 700 ghost").stderr).toBe("chmod: cannot access 'ghost': No such file or directory\n");
  });

  test("executing a directory or missing path fails with bash semantics", () => {
    const s = mkSession();
    expect(run(s, "./evidence")).toEqual({ stdout: "", stderr: "bash: ./evidence: Is a directory\n", exit: 126 });
    expect(run(s, "./nope.sh")).toEqual({ stdout: "", stderr: "bash: ./nope.sh: No such file or directory\n", exit: 127 });
  });

  test("set -e aborts a script at the first failure; set -o pipefail propagates stage failures", () => {
    const s = mkSession();
    run(s, "printf 'set -e\\nfalse\\necho unreachable\\n' > strict.sh");
    const r = run(s, "bash strict.sh");
    expect(r.stdout).toBe("");
    expect(r.exit).toBe(1);
    run(s, "printf 'set -o pipefail\\nfalse | true\\n' > pf.sh");
    expect(run(s, "bash pf.sh").exit).toBe(1);
    run(s, "printf 'false | true\\n' > nopf.sh");
    expect(run(s, "bash nopf.sh").exit).toBe(0);
  });

  test("set -u flags unbound variables; ${VAR:-default} guards them", () => {
    const s = mkSession();
    run(s, "printf 'set -u\\necho \"${MISSING:-fallback}\"\\necho $ALSO_MISSING\\n' > unbound.sh");
    const r = run(s, "bash unbound.sh");
    expect(r.stdout).toBe("fallback\n");
    expect(r.stderr).toBe("bash: ALSO_MISSING: unbound variable\n");
    expect(r.exit).toBe(1);
  });

  test("seed PATH tools run as their script bytes with stream separation", () => {
    const s = mkSession();
    const r = run(s, "collect-encryption-status");
    expect(r.stdout).toBe("laptop-01: encrypted\n");
    expect(r.stderr).toBe("WARN: host db-07 unreachable\n");
  });

  test("recursion is capped honestly", () => {
    const s = mkSession();
    run(s, "printf '#!/usr/bin/env bash\\nbash loop.sh\\n' > loop.sh");
    const r = run(s, "bash loop.sh");
    expect(r.stderr).toContain("maximum simulated script recursion exceeded");
  });

  test("exit propagates its code from a script", () => {
    const s = mkSession();
    run(s, "printf 'echo before\\nexit 3\\necho after\\n' > ex.sh");
    expect(run(s, "bash ex.sh")).toEqual({ stdout: "before\n", stderr: "", exit: 3 });
    expect(run(s, "echo $?").stdout).toBe("3\n");
  });
});

// ---------------------------------------------------------------------------
// expansion, quoting, operators (ISC-35/38/39/47/50)
// ---------------------------------------------------------------------------

describe("expansion and operators", () => {
  test("quoting: single quotes are literal, double quotes expand, backslash escapes", () => {
    const s = mkSession();
    expect(run(s, "echo '$HOME'").stdout).toBe("$HOME\n");
    expect(run(s, 'echo "$HOME"').stdout).toBe("/home/analyst\n");
    expect(run(s, "echo \\$HOME").stdout).toBe("$HOME\n");
    expect(run(s, 'echo "quoted \\" quote"').stdout).toBe('quoted " quote\n');
    expect(run(s, "echo a\\ b").stdout).toBe("a b\n");
  });

  test("variable forms: $VAR, ${VAR}, ${#VAR}, ${VAR:+alt}, ${VAR:=set}", () => {
    const s = mkSession();
    run(s, "export NAME=audit");
    expect(run(s, "echo ${NAME} $NAME").stdout).toBe("audit audit\n");
    expect(run(s, "echo ${#NAME}").stdout).toBe("5\n");
    expect(run(s, "echo ${NAME:+present}").stdout).toBe("present\n");
    expect(run(s, "echo ${EMPTYX:+present}").stdout).toBe("\n");
    run(s, "echo ${ASSIGNED:=defaulted}");
    expect(run(s, "echo $ASSIGNED").stdout).toBe("defaulted\n");
    expect(run(s, "echo ${NOPE-unset-form}").stdout).toBe("unset-form\n");
  });

  test("${VAR:?message} errors honestly", () => {
    const s = mkSession();
    const r = run(s, 'echo "${REQUIRED:?is required}"');
    expect(r.stderr).toBe("bash: REQUIRED: is required\n");
    expect(r.exit).toBe(1);
  });

  test("command substitution and arithmetic expansion", () => {
    const s = mkSession();
    expect(run(s, "echo $(echo nested)").stdout).toBe("nested\n");
    expect(run(s, 'echo "count=$(grep -c admin evidence/access.csv)"').stdout).toBe("count=2\n");
    expect(run(s, "echo $((2 + 3 * 4))").stdout).toBe("14\n");
    expect(run(s, "echo $(( (10 - 4) / 3 ))").stdout).toBe("2\n");
    expect(run(s, "x=7; echo $((x % 4)) $((x > 3)) $((x == 7 && 1))").stdout).toBe("3 1 1\n");
  });

  test("&&, ||, ; sequencing with short-circuit", () => {
    const s = mkSession();
    expect(run(s, "true && echo yes").stdout).toBe("yes\n");
    expect(run(s, "false && echo no").stdout).toBe("");
    expect(run(s, "false || echo rescued").stdout).toBe("rescued\n");
    expect(run(s, "true || echo skipped").stdout).toBe("");
    expect(run(s, "echo a; false; echo b")).toEqual({ stdout: "a\nb\n", stderr: "", exit: 0 });
    expect(run(s, "false; echo $?").stdout).toBe("1\n");
    expect(run(s, "! false").exit).toBe(0);
    expect(run(s, "! true").exit).toBe(1);
  });

  test("redirections: 2>, 2>&1, >&2, < — against the VFS", () => {
    const s = mkSession();
    run(s, "collect-encryption-status > out.txt 2> err.txt");
    expect(s.readFile("out.txt")).toBe("laptop-01: encrypted\n");
    expect(s.readFile("err.txt")).toBe("WARN: host db-07 unreachable\n");
    expect(run(s, "collect-encryption-status 2>&1 | wc -l").stdout).toBe("2\n");
    expect(run(s, "wc -l < notes.txt").stdout).toBe("2\n");
    expect(run(s, "wc -l < ghost.txt")).toEqual({ stdout: "", stderr: "bash: ghost.txt: No such file or directory\n", exit: 1 });
    const r = run(s, "echo to-err >&2");
    expect(r.stderr).toBe("to-err\n");
    expect(r.stdout).toBe("");
    expect(run(s, "echo x > evidence").stderr).toBe("bash: evidence: Is a directory\n");
    expect(run(s, "echo x 2>&7").stderr).toBe("bash: 7: Bad file descriptor\n");
  });

  test("a failed command with output redirection still creates (truncates) the file", () => {
    const s = mkSession();
    run(s, "echo old > t.txt");
    run(s, "false > t.txt");
    expect(s.readFile("t.txt")).toBe("");
  });

  test("if/elif/else, until, case with alternatives and globs", () => {
    const s = mkSession();
    expect(run(s, "if test -f notes.txt; then echo file; else echo nofile; fi").stdout).toBe("file\n");
    expect(run(s, "if [ -d notes.txt ]; then echo d; elif [ -f notes.txt ]; then echo f; else echo none; fi").stdout).toBe("f\n");
    expect(run(s, "n=0; until [ $n -ge 2 ]; do echo tick $n; n=$((n+1)); done").stdout).toBe("tick 0\ntick 1\n");
    expect(run(s, "case hello.txt in *.csv) echo csv;; *.txt|*.md) echo text;; *) echo other;; esac").stdout).toBe("text\n");
    expect(run(s, "case zzz in (a) echo a;; esac").stdout).toBe("");
  });

  test("subshells isolate variables and cwd; groups do not", () => {
    const s = mkSession();
    expect(run(s, "(cd /tmp; pwd); pwd").stdout).toBe("/tmp\n/home/analyst\n");
    run(s, "V=outer; (V=inner; true)");
    expect(run(s, "echo $V").stdout).toBe("outer\n");
    expect(run(s, "{ echo grouped; } > grp.txt").exit).toBe(0);
    expect(s.readFile("grp.txt")).toBe("grouped\n");
  });

  test("positional parameters: $1..$9, $#, $@, shift", () => {
    const s = mkSession();
    run(s, "printf 'echo n=$# first=$1 second=$2\\nfor a in \"$@\"; do echo arg:$a; done\\nshift\\necho now=$1\\n' > pos.sh");
    const r = run(s, "bash pos.sh one two");
    expect(r.stdout).toBe("n=2 first=one second=two\narg:one\narg:two\nnow=two\n");
  });

  test("tilde expansion and assignment-prefixed commands", () => {
    const s = mkSession();
    expect(run(s, "echo ~").stdout).toBe("/home/analyst\n");
    expect(run(s, "ls ~/evidence").stdout).toBe("access.csv\n");
    expect(run(s, "TAG=tmp env | grep -c '^TAG='").stdout).toBe("1\n");
    expect(run(s, "echo $TAG").stdout).toBe("\n"); // prefix assignment does not persist
    run(s, "PERSIST=yes");
    expect(run(s, "echo $PERSIST").stdout).toBe("yes\n");
  });

  test("syntax errors surface as exit 2", () => {
    const s = mkSession();
    const r = run(s, "echo |");
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("syntax error");
    expect(run(s, "fi").exit).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// builtins (ISC-44/48 + taught surface)
// ---------------------------------------------------------------------------

describe("builtins", () => {
  test("echo -n / -e flag handling", () => {
    const s = mkSession();
    expect(run(s, "echo -n no-newline").stdout).toBe("no-newline");
    expect(run(s, "echo -e 'a\\tb\\nc'").stdout).toBe("a\tb\nc\n");
    expect(run(s, "echo 'a\\tb'").stdout).toBe("a\\tb\n"); // no -e → literal
    expect(run(s, "echo -e 'stop\\chere'").stdout).toBe("stop");
    expect(run(s, "echo -e '\\060\\061'").stdout).toBe("01\n");
  });

  test("printf %s %d width/precision and escape handling", () => {
    const s = mkSession();
    expect(run(s, "printf '%s-%s\\n' a b").stdout).toBe("a-b\n");
    expect(run(s, "printf '%d\\n' 42").stdout).toBe("42\n");
    expect(run(s, "printf '%5d|%-5s|%05d\\n' 7 ab 7").stdout).toBe("    7|ab   |00007\n");
    expect(run(s, "printf '%x %X %o %c %.2s\\n' 255 255 8 hello world").stdout).toBe("ff FF 10 h wo\n");
    expect(run(s, "printf '%s\\n' a b").stdout).toBe("a\nb\n"); // format cycles
    expect(run(s, "printf 'static\\n' ignored").stdout).toBe("static\n");
    expect(run(s, "printf '%%\\n'").stdout).toBe("%\n");
    const bad = run(s, "printf '%d\\n' notanumber");
    expect(bad.stdout).toBe("0\n");
    expect(bad.stderr).toContain("invalid number");
    expect(run(s, "printf").exit).toBe(2);
  });

  test("test/[ ]: file checks, string checks, numeric comparisons, negation", () => {
    const s = mkSession();
    expect(run(s, "test -f notes.txt").exit).toBe(0);
    expect(run(s, "test -d notes.txt").exit).toBe(1);
    expect(run(s, "test -d evidence").exit).toBe(0);
    expect(run(s, "test -e evidence").exit).toBe(0);
    expect(run(s, "test -x evidence").exit).toBe(0);
    run(s, "touch plain.txt");
    expect(run(s, "test -x plain.txt").exit).toBe(1);
    expect(run(s, "test -s notes.txt").exit).toBe(0);
    expect(run(s, "test -s plain.txt").exit).toBe(1);
    expect(run(s, "test -z ''").exit).toBe(0);
    expect(run(s, "test -n ''").exit).toBe(1);
    expect(run(s, "test abc = abc").exit).toBe(0);
    expect(run(s, "test abc != abc").exit).toBe(1);
    expect(run(s, "test 3 -lt 5").exit).toBe(0);
    expect(run(s, "test 5 -le 4").exit).toBe(1);
    expect(run(s, "test 5 -gt 4").exit).toBe(0);
    expect(run(s, "test 5 -ge 6").exit).toBe(1);
    expect(run(s, "test 5 -eq 5").exit).toBe(0);
    expect(run(s, "test 5 -ne 5").exit).toBe(1);
    expect(run(s, "test ! -f notes.txt").exit).toBe(1);
    expect(run(s, "test onearg").exit).toBe(0);
    expect(run(s, "test").exit).toBe(1);
    expect(run(s, "[ -f notes.txt ]").exit).toBe(0);
    expect(run(s, "[ -f notes.txt").stderr).toBe("bash: [: missing `]'\n");
    expect(run(s, "test 5 -lt x").exit).toBe(2);
    expect(run(s, "test a -q b").exit).toBe(2);
    expect(run(s, "test a b c d").exit).toBe(2);
  });

  test("export/unset/env interplay distinguishes exported from shell-local vars", () => {
    const s = mkSession();
    run(s, "LOCAL=1; export SHARED=2");
    expect(run(s, "env | grep -c '^SHARED='").stdout).toBe("1\n");
    expect(run(s, "env | grep -c '^LOCAL='")).toEqual({ stdout: "0\n", stderr: "", exit: 1 });
    run(s, "export LOCAL");
    expect(run(s, "env | grep -c '^LOCAL='").stdout).toBe("1\n");
    run(s, "unset LOCAL SHARED");
    expect(run(s, "env | grep -c '^SHARED='").stdout).toBe("0\n");
  });

  test("clear emits the screen-clear control sequence", () => {
    const s = mkSession();
    expect(run(s, "clear").stdout).toBe("\x1b[H\x1b[2J\x1b[3J");
  });

  test("command -v finds builtins, simulated binaries, and PATH tools", () => {
    const s = mkSession();
    expect(run(s, "command -v cd").stdout).toBe("cd\n");
    expect(run(s, "command -v grep").stdout).toBe("/usr/bin/grep\n");
    expect(run(s, "command -v collect-encryption-status").stdout).toBe("/usr/local/bin/collect-encryption-status\n");
    expect(run(s, "command -v frobnicate").exit).toBe(1);
    expect(run(s, "command echo via-command").stdout).toBe("via-command\n");
  });

  test("bash -c runs an inline program", () => {
    const s = mkSession();
    expect(run(s, "bash -c 'echo inline'").stdout).toBe("inline\n");
    expect(run(s, "bash -c").exit).toBe(2);
    expect(run(s, "bash ghost.sh").exit).toBe(127);
    expect(run(s, "bash").exit).toBe(64); // nested interactive shell = declared boundary
  });

  test("set rejects invalid options", () => {
    const s = mkSession();
    expect(run(s, "set -e; set +e; true").exit).toBe(0);
    expect(run(s, "set bogus").exit).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// coreutils behavior (taught surface)
// ---------------------------------------------------------------------------

describe("coreutils", () => {
  test("ls: -a, -1, errors, and piped output is one-per-line", () => {
    const s = mkSession();
    run(s, "touch zfile");
    expect(run(s, "ls -1").stdout).toBe("evidence\nnotes.txt\nzfile\n");
    expect(run(s, "ls | cat").stdout).toBe("evidence\nnotes.txt\nzfile\n");
    expect(run(s, "ls -a -1").stdout).toBe(".\n..\nevidence\nnotes.txt\nzfile\n");
    expect(run(s, "ls missing-dir")).toEqual({
      stdout: "",
      stderr: "ls: cannot access 'missing-dir': No such file or directory\n",
      exit: 2,
    });
    expect(run(s, "ls notes.txt").stdout).toBe("notes.txt\n");
    const multi = run(s, "ls notes.txt evidence");
    expect(multi.stdout).toBe("notes.txt\n\nevidence:\naccess.csv\n");
  });

  test("ls -l renders symlinks, multiple sizes aligned, and old mtimes with the year format", () => {
    const s = mkSession();
    run(s, "ln -s notes.txt link.txt");
    const r = run(s, "ls -l link.txt");
    expect(r.stdout).toContain("lrwxrwxrwx");
    expect(r.stdout).toContain("link.txt -> notes.txt");
    run(s, "mkdir aged");
    run(s, "touch -d '2020-01-15 12:00:00' aged/old.txt");
    run(s, "printf '0123456789' > aged/new.txt");
    const l = run(s, "ls -l aged");
    expect(l.stdout).toContain("Jan 15  2020 old.txt");
    expect(l.stdout).toContain("Jun  1 09:0"); // sim-now mtime in recent format
    expect(l.stdout).toStartWith("total 4\n");
  });

  test("cat reports missing files and directories", () => {
    const s = mkSession();
    expect(run(s, "cat ghost.txt")).toEqual({ stdout: "", stderr: "cat: ghost.txt: No such file or directory\n", exit: 1 });
    expect(run(s, "cat evidence").stderr).toBe("cat: evidence: Is a directory\n");
    expect(run(s, "cat notes.txt notes.txt").stdout).toBe("alpha\nbeta\nalpha\nbeta\n");
  });

  test("grep: -i, -v, -n, -c, -E, multi-file labels, recursive, and errors", () => {
    const s = mkSession();
    expect(run(s, "grep -i ALICE evidence/access.csv").stdout).toBe("alice,admin\n");
    expect(run(s, "grep -v admin evidence/access.csv").stdout).toBe("user,role\nbob,viewer\n");
    expect(run(s, "grep -n admin evidence/access.csv").stdout).toBe("2:alice,admin\n4:erin,admin\n");
    expect(run(s, "grep -c viewer evidence/access.csv").stdout).toBe("1\n");
    expect(run(s, "grep -E 'al(ice|fa)' evidence/access.csv").stdout).toBe("alice,admin\n");
    expect(run(s, "grep alpha notes.txt evidence/access.csv").stdout).toBe("notes.txt:alpha\n");
    const rec = run(s, "grep -r admin evidence");
    expect(rec.stdout).toBe("evidence/access.csv:alice,admin\nevidence/access.csv:erin,admin\n");
    expect(run(s, "grep x ghost.txt")).toEqual({ stdout: "", stderr: "grep: ghost.txt: No such file or directory\n", exit: 2 });
    expect(run(s, "grep x evidence").stderr).toBe("grep: evidence: Is a directory\n");
    // BRE: + and ( are literal unless escaped; \(..\) groups
    run(s, "printf 'a+b\\n(x)\\n' > meta.txt");
    expect(run(s, "grep 'a+b' meta.txt").stdout).toBe("a+b\n");
    expect(run(s, "grep '(x)' meta.txt").stdout).toBe("(x)\n");
    expect(run(s, "grep '^\\(x\\)$' meta.txt").exit).toBe(1); // group matches bare x, not (x)
    expect(run(s, "grep '^.x.$' meta.txt").stdout).toBe("(x)\n");
  });

  test("wc: GNU bare counts vs BSD padded counts; default triple; file labels", () => {
    const s = mkSession();
    expect(run(s, "wc -l notes.txt").stdout).toBe("2 notes.txt\n");
    expect(run(s, "cat notes.txt | wc -w").stdout).toBe("2\n");
    expect(run(s, "cat notes.txt | wc -c").stdout).toBe("11\n");
    expect(run(s, "cat notes.txt | wc").stdout).toBe("      2       2      11\n");
    expect(run(s, "wc -l notes.txt evidence/access.csv").stdout).toBe(" 2 notes.txt\n 4 evidence/access.csv\n 6 total\n");
    expect(run(s, "wc -l ghost").exit).toBe(1);
    const z = mkSession({ variant: "zsh-macos" });
    expect(run(z, "printf 'one\\n' | wc -l").stdout).toBe("       1\n");
  });

  test("head and tail honor -n in both spellings", () => {
    const s = mkSession();
    run(s, "printf '1\\n2\\n3\\n4\\n5\\n' > nums.txt");
    expect(run(s, "head -n 2 nums.txt").stdout).toBe("1\n2\n");
    expect(run(s, "head -n2 nums.txt").stdout).toBe("1\n2\n");
    expect(run(s, "tail -n 2 nums.txt").stdout).toBe("4\n5\n");
    expect(run(s, "cat nums.txt | head -n 1").stdout).toBe("1\n");
    expect(run(s, "head nums.txt").stdout).toBe("1\n2\n3\n4\n5\n"); // default 10 > file length
    expect(run(s, "head -n x nums.txt").exit).toBe(1);
    expect(run(s, "head ghost.txt").exit).toBe(1);
  });

  test("sort: lexicographic, -r, -n, -u", () => {
    const s = mkSession();
    run(s, "printf 'b\\na\\nc\\na\\n10\\n2\\n' > mix.txt");
    expect(run(s, "sort mix.txt").stdout).toBe("10\n2\na\na\nb\nc\n");
    expect(run(s, "sort -r mix.txt").stdout).toBe("c\nb\na\na\n2\n10\n");
    expect(run(s, "sort -n mix.txt").stdout).toBe("a\na\nb\nc\n2\n10\n");
    expect(run(s, "sort -u mix.txt").stdout).toBe("10\n2\na\nb\nc\n");
  });

  test("uniq: adjacent dedupe, -c counts, -d duplicates-only", () => {
    const s = mkSession();
    run(s, "printf 'a\\na\\nb\\na\\n' > dup.txt");
    expect(run(s, "uniq dup.txt").stdout).toBe("a\nb\na\n");
    expect(run(s, "uniq -c dup.txt").stdout).toBe("      2 a\n      1 b\n      1 a\n");
    expect(run(s, "uniq -d dup.txt").stdout).toBe("a\n");
  });

  test("cut: -d/-f single fields, lists, ranges; pass-through without delimiter", () => {
    const s = mkSession();
    expect(run(s, "cut -d, -f1 evidence/access.csv").stdout).toBe("user\nalice\nbob\nerin\n");
    expect(run(s, "cut -d, -f2 evidence/access.csv | head -n 2").stdout).toBe("role\nadmin\n");
    run(s, "printf 'a,b,c,d\\nnodelim\\n' > fields.txt");
    expect(run(s, "cut -d, -f1,3 fields.txt").stdout).toBe("a,c\nnodelim\n");
    expect(run(s, "cut -d, -f2- fields.txt").stdout).toBe("b,c,d\nnodelim\n");
    expect(run(s, "cut -d, -f-2 fields.txt").stdout).toBe("a,b\nnodelim\n");
    expect(run(s, "cut -f1 fields.txt").stdout).toBe("a,b,c,d\nnodelim\n"); // default TAB delim absent
    expect(run(s, "cut notes.txt").exit).toBe(1);
    expect(run(s, "cut -d, -f bogus notes.txt").exit).toBe(1);
  });

  test("tr: translation, ranges, classes, and -d deletion", () => {
    const s = mkSession();
    expect(run(s, "echo abc | tr a-c A-C").stdout).toBe("ABC\n");
    expect(run(s, "echo hello | tr '[:lower:]' '[:upper:]'").stdout).toBe("HELLO\n");
    expect(run(s, "echo a-b-c | tr -d -- -").stdout).toBe("abc\n");
    expect(run(s, "printf 'a b\\tc' | tr '\\t' ' '").stdout).toBe("a b c");
    expect(run(s, "echo xyz | tr xy a").stdout).toBe("aaz\n"); // short SET2 pads with last char
    expect(run(s, "tr").exit).toBe(1);
    expect(run(s, "echo q | tr -d").exit).toBe(1);
  });

  test("mkdir/rmdir/rm/cp/mv file management with real GNU error shapes", () => {
    const s = mkSession();
    expect(run(s, "mkdir -p a/b/c").exit).toBe(0);
    expect(run(s, "mkdir a").stderr).toBe("mkdir: cannot create directory ‘a’: File exists\n");
    expect(run(s, "mkdir -p a").exit).toBe(0);
    expect(run(s, "mkdir x/y").stderr).toBe("mkdir: cannot create directory ‘x/y’: No such file or directory\n");
    expect(run(s, "mkdir").exit).toBe(1);

    run(s, "echo data > a/b/file.txt");
    expect(run(s, "rm a").stderr).toBe("rm: cannot remove 'a': Is a directory\n");
    expect(run(s, "rm ghost").stderr).toBe("rm: cannot remove 'ghost': No such file or directory\n");
    expect(run(s, "rm -f ghost").exit).toBe(0);
    expect(run(s, "rm -r a").exit).toBe(0);
    expect(s.exists("a")).toBe(false);

    run(s, "mkdir empty nonempty && touch nonempty/f");
    expect(run(s, "rmdir empty").exit).toBe(0);
    expect(run(s, "rmdir nonempty").stderr).toBe("rmdir: failed to remove 'nonempty': Directory not empty\n");
    expect(run(s, "rmdir ghost").exit).toBe(1);

    expect(run(s, "cp notes.txt copy.txt").exit).toBe(0);
    expect(s.readFile("copy.txt")).toBe("alpha\nbeta\n");
    expect(run(s, "cp ghost.txt x.txt").stderr).toBe("cp: cannot stat 'ghost.txt': No such file or directory\n");
    expect(run(s, "cp evidence flat").stderr).toBe("cp: -r not specified; omitting directory 'evidence'\n");
    expect(run(s, "cp -r evidence evidence-copy").exit).toBe(0);
    expect(s.readFile("evidence-copy/access.csv")).toContain("alice,admin");
    run(s, "mkdir dest");
    expect(run(s, "cp notes.txt copy.txt dest").exit).toBe(0);
    expect(s.exists("dest/notes.txt")).toBe(true);
    expect(run(s, "cp notes.txt copy.txt not-a-dir").stderr).toBe("cp: target 'not-a-dir' is not a directory\n");
    expect(run(s, "cp").exit).toBe(1);

    expect(run(s, "mv copy.txt renamed.txt").exit).toBe(0);
    expect(s.exists("copy.txt")).toBe(false);
    expect(s.readFile("renamed.txt")).toBe("alpha\nbeta\n");
    expect(run(s, "mv ghost.txt x").stderr).toBe("mv: cannot stat 'ghost.txt': No such file or directory\n");
    expect(run(s, "mv renamed.txt dest").exit).toBe(0);
    expect(s.exists("dest/renamed.txt")).toBe(true);
    expect(run(s, "mv notes.txt dest/notes.txt not-a-dir").stderr).toBe("mv: target 'not-a-dir' is not a directory\n");
    expect(run(s, "mv").exit).toBe(1);
  });

  test("rm really removes (destructive honesty, ISC-121)", () => {
    const s = mkSession();
    run(s, "rm notes.txt");
    expect(s.exists("notes.txt")).toBe(false);
    expect(run(s, "cat notes.txt").exit).toBe(1);
  });

  test("touch -d sets mtimes; @epoch form works; invalid dates fail", () => {
    const s = mkSession();
    run(s, "touch -d '2024-03-07 10:30:00' stamped.txt");
    expect(run(s, "ls -l stamped.txt").stdout).toContain("Mar  7  2024");
    run(s, "touch -d @1700000000 epoch.txt");
    expect(run(s, "ls -l epoch.txt").stdout).toContain("Nov 14  2023");
    expect(run(s, "touch -d nonsense f.txt").exit).toBe(1);
    expect(run(s, "touch").exit).toBe(1);
    expect(run(s, "touch missing-dir/f.txt").stderr).toBe("touch: cannot touch 'missing-dir/f.txt': No such file or directory\n");
  });

  test("which/env/date/whoami/id/uname/hostname report the declared box", () => {
    const s = mkSession();
    expect(run(s, "which grep").stdout).toBe("/usr/bin/grep\n");
    expect(run(s, "which collect-encryption-status").stdout).toBe("/usr/local/bin/collect-encryption-status\n");
    expect(run(s, "which nope").exit).toBe(1);
    expect(run(s, "env | grep '^HOME='").stdout).toBe("HOME=/home/analyst\n");
    expect(run(s, "env TAG=v env | grep '^TAG='").stdout).toBe("TAG=v\n");
    expect(run(s, "date").stdout).toMatch(/^Mon Jun {2}1 09:00:0\d UTC 2026\n$/);
    expect(run(s, "date +%Y-%m-%d").stdout).toBe("2026-06-01\n");
    expect(run(s, "date '+%F %T %Z'").stdout).toMatch(/^2026-06-01 09:00:0\d UTC\n$/);
    expect(run(s, "date +%s").stdout).toMatch(/^17803044\d\d\n$/);
    expect(run(s, "date +%q").exit).toBe(64); // undocumented-in-sim directive → boundary
    expect(run(s, "whoami").stdout).toBe("analyst\n");
    expect(run(s, "hostname").stdout).toBe("workstation\n");
    expect(run(s, "id").stdout).toBe("uid=1000(analyst) gid=1000(analyst) groups=1000(analyst)\n");
    expect(run(s, "id -u").exit).toBe(64);
    expect(run(s, "uname").stdout).toBe("Linux\n");
    expect(run(s, "uname -s").stdout).toBe("Linux\n");
    expect(run(s, "uname -n").stdout).toBe("workstation\n");
    const z = mkSession({ variant: "zsh-macos" });
    expect(run(z, "uname").stdout).toBe("Darwin\n");
  });

  test("sleep advances the sim clock without real waiting (ISC-132)", () => {
    const s = mkSession();
    const before = run(s, "date +%s").stdout.trim();
    const t0 = Date.now();
    run(s, "sleep 3600");
    expect(Date.now() - t0).toBeLessThan(1000); // no real wait
    const after = run(s, "date +%s").stdout.trim();
    expect(Number(after) - Number(before)).toBeGreaterThanOrEqual(3600);
    expect(run(s, "sleep 2m").exit).toBe(0);
    expect(run(s, "sleep nonsense").exit).toBe(1);
    expect(run(s, "sleep").exit).toBe(1);
  });

  test("file is NOT on the linux box (image-verified negative space); macOS variant classifies", () => {
    const s = mkSession();
    expect(run(s, "file notes.txt")).toEqual({ stdout: "", stderr: "bash: file: command not found\n", exit: 127 });
    const z = mkSession({ variant: "zsh-macos" });
    run(z, "printf '#!/usr/bin/env bash\\necho x\\n' > sc.sh; touch empty.txt");
    expect(run(z, "file evidence").stdout).toBe("evidence: directory\n");
    expect(run(z, "file sc.sh").stdout).toBe("sc.sh: Bourne-Again shell script text executable, ASCII text\n"); // pinned to m03x-file-script capture
    expect(run(z, "file notes.txt").stdout).toBe("notes.txt: ASCII text\n");
    expect(run(z, "file empty.txt").stdout).toBe("empty.txt: empty\n");
    expect(run(z, "file ghost").stdout).toBe("ghost: cannot open `ghost' (No such file or directory)\n");
    run(z, "printf '#!/bin/sh\\n' > shsc.sh");
    expect(run(z, "file shsc.sh").stdout).toBe("shsc.sh: POSIX shell script text executable, ASCII text\n"); // host probe 2026-06-12
    run(z, "printf '#!/usr/bin/env python3\\nprint(1)\\n' > py.py");
    const boundary = run(z, "file py.py");
    expect(boundary.exit).toBe(64); // uncaptured type → honest sim boundary, never invention
  });

  test("ln -s creates working symlinks; duplicates fail", () => {
    const s = mkSession();
    run(s, "ln -s notes.txt alias.txt");
    expect(run(s, "cat alias.txt").stdout).toBe("alpha\nbeta\n");
    expect(run(s, "ln -s notes.txt alias.txt").stderr).toBe("ln: failed to create symbolic link 'alias.txt': File exists\n");
    expect(run(s, "ln notes.txt hard.txt").exit).toBe(64); // hard links: declared boundary
    expect(run(s, "ln -s").exit).toBe(1);
  });

  test("mktemp creates unique paths; -d makes directories", () => {
    const s = mkSession();
    const a = run(s, "mktemp").stdout.trim();
    const b = run(s, "mktemp").stdout.trim();
    expect(a).toMatch(/^\/tmp\/tmp\.[A-Za-z0-9]{10}$/);
    expect(a).not.toBe(b);
    expect(s.exists(a)).toBe(true);
    const d = run(s, "mktemp -d").stdout.trim();
    expect(s.listDir(d)).toEqual([]);
  });

  test("dirname/basename string semantics", () => {
    const s = mkSession();
    expect(run(s, "dirname /a/b/c.txt").stdout).toBe("/a/b\n");
    expect(run(s, "dirname plain").stdout).toBe(".\n");
    expect(run(s, "dirname /top").stdout).toBe("/\n");
    expect(run(s, "basename /a/b/c.txt").stdout).toBe("c.txt\n");
    expect(run(s, "basename /a/b/c.txt .txt").stdout).toBe("c\n");
    expect(run(s, "basename /").stdout).toBe("/\n");
    expect(run(s, "dirname").exit).toBe(1);
    expect(run(s, "basename").exit).toBe(1);
  });

  test("diff: identical exits 0, changes/adds/deletes in normal format", () => {
    const s = mkSession();
    run(s, "printf 'a\\nb\\nc\\n' > f1; printf 'a\\nB\\nc\\nd\\n' > f2; cp f1 f3");
    expect(run(s, "diff f1 f3")).toEqual({ stdout: "", stderr: "", exit: 0 });
    const r = run(s, "diff f1 f2");
    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("2c2\n< b\n---\n> B\n3a4\n> d\n");
    run(s, "printf 'a\\nc\\n' > f4");
    expect(run(s, "diff f1 f4").stdout).toBe("2d1\n< b\n");
    expect(run(s, "diff f1 ghost").exit).toBe(2);
    expect(run(s, "diff f1").exit).toBe(2);
  });

  test("sha256sum matches the FIPS test vectors", () => {
    const s = mkSession();
    expect(run(s, "printf '' | sha256sum").stdout).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  -\n");
    expect(run(s, "printf 'abc' | sha256sum").stdout).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  -\n");
    run(s, "printf 'abc' > vec.txt");
    expect(run(s, "sha256sum vec.txt").stdout).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  vec.txt\n");
    expect(run(s, "sha256sum ghost").exit).toBe(1);
  });

  test("cksum matches the POSIX CRC reference values", () => {
    const s = mkSession();
    expect(run(s, "printf '123456789' | cksum").stdout).toBe("930766865 9\n");
    expect(run(s, "printf '' | cksum").stdout).toBe("4294967295 0\n");
    run(s, "printf '123456789' > crc.txt");
    expect(run(s, "cksum crc.txt").stdout).toBe("930766865 9 crc.txt\n");
    expect(run(s, "cksum ghost").exit).toBe(1);
  });

  test("tee duplicates to stdout and files; -a appends", () => {
    const s = mkSession();
    expect(run(s, "echo data | tee t1 t2").stdout).toBe("data\n");
    expect(s.readFile("t1")).toBe("data\n");
    expect(s.readFile("t2")).toBe("data\n");
    run(s, "echo more | tee -a t1");
    expect(s.readFile("t1")).toBe("data\nmore\n");
    expect(run(s, "echo x | tee missing-dir/t").exit).toBe(1);
  });

  test("tac reverses line order", () => {
    const s = mkSession();
    expect(run(s, "tac notes.txt").stdout).toBe("beta\nalpha\n");
  });

  test("macOS module-03 commands answer only their captured invocations", () => {
    const z = mkSession({ variant: "zsh-macos" });
    expect(run(z, "sw_vers").stdout).toBe("ProductName:\t\tmacOS\nProductVersion:\t\t26.5.1\nBuildVersion:\t\t25F80\n");
    expect(run(z, "csrutil status").stdout).toBe("System Integrity Protection status: enabled.\n");
    expect(run(z, "spctl --status").stdout).toBe("assessments enabled\n");
    expect(run(z, "fdesetup status").stdout).toBe("FileVault is On.\n");
    expect(run(z, "csrutil clear").exit).toBe(64);
    expect(run(z, "spctl --assess").exit).toBe(64);
    expect(run(z, "fdesetup enable").exit).toBe(64);
    expect(run(z, "sw_vers -productVersion").exit).toBe(64);
    // and they do NOT exist on the linux box
    const s = mkSession();
    expect(run(s, "sw_vers").exit).toBe(127);
  });
});

// ---------------------------------------------------------------------------
// edge behaviors (error paths and rarely-hit branches)
// ---------------------------------------------------------------------------

describe("edge behaviors", () => {
  test("echo -e covers the full escape table and unknown escapes stay literal", () => {
    const s = mkSession();
    expect(run(s, "echo -e 'cr\\rbel\\abs\\bff\\fvt\\vbk\\\\'").stdout).toBe("cr\rbel\x07bs\bff\fvt\vbk\\\n");
    expect(run(s, "echo -e 'odd\\q'").stdout).toBe("odd\\q\n");
    expect(run(s, "echo -e 'nul\\0end'").stdout).toBe("nul\0end\n");
    expect(run(s, "echo -E 'plain\\n'").stdout).toBe("plain\\n\n");
  });

  test("printf leaves non-directive percents and unknown format escapes alone (image-verified)", () => {
    const s = mkSession();
    expect(run(s, "printf '100% done\\n'").stdout).toBe("100% done\n");
    // verified on the contract image 2026-06-12: \c and \q in the FORMAT stay literal
    expect(run(s, "printf 'a\\cb-after\\n'").stdout).toBe("a\\cb-after\n");
    expect(run(s, "printf 'x\\qy\\n'").stdout).toBe("x\\qy\n");
  });

  test("test -r/-w report readability/writability of existing files", () => {
    const s = mkSession();
    expect(run(s, "test -r notes.txt").exit).toBe(0);
    expect(run(s, "test -w notes.txt").exit).toBe(0);
    expect(run(s, "test -r ghost").exit).toBe(1);
  });

  test("cat mixes file operands with - for stdin", () => {
    const s = mkSession();
    expect(run(s, "echo from-stdin | cat notes.txt -").stdout).toBe("alpha\nbeta\nfrom-stdin\n");
  });

  test("grep -r descends nested directories in sorted order", () => {
    const s = mkSession();
    run(s, "mkdir evidence/sub && echo deep,admin > evidence/sub/extra.csv");
    const r = run(s, "grep -r admin evidence");
    expect(r.stdout).toBe("evidence/access.csv:alice,admin\nevidence/access.csv:erin,admin\nevidence/sub/extra.csv:deep,admin\n");
  });

  test("set -o/+o pipefail toggles explicitly", () => {
    const s = mkSession();
    run(s, "printf 'set -o pipefail\\nfalse | true; echo rc=$?\\nset +o pipefail\\nfalse | true; echo rc=$?\\n' > toggle.sh");
    expect(run(s, "bash toggle.sh").stdout).toBe("rc=1\nrc=0\n");
  });

  test("flag arguments that need values fail honestly when missing", () => {
    const s = mkSession();
    expect(run(s, "ls -w")).toEqual({ stdout: "", stderr: "ls: option requires an argument -- 'w'\n", exit: 1 });
  });

  test("cat - reads stdin inside a pipeline", () => {
    const s = mkSession();
    expect(run(s, "echo via-dash | cat -").stdout).toBe("via-dash\n");
  });

  test("ls -l link counts include subdirectories", () => {
    const s = mkSession();
    run(s, "mkdir -p outer/inner/leaf && touch outer/inner/file.txt");
    const r = run(s, "ls -l outer");
    expect(r.stdout).toContain("3 analyst analyst"); // inner: 2 + 1 subdir
    expect(r.stdout).toContain("drwxr-xr-x");
  });

  test("grep edge cases: no pattern, invalid -E regex, recursive errors, BRE backslash escapes", () => {
    const s = mkSession();
    expect(run(s, "grep").exit).toBe(2);
    expect(run(s, "grep -E '(' notes.txt")).toEqual({ stdout: "", stderr: "grep: invalid pattern\n", exit: 2 });
    expect(run(s, "grep -r x ghost-dir").exit).toBe(2);
    expect(run(s, "grep -r alpha notes.txt").stdout).toBe("notes.txt:alpha\n"); // -r over a file root
    run(s, "printf 'a.b\\naxb\\n' > dots.txt");
    expect(run(s, "grep 'a\\.b' dots.txt").stdout).toBe("a.b\n"); // escaped dot is literal
    expect(run(s, "grep 'a.b' dots.txt").stdout).toBe("a.b\naxb\n");
  });

  test("rm/chmod/cp/mv operand edge cases", () => {
    const s = mkSession();
    expect(run(s, "rm").exit).toBe(1);
    expect(run(s, "rm -f").exit).toBe(0);
    expect(run(s, "chmod").exit).toBe(1);
    expect(run(s, "cp notes.txt ghostdir/x").stderr).toBe("cp: cannot create regular file 'ghostdir/x': No such file or directory\n");
    expect(run(s, "mv notes.txt ghostdir/x").stderr).toBe("mv: cannot move 'notes.txt' to 'ghostdir/x': No such file or directory\n");
  });

  test("date %% literal percent", () => {
    const s = mkSession();
    expect(run(s, "date +%H%%").stdout).toBe("09%\n");
  });

  test("diff reports trailing deletions", () => {
    const s = mkSession();
    run(s, "printf 'a\\nb\\nc\\n' > long.txt; printf 'a\\n' > short.txt");
    expect(run(s, "diff long.txt short.txt").stdout).toBe("2,3d1\n< b\n< c\n");
    expect(run(s, "diff short.txt long.txt").stdout).toBe("1a2,3\n> b\n> c\n");
  });

  test("syntax errors name the offending token like bash", () => {
    const s = mkSession();
    const r = run(s, "echo > <");
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unexpected token");
    const r2 = run(s, "if true; then echo hi; fi extra");
    expect(r2.exit).toBe(2);
    expect(r2.stderr).toContain("extra");
  });

  test("lexer corner cases: empty heredoc delim, unterminated $(( , arithmetic in quotes", () => {
    const s = mkSession();
    expect(run(s, "echo <<").exit).toBe(2); // missing heredoc delimiter
    expect(run(s, "echo $((1+2)").exit).toBe(2); // `)` where `))` required
    expect(run(s, 'echo "$((2+2))"').stdout).toBe("4\n"); // arithmetic inside double quotes
    expect(run(s, 'echo "$(echo dq) and \\` and \\\\"').stdout).toBe("dq and ` and \\\n");
    expect(run(s, "echo done\\").exit).toBe(2); // dangling line continuation at EOF of input
    expect(run(s, "echo 'unterminated").exit).toBe(2);
    expect(run(s, 'echo "unterminated').exit).toBe(2);
    expect(run(s, "echo line1\\\nline2").stdout).toBe("line1line2\n"); // backslash-newline join
  });

  test("ps/top/seq exist on the box but are outside the simulated surface", () => {
    const s = mkSession();
    expect(run(s, "ps").exit).toBe(64);
    expect(run(s, "top").exit).toBe(64);
    expect(run(s, "seq 3").exit).toBe(64);
    expect(run(s, "which ps").stdout).toBe("/usr/bin/ps\n");
  });
});

// ---------------------------------------------------------------------------
// awk subset
// ---------------------------------------------------------------------------

describe("awk subset", () => {
  test("field extraction, NR/NF, patterns, END totals", () => {
    const s = mkSession();
    expect(run(s, "awk -F, '{print $2}' evidence/access.csv").stdout).toBe("role\nadmin\nviewer\nadmin\n");
    expect(run(s, "awk -F, 'NR == 1 {print $1}' evidence/access.csv").stdout).toBe("user\n");
    expect(run(s, "awk -F, 'NR > 1 { c++ } END { print c }' evidence/access.csv").stdout).toBe("3\n");
    expect(run(s, "awk -F, '$2 == \"admin\"' evidence/access.csv").stdout).toBe("alice,admin\nerin,admin\n");
    expect(run(s, "awk '/admin/ {print NR\": \"$0}' evidence/access.csv").stdout).toBe("2: alice,admin\n4: erin,admin\n");
    expect(run(s, "echo 'a b  c' | awk '{print NF}'").stdout).toBe("3\n");
  });

  test("stderr redirection, next, if/else, functions, operators", () => {
    const s = mkSession();
    run(s, "printf 'ok,1\\nBAD\\nok,2\\n' > rows.csv");
    const r = run(s, "awk -F, 'NF != 2 { print \"WARN: \" $0 > \"/dev/stderr\"; next } { print $2 }' rows.csv");
    expect(r.stdout).toBe("1\n2\n");
    expect(r.stderr).toBe("WARN: BAD\n");
    expect(run(s, "echo 5 | awk '{ if ($1 > 3) print \"big\"; else print \"small\" }'").stdout).toBe("big\n");
    expect(run(s, "echo 2 | awk '{ if ($1 > 3) print \"big\"; else print \"small\" }'").stdout).toBe("small\n");
    expect(run(s, "echo abcdef | awk '{print length($0), substr($0, 2, 3), index($0, \"cd\")}'").stdout).toBe("6 bcd 3\n");
    expect(run(s, "echo MiXeD | awk '{print tolower($0), toupper($0)}'").stdout).toBe("mixed MIXED\n");
    expect(run(s, "echo x | awk '$0 ~ /x/ {print \"match\"} $0 !~ /y/ {print \"nomatch-y\"}'").stdout).toBe("match\nnomatch-y\n");
    expect(run(s, "awk 'BEGIN { print 2*3+1, 10/4, 7%3, -2 }'").stdout).toBe("7 2.5 1 -2\n");
    expect(run(s, "awk -v who=lab 'BEGIN { print \"hi \" who }'").stdout).toBe("hi lab\n");
    expect(run(s, "echo 1 | awk '{ x += 2; x *= 3; print x; print ++x; print x++; print x }'").stdout).toBe("6\n7\n7\n8\n");
    expect(run(s, "awk 'BEGIN { print (1 && 0), (1 || 0), !1 }'").stdout).toBe("0 1 0\n");
  });

  test("file output redirection from awk records provenance", () => {
    const s = mkSession();
    run(s, "awk -F, 'NR>1 {print $1 > \"users.txt\"}' evidence/access.csv");
    expect(s.readFile("users.txt")).toBe("alice\nbob\nerin\n");
    expect(s.producedBy("users.txt")).toContain("awk -F,");
  });

  test("unsupported awk constructs hit the honest boundary, never approximate", () => {
    const s = mkSession();
    const r = run(s, "awk '{ system(\"ls\") }' notes.txt");
    expect(r.stderr).toBe("grc-sim: awk: program uses features outside this lab's simulated surface — run it on a real machine to explore\n");
    expect(r.exit).toBe(64);
    expect(run(s, "awk --posix '{print}' notes.txt").exit).toBe(64);
    expect(run(s, "awk").exit).toBe(2);
    expect(run(s, "awk '{print}' ghost.txt").exit).toBe(2);
  });
});
