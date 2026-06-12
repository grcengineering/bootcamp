/**
 * Word expansion (web ISA ISC-38/39/40): $VAR / ${VAR} / $? / $1..$9 / $# / $@,
 * ${VAR:-def} / ${VAR:?msg} forms, $( ) command substitution, $(( )) arithmetic,
 * tilde, field splitting, and globbing with per-variant no-match semantics.
 */
import type { WordTok, Part } from "./lexer";

export interface ExpandHost {
  getVar(name: string): string | undefined;
  setVar(name: string, value: string): void;
  positional: string[];
  scriptName: string;
  lastExit: number;
  nounset: boolean;
  variant: "bash-linux" | "zsh-macos";
  home: string;
  runSub(cmd: string): string;
  /** Expand a glob pattern (already regex-compiled per segment). null → no matches. */
  glob(pattern: PatChar[]): string[] | null;
}

/** One pattern character: quoted chars match literally even if they are glob metas. */
export interface PatChar {
  c: string;
  q: boolean;
}

export class UnboundVarError extends Error {
  constructor(public varName: string) {
    super(`${varName}: unbound variable`);
  }
}

export class VarAssertError extends Error {
  constructor(
    public varName: string,
    public msg: string,
  ) {
    super(`${varName}: ${msg}`);
  }
}

export class NoGlobMatchError extends Error {
  constructor(public pattern: string) {
    super(`no matches found: ${pattern}`);
  }
}

interface XChar {
  c: string;
  q: boolean; // quoted → glob metas inert
  s: boolean; // splittable → came from an unquoted expansion
}

const BREAK = Symbol("field-break");
type Piece = XChar | typeof BREAK;

function pushText(out: Piece[], text: string, q: boolean, s: boolean) {
  for (const c of text) out.push({ c, q, s });
}

/** Expand $-constructs in a literal run. `q` = inside double quotes. */
function expandDollar(text: string, q: boolean, host: ExpandHost, out: Piece[]) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    // Backtick command substitution — the deprecated form bash still honors everywhere,
    // including double quotes and heredoc bodies (engine audit finding 2, 2026-06-12).
    if (c === "`") {
      let j = i + 1;
      let cmd = "";
      while (j < n && text[j] !== "`") {
        if (text[j] === "\\" && j + 1 < n && (text[j + 1] === "`" || text[j + 1] === "\\" || text[j + 1] === "$")) {
          cmd += text[j + 1];
          j += 2;
          continue;
        }
        cmd += text[j];
        j++;
      }
      if (j < n) {
        pushText(out, host.runSub(cmd).replace(/\n+$/, ""), q, !q);
        i = j + 1;
        continue;
      }
      // unterminated backtick: fall through as literal (lexer-level errors handled upstream)
    }
    if (c !== "$" || i + 1 >= n) {
      out.push({ c, q, s: false });
      i++;
      continue;
    }
    const nx = text[i + 1]!;
    // $( … ) and $(( … )) reached as literal text (heredoc bodies are synthetic d-quoted
    // lits that never pass the lexer's extraction — engine audit finding 3, 2026-06-12).
    if (nx === "(") {
      const arith = text[i + 2] === "(";
      let depth = 0;
      let j = i + 1;
      while (j < n) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")") { depth--; if (depth === 0) break; }
        j++;
      }
      if (j < n) {
        const inner = text.slice(i + 2, j); // for arith this includes the inner parens' body + ")"
        const result = arith
          ? host.runSub(`printf %s "$(${inner})"`).replace(/\n+$/, "")
          : host.runSub(inner).replace(/\n+$/, "");
        pushText(out, result, q, !q);
        i = j + 1;
        continue;
      }
    }
    if (nx === "?") {
      pushText(out, String(host.lastExit), q, !q);
      i += 2;
      continue;
    }
    if (nx === "#") {
      pushText(out, String(host.positional.length), q, !q);
      i += 2;
      continue;
    }
    if (nx === "@" || nx === "*") {
      // "$@" inside quotes → one field per positional; otherwise join with spaces (splittable)
      if (q && nx === "@") {
        host.positional.forEach((p, idx) => {
          if (idx > 0) out.push(BREAK);
          pushText(out, p, true, false);
        });
      } else {
        pushText(out, host.positional.join(" "), q, !q);
      }
      i += 2;
      continue;
    }
    if (nx === "0") {
      pushText(out, host.scriptName, q, !q);
      i += 2;
      continue;
    }
    if (/[1-9]/.test(nx)) {
      pushText(out, host.positional[Number(nx) - 1] ?? "", q, !q);
      i += 2;
      continue;
    }
    if (nx === "{") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (text[j] === "{") depth++;
        if (text[j] === "}") depth--;
        j++;
      }
      const inner = text.slice(i + 2, j - 1);
      pushText(out, expandBraced(inner, host), q, !q);
      i = j;
      continue;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i + 1));
    if (m) {
      pushText(out, lookupVar(m[0], host, false), q, !q);
      i += 1 + m[0].length;
      continue;
    }
    out.push({ c, q, s: false });
    i++;
  }
}

