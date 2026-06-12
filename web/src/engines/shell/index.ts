/**
 * Shell engine entry point (web ISA Wave 2 — ISC-35..52, ISC-115..128).
 *
 * Pure DOM-free TypeScript implementing the frozen public contract in ./types.ts.
 * The fidelity suite replays every captured fixture through createShellEngine();
 * the browser layer only renders events and routes keystrokes.
 */
import type {
  ShellEngine,
  ShellSession,
  ShellSessionOptions,
  SessionSnapshot,
  ExecResult,
  ExecEvent,
  RunCleanResult,
  SeedSpec,
} from "./types";
import { VFS, normalize, byteCompare, type SerializedNode } from "./vfs";
import {
  Machine,
  StringSink,
  PendingStdinSignal,
  ScriptExitSignal,
  BudgetExceeded,
  BUDGET_MESSAGE,
  BUDGET_EXIT,
  type IOCtx,
  type Sink,
} from "./interpreter";
import { parse, type List } from "./parser";
import { UnexpectedEof } from "./lexer";
import { UnboundVarError, VarAssertError, NoGlobMatchError } from "./expand";
import { BUILTINS } from "./builtins";
import { INSTALLED_COMMANDS, MACOS_EXTRA_COMMANDS } from "./installed";

export type * from "./types";

const DEFAULT_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

type Pending =
  | { kind: "stdin"; line: string; chunks: string[]; echoCat: boolean }
  | { kind: "continuation"; src: string; heredocDelim: string | null };

interface EngineVfsBlob {
  root: SerializedNode;
  exported: string[];
  entropy: number;
  prevCwd: string;
}

// DELIBERATE DIVERGENCE (documented per engine audit finding 6, 2026-06-12): in real
// interactive bash, \`set -e; false\` terminates the session. Here the session survives —
// ending a learner's lab because they experimented with set -e would be hostile UX, and the
// lab page has no concept of a dead session. Scripts (bash f.sh / ./f.sh) honor set -e fully.
class ShellSessionImpl implements ShellSession {
  private m: Machine;
  private pending: Pending | null = null;
  private historyCursor = 0;
  private cleanRunNonce = 0;

  constructor(
    private opts: ShellSessionOptions,
    snap?: SessionSnapshot,
  ) {
    const epochMs = Date.parse(opts.epoch);
    if (snap) {
      const blob = snap.vfs as EngineVfsBlob;
      this.m = new Machine({
        vfs: VFS.deserialize(blob.root),
        vars: new Map(Object.entries(snap.env)),
        exported: new Set(blob.exported),
        cwd: snap.cwd,
        user: opts.user,
        host: opts.host,
        home: opts.home,
        variant: snap.variant,
        cols: opts.cols,
        epochMs,
        skewMs: snap.elapsedMs,
        history: [...snap.history],
        producedBy: new Map(Object.entries(snap.producedBy)),
        entropy: blob.entropy,
      });
      this.m.prevCwd = blob.prevCwd;
      this.m.lastExit = snap.lastExit;
    } else {
      this.m = new Machine({
        vfs: buildVfs(opts),
        vars: initialVars(opts),
        exported: new Set(["HOME", "USER", "LOGNAME", "PATH", "SHELL", "PWD", "HOSTNAME", "TERM", "LANG"]),
        cwd: opts.home,
        user: opts.user,
        host: opts.host,
        home: opts.home,
        variant: opts.variant,
        cols: opts.cols,
        epochMs,
        skewMs: 0,
        history: [],
        producedBy: new Map(),
        entropy: (epochMs >>> 8) || 1,
      });
    }
    this.historyCursor = this.m.history.length;
  }

