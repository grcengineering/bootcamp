/**
 * Lexer for the constrained Windows PowerShell 5.1 grammar (web ISA ISC-63/64).
 *
 * Covers exactly what module 04 teaches: Verb-Noun commands and parameters, pipes,
 * single/double-quoted strings, numbers, @{ } hashtable literals, [pscustomobject],
 * ( ) grouping with .Member access, { $_.Prop -op value } filter blocks, `,` lists,
 * `>` redirection, `;` and newline statement separators, `#` comments.
 *
 * IncompleteInput signals an open construct (unterminated quote) so the console can
 * show the PS continuation prompt (`>> `) instead of erroring — real 5.1 behavior.
 * Error message strings for malformed input reuse the documented PowerShell parser
 * vocabulary (Microsoft Learn, about_Parsing / ParserError messages).
 */

export type Token =
  | { k: "word"; v: string }
  | { k: "str"; v: string }
  | { k: "num"; v: number }
  | { k: "param"; v: string }
  | { k: "var"; v: string }
  | { k: "cast"; v: string }
  | { k: "op"; v: "|" | ">" | "(" | ")" | "{" | "}" | "@{" | ";" | "," | "=" | "." | "nl" };

export class PsParseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class IncompleteInput extends Error {
  constructor(message: string) {
    super(message);
  }
}

const WORD_STOP = new Set([
  " ", "\t", "\r", "\n", "|", ";", ",", "(", ")", "{", "}", "=", ">", "<", "'", '"', "#", "&",
]);

export function lex(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const prev = (): Token | null => (toks.length ? toks[toks.length - 1] : null);

  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "\n") { toks.push({ k: "op", v: "nl" }); i++; continue; }
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }

    if (c === "'") {
      let out = ""; i++;
      for (;;) {
        if (i >= src.length) throw new IncompleteInput("The string is missing the terminator: '.");
        if (src[i] === "'") {
          if (src[i + 1] === "'") { out += "'"; i += 2; continue; }
          i++; break;
        }
        out += src[i++];
      }
      toks.push({ k: "str", v: out });
      continue;
    }

    if (c === '"') {
      let out = ""; i++;
      for (;;) {
        if (i >= src.length) throw new IncompleteInput('The string is missing the terminator: ".');
        if (src[i] === "`") { out += src[i + 1] ?? ""; i += 2; continue; }
        if (src[i] === '"') { i++; break; }
        out += src[i++];
      }
      toks.push({ k: "str", v: out });
      continue;
    }

    if (c === "@" && src[i + 1] === "{") { toks.push({ k: "op", v: "@{" }); i += 2; continue; }

    if (c === "$") {
      let out = ""; i++;
      while (i < src.length && /[A-Za-z0-9_?]/.test(src[i])) out += src[i++];
      toks.push({ k: "var", v: out });
      continue;
    }

    if (c === "[") {
      let out = ""; i++;
      while (i < src.length && src[i] !== "]") out += src[i++];
      if (i >= src.length) throw new PsParseError("Missing closing ']' in type literal.");
      i++; // consume ]
      toks.push({ k: "cast", v: out });
      continue;
    }

    if ("|();,={}>".includes(c)) {
      toks.push({ k: "op", v: c as "|" });
      i++;
      continue;
    }

    // Member-access dot: only directly after `)` or a variable ( `(Get-X).Prop`, `$_.Id` ).
    if (c === ".") {
      const p = prev();
      if ((p && p.k === "op" && p.v === ")") || (p && p.k === "var")) {
        toks.push({ k: "op", v: "." });
        i++;
        continue;
      }
    }

    // Parameter: `-Name` (only when the dash starts a word; `Select-Object` stays one word).
    if (c === "-" && /[A-Za-z]/.test(src[i + 1] ?? "")) {
      let out = ""; i++;
      while (i < src.length && /[A-Za-z0-9]/.test(src[i])) out += src[i++];
      toks.push({ k: "param", v: out });
      continue;
    }

    // Bareword (command names, property lists, paths, drive-qualified C:, .\script.ps1).
    let out = "";
    while (i < src.length && !WORD_STOP.has(src[i])) out += src[i++];
    if (out === "") throw new PsParseError(`Unexpected token '${c}' in expression or statement.`);
    if (/^\d+(\.\d+)?$/.test(out)) toks.push({ k: "num", v: Number(out) });
    else toks.push({ k: "word", v: out });
  }
  return toks;
}
