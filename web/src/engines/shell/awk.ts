/**
 * POSIX-subset awk interpreter (web ISA — seed-tool fidelity; root ISC-55 taught subset).
 *
 * Covers what the curriculum and seed tools use: -F/-v options, regex patterns /re/,
 * expression patterns (NR == 1, NF != 2), BEGIN/END, actions with print (incl.
 * `> "/dev/stderr"` and file redirection), next, if/else, assignments, ++/--,
 * arithmetic, string concatenation, $0/$N field refs, and the ~ / !~ match operators.
 *
 * Anything outside this subset fails with the honest sim-boundary message — the
 * engine never invents awk behavior it does not actually implement.
 */
import type { IOCtx, Machine } from "./interpreter";
import { SIM_BOUNDARY_EXIT } from "./interpreter";

class AwkParseError extends Error {}
class NextSignal extends Error {}

type Value = string | number;

// ---------------------------------------------------------------------------
// lexer
// ---------------------------------------------------------------------------

interface Tok {
  t: "num" | "str" | "name" | "regex" | "op" | "nl";
  v: string;
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  const prevMeaning = (): Tok | undefined => toks[toks.length - 1];
  const expectOperand = (): boolean => {
    const p = prevMeaning();
    if (!p) return true;
    if (p.t === "num" || p.t === "str" || p.t === "name" || p.t === "regex") return false;
    if (p.t === "op" && (p.v === ")" || p.v === "$0")) return false;
    return p.t !== "op" || p.v !== ")";
  };
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "\\" && src[i + 1] === "\n") {
      i += 2;
      continue;
    }
    if (c === "\n") {
      toks.push({ t: "nl", v: "\n" });
      i++;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") {
          const e = src[i + 1]!;
          s += e === "n" ? "\n" : e === "t" ? "\t" : e === "\\" ? "\\" : e === '"' ? '"' : "\\" + e;
          i += 2;
        } else {
          s += src[i]!;
          i++;
        }
      }
      if (i >= n) throw new AwkParseError("unterminated string");
      i++;
      toks.push({ t: "str", v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+([eE][-+]?\d+)?/.exec(src.slice(i))!;
      toks.push({ t: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: "name", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "/" && expectOperand()) {
      let re = "";
      i++;
      while (i < n && src[i] !== "/") {
        if (src[i] === "\\") {
          re += src[i]! + (src[i + 1] ?? "");
          i += 2;
        } else {
          re += src[i]!;
          i++;
        }
      }
      if (i >= n) throw new AwkParseError("unterminated regex");
      i++;
      toks.push({ t: "regex", v: re });
      continue;
    }
    const three = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "!~", ">>"].includes(three)) {
      toks.push({ t: "op", v: three });
      i += 2;
      continue;
    }
    if ("{}();,<>+-*/%!~$=?:".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new AwkParseError(`unexpected character ${c}`);
  }
  return toks;
}

// ---------------------------------------------------------------------------
// parser
// ---------------------------------------------------------------------------

type Expr =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "regex"; v: string }
  | { k: "var"; name: string }
  | { k: "field"; idx: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "concat"; l: Expr; r: Expr }
  | { k: "neg"; e: Expr }
  | { k: "not"; e: Expr }
  | { k: "incdec"; op: "++" | "--"; pre: boolean; target: Expr }
  | { k: "assign"; op: string; target: Expr; value: Expr }
  | { k: "call"; name: string; args: Expr[] };

type Stmt =
  | { k: "print"; args: Expr[]; redirect: { append: boolean; target: Expr } | null }
  | { k: "next" }
  | { k: "expr"; e: Expr }
  | { k: "if"; cond: Expr; then: Stmt[]; else: Stmt[] | null };

interface Rule {
  kind: "main" | "begin" | "end";
  pattern: Expr | null;
  action: Stmt[] | null; // null → default { print }
}

class AwkParser {
  pos = 0;
  constructor(public toks: Tok[]) {}

  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  next(): Tok | undefined {
    return this.toks[this.pos++];
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === "op" && t.v === v;
  }
  eatOp(v: string) {
    if (!this.isOp(v)) throw new AwkParseError(`expected ${v}`);
    this.pos++;
  }
  skipNl() {
    while (this.peek()?.t === "nl" || this.isOp(";")) this.pos++;
  }

