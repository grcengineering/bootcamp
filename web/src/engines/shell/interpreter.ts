/**
 * Shell interpreter (web ISA ISC-36..43/47/49/50, ISC-115..128 engine criteria).
 *
 * Executes the parsed AST against the VFS with bash-faithful stream wiring. The same
 * interpreter path runs interactive lines, `bash file.sh`, `./file.sh`, and the seed
 * PATH tools (the fixture scripts run as the same bytes the capture container ran).
 */
import { VFS, normalize, parentPath, baseName, byteCompare } from "./vfs";
import { parse, type List, type AndOr, type Pipeline, type Cmd, type SimpleCmd, type Redir } from "./parser";
import { type WordTok } from "./lexer";
import {
  expandWord,
  expandSingle,
  matchPattern,
  patternToRegex,
  UnboundVarError,
  VarAssertError,
  NoGlobMatchError,
  type ExpandHost,
  type PatChar,
} from "./expand";
import { BUILTINS } from "./builtins";
import { COREUTILS, stdinWillBeRead } from "./coreutils";
import { STATIC_OUTPUTS } from "./generated/static-outputs";
import type { ShellVariant } from "./types";

export interface Sink {
  write(s: string): void;
}

export interface IOCtx {
  stdin: string | null; // null → interactive terminal stdin
  out: Sink;
  err: Sink;
  ttyOut: boolean;
}

export interface ShellFlags {
  errexit: boolean;
  nounset: boolean;
  pipefail: boolean;
}

interface Frame {
  positional: string[];
  scriptName: string;
  flags: ShellFlags;
}

/** Deterministic execution budget — runaway-loop protection (ISC-123). */
export const MAX_STEPS = 100_000;
export const BUDGET_MESSAGE = "grc-lab: script exceeded simulated execution budget\n";
export const BUDGET_EXIT = 124;
export const SIM_BOUNDARY_EXIT = 64;

export class PendingStdinSignal extends Error {
  /**
   * `lines`: dialogue mode (module-02 admin-ext) — the session auto-resumes after exactly N
   * input lines instead of waiting for EOF, re-running the line with the collected stdin
   * (the resumed impl sees Machine.dialogueResume and skips re-emitting prompts).
   * `prompts[i]`: stderr prompt to emit after the i-th line is collected (multi-step dialogues).
   */
  constructor(public echoCat: boolean, public lines?: number, public prompts?: string[]) {
    super("pending stdin");
  }
}

export class ScriptExitSignal extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

export class BudgetExceeded extends Error {}

export interface MachineConfig {
  vfs: VFS;
  vars: Map<string, string>;
  exported: Set<string>;
  cwd: string;
  user: string;
  host: string;
  home: string;
  variant: ShellVariant;
  cols: number;
  epochMs: number;
  /** carried sim-elapsed (snapshot restore) + sleep/perturbation skew */
  skewMs: number;
  history: string[];
  producedBy: Map<string, string>;
  entropy: number;
}

export class Machine {
  vfs: VFS;
  vars: Map<string, string>;
  exported: Set<string>;
  cwd: string;
  prevCwd: string;
  lastExit = 0;
  user: string;
  host: string;
  home: string;
  variant: ShellVariant;
  cols: number;
  epochMs: number;
  skewMs: number;
  startedReal: number;
  history: string[];
  producedBy: Map<string, string>;
  entropy: number;

  currentLine = "";
  interactive = false;
  emittedAnything = false;
  /** True while a line is re-run with dialogue-collected stdin (prompts already shown). */
  dialogueResume = false;
  /** commands completed during the current exec() — pending stdin only allowed at 0 */
  execCount = 0;
  steps = 0;
  budgetHit = false;
  private depth = 0;
  private frames: Frame[] = [];

