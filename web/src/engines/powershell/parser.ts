/**
 * Parser for the constrained PS 5.1 grammar (web ISA ISC-63/64).
 *
 * statement  := pipeline [ '>' file ]
 * pipeline   := head ( '|' call )*
 * head       := call | expr
 * call       := Word arg*            arg := -Param | value (`,`-separated values group)
 * expr       := literal | bareword | @{...} | [pscustomobject]@{...} | '(' pipeline ')' [.Member] | {filter}
 *
 * EOF inside an open construct raises IncompleteInput (console continuation, `>> `);
 * any other malformed input raises PsParseError with the documented PS vocabulary.
 */
import { lex, IncompleteInput, PsParseError, type Token } from "./lexer";

export type Expr =
  | { t: "lit"; v: string | number | boolean | null }
  | { t: "bare"; v: string }
  | { t: "arr"; items: Expr[] }
  | { t: "hash"; entries: Array<[string, Expr]> }
  | { t: "pscustom"; entries: Array<[string, Expr]> }
  | { t: "paren"; inner: Pipeline; member: string | null }
  | { t: "sb"; prop: string; op: string | null; value: Expr | null };

export type Arg = { kind: "param"; name: string } | { kind: "val"; value: Expr };

export interface Stage { name: string; args: Arg[] }

export interface Pipeline {
  head: { kind: "cmd"; stage: Stage } | { kind: "expr"; expr: Expr };
  stages: Stage[];
  redirect: string | null;
}

