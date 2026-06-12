/**
 * Shell parser (web ISA ISC-36/37/47/49/50): pipelines, redirections, ;/&&/|| lists,
 * and the compound commands the seed tools + lab scripts need (if/while/for/case/{ }).
 */
import { tokenize, type Token, type WordTok, type RedirTok, SyntaxErr, UnexpectedEof, rawText } from "./lexer";

export interface Redir {
  fd: number;
  kind: "in" | "out" | "append" | "heredoc" | "dup";
  target: WordTok | null; // null only for heredoc
  heredoc?: { body: string; quoted: boolean };
}

export interface SimpleCmd {
  k: "simple";
  assigns: { name: string; value: WordTok }[];
  words: WordTok[];
  redirs: Redir[];
}

export interface IfCmd {
  k: "if";
  clauses: { cond: List; body: List }[];
  elseBody: List | null;
}

export interface WhileCmd {
  k: "while";
  until: boolean;
  cond: List;
  body: List;
}

export interface ForCmd {
  k: "for";
  name: string;
  words: WordTok[] | null; // null → "$@"
  body: List;
}

export interface CaseCmd {
  k: "case";
  word: WordTok;
  clauses: { patterns: WordTok[]; body: List }[];
}

export interface GroupCmd {
  k: "group";
  subshell: boolean;
  body: List;
  redirs: Redir[];
}

export type Cmd = SimpleCmd | IfCmd | WhileCmd | ForCmd | CaseCmd | GroupCmd;

export interface Pipeline {
  negate: boolean;
  stages: Cmd[];
}

export interface AndOr {
  /** first op is always null */
  parts: { op: "&&" | "||" | null; pipe: Pipeline }[];
}

export type List = AndOr[];