  prompt(): string {
    const m = this.m;
    if (m.variant === "zsh-macos") {
      const last = m.cwd === m.home ? "~" : m.cwd === "/" ? "/" : m.cwd.slice(m.cwd.lastIndexOf("/") + 1);
      return `${m.user}@${m.host} ${last} % `;
    }
    let cwd = m.cwd;
    if (cwd === m.home) cwd = "~";
    else if (cwd.startsWith(m.home + "/")) cwd = "~" + cwd.slice(m.home.length);
    return `${m.user}@${m.host}:${cwd}$ `;
  }

  // -------------------------------------------------------------------------
  // execution
  // -------------------------------------------------------------------------

  exec(line: string): ExecResult {
    if (this.pending !== null) return this.feedStdin(line + "\n");
    if (line.trim() !== "") {
      this.m.history.push(line);
      this.historyCursor = this.m.history.length;
    }
    return this.runLine(line, null, true);
  }

  /** Run one input line; stdinOverride replays a suspended line with collected stdin. */
  private runLine(src: string, stdinOverride: string | null, interactive: boolean, preEvents: ExecEvent[] = []): ExecResult {
    const m = this.m;
    const events: ExecEvent[] = [...preEvents];
    const outSink: Sink = {
      write: (s) => {
        if (s !== "") {
          events.push({ stream: "stdout", text: s });
          m.emittedAnything = true;
        }
      },
    };
    const errSink: Sink = {
      write: (s) => {
        if (s !== "") {
          events.push({ stream: "stderr", text: s });
          m.emittedAnything = true;
        }
      },
    };
    m.currentLine = src;
    m.interactive = interactive;
    m.emittedAnything = preEvents.length > 0;
    m.execCount = 0;
    m.steps = 0;
    m.budgetHit = false;

    let list: List;
    try {
      list = parse(src);
    } catch (e) {
      if (e instanceof UnexpectedEof && interactive) {
        this.pending = { kind: "continuation", src, heredocDelim: e.heredocDelim ?? null };
        return { state: "pending", events };
      }
      errSink.write(`${m.errPrefix()}syntax error: ${(e as Error).message}\n`);
      m.lastExit = 2;
      return { state: "done", events, exit: 2 };
    }

    const io: IOCtx = { stdin: stdinOverride, out: outSink, err: errSink, ttyOut: true };
    let exit: number;
    try {
      exit = m.runList(list, io);
    } catch (e) {
      if (e instanceof PendingStdinSignal) {
        this.pending = { kind: "stdin", line: src, chunks: [], echoCat: e.echoCat };
        return { state: "pending", events };
      }
      if (e instanceof ScriptExitSignal) {
        exit = e.code;
      } else if (e instanceof BudgetExceeded) {
        errSink.write(BUDGET_MESSAGE);
        exit = BUDGET_EXIT;
      } else if (e instanceof UnboundVarError || e instanceof VarAssertError) {
        errSink.write(`${m.errPrefix()}${e.message}\n`);
        exit = 1;
      } else if (e instanceof NoGlobMatchError) {
        errSink.write(`zsh: no matches found: ${e.pattern}\n`);
        exit = 1;
      } else {
        throw e;
      }
    }
    m.lastExit = exit;
    return { state: "done", events, exit };
  }

  feedStdin(text: string): ExecResult {
    const p = this.pending;
    if (p === null) return { state: "done", events: [], exit: this.m.lastExit };
    if (p.kind === "stdin") {
      p.chunks.push(text);
      // bare interactive `cat` echoes input back as it arrives
      const events: ExecEvent[] = p.echoCat ? [{ stream: "stdout", text }] : [];
      return { state: "pending", events };
    }
    // continuation: accumulate source until it parses
    p.src += (p.src.endsWith("\n") || text.startsWith("\n") ? "" : "\n") + text;
    try {
      parse(p.src.endsWith("\n") ? p.src : p.src + "\n");
    } catch (e) {
      if (e instanceof UnexpectedEof) {
        p.heredocDelim = e.heredocDelim ?? null;
        return { state: "pending", events: [] };
      }
      // fall through: let runLine surface the syntax error
    }
    const src = p.src;
    this.pending = null;
    return this.runLine(src, null, true);
  }