  constructor(cfg: MachineConfig) {
    this.vfs = cfg.vfs;
    this.vars = cfg.vars;
    this.exported = cfg.exported;
    this.cwd = cfg.cwd;
    this.prevCwd = cfg.cwd;
    this.user = cfg.user;
    this.host = cfg.host;
    this.home = cfg.home;
    this.variant = cfg.variant;
    this.cols = cfg.cols;
    this.epochMs = cfg.epochMs;
    this.skewMs = cfg.skewMs;
    this.startedReal = Date.now();
    this.history = cfg.history;
    this.producedBy = cfg.producedBy;
    this.entropy = cfg.entropy;
    this.frames.push({ positional: [], scriptName: this.shellName(), flags: { errexit: false, nounset: false, pipefail: false } });
  }

  shellName(): string {
    return this.variant === "zsh-macos" ? "zsh" : "bash";
  }

  /** Sim clock (ISC-132): epoch + monotonic real elapsed + skew (sleep / perturbation). */
  now(): number {
    return this.epochMs + (Date.now() - this.startedReal) + this.skewMs;
  }

  elapsedMs(): number {
    return this.now() - this.epochMs;
  }

  frame(): Frame {
    return this.frames[this.frames.length - 1]!;
  }

  getVar(name: string): string | undefined {
    return this.vars.get(name);
  }

  setVar(name: string, value: string, exported = false) {
    this.vars.set(name, value);
    if (exported) this.exported.add(name);
  }

  recordWrite(absPath: string) {
    if (this.currentLine !== "") this.producedBy.set(absPath, this.currentLine);
  }

  resolve(path: string): string {
    return normalize(path, this.cwd, this.home);
  }

  errPrefix(): string {
    return this.variant === "zsh-macos" ? "zsh: " : "bash: ";
  }

  notFoundMessage(name: string): string {
    return this.variant === "zsh-macos" ? `zsh: command not found: ${name}\n` : `bash: ${name}: command not found\n`;
  }

  permissionDeniedMessage(name: string): string {
    return this.variant === "zsh-macos" ? `zsh: permission denied: ${name}\n` : `bash: ${name}: Permission denied\n`;
  }

  // -------------------------------------------------------------------------
  // execution
  // -------------------------------------------------------------------------

  runProgram(src: string, io: IOCtx): number {
    let list: List;
    try {
      list = parse(src);
    } catch (e) {
      io.err.write(`${this.errPrefix()}syntax error: ${(e as Error).message}\n`);
      return (this.lastExit = 2);
    }
    return this.runList(list, io);
  }

  runList(list: List, io: IOCtx): number {
    let code = this.lastExit;
    for (const andor of list) {
      code = this.runAndOr(andor, io);
      if (this.frame().flags.errexit && code !== 0) throw new ScriptExitSignal(code);
    }
    return code;
  }

  runAndOr(andor: AndOr, io: IOCtx): number {
    let code = 0;
    for (let i = 0; i < andor.parts.length; i++) {
      const part = andor.parts[i]!;
      if (i > 0) {
        if (part.op === "&&" && code !== 0) continue;
        if (part.op === "||" && code === 0) continue;
      }
      code = this.runPipeline(part.pipe, io);
    }
    this.lastExit = code;
    return code;
  }