const KEYWORDS = new Set(["if", "then", "elif", "else", "fi", "while", "until", "do", "done", "for", "in", "case", "esac", "{", "}", "!"]);

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  peek(): Token | null {
    return this.toks[this.pos] ?? null;
  }

  next(): Token | null {
    return this.toks[this.pos++] ?? null;
  }

  private isOp(t: Token | null, v: string): boolean {
    return !!t && t.t === "op" && t.v === v;
  }

  private isKeyword(t: Token | null, kw: string): boolean {
    return !!t && t.t === "word" && t.parts.length === 1 && t.parts[0]!.k === "lit" && t.parts[0]!.q === "n" && t.parts[0]!.text === kw;
  }

  private keywordOf(t: Token | null): string | null {
    if (t && t.t === "word" && t.parts.length === 1 && t.parts[0]!.k === "lit" && t.parts[0]!.q === "n" && KEYWORDS.has(t.parts[0]!.text))
      return t.parts[0]!.text;
    return null;
  }

  private skipNewlines() {
    while (this.isOp(this.peek(), "\n")) this.pos++;
  }

  private expectKeyword(kw: string) {
    const t = this.next();
    if (!this.isKeyword(t, kw)) {
      if (t === null) throw new UnexpectedEof(`expected \`${kw}'`);
      throw new SyntaxErr(`syntax error near unexpected token \`${tokenDesc(t)}'`);
    }
  }

  parseProgram(): List {
    const list = this.parseList(new Set());
    this.skipNewlines();
    const t = this.peek();
    if (t !== null) throw new SyntaxErr(`syntax error near unexpected token \`${tokenDesc(t)}'`);
    return list;
  }

  /** Parse a command list until EOF or one of the given stop keywords / ops. */
  parseList(stop: Set<string>): List {
    const list: List = [];
    for (;;) {
      this.skipNewlines();
      const t = this.peek();
      if (t === null) break;
      if (t.t === "op" && (t.v === ")" || t.v === ";;")) break;
      const kw = this.keywordOf(t);
      if (kw !== null && stop.has(kw)) break;
      list.push(this.parseAndOr());
      // separator
      const sep = this.peek();
      if (this.isOp(sep, ";") || this.isOp(sep, "\n")) this.pos++;
      else break;
    }
    return list;
  }

  parseAndOr(): AndOr {
    const parts: AndOr["parts"] = [{ op: null, pipe: this.parsePipeline() }];
    for (;;) {
      const t = this.peek();
      if (this.isOp(t, "&&") || this.isOp(t, "||")) {
        this.pos++;
        this.skipNewlines();
        parts.push({ op: (t as { v: "&&" | "||" }).v, pipe: this.parsePipeline() });
      } else break;
    }
    return { parts };
  }

  parsePipeline(): Pipeline {
    let negate = false;
    if (this.isKeyword(this.peek(), "!")) {
      this.pos++;
      negate = true;
    }
    const stages: Cmd[] = [this.parseCommand()];
    while (this.isOp(this.peek(), "|")) {
      this.pos++;
      this.skipNewlines();
      stages.push(this.parseCommand());
    }
    return { negate, stages };
  }

  parseCommand(): Cmd {
    const t = this.peek();
    if (t === null) throw new UnexpectedEof("expected command");
    const kw = this.keywordOf(t);
    if (kw !== null && ["then", "elif", "else", "fi", "do", "done", "esac", "in", "}"].includes(kw)) {
      throw new SyntaxErr(`syntax error near unexpected token \`${kw}'`);
    }
    switch (kw) {
      case "if":
        return this.parseIf();
      case "while":
      case "until":
        return this.parseWhile(kw === "until");
      case "for":
        return this.parseFor();
      case "case":
        return this.parseCase();
      case "{":
        return this.parseGroup(false);
    }
    if (this.isOp(t, "(")) return this.parseGroup(true);
    return this.parseSimple();
  }

  private parseIf(): IfCmd {
    this.expectKeyword("if");
    const clauses: IfCmd["clauses"] = [];
    let elseBody: List | null = null;
    for (;;) {
      const cond = this.parseList(new Set(["then"]));
      this.expectKeyword("then");
      const body = this.parseList(new Set(["elif", "else", "fi"]));
      clauses.push({ cond, body });
      const t = this.peek();
      if (this.isKeyword(t, "elif")) {
        this.pos++;
        continue;
      }
      if (this.isKeyword(t, "else")) {
        this.pos++;
        elseBody = this.parseList(new Set(["fi"]));
      }
      this.expectKeyword("fi");
      return { k: "if", clauses, elseBody };
    }
  }

  private parseWhile(until: boolean): WhileCmd {
    this.pos++; // while/until
    const cond = this.parseList(new Set(["do"]));
    this.expectKeyword("do");
    const body = this.parseList(new Set(["done"]));
    this.expectKeyword("done");
    return { k: "while", until, cond, body };
  }

  private parseFor(): ForCmd {
    this.expectKeyword("for");
    const nameTok = this.next();
    if (!nameTok || nameTok.t !== "word") throw new SyntaxErr("syntax error: expected name after `for'");
    const name = rawText(nameTok);
    this.skipNewlines();
    let words: WordTok[] | null = null;
    if (this.isKeyword(this.peek(), "in")) {
      this.pos++;
      words = [];
      while (this.peek()?.t === "word") words.push(this.next() as WordTok);
    }
    if (this.isOp(this.peek(), ";") || this.isOp(this.peek(), "\n")) this.pos++;
    this.skipNewlines();
    this.expectKeyword("do");
    const body = this.parseList(new Set(["done"]));
    this.expectKeyword("done");
    return { k: "for", name, words, body };
  }

  private parseCase(): CaseCmd {
    this.expectKeyword("case");
    const word = this.next();
    if (!word || word.t !== "word") throw new SyntaxErr("syntax error after `case'");
    this.skipNewlines();
    this.expectKeyword("in");
    this.skipNewlines();
    const clauses: CaseCmd["clauses"] = [];
    for (;;) {
      this.skipNewlines();
      if (this.isKeyword(this.peek(), "esac")) {
        this.pos++;
        break;
      }
      if (this.peek() === null) throw new UnexpectedEof("expected `esac'");
      if (this.isOp(this.peek(), "(")) this.pos++;
      const patterns: WordTok[] = [];
      for (;;) {
        const p = this.next();
        if (!p || p.t !== "word") throw new SyntaxErr("syntax error in case pattern");
        patterns.push(p);
        if (this.isOp(this.peek(), "|")) {
          this.pos++;
          continue;
        }
        break;
      }
      const close = this.next();
      if (!this.isOp(close, ")")) throw new SyntaxErr("syntax error: expected `)' in case pattern");
      const body = this.parseList(new Set(["esac"]));
      clauses.push({ patterns, body });
      if (this.isOp(this.peek(), ";;")) {
        this.pos++;
        continue;
      }
      this.skipNewlines();
      if (this.isKeyword(this.peek(), "esac")) {
        this.pos++;
        break;
      }
      if (this.peek() === null) throw new UnexpectedEof("expected `esac'");
    }
    return { k: "case", word, clauses };
  }

  private parseGroup(subshell: boolean): GroupCmd {
    this.pos++; // { or (
    const body = this.parseList(subshell ? new Set() : new Set(["}"]));
    if (subshell) {
      const t = this.next();
      if (!this.isOp(t, ")")) throw t === null ? new UnexpectedEof("expected `)'") : new SyntaxErr("syntax error: expected `)'");
    } else {
      this.expectKeyword("}");
    }
    const redirs = this.collectRedirs();
    return { k: "group", subshell, body, redirs };
  }

  private collectRedirs(): Redir[] {
    const redirs: Redir[] = [];
    for (;;) {
      const t = this.peek();
      if (t && t.t === "redir") {
        this.pos++;
        const r = t as RedirTok;
        if (r.kind === "heredoc") {
          redirs.push({ fd: r.fd, kind: "heredoc", target: null, heredoc: r.heredoc! });
        } else {
          const target = this.next();
          if (!target || target.t !== "word") throw new SyntaxErr("syntax error near unexpected token `newline'");
          redirs.push({ fd: r.fd, kind: r.kind, target });
        }
        continue;
      }
      break;
    }
    return redirs;
  }

  private parseSimple(): SimpleCmd {
    const assigns: SimpleCmd["assigns"] = [];
    const words: WordTok[] = [];
    const redirs: Redir[] = [];
    for (;;) {
      const t = this.peek();
      if (t === null) break;
      if (t.t === "op") break;
      if (t.t === "redir") {
        this.pos++;
        const r = t as RedirTok;
        if (r.kind === "heredoc") {
          redirs.push({ fd: r.fd, kind: "heredoc", target: null, heredoc: r.heredoc! });
        } else {
          const target = this.next();
          if (!target || target.t !== "word") {
            if (target === null) throw new UnexpectedEof("expected redirection target");
            throw new SyntaxErr(`syntax error near unexpected token \`${tokenDesc(target)}'`);
          }
          redirs.push({ fd: r.fd, kind: r.kind, target });
        }
        continue;
      }
      // assignment prefix? NAME=... before any command word
      if (words.length === 0) {
        const asn = splitAssignment(t);
        if (asn) {
          this.pos++;
          assigns.push(asn);
          continue;
        }
      }
      this.pos++;
      words.push(t);
    }
    if (assigns.length === 0 && words.length === 0 && redirs.length === 0) {
      const t = this.peek();
      throw t === null ? new UnexpectedEof("expected command") : new SyntaxErr(`syntax error near unexpected token \`${tokenDesc(t)}'`);
    }
    return { k: "simple", assigns, words, redirs };
  }
}

/** If the word begins with NAME= (unquoted), split into an assignment. */
function splitAssignment(w: WordTok): { name: string; value: WordTok } | null {
  const first = w.parts[0];
  if (!first || first.k !== "lit" || first.q !== "n") return null;
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(first.text);
  if (!m) return null;
  const rest = first.text.slice(m[0].length);
  const valueParts = [...w.parts.slice(1)];
  if (rest !== "") valueParts.unshift({ k: "lit", q: "n", text: rest });
  return { name: m[1]!, value: { t: "word", parts: valueParts } };
}

function tokenDesc(t: Token): string {
  if (t.t === "op") return t.v === "\n" ? "newline" : t.v;
  if (t.t === "redir") return t.kind === "heredoc" ? "<<" : t.kind === "in" ? "<" : ">";
  return rawText(t);
}

export function parse(src: string): List {
  return new Parser(tokenize(src)).parseProgram();
}
