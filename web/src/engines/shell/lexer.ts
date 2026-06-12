/**
 * Shell lexer (web ISA ISC-35): quoting (single/double/backslash), operators, redirections,
 * heredocs (<< 'TAG' and << TAG), and $( ) command-substitution extraction.
 *
 * Words are kept as quoted segments; variable expansion happens later (expand.ts) so that
 * quote context survives until expansion time.
 */

export type Quote = "n" | "s" | "d"; // none | single | double

export type Part =
  | { k: "lit"; q: Quote; text: string }
  | { k: "cs"; q: "n" | "d"; cmd: string } // $( … )
  | { k: "ar"; q: "n" | "d"; expr: string }; // $(( … ))

export interface WordTok {
  t: "word";
  parts: Part[];
}

export interface OpTok {
  t: "op";
  v: string; // | ; ;; && || ( ) \n
}

export interface RedirTok {
  t: "redir";
  fd: number; // 0, 1, 2
  kind: "in" | "out" | "append" | "heredoc" | "dup";
  /** for heredoc: filled by the lexer once the body is consumed */
  heredoc?: { body: string; quoted: boolean };
}

export type Token = WordTok | OpTok | RedirTok;

/** Thrown when input ends mid-construct (open quote, unfilled heredoc) — drives PS2 continuation. */
export class UnexpectedEof extends Error {
  constructor(
    public what: string,
    public heredocDelim?: string,
  ) {
    super(`unexpected EOF: ${what}`);
  }
}

export class SyntaxErr extends Error {
  constructor(message: string) {
    super(message);
  }
}