  parseProgram(): Rule[] {
    const rules: Rule[] = [];
    this.skipNl();
    while (this.peek() !== undefined) {
      rules.push(this.parseRule());
      this.skipNl();
    }
    return rules;
  }

  parseRule(): Rule {
    const t = this.peek()!;
    if (t.t === "name" && (t.v === "BEGIN" || t.v === "END")) {
      this.pos++;
      const action = this.parseBlock();
      return { kind: t.v === "BEGIN" ? "begin" : "end", pattern: null, action };
    }
    if (this.isOp("{")) return { kind: "main", pattern: null, action: this.parseBlock() };
    const pattern = this.parseExpr();
    if (this.isOp("{")) return { kind: "main", pattern, action: this.parseBlock() };
    return { kind: "main", pattern, action: null };
  }

  parseBlock(): Stmt[] {
    this.eatOp("{");
    const stmts: Stmt[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.peek() === undefined) throw new AwkParseError("unterminated block");
      stmts.push(this.parseStmt());
      this.skipNl();
    }
    this.eatOp("}");
    return stmts;
  }

  parseStmt(): Stmt {
    const t = this.peek()!;
    if (t.t === "name" && t.v === "print") {
      this.pos++;
      const args: Expr[] = [];
      let redirect: { append: boolean; target: Expr } | null = null;
      if (!this.atStmtEnd() && !this.isOp(">") && !this.isOp(">>")) {
        args.push(this.parseExpr(true));
        while (this.isOp(",")) {
          this.pos++;
          args.push(this.parseExpr(true));
        }
      }
      if (this.isOp(">") || this.isOp(">>")) {
        const append = this.peek()!.v === ">>";
        this.pos++;
        redirect = { append, target: this.parseExpr(true) };
      }
      return { k: "print", args, redirect };
    }
    if (t.t === "name" && t.v === "next") {
      this.pos++;
      return { k: "next" };
    }
    if (t.t === "name" && t.v === "if") {
      this.pos++;
      this.eatOp("(");
      const cond = this.parseExpr();
      this.eatOp(")");
      this.skipNl();
      const then = this.isOp("{") ? this.parseBlock() : [this.parseStmt()];
      this.skipNl();
      let els: Stmt[] | null = null;
      const e = this.peek();
      if (e && e.t === "name" && e.v === "else") {
        this.pos++;
        this.skipNl();
        els = this.isOp("{") ? this.parseBlock() : [this.parseStmt()];
      }
      return { k: "if", cond, then, else: els };
    }
    return { k: "expr", e: this.parseExpr() };
  }

  atStmtEnd(): boolean {
    const t = this.peek();
    return t === undefined || t.t === "nl" || (t.t === "op" && (t.v === ";" || t.v === "}"));
  }

  /** noGt: inside print args, a bare `>` is redirection, not comparison. */
  parseExpr(noGt = false): Expr {
    return this.parseAssign(noGt);
  }

  parseAssign(noGt: boolean): Expr {
    const left = this.parseOr(noGt);
    const t = this.peek();
    if (t && t.t === "op" && ["=", "+=", "-=", "*=", "/="].includes(t.v)) {
      if (left.k !== "var" && left.k !== "field") throw new AwkParseError("invalid assignment target");
      this.pos++;
      return { k: "assign", op: t.v, target: left, value: this.parseAssign(noGt) };
    }
    return left;
  }

  parseOr(noGt: boolean): Expr {
    let l = this.parseAnd(noGt);
    while (this.isOp("||")) {
      this.pos++;
      l = { k: "bin", op: "||", l, r: this.parseAnd(noGt) };
    }
    return l;
  }

  parseAnd(noGt: boolean): Expr {
    let l = this.parseMatch(noGt);
    while (this.isOp("&&")) {
      this.pos++;
      l = { k: "bin", op: "&&", l, r: this.parseMatch(noGt) };
    }
    return l;
  }

  parseMatch(noGt: boolean): Expr {
    let l = this.parseCompare(noGt);
    while (this.isOp("~") || this.isOp("!~")) {
      const op = this.next()!.v;
      l = { k: "bin", op, l, r: this.parseCompare(noGt) };
    }
    return l;
  }

  parseCompare(noGt: boolean): Expr {
    const l = this.parseConcat(noGt);
    const t = this.peek();
    const ops = noGt ? ["==", "!=", "<", "<=", ">="] : ["==", "!=", "<", "<=", ">", ">="];
    if (t && t.t === "op" && ops.includes(t.v)) {
      this.pos++;
      return { k: "bin", op: t.v, l, r: this.parseConcat(noGt) };
    }
    return l;
  }

  parseConcat(noGt: boolean): Expr {
    let l = this.parseAdd(noGt);
    for (;;) {
      const t = this.peek();
      if (
        t !== undefined &&
        (t.t === "str" || t.t === "num" || t.t === "name" || (t.t === "op" && (t.v === "$" || t.v === "(")))
      ) {
        // `name(`-style calls are still primary; bare name as concat operand is fine
        l = { k: "concat", l, r: this.parseAdd(noGt) };
        continue;
      }
      return l;
    }
  }

  parseAdd(noGt: boolean): Expr {
    let l = this.parseMul(noGt);
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next()!.v;
      l = { k: "bin", op, l, r: this.parseMul(noGt) };
    }
    return l;
  }

  parseMul(noGt: boolean): Expr {
    let l = this.parseUnary(noGt);
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next()!.v;
      l = { k: "bin", op, l, r: this.parseUnary(noGt) };
    }
    return l;
  }

  parseUnary(noGt: boolean): Expr {
    if (this.isOp("-")) {
      this.pos++;
      return { k: "neg", e: this.parseUnary(noGt) };
    }
    if (this.isOp("!")) {
      this.pos++;
      return { k: "not", e: this.parseUnary(noGt) };
    }
    if (this.isOp("++") || this.isOp("--")) {
      const op = this.next()!.v as "++" | "--";
      const target = this.parseUnary(noGt);
      return { k: "incdec", op, pre: true, target };
    }
    return this.parsePostfix(noGt);
  }

  parsePostfix(noGt: boolean): Expr {
    let e = this.parsePrimary(noGt);
    while (this.isOp("++") || this.isOp("--")) {
      const op = this.next()!.v as "++" | "--";
      e = { k: "incdec", op, pre: false, target: e };
    }
    return e;
  }

  parsePrimary(noGt: boolean): Expr {
    const t = this.next();
    if (t === undefined) throw new AwkParseError("unexpected end of program");
    if (t.t === "num") return { k: "num", v: Number(t.v) };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "regex") return { k: "regex", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const e = this.parseExpr();
      this.eatOp(")");
      return e;
    }
    if (t.t === "op" && t.v === "$") return { k: "field", idx: this.parsePostfix(noGt) };
    if (t.t === "name") {
      if (this.isOp("(")) {
        // unknown function calls (system, sprintf, split…) are OUTSIDE the simulated subset —
        // refuse to parse so the caller emits the honest boundary instead of doing nothing
        if (!["length", "substr", "index", "tolower", "toupper"].includes(t.v)) {
          throw new AwkParseError(`unsupported function ${t.v}`);
        }
        this.pos++;
        const args: Expr[] = [];
        if (!this.isOp(")")) {
          args.push(this.parseExpr());
          while (this.isOp(",")) {
            this.pos++;
            args.push(this.parseExpr());
          }
        }
        this.eatOp(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    throw new AwkParseError(`unexpected token ${t.v}`);
  }
}

// ---------------------------------------------------------------------------
// evaluator
// ---------------------------------------------------------------------------

class AwkRun {
  vars = new Map<string, Value>();
  fields: string[] = [];
  record = "";
  files = new Map<string, { truncated: boolean }>();

  constructor(
    public io: IOCtx,
    public m: Machine,
    public fs: string,
  ) {}

  setRecord(line: string) {
    this.record = line;
    if (this.fs === " ") {
      const trimmed = line.replace(/^[ \t]+|[ \t]+$/g, "");
      this.fields = trimmed === "" ? [] : trimmed.split(/[ \t]+/);
    } else if (this.fs.length <= 1) {
      this.fields = line.split(this.fs);
    } else {
      this.fields = line.split(new RegExp(this.fs));
    }
    this.vars.set("NF", this.fields.length);
  }

  getVar(name: string): Value {
    return this.vars.get(name) ?? "";
  }

  toNum(v: Value): number {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }

  toStr(v: Value): string {
    if (typeof v === "string") return v;
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(6)));
  }

  truthy(v: Value): boolean {
    return typeof v === "number" ? v !== 0 : v !== "";
  }

  fieldValue(idx: number): string {
    if (idx === 0) return this.record;
    return this.fields[idx - 1] ?? "";
  }

  evalExpr(e: Expr): Value {
    switch (e.k) {
      case "num":
        return e.v;
      case "str":
        return e.v;
      case "regex":
        return new RegExp(e.v).test(this.record) ? 1 : 0;
      case "var":
        return this.getVar(e.name);
      case "field":
        return this.fieldValue(this.toNum(this.evalExpr(e.idx)));
      case "neg":
        return -this.toNum(this.evalExpr(e.e));
      case "not":
        return this.truthy(this.evalExpr(e.e)) ? 0 : 1;
      case "concat":
        return this.toStr(this.evalExpr(e.l)) + this.toStr(this.evalExpr(e.r));
      case "incdec": {
        if (e.target.k !== "var") throw new AwkParseError("++/-- target must be a variable");
        const old = this.toNum(this.getVar(e.target.name));
        const nv = e.op === "++" ? old + 1 : old - 1;
        this.vars.set(e.target.name, nv);
        return e.pre ? nv : old;
      }
      case "assign": {
        const value = this.evalExpr(e.value);
        if (e.target.k === "var") {
          if (e.op === "=") this.vars.set(e.target.name, value);
          else {
            const old = this.toNum(this.getVar(e.target.name));
            const v = this.toNum(value);
            this.vars.set(e.target.name, e.op === "+=" ? old + v : e.op === "-=" ? old - v : e.op === "*=" ? old * v : old / v);
          }
          return this.vars.get(e.target.name)!;
        }
        throw new AwkParseError("field assignment is outside the simulated awk subset");
      }
      case "call": {
        const args = e.args.map((a) => this.evalExpr(a));
        switch (e.name) {
          case "length":
            return (args.length > 0 ? this.toStr(args[0]!) : this.record).length;
          case "substr": {
            const s = this.toStr(args[0] ?? "");
            const start = this.toNum(args[1] ?? 1);
            const len = args[2] !== undefined ? this.toNum(args[2]) : undefined;
            return len === undefined ? s.slice(start - 1) : s.slice(start - 1, start - 1 + len);
          }
          case "index":
            return this.toStr(args[0] ?? "").indexOf(this.toStr(args[1] ?? "")) + 1;
          case "tolower":
            return this.toStr(args[0] ?? "").toLowerCase();
          default:
            return this.toStr(args[0] ?? "").toUpperCase();
        }
      }
      default: {
        const l = this.evalExpr(e.l);
        if (e.op === "&&") return this.truthy(l) && this.truthy(this.evalExpr(e.r)) ? 1 : 0;
        if (e.op === "||") return this.truthy(l) || this.truthy(this.evalExpr(e.r)) ? 1 : 0;
        if (e.op === "~" || e.op === "!~") {
          const pattern = e.r.k === "regex" ? e.r.v : this.toStr(this.evalExpr(e.r));
          const matched = new RegExp(pattern).test(this.toStr(l));
          return (e.op === "~" ? matched : !matched) ? 1 : 0;
        }
        const r = this.evalExpr(e.r);
        switch (e.op) {
          case "+":
            return this.toNum(l) + this.toNum(r);
          case "-":
            return this.toNum(l) - this.toNum(r);
          case "*":
            return this.toNum(l) * this.toNum(r);
          case "/":
            return this.toNum(l) / this.toNum(r);
          case "%":
            return this.toNum(l) % this.toNum(r);
          default: {
            const bothNumeric =
              (typeof l === "number" || looksNumeric(l)) && (typeof r === "number" || looksNumeric(r));
            const cmp = bothNumeric
              ? this.toNum(l) - this.toNum(r)
              : this.toStr(l) < this.toStr(r)
                ? -1
                : this.toStr(l) > this.toStr(r)
                  ? 1
                  : 0;
            switch (e.op) {
              case "==":
                return cmp === 0 ? 1 : 0;
              case "!=":
                return cmp !== 0 ? 1 : 0;
              case "<":
                return cmp < 0 ? 1 : 0;
              case "<=":
                return cmp <= 0 ? 1 : 0;
              case ">":
                return cmp > 0 ? 1 : 0;
              default:
                return cmp >= 0 ? 1 : 0;
            }
          }
        }
      }
    }
  }

  runStmts(stmts: Stmt[]) {
    for (const s of stmts) {
      switch (s.k) {
        case "print": {
          const text = (s.args.length === 0 ? [this.record] : s.args.map((a) => this.toStr(this.evalExpr(a)))).join(" ") + "\n";
          if (s.redirect === null) {
            this.io.out.write(text);
            break;
          }
          const target = this.toStr(this.evalExpr(s.redirect.target));
          if (target === "/dev/stderr") {
            this.io.err.write(text);
            break;
          }
          if (target === "/dev/stdout") {
            this.io.out.write(text);
            break;
          }
          const abs = this.m.resolve(target);
          const state = this.files.get(abs);
          const append = s.redirect.append || state !== undefined;
          this.m.vfs.writeFile(abs, text, { append, owner: this.m.user, now: this.m.now() });
          this.m.recordWrite(abs);
          this.files.set(abs, { truncated: true });
          break;
        }
        case "next":
          throw new NextSignal();
        case "expr":
          this.evalExpr(s.e);
          break;
        case "if":
          if (this.truthy(this.evalExpr(s.cond))) this.runStmts(s.then);
          else if (s.else) this.runStmts(s.else);
          break;
      }
    }
  }
}