  eof(): ExecResult {
    const p = this.pending;
    if (p === null) return { state: "done", events: [], exit: this.m.lastExit };
    this.pending = null;
    if (p.kind === "stdin") {
      if (p.echoCat) {
        // output already echoed incrementally; EOF just finishes with status 0
        this.m.lastExit = 0;
        return { state: "done", events: [], exit: 0 };
      }
      return this.runLine(p.line, p.chunks.join(""), false);
    }
    if (p.heredocDelim !== null) {
      // bash: EOF terminates the here-document with a warning, then the command runs
      const warning: ExecEvent = {
        stream: "stderr",
        text: `${this.m.errPrefix()}warning: here-document at line 1 delimited by end-of-file (wanted \`${p.heredocDelim}')\n`,
      };
      const src = p.src.endsWith("\n") ? p.src + p.heredocDelim : p.src + "\n" + p.heredocDelim;
      return this.runLine(src, null, true, [warning]);
    }
    this.m.lastExit = 2;
    return {
      state: "done",
      events: [{ stream: "stderr", text: `${this.m.errPrefix()}syntax error: unexpected end of file\n` }],
      exit: 2,
    };
  }

  interrupt(): ExecResult {
    this.pending = null;
    this.m.lastExit = 130;
    return { state: "done", events: [{ stream: "stdout", text: "^C\n" }], exit: 130 };
  }

  // -------------------------------------------------------------------------
  // completion + history (ISC-44/45)
  // -------------------------------------------------------------------------