export function parse(src: string): Pipeline[] {
  return new Parser(lex(src)).program();
}

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  private peek(): Token | null { return this.pos < this.toks.length ? this.toks[this.pos] : null; }
  private next(): Token | null { return this.pos < this.toks.length ? this.toks[this.pos++] : null; }
  private isOp(t: Token | null, v: string): boolean { return !!t && t.k === "op" && t.v === v; }
  private skipNl(): void { while (this.isOp(this.peek(), "nl")) this.pos++; }

  program(): Pipeline[] {
    const out: Pipeline[] = [];
    for (;;) {
      while (this.isOp(this.peek(), "nl") || this.isOp(this.peek(), ";")) this.pos++;
      if (this.peek() === null) return out;
      out.push(this.pipeline(false));
    }
  }

  /** insideParen: pipeline ends at `)` instead of consuming statement separators. */
  pipeline(insideParen: boolean): Pipeline {
    const t = this.peek()!;
    let head: Pipeline["head"];
    if (t.k === "word") {
      this.pos++;
      head = { kind: "cmd", stage: this.call(t.v) };
    } else {
      head = { kind: "expr", expr: this.value() };
    }

    const stages: Stage[] = [];
    let redirect: string | null = null;
    for (;;) {
      const p = this.peek();
      if (this.isOp(p, "|")) {
        this.pos++;
        this.skipNl(); // a line ending in `|` continues on the next line (module 04 §5.3)
        const nt = this.peek();
        if (nt === null) throw new IncompleteInput("An empty pipe element is not allowed.");
        if (nt.k !== "word") throw new PsParseError("Expressions are only allowed as the first element of a pipeline.");
        this.pos++;
        stages.push(this.call(nt.v));
        continue;
      }
      if (this.isOp(p, ">")) {
        this.pos++;
        const ft = this.next();
        // Real PS errors here immediately — a bare `>` is not a continuable construct.
        if (ft === null || (ft.k !== "word" && ft.k !== "str")) {
          throw new PsParseError("Missing file specification after redirection operator.");
        }
        redirect = ft.v as string;
        continue;
      }
      break;
    }

    const end = this.peek();
    if (insideParen) {
      if (!this.isOp(end, ")")) {
        if (end === null) throw new IncompleteInput("Missing closing ')' in expression.");
        throw new PsParseError(`Unexpected token '${tokenText(end)}' in expression or statement.`);
      }
    } else if (end !== null && !this.isOp(end, "nl") && !this.isOp(end, ";")) {
      throw new PsParseError(`Unexpected token '${tokenText(end)}' in expression or statement.`);
    }
    return { head, stages, redirect };
  }

  /** Command-call arguments, already past the command word. */
  private call(name: string): Stage {
    const args: Arg[] = [];
    for (;;) {
      const t = this.peek();
      if (
        t === null || this.isOp(t, "|") || this.isOp(t, ">") || this.isOp(t, "nl") ||
        this.isOp(t, ";") || this.isOp(t, ")")
      ) break;
      if (t.k === "param") { this.pos++; args.push({ kind: "param", name: t.v }); continue; }
      let v = this.value();
      while (this.isOp(this.peek(), ",")) {
        this.pos++;
        this.skipNl();
        const items = v.t === "arr" ? v.items : [v];
        items.push(this.value());
        v = { t: "arr", items };
      }
      args.push({ kind: "val", value: v });
    }
    return { name, args };
  }

  private value(): Expr {
    const t = this.next();
    if (t === null) throw new IncompleteInput("Missing expression after operator.");
    if (t.k === "str") return { t: "lit", v: t.v };
    if (t.k === "num") return { t: "lit", v: t.v };
    if (t.k === "word") return { t: "bare", v: t.v };
    if (t.k === "var") {
      const lower = t.v.toLowerCase();
      if (lower === "true") return { t: "lit", v: true };
      if (lower === "false") return { t: "lit", v: false };
      if (lower === "null") return { t: "lit", v: null };
      throw new PsParseError(`The variable '$${t.v}' is not in this lab's taught subset ($_ is available inside Where-Object filter blocks).`);
    }
    if (t.k === "cast") {
      if (t.v.toLowerCase() !== "pscustomobject") {
        throw new PsParseError(`Unable to find type [${t.v}] — only [pscustomobject] is in this lab's taught subset.`);
      }
      const open = this.next();
      if (open === null) throw new IncompleteInput("Missing '@{' after [pscustomobject].");
      if (!this.isOp(open, "@{")) throw new PsParseError("Missing '@{' after [pscustomobject].");
      return { t: "pscustom", entries: this.hashEntries() };
    }
    if (this.isOp(t, "@{")) return { t: "hash", entries: this.hashEntries() };
    if (this.isOp(t, "(")) {
      this.skipNl();
      const inner = this.pipeline(true);
      this.pos++; // consume )
      let member: string | null = null;
      if (this.isOp(this.peek(), ".")) {
        this.pos++;
        const m = this.next();
        if (m === null) throw new IncompleteInput("Missing property name after '.'.");
        if (m.k !== "word") throw new PsParseError("Missing property name after '.'.");
        member = m.v;
      }
      return { t: "paren", inner, member };
    }
    if (this.isOp(t, "{")) return this.filterBlock();
    throw new PsParseError(`Unexpected token '${tokenText(t)}' in expression or statement.`);
  }

  /** `{ $_.Prop }` or `{ $_.Prop -op value }` (Where-Object taught subset). */
  private filterBlock(): Expr {
    this.skipNl();
    const v = this.next();
    if (v === null) throw new IncompleteInput("Missing closing '}' in statement block.");
    if (v.k !== "var" || v.v !== "_") throw new PsParseError("Filter blocks in this lab's taught subset take the form { $_.Property -op value }.");
    const dot = this.next();
    if (dot === null) throw new IncompleteInput("Missing closing '}' in statement block.");
    if (!this.isOp(dot, ".")) throw new PsParseError("Filter blocks in this lab's taught subset take the form { $_.Property -op value }.");
    const prop = this.next();
    if (prop === null) throw new IncompleteInput("Missing closing '}' in statement block.");
    if (prop.k !== "word") throw new PsParseError("Missing property name after '.'.");
    let op: string | null = null;
    let value: Expr | null = null;
    let t = this.next();
    if (t === null) throw new IncompleteInput("Missing closing '}' in statement block.");
    if (t.k === "param") {
      const lower = t.v.toLowerCase();
      if (!["eq", "ne", "gt", "ge", "lt", "le", "like", "notlike"].includes(lower)) {
        throw new PsParseError(`Operator '-${t.v}' is not in this lab's taught subset (-eq -ne -gt -ge -lt -le -like -notlike).`);
      }
      op = lower;
      value = this.value();
      t = this.next();
      if (t === null) throw new IncompleteInput("Missing closing '}' in statement block.");
    }
    if (!this.isOp(t, "}")) throw new PsParseError("Missing closing '}' in statement block.");
    return { t: "sb", prop: prop.v, op, value };
  }

  /** Entries of @{ k = v ; k2 = v2 } — `;` or newline separated, `}` terminated. */
  private hashEntries(): Array<[string, Expr]> {
    const entries: Array<[string, Expr]> = [];
    for (;;) {
      while (this.isOp(this.peek(), "nl") || this.isOp(this.peek(), ";")) this.pos++;
      const t = this.next();
      if (t === null) throw new IncompleteInput("Missing closing '}' in hash literal.");
      if (this.isOp(t, "}")) return entries;
      if (t.k !== "word" && t.k !== "str") throw new PsParseError("Missing '=' operator after key in hash literal.");
      const eq = this.next();
      if (eq === null) throw new IncompleteInput("Missing '=' operator after key in hash literal.");
      if (!this.isOp(eq, "=")) throw new PsParseError("Missing '=' operator after key in hash literal.");
      this.skipNl();
      let v = this.value();
      while (this.isOp(this.peek(), ",")) {
        this.pos++;
        this.skipNl();
        const items = v.t === "arr" ? v.items : [v];
        items.push(this.value());
        v = { t: "arr", items };
      }
      entries.push([t.v as string, v]);
    }
  }
}

function tokenText(t: Token): string {
  if (t.k === "op") return t.v;
  if (t.k === "param") return `-${t.v}`;
  if (t.k === "var") return `$${t.v}`;
  if (t.k === "cast") return `[${t.v}]`;
  return String(t.v);
}