function looksNumeric(s: string): boolean {
  return /^[ \t]*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?[ \t]*$/.test(s);
}

// ---------------------------------------------------------------------------
// entry point (invoked from coreutils dispatch)
// ---------------------------------------------------------------------------

export function runAwk(args: string[], io: IOCtx, m: Machine): number {
  let fs = " ";
  const assigns: [string, string][] = [];
  let program: string | null = null;
  const files: string[] = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (program === null && a === "-F") {
      fs = args[++i] ?? " ";
      i++;
      continue;
    }
    if (program === null && a.startsWith("-F")) {
      fs = a.slice(2);
      i++;
      continue;
    }
    if (program === null && a === "-v") {
      const kv = args[++i] ?? "";
      const eq = kv.indexOf("=");
      if (eq > 0) assigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
      i++;
      continue;
    }
    if (program === null && a.startsWith("-") && a !== "-") {
      io.err.write(`grc-sim: awk: option ${a} is outside this lab's simulated surface — run it on a real machine to explore\n`);
      return SIM_BOUNDARY_EXIT;
    }
    if (program === null) {
      program = a;
      i++;
      continue;
    }
    files.push(a);
    i++;
  }
  if (program === null) {
    io.err.write("usage: awk [-F fs] [-v var=value] 'prog' [file ...]\n");
    return 2;
  }
  if (fs === "\\t") fs = "\t";

  let rules: Rule[];
  try {
    rules = new AwkParser(lex(program)).parseProgram();
  } catch {
    io.err.write("grc-sim: awk: program uses features outside this lab's simulated surface — run it on a real machine to explore\n");
    return SIM_BOUNDARY_EXIT;
  }

  // gather input
  let input = "";
  if (files.length === 0 || (files.length === 1 && files[0] === "-")) {
    input = io.stdin ?? "";
  } else {
    for (const f of files) {
      const content = m.vfs.readFile(m.resolve(f));
      if (content === null) {
        io.err.write(`awk: cannot open ${f} (No such file or directory)\n`);
        return 2;
      }
      input = input + content;
    }
  }

  const run = new AwkRun(io, m, fs);
  for (const [k, v] of assigns) run.vars.set(k, v);
  run.vars.set("NR", 0);
  run.vars.set("NF", 0);

  try {
    for (const r of rules.filter((r) => r.kind === "begin")) run.runStmts(r.action!);

    const lines = input.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const mainRules = rules.filter((r) => r.kind === "main");
    for (const line of lines) {
      m.budgetStep();
      run.vars.set("NR", run.toNum(run.getVar("NR")) + 1);
      run.setRecord(line);
      try {
        for (const r of mainRules) {
          const matched = r.pattern === null ? true : run.truthy(run.evalExpr(r.pattern));
          if (!matched) continue;
          if (r.action === null) io.out.write(run.record + "\n");
          else run.runStmts(r.action);
        }
      } catch (e) {
        if (!(e instanceof NextSignal)) throw e;
      }
    }

    for (const r of rules.filter((r) => r.kind === "end")) run.runStmts(r.action!);
  } catch (e) {
    if (e instanceof AwkParseError) {
      io.err.write("grc-sim: awk: program uses features outside this lab's simulated surface — run it on a real machine to explore\n");
      return SIM_BOUNDARY_EXIT;
    }
    throw e;
  }
  return 0;
}