interface PendingHeredoc {
  tok: RedirTok;
  delim: string;
  quoted: boolean;
}

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const n = src.length;
  let parts: Part[] = [];
  let cur = ""; // current literal run (quote = n)
  let pending: PendingHeredoc[] = [];

  const flushLit = (q: Quote = "n") => {
    if (cur !== "") {
      parts.push({ k: "lit", q, text: cur });
      cur = "";
    }
  };
  const flushWord = () => {
    flushLit();
    if (parts.length > 0) {
      toks.push({ t: "word", parts });
      parts = [];
    }
  };

  const consumeHeredocBodies = () => {
    for (const h of pending) {
      let body = "";
      let found = false;
      while (i < n) {
        let eol = src.indexOf("\n", i);
        if (eol === -1) eol = n;
        const line = src.slice(i, eol);
        i = eol < n ? eol + 1 : n;
        if (line === h.delim) {
          found = true;
          break;
        }
        body += line + "\n";
      }
      if (!found) throw new UnexpectedEof(`here-document delimited by end-of-file (wanted \`${h.delim}')`, h.delim);
      h.tok.heredoc = { body, quoted: h.quoted };
    }
    pending = [];
  };

  // Reads a $( … ) or $(( … )) span starting at src[i] === "(" (after the $). Returns inner text.
  const readCmdSub = (open: string, close: string): string => {
    let depth = 1;
    let out = "";
    i += open.length;
    while (i < n) {
      const c = src[i]!;
      if (c === "'") {
        let j = src.indexOf("'", i + 1);
        if (j === -1) throw new UnexpectedEof("quote in substitution");
        out += src.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (c === "\\") {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") {
        depth--;
        if (depth === 0) {
          // for $(( … )) require the second close paren
          if (close === "))") {
            if (src[i + 1] !== ")") throw new SyntaxErr("expected `))'");
            i += 2;
          } else i += 1;
          return out;
        }
      }
      out += c;
      i++;
    }
    throw new UnexpectedEof("unterminated substitution");
  };

  const atWordStart = () => parts.length === 0 && cur === "";

  while (i < n) {
    const c = src[i]!;

    // comments: # at start of a word
    if (c === "#" && atWordStart()) {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    if (c === " " || c === "\t") {
      flushWord();
      i++;
      continue;
    }

    if (c === "\n") {
      flushWord();
      i++;
      if (pending.length > 0) consumeHeredocBodies();
      toks.push({ t: "op", v: "\n" });
      continue;
    }

    if (c === "'") {
      flushLit();
      const j = src.indexOf("'", i + 1);
      if (j === -1) throw new UnexpectedEof("unterminated single quote");
      parts.push({ k: "lit", q: "s", text: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    if (c === '"') {
      flushLit();
      i++;
      let buf = "";
      const dflush = () => {
        if (buf !== "") {
          parts.push({ k: "lit", q: "d", text: buf });
          buf = "";
        }
      };
      let closed = false;
      while (i < n) {
        const d = src[i]!;
        if (d === '"') {
          i++;
          closed = true;
          break;
        }
        if (d === "\\") {
          const nx = src[i + 1];
          if (nx === "$" || nx === "`" || nx === '"' || nx === "\\") {
            // escaped char is literal even through expansion — encode as single-quoted part
            dflush();
            parts.push({ k: "lit", q: "s", text: nx });
            i += 2;
            continue;
          }
          if (nx === "\n") {
            i += 2;
            continue;
          }
          buf += d;
          i++;
          continue;
        }
        if (d === "$" && src[i + 1] === "(") {
          dflush();
          i++; // at "("
          if (src[i + 1] === "(") parts.push({ k: "ar", q: "d", expr: readCmdSub("((", "))") });
          else parts.push({ k: "cs", q: "d", cmd: readCmdSub("(", ")") });
          continue;
        }
        buf += d;
        i++;
      }
      if (!closed) throw new UnexpectedEof("unterminated double quote");
      dflush();
      // an empty "" still forms a word
      if (parts.length === 0 && cur === "") parts.push({ k: "lit", q: "d", text: "" });
      continue;
    }

    if (c === "\\") {
      const nx = src[i + 1];
      if (nx === undefined) throw new UnexpectedEof("line continuation");
      if (nx === "\n") {
        i += 2;
        continue;
      }
      flushLit();
      parts.push({ k: "lit", q: "s", text: nx });
      i += 2;
      continue;
    }

    if (c === "$" && src[i + 1] === "(") {
      flushLit();
      i++; // at "("
      if (src[i + 1] === "(") parts.push({ k: "ar", q: "n", expr: readCmdSub("((", "))") });
      else parts.push({ k: "cs", q: "n", cmd: readCmdSub("(", ")") });
      continue;
    }

    // operators
    if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      flushWord();
      const two = src.slice(i, i + 2);
      if (two === "&&" || two === "||" || two === ";;") {
        toks.push({ t: "op", v: two });
        i += 2;
      } else {
        toks.push({ t: "op", v: c });
        i += 1;
      }
      continue;
    }

    if (c === "<" || c === ">") {
      // possible fd prefix: a word made of a single digit directly attached
      let fd: number | null = null;
      if (cur !== "" && /^\d$/.test(cur) && parts.length === 0) {
        fd = Number(cur);
        cur = "";
      }
      flushWord();
      if (c === "<") {
        if (src[i + 1] === "<") {
          i += 2;
          // skip whitespace, read delimiter word (possibly quoted)
          while (src[i] === " " || src[i] === "\t") i++;
          let delim = "";
          let quoted = false;
          while (i < n && !" \t\n;|&<>".includes(src[i]!)) {
            const d = src[i]!;
            if (d === "'" || d === '"') {
              quoted = true;
              const j = src.indexOf(d, i + 1);
              if (j === -1) throw new UnexpectedEof("heredoc delimiter quote");
              delim += src.slice(i + 1, j);
              i = j + 1;
            } else if (d === "\\") {
              quoted = true;
              delim += src[i + 1] ?? "";
              i += 2;
            } else {
              delim += d;
              i++;
            }
          }
          if (delim === "") throw new SyntaxErr("syntax error near unexpected token `newline'");
          const tok: RedirTok = { t: "redir", fd: fd ?? 0, kind: "heredoc" };
          toks.push(tok);
          pending.push({ tok, delim, quoted });
          continue;
        }
        toks.push({ t: "redir", fd: fd ?? 0, kind: "in" });
        i += 1;
        continue;
      }
      // ">"
      if (src[i + 1] === ">") {
        toks.push({ t: "redir", fd: fd ?? 1, kind: "append" });
        i += 2;
        continue;
      }
      if (src[i + 1] === "&") {
        toks.push({ t: "redir", fd: fd ?? 1, kind: "dup" });
        i += 2;
        continue;
      }
      toks.push({ t: "redir", fd: fd ?? 1, kind: "out" });
      i += 1;
      continue;
    }

    cur += c;
    i++;
  }

  flushWord();
  if (pending.length > 0) consumeHeredocBodies(); // EOF-terminated heredoc on last line
  return toks;
}

/** Render a word token's literal text (no expansion) — used for error messages. */
export function rawText(w: WordTok): string {
  return w.parts.map((p) => (p.k === "lit" ? p.text : p.k === "cs" ? `$(${p.cmd})` : `$((${p.expr}))`)).join("");
}