  runPipeline(pipe: Pipeline, io: IOCtx): number {
    const n = pipe.stages.length;
    let code = 0;
    if (n === 1) {
      code = this.runCommand(pipe.stages[0]!, io);
    } else {
      let carried: string | null = io.stdin;
      const exits: number[] = [];
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        const collector = last ? null : new StringSink();
        const stageIo: IOCtx = {
          stdin: i === 0 ? carried : carried ?? "",
          out: collector ?? io.out,
          err: io.err,
          ttyOut: last && io.ttyOut,
        };
        exits.push(this.runCommand(pipe.stages[i]!, stageIo));
        carried = collector ? collector.text : null;
      }
      code = exits[n - 1]!;
      if (this.frame().flags.pipefail) {
        for (const e of exits) if (e !== 0) code = e;
      }
    }
    if (pipe.negate) code = code === 0 ? 1 : 0;
    this.lastExit = code;
    return code;
  }

  runCommand(cmd: Cmd, io: IOCtx): number {
    switch (cmd.k) {
      case "simple":
        return this.runSimple(cmd, io);
      case "if": {
        for (const clause of cmd.clauses) {
          if (this.runCondition(clause.cond, io) === 0) return this.runList(clause.body, io);
        }
        return cmd.elseBody ? this.runList(cmd.elseBody, io) : 0;
      }
      case "while": {
        let code = 0;
        for (;;) {
          this.budgetStep();
          const c = this.runCondition(cmd.cond, io);
          const go = cmd.until ? c !== 0 : c === 0;
          if (!go) break;
          code = this.runList(cmd.body, io);
        }
        return code;
      }
      case "for": {
        const host = this.expandHost(io);
        const words = cmd.words === null ? [...this.frame().positional] : cmd.words.flatMap((w) => expandWord(w, host));
        let code = 0;
        for (const w of words) {
          this.budgetStep();
          this.setVar(cmd.name, w);
          code = this.runList(cmd.body, io);
        }
        return code;
      }
      case "case": {
        const host = this.expandHost(io);
        const subject = expandSingle(cmd.word, host);
        for (const clause of cmd.clauses) {
          if (clause.patterns.some((p) => matchPattern(subject, p, host))) return this.runList(clause.body, io);
        }
        return 0;
      }
      default: {
        // group / subshell
        const applied = this.applyRedirs(cmd.redirs, io);
        if (applied.error !== null) return applied.error;
        if (cmd.subshell) {
          const savedVars = new Map(this.vars);
          const savedCwd = this.cwd;
          try {
            return this.runList(cmd.body, applied.io);
          } finally {
            this.vars = savedVars;
            this.cwd = savedCwd;
          }
        }
        return this.runList(cmd.body, applied.io);
      }
    }
  }

  /** Condition lists (if/while) suppress errexit by frame-local toggle. */
  private runCondition(cond: List, io: IOCtx): number {
    const f = this.frame();
    const saved = f.flags.errexit;
    f.flags.errexit = false;
    try {
      return this.runList(cond, io);
    } finally {
      f.flags.errexit = saved;
    }
  }

  budgetStep() {
    if (++this.steps > MAX_STEPS) {
      this.budgetHit = true;
      throw new BudgetExceeded();
    }
  }

  expandHost(io: IOCtx): ExpandHost {
    return {
      getVar: (n) => this.getVar(n),
      setVar: (n, v) => this.setVar(n, v),
      positional: this.frame().positional,
      scriptName: this.frame().scriptName,
      lastExit: this.lastExit,
      nounset: this.frame().flags.nounset,
      variant: this.variant,
      home: this.home,
      runSub: (src) => this.commandSubstitute(src, io),
      glob: (pat) => this.globMatch(pat),
    };
  }

  commandSubstitute(src: string, io: IOCtx): string {
    const collector = new StringSink();
    const savedVars = new Map(this.vars);
    const savedCwd = this.cwd;
    try {
      this.runProgram(src, { stdin: "", out: collector, err: io.err, ttyOut: false });
    } finally {
      this.vars = savedVars;
      this.cwd = savedCwd;
    }
    return collector.text;
  }

  /** Glob over the VFS (ISC-40). Returns matched display paths or null. */
  globMatch(pat: PatChar[]): string[] | null {
    // split into segments on unquoted "/"
    const segs: PatChar[][] = [[]];
    for (const p of pat) {
      if (p.c === "/" && !p.q) segs.push([]);
      else segs[segs.length - 1]!.push(p);
    }
    const absolute = segs.length > 1 && segs[0]!.length === 0;
    if (absolute) segs.shift();
    const trailingDir = segs.length > 1 && segs[segs.length - 1]!.length === 0;
    if (trailingDir) segs.pop();

    interface Cand {
      display: string;
      abs: string;
    }
    let cands: Cand[] = [{ display: absolute ? "/" : "", abs: absolute ? "/" : this.cwd }];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const isLast = i === segs.length - 1;
      const hasGlob = seg.some((p) => !p.q && (p.c === "*" || p.c === "?" || p.c === "["));
      const nextCands: Cand[] = [];
      for (const cand of cands) {
        const dirNode = this.vfs.lookup(cand.abs);
        if (!dirNode || dirNode.t !== "dir") continue;
        const joinDisplay = (name: string) => (cand.display === "" ? name : cand.display === "/" ? "/" + name : cand.display + "/" + name);
        if (!hasGlob) {
          const name = seg.map((p) => p.c).join("");
          const literal = name === "" ? cand.abs : normalize(cand.abs + "/" + name, this.cwd, this.home);
          const node = this.vfs.lookup(literal);
          if (node && (isLast ? !trailingDir || node.t === "dir" : node.t === "dir")) {
            nextCands.push({ display: joinDisplay(name), abs: literal });
          }
          continue;
        }
        const re = patternToRegex(seg);
        const wantHidden = seg[0] !== undefined && seg[0]!.c === ".";
        for (const name of [...dirNode.children!.keys()].sort(byteCompare)) {
          if (name.startsWith(".") && !wantHidden) continue;
          if (!re.test(name)) continue;
          const childAbs = cand.abs === "/" ? "/" + name : cand.abs + "/" + name;
          const node = this.vfs.lookup(childAbs)!;
          if (!isLast && node.t !== "dir") continue;
          if (isLast && trailingDir && node.t !== "dir") continue;
          nextCands.push({ display: joinDisplay(name), abs: childAbs });
        }
      }
      cands = nextCands;
      if (cands.length === 0) return null;
    }
    const out = cands.map((c) => (trailingDir ? c.display + "/" : c.display)).sort(byteCompare);
    return out.length > 0 ? out : null;
  }

  // -------------------------------------------------------------------------
  // simple command execution
  // -------------------------------------------------------------------------

  runSimple(cmd: SimpleCmd, io: IOCtx): number {
    this.budgetStep();
    const host = this.expandHost(io);

    let argv: string[];
    try {
      argv = cmd.words.flatMap((w) => expandWord(w, host));
    } catch (e) {
      return this.expansionError(e, io);
    }

    // assignment-only command: persist variables
    if (argv.length === 0) {
      for (const a of cmd.assigns) {
        try {
          this.setVar(a.name, expandSingle(a.value, host));
        } catch (e) {
          return this.expansionError(e, io);
        }
      }
      const applied = this.applyRedirs(cmd.redirs, io);
      return applied.error !== null ? applied.error : 0;
    }

    // pending interactive stdin (ISC-122) — checked BEFORE redirs so no side effects exist yet.
    // Only the first command of an input line may suspend (a resumed line re-executes from the
    // start, so anything that already ran must not run twice); later stdin-readers see EOF.
    const hasStdinRedir = cmd.redirs.some((r) => r.fd === 0);
    if (
      this.interactive &&
      io.stdin === null &&
      !hasStdinRedir &&
      !this.emittedAnything &&
      this.execCount === 0 &&
      stdinWillBeRead(argv[0]!, argv.slice(1)) &&
      !BUILTINS[argv[0]!]
    ) {
      // echo-mode only for a bare `cat` writing straight to the terminal (io.ttyOut is false
      // inside pipelines and under output redirection, where input must be collected instead)
      throw new PendingStdinSignal(argv[0] === "cat" && argv.length === 1 && cmd.redirs.length === 0 && io.ttyOut);
    }

    const applied = this.applyRedirs(cmd.redirs, io, host);
    if (applied.error !== null) return applied.error;
    const cio = applied.io;
    if (cio.stdin === null && !this.interactive) cio.stdin = "";

    // temporary assignment prefix (VAR=x cmd): exported for the command, restored after
    const savedTemp: [string, string | undefined, boolean][] = [];
    for (const a of cmd.assigns) {
      savedTemp.push([a.name, this.vars.get(a.name), this.exported.has(a.name)]);
      this.setVar(a.name, expandSingle(a.value, host), true);
    }
    try {
      return this.dispatch(argv, cio);
    } finally {
      this.execCount++;
      for (const [name, old, wasExported] of savedTemp) {
        if (old === undefined) this.vars.delete(name);
        else this.vars.set(name, old);
        if (!wasExported) this.exported.delete(name);
      }
    }
  }

  private expansionError(e: unknown, io: IOCtx): number {
    if (e instanceof UnboundVarError) {
      io.err.write(`${this.errPrefix()}${e.varName}: unbound variable\n`);
      if (this.depth > 0) throw new ScriptExitSignal(1);
      return (this.lastExit = 1);
    }
    if (e instanceof VarAssertError) {
      io.err.write(`${this.errPrefix()}${e.varName}: ${e.msg}\n`);
      if (this.depth > 0) throw new ScriptExitSignal(1);
      return (this.lastExit = 1);
    }
    if (e instanceof NoGlobMatchError) {
      io.err.write(`zsh: no matches found: ${e.pattern}\n`);
      return (this.lastExit = 1);
    }
    throw e;
  }

  dispatch(argv: string[], io: IOCtx): number {
    const [name, ...args] = argv as [string, ...string[]];

    // captured static text (--help passthrough): fixtures are the single source of truth
    const staticKey = [name, ...args].join(" ");
    const staticOut = STATIC_OUTPUTS[staticKey];
    if (staticOut !== undefined) {
      io.out.write(staticOut.stdout);
      return (this.lastExit = staticOut.exit);
    }

    if (name.includes("/")) return (this.lastExit = this.execPath(name, args, io));

    const builtin = BUILTINS[name];
    if (builtin) return (this.lastExit = builtin(args, io, this));

    // PATH search: seed tools (/usr/local/bin scripts) shadow simulated binaries (/usr/bin)
    const path = this.getVar("PATH") ?? "";
    for (const dir of path.split(":")) {
      if (dir === "") continue;
      const abs = dir === "/" ? "/" + name : dir + "/" + name;
      const node = this.vfs.lookup(abs);
      if (!node || node.t === "dir") continue;
      if ((node.mode & 0o111) === 0) continue;
      if (node.sim) {
        const impl = COREUTILS[node.sim];
        if (impl) return (this.lastExit = impl(args, io, this));
        // declared-installed but outside the simulated surface — honest boundary (ISC-120)
        io.err.write(`grc-sim: ${name}: command is outside this lab's simulated surface — run it on a real machine to explore\n`);
        return (this.lastExit = SIM_BOUNDARY_EXIT);
      }
      return (this.lastExit = this.runScriptFile(abs, name, node.content, args, io));
    }

    io.err.write(this.notFoundMessage(name));
    return (this.lastExit = 127);
  }

  /** Execute ./path or /abs/path (exec-bit gate, ISC-42/49). */
  execPath(pathArg: string, args: string[], io: IOCtx): number {
    const abs = this.resolve(pathArg);
    const node = this.vfs.lookup(abs);
    if (!node) {
      io.err.write(
        this.variant === "zsh-macos" ? `zsh: no such file or directory: ${pathArg}\n` : `bash: ${pathArg}: No such file or directory\n`,
      );
      return 127;
    }
    if (node.t === "dir") {
      io.err.write(this.variant === "zsh-macos" ? `zsh: is a directory: ${pathArg}\n` : `bash: ${pathArg}: Is a directory\n`);
      return 126;
    }
    if ((node.mode & 0o111) === 0) {
      io.err.write(this.permissionDeniedMessage(pathArg));
      return 126;
    }
    return this.runScriptFile(abs, pathArg, node.content, args, io);
  }

  /** Run script bytes through this same interpreter (ISC-49; seed tools run as-is). */
  runScriptFile(absPath: string, argv0: string, content: string, args: string[], io: IOCtx): number {
    if (this.depth >= 32) {
      io.err.write(`${this.errPrefix()}${argv0}: maximum simulated script recursion exceeded\n`);
      return 1;
    }
    this.depth++;
    this.frames.push({ positional: args, scriptName: argv0, flags: { errexit: false, nounset: false, pipefail: false } });
    try {
      let list: List;
      try {
        list = parse(content);
      } catch (e) {
        io.err.write(`${argv0}: syntax error: ${(e as Error).message}\n`);
        return 2;
      }
      const code = this.runList(list, io);
      return code;
    } catch (e) {
      if (e instanceof ScriptExitSignal) return e.code;
      if (e instanceof UnboundVarError || e instanceof VarAssertError) {
        io.err.write(`${this.errPrefix()}${(e as Error).message}\n`);
        return 1;
      }
      throw e;
    } finally {
      this.frames.pop();
      this.depth--;
      void absPath;
    }
  }

  // -------------------------------------------------------------------------
  // redirections (ISC-37)
  // -------------------------------------------------------------------------

  applyRedirs(redirs: Redir[], io: IOCtx, host?: ExpandHost): { io: IOCtx; error: number | null } {
    const out: IOCtx = { ...io };
    const h = host ?? this.expandHost(io);
    for (const r of redirs) {
      if (r.kind === "heredoc") {
        const body = r.heredoc!.quoted ? r.heredoc!.body : this.expandHeredoc(r.heredoc!.body, h);
        out.stdin = body;
        continue;
      }
      const target = expandSingle(r.target!, h);
      if (r.kind === "dup") {
        if (target === "1") {
          if (r.fd === 2) out.err = out.out;
          continue;
        }
        if (target === "2") {
          if (r.fd !== 2) out.out = out.err; // 2>&2 is a no-op, not an alias swap (audit finding 7)
          continue;
        }
        out.err.write(`${this.errPrefix()}${target}: Bad file descriptor\n`);
        return { io: out, error: (this.lastExit = 1) };
      }
      const abs = this.resolve(target);
      if (r.kind === "in") {
        const node = this.vfs.lookup(abs);
        if (!node || node.t !== "file") {
          out.err.write(
            this.variant === "zsh-macos"
              ? `zsh: no such file or directory: ${target}\n`
              : `bash: ${target}: No such file or directory\n`,
          );
          return { io: out, error: (this.lastExit = 1) };
        }
        out.stdin = node.content;
        continue;
      }
      // out / append
      const sink = this.openFileSink(abs, r.kind === "append", target, out.err);
      if (sink === null) return { io: out, error: (this.lastExit = 1) };
      if (r.fd === 2) out.err = sink;
      else out.out = sink;
      out.ttyOut = r.fd === 2 ? out.ttyOut : false;
    }
    return { io: out, error: null };
  }

  private expandHeredoc(body: string, host: ExpandHost): string {
    // unquoted heredoc bodies expand $ constructs; build a synthetic double-quoted word
    const word: WordTok = { t: "word", parts: [{ k: "lit", q: "d", text: body }] };
    return expandSingle(word, host);
  }

  openFileSink(abs: string, append: boolean, display: string, err: Sink): Sink | null {
    const existing = this.vfs.lookup(abs);
    if (existing && existing.t === "dir") {
      err.write(`${this.errPrefix()}${display}: Is a directory\n`);
      return null;
    }
    const ok = this.vfs.writeFile(abs, "", { append, owner: this.user, now: this.now() });
    if (!ok) {
      err.write(
        this.variant === "zsh-macos" ? `zsh: no such file or directory: ${display}\n` : `bash: ${display}: No such file or directory\n`,
      );
      return null;
    }
    this.recordWrite(abs);
    const machine = this;
    return {
      write(s: string) {
        const node = machine.vfs.lookup(abs);
        if (node && node.t === "file") {
          node.content += s;
          node.mtime = machine.now();
        }
      },
    };
  }

}

export class StringSink implements Sink {
  text = "";
  write(s: string) {
    this.text += s;
  }
}