  complete(partial: string): { completions: string[]; replacePrefix: string } {
    const m = this.m;
    // current token = trailing run after the last unquoted separator
    const sep = /[\s|;&<>()]/;
    let tokenStart = partial.length;
    while (tokenStart > 0 && !sep.test(partial[tokenStart - 1]!)) tokenStart--;
    const token = partial.slice(tokenStart);
    const before = partial.slice(0, tokenStart).trim();
    const commandPosition = before === "" || /(\||;|&&|\|\||\$\(|\()$/.test(before);

    if (commandPosition && !token.includes("/")) {
      const names = new Set<string>(Object.keys(BUILTINS));
      const path = m.getVar("PATH") ?? DEFAULT_PATH;
      for (const dir of path.split(":")) {
        const node = m.vfs.lookup(dir);
        if (!node || node.t !== "dir") continue;
        for (const [name, child] of node.children!) {
          if (child.t !== "dir" && (child.mode & 0o111) !== 0) names.add(name);
        }
      }
      const completions = [...names].filter((n) => n.startsWith(token)).sort(byteCompare);
      return { completions, replacePrefix: token };
    }

    // path completion
    const slash = token.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : token.slice(0, slash + 1);
    const base = slash === -1 ? token : token.slice(slash + 1);
    const dirAbs = dirPart === "" ? m.cwd : m.resolve(dirPart === "/" ? "/" : dirPart);
    const node = m.vfs.lookup(dirAbs);
    if (!node || node.t !== "dir") return { completions: [], replacePrefix: token };
    const completions: string[] = [];
    for (const name of [...node.children!.keys()].sort(byteCompare)) {
      if (!name.startsWith(base)) continue;
      if (name.startsWith(".") && !base.startsWith(".")) continue;
      const child = node.children!.get(name)!;
      completions.push(dirPart + name + (child.t === "dir" ? "/" : ""));
    }
    return { completions, replacePrefix: token };
  }

  historyUp(): string | null {
    if (this.m.history.length === 0 || this.historyCursor === 0) {
      return this.m.history.length === 0 ? null : this.m.history[0]!;
    }
    this.historyCursor--;
    return this.m.history[this.historyCursor]!;
  }

  historyDown(): string | null {
    if (this.historyCursor >= this.m.history.length) return null;
    this.historyCursor++;
    return this.historyCursor === this.m.history.length ? null : this.m.history[this.historyCursor]!;
  }

  history(): string[] {
    return [...this.m.history];
  }

  lastExit(): number {
    return this.m.lastExit;
  }

  setCols(cols: number): void {
    this.m.cols = cols;
  }

  // -------------------------------------------------------------------------
  // verifier probes (ISC-126/127)
  // -------------------------------------------------------------------------

  exists(path: string): boolean {
    return this.m.vfs.exists(this.m.resolve(path));
  }

  readFile(path: string): string | null {
    return this.m.vfs.readFile(this.m.resolve(path));
  }

  listDir(path: string): string[] | null {
    return this.m.vfs.listNames(this.m.resolve(path));
  }

  producedBy(path: string): string | null {
    return this.m.producedBy.get(this.m.resolve(path)) ?? null;
  }

  /** Honest editor writes: provenance records what the learner actually did ("nano <file>"). */
  writeFileAs(path: string, content: string, provenance: string): void {
    const m = this.m;
    const abs = m.resolve(path);
    m.vfs.writeFile(abs, content, { owner: m.user, now: m.now() });
    m.producedBy.set(abs, provenance);
  }

  /** Restore seeded files + tools without touching history/env/cwd (web ISA ISC-117). */
  reseedFiles(seed: SeedSpec): void {
    const m = this.m;
    const epochMs = Date.parse(this.opts.epoch);
    for (const f of seed.files) {
      const abs = normalize(f.path, this.opts.home, this.opts.home);
      if (f.dir === true) {
        m.vfs.mkdir(abs, { parents: true, owner: this.opts.user, now: epochMs });
        continue;
      }
      m.vfs.mkdir(abs.slice(0, abs.lastIndexOf("/")) || "/", { parents: true, owner: this.opts.user, now: epochMs });
      m.vfs.writeFile(abs, f.content ?? "", { owner: this.opts.user, now: epochMs, mode: f.mode ?? 0o644 });
      const node = m.vfs.lookup(abs);
      if (node) node.mtime = epochMs;
      m.producedBy.delete(abs);
    }
    for (const [name, source] of Object.entries(seed.tools)) {
      m.vfs.writeFile(`/usr/local/bin/${name}`, source, { owner: "root", now: epochMs, mode: 0o755 });
    }
  }

  runScriptClean(path: string, args: string[], opts?: { perturb?: boolean }): RunCleanResult {
    const m = this.m;
    const abs = m.resolve(path);
    const node = m.vfs.lookup(abs);
    if (!node || node.t !== "file") {
      return { stdout: "", stderr: `${m.errPrefix()}${path}: No such file or directory\n`, exit: 127 };
    }
    const perturb = opts?.perturb !== false;
    const nonce = ++this.cleanRunNonce;
    // each call perturbs differently so two runs of a clock/entropy-contaminated script
    // observably diverge (ISC-127: determinism must come from the learner's script)
    const skew = perturb ? m.skewMs + nonce * (7 * 3600_000 + 137_000) : m.skewMs;
    const sub = new Machine({
      vfs: m.vfs.clone(),
      vars: initialVars(this.opts),
      exported: new Set(["HOME", "USER", "LOGNAME", "PATH", "SHELL", "PWD", "HOSTNAME", "TERM", "LANG"]),
      cwd: m.cwd,
      user: m.user,
      host: m.host,
      home: m.home,
      variant: m.variant,
      cols: m.cols,
      epochMs: m.epochMs,
      skewMs: skew,
      history: [],
      producedBy: new Map(),
      entropy: perturb ? ((m.entropy + nonce * 0x9e3779b9) >>> 0) || 1 : m.entropy,
    });
    sub.interactive = false;
    const out = new StringSink();
    const err = new StringSink();
    const io: IOCtx = { stdin: "", out, err, ttyOut: false };
    let exit: number;
    try {
      exit = sub.runScriptFile(abs, path, node.content, args, io);
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        err.write(BUDGET_MESSAGE);
        exit = BUDGET_EXIT;
      } else if (e instanceof ScriptExitSignal) {
        exit = e.code;
      } else {
        throw e;
      }
    }
    return { stdout: out.text, stderr: err.text, exit };
  }

  // -------------------------------------------------------------------------
  // persistence (ISC-92/135)
  // -------------------------------------------------------------------------

  snapshot(): SessionSnapshot {
    const m = this.m;
    const blob: EngineVfsBlob = {
      root: m.vfs.serialize(),
      exported: [...m.exported],
      entropy: m.entropy,
      prevCwd: m.prevCwd,
    };
    return {
      version: 1,
      variant: m.variant,
      vfs: blob,
      env: Object.fromEntries(m.vars),
      cwd: m.cwd,
      history: [...m.history],
      lastExit: m.lastExit,
      elapsedMs: m.elapsedMs(),
      producedBy: Object.fromEntries(m.producedBy),
    };
  }
}

function initialVars(opts: ShellSessionOptions): Map<string, string> {
  return new Map<string, string>([
    ["HOME", opts.home],
    ["USER", opts.user],
    ["LOGNAME", opts.user],
    ["PATH", DEFAULT_PATH],
    ["SHELL", opts.variant === "zsh-macos" ? "/bin/zsh" : "/bin/bash"],
    ["PWD", opts.home],
    ["HOSTNAME", opts.host],
    ["TERM", "xterm-256color"],
    ["LANG", "C.UTF-8"],
  ]);
}

function buildVfs(opts: ShellSessionOptions): VFS {
  const vfs = new VFS();
  const epochMs = Date.parse(opts.epoch);
  const mk = (path: string, owner = "root") => vfs.mkdir(path, { parents: true, owner, now: epochMs });
  for (const dir of ["/home", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin", "/tmp", "/etc", "/dev", "/var"]) {
    mk(dir);
  }
  mk(opts.home, opts.user);

  // simulated binaries (declared installed set, ISC-120) live at /usr/bin
  const usrBin = vfs.lookup("/usr/bin")!;
  const names = [...INSTALLED_COMMANDS, ...(opts.variant === "zsh-macos" ? MACOS_EXTRA_COMMANDS : [])];
  for (const name of names) {
    usrBin.children!.set(name, {
      t: "file",
      mode: 0o755,
      owner: "root",
      group: "root",
      mtime: epochMs,
      content: `\x7fELF (simulated binary: ${name})\n`,
      target: "",
      children: null,
      sim: name,
    });
  }
  seedInto(vfs, opts.seed, opts);
  return vfs;
}

function seedInto(vfs: VFS, seed: SeedSpec, opts: ShellSessionOptions): void {
  const epochMs = Date.parse(opts.epoch);
  for (const f of seed.files) {
    const abs = normalize(f.path, opts.home, opts.home);
    if (f.dir === true) {
      vfs.mkdir(abs, { parents: true, owner: opts.user, now: epochMs });
      const node = vfs.lookup(abs)!;
      if (f.mode !== undefined) node.mode = f.mode;
      continue;
    }
    vfs.mkdir(abs.slice(0, abs.lastIndexOf("/")) || "/", { parents: true, owner: opts.user, now: epochMs });
    vfs.writeFile(abs, f.content ?? "", { owner: opts.user, now: epochMs, mode: f.mode ?? 0o644 });
    const node = vfs.lookup(abs)!;
    node.mtime = epochMs;
  }
  for (const [name, source] of Object.entries(seed.tools)) {
    vfs.writeFile(`/usr/local/bin/${name}`, source, { owner: "root", now: epochMs, mode: 0o755 });
  }
}

export function createShellEngine(): ShellEngine {
  return {
    create(opts: ShellSessionOptions): ShellSession {
      return new ShellSessionImpl(opts);
    },
    restore(snap: SessionSnapshot, opts: ShellSessionOptions): ShellSession {
      return new ShellSessionImpl(opts, snap);
    },
  };
}