function lookupVar(name: string, host: ExpandHost, guarded: boolean): string {
  let v: string | undefined;
  if (/^\d+$/.test(name)) v = name === "0" ? host.scriptName : host.positional[Number(name) - 1];
  else if (name === "#") v = String(host.positional.length);
  else if (name === "?") v = String(host.lastExit);
  else v = host.getVar(name);
  if (v === undefined && host.nounset && !guarded) throw new UnboundVarError(name);
  return v ?? "";
}

/** ${NAME}, ${#NAME}, ${NAME:-w}, ${NAME-w}, ${NAME:=w}, ${NAME:+w}, ${NAME:?w}. */
function expandBraced(inner: string, host: ExpandHost): string {
  if (inner.startsWith("#")) {
    return String(lookupVar(inner.slice(1), host, true).length);
  }
  const m = /^([A-Za-z_][A-Za-z0-9_]*|\d+|[#?@*])(:?[-=?+])?(.*)$/s.exec(inner);
  if (!m) return "";
  const [, name, op, rest] = m as unknown as [string, string, string | undefined, string];
  const val = lookupVar(name, host, op !== undefined);
  if (op === undefined) return val;
  const colon = op.startsWith(":");
  const kind = op.slice(colon ? 1 : 0);
  const isUnset = !colon
    ? rawIsUnset(name, host)
    : val === "" || rawIsUnset(name, host);
  const wordVal = () => expandTextToString(rest, host);
  switch (kind) {
    case "-":
      return isUnset ? wordVal() : val;
    case "=": {
      if (isUnset) {
        const w = wordVal();
        host.setVar(name, w);
        return w;
      }
      return val;
    }
    case "+":
      return isUnset ? "" : wordVal();
    default: {
      // "?"
      if (isUnset) throw new VarAssertError(name, rest !== "" ? expandTextToString(rest, host) : "parameter null or not set");
      return val;
    }
  }
}

function rawIsUnset(name: string, host: ExpandHost): boolean {
  if (/^\d+$/.test(name)) return name !== "0" && host.positional[Number(name) - 1] === undefined;
  if (name === "#" || name === "?" || name === "@" || name === "*") return false;
  return host.getVar(name) === undefined;
}

/** Expand a plain text fragment (used inside ${...:-word} defaults). */
function expandTextToString(text: string, host: ExpandHost): string {
  const pieces: Piece[] = [];
  expandDollar(text, true, host, pieces);
  return pieces
    .filter((p): p is XChar => p !== BREAK)
    .map((p) => p.c)
    .join("");
}

export interface ExpandOptions {
  /** disable field splitting + globbing (redirection targets, case words, assignments) */
  single?: boolean;
}

export function expandWord(word: WordTok, host: ExpandHost, opts: ExpandOptions = {}): string[] {
  const pieces: Piece[] = [];
  let sawQuoted = false;
  for (const part of word.parts) {
    if (part.k === "lit") {
      if (part.q === "s") {
        sawQuoted = true;
        pushText(pieces, part.text, true, false);
      } else if (part.q === "d") {
        sawQuoted = true;
        expandDollar(part.text, true, host, pieces);
      } else {
        expandDollar(part.text, false, host, pieces);
      }
    } else if (part.k === "cs") {
      const outText = host.runSub(part.cmd).replace(/\n+$/, "");
      if (part.q === "d") {
        sawQuoted = true;
        pushText(pieces, outText, true, false);
      } else pushText(pieces, outText, false, true);
    } else {
      const v = String(evalArith(part.expr, host));
      pushText(pieces, v, part.q === "d", part.q !== "d");
    }
  }

  // tilde expansion: leading unquoted ~ at word start, followed by / or end
  const first = pieces[0];
  if (first && first !== BREAK && first.c === "~" && !first.q && !first.s) {
    const second = pieces[1];
    if (second === undefined || second === BREAK || (second as XChar).c === "/") {
      pieces.splice(0, 1, ...[...host.home].map((c) => ({ c, q: true, s: false }) as XChar));
    }
  }

  // field splitting
  let fields: XChar[][];
  if (opts.single) {
    fields = [pieces.filter((p): p is XChar => p !== BREAK)];
  } else {
    fields = [[]];
    for (const p of pieces) {
      if (p === BREAK) {
        fields.push([]);
        continue;
      }
      if (p.s && (p.c === " " || p.c === "\t" || p.c === "\n")) {
        if (fields[fields.length - 1]!.length > 0) fields.push([]);
        continue;
      }
      fields[fields.length - 1]!.push(p);
    }
    // drop a trailing empty field produced by splitting, and empty unquoted words
    fields = fields.filter((f, idx) => f.length > 0 || (sawQuoted && idx === 0 && fields.length === 1));
    if (fields.length === 0 && sawQuoted) fields = [[]];
  }

  // globbing
  const results: string[] = [];
  for (const field of fields) {
    if (!opts.single && hasGlobChars(field)) {
      const matches = host.glob(field.map((p) => ({ c: p.c, q: p.q })));
      if (matches !== null) {
        results.push(...matches);
        continue;
      }
      if (host.variant === "zsh-macos") throw new NoGlobMatchError(field.map((p) => p.c).join(""));
    }
    results.push(field.map((p) => p.c).join(""));
  }
  return results;
}

/** Expand to exactly one string (redirection targets, case subjects, assignment values). */
export function expandSingle(word: WordTok, host: ExpandHost): string {
  return expandWord(word, host, { single: true })[0] ?? "";
}

function hasGlobChars(field: XChar[]): boolean {
  return field.some((p) => !p.q && (p.c === "*" || p.c === "?" || p.c === "["));
}

/** Compile pattern chars to an anchored RegExp (used for glob segments + case patterns). */
export function patternToRegex(pat: PatChar[]): RegExp {
  let re = "";
  let i = 0;
  while (i < pat.length) {
    const p = pat[i]!;
    if (p.q) {
      re += escapeRe(p.c);
      i++;
      continue;
    }
    if (p.c === "*") {
      re += "[^/]*";
      i++;
      continue;
    }
    if (p.c === "?") {
      re += "[^/]";
      i++;
      continue;
    }
    if (p.c === "[") {
      // find unquoted closing ]
      let j = i + 1;
      let cls = "";
      let negate = false;
      if (j < pat.length && !pat[j]!.q && (pat[j]!.c === "!" || pat[j]!.c === "^")) {
        negate = true;
        j++;
      }
      let closed = false;
      for (; j < pat.length; j++) {
        if (!pat[j]!.q && pat[j]!.c === "]" && cls !== "") {
          closed = true;
          break;
        }
        cls += pat[j]!.c;
      }
      if (closed) {
        re += `[${negate ? "^" : ""}${cls.replace(/[\\^\]]/g, (m) => "\\" + m)}]`;
        i = j + 1;
        continue;
      }
      re += "\\[";
      i++;
      continue;
    }
    re += escapeRe(p.c);
    i++;
  }
  return new RegExp(`^${re}$`);
}

function escapeRe(c: string): string {
  return /[.*+?^${}()|[\]\\\/]/.test(c) ? "\\" + c : c;
}

/** Match a string against a shell pattern word (case statements). */
export function matchPattern(str: string, patternWord: WordTok, host: ExpandHost): boolean {
  const pieces: Piece[] = [];
  for (const part of patternWord.parts) {
    if (part.k === "lit") {
      if (part.q === "s") pushText(pieces, part.text, true, false);
      else if (part.q === "d") expandDollar(part.text, true, host, pieces);
      else expandDollar(part.text, false, host, pieces);
    } else if (part.k === "cs") {
      pushText(pieces, host.runSub(part.cmd).replace(/\n+$/, ""), true, false);
    } else {
      pushText(pieces, String(evalArith(part.expr, host)), true, false);
    }
  }
  const chars = pieces.filter((p): p is XChar => p !== BREAK).map((p) => ({ c: p.c, q: p.q }));
  return patternToRegex(chars).test(str);
}

// ---------------------------------------------------------------------------
// $(( … )) arithmetic — integer subset: + - * / % comparisons, ( ), unary -/!.
// ---------------------------------------------------------------------------

export function evalArith(expr: string, host: ExpandHost): number {
  const toks = expr.match(/\d+|[A-Za-z_][A-Za-z0-9_]*|<=|>=|==|!=|&&|\|\||[-+*/%()<>!]/g) ?? [];
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  const primary = (): number => {
    const t = next();
    if (t === undefined) return 0;
    if (t === "(") {
      const v = logicalOr();
      if (peek() === ")") next();
      return v;
    }
    if (t === "-") return -primary();
    if (t === "!") return primary() === 0 ? 1 : 0;
    if (/^\d+$/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) {
      const v = host.getVar(t);
      const num = v === undefined ? 0 : Number.parseInt(v, 10);
      return Number.isNaN(num) ? 0 : num;
    }
    return 0;
  };
  const mul = (): number => {
    let v = primary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const r = primary();
      v = op === "*" ? v * r : op === "/" ? Math.trunc(v / r) : v % r;
    }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const cmp = (): number => {
    let v = add();
    while (["<", ">", "<=", ">=", "==", "!="].includes(peek() ?? "")) {
      const op = next();
      const r = add();
      const b = op === "<" ? v < r : op === ">" ? v > r : op === "<=" ? v <= r : op === ">=" ? v >= r : op === "==" ? v === r : v !== r;
      v = b ? 1 : 0;
    }
    return v;
  };
  const logicalAnd = (): number => {
    let v = cmp();
    while (peek() === "&&") {
      next();
      const r = cmp();
      v = v !== 0 && r !== 0 ? 1 : 0;
    }
    return v;
  };
  const logicalOr = (): number => {
    let v = logicalAnd();
    while (peek() === "||") {
      next();
      const r = logicalAnd();
      v = v !== 0 || r !== 0 ? 1 : 0;
    }
    return v;
  };
  return logicalOr();
}
