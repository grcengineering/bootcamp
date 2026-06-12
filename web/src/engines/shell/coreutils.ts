/**
 * Coreutils as taught (web ISA ISC-53/54/58/59 taught surface).
 *
 * Honesty contract: flags/commands outside the taught surface produce the declared
 * sim-boundary message (exit 64) — never invented output. Messages that ARE emitted
 * mirror documented GNU coreutils behavior on the contract image (C.UTF-8 locale).
 */
import type { IOCtx, Machine, Sink } from "./interpreter";
import { SIM_BOUNDARY_EXIT } from "./interpreter";
import { byteCompare, byteLength, sizeOf, baseName, parentPath, type VNode } from "./vfs";
import { columnize } from "./columns";
import { sha256Hex, posixCksum } from "./hashes";
import { runAwk } from "./awk";
import { MAN_PAGES } from "./man";

export type CoreutilImpl = (args: string[], io: IOCtx, m: Machine) => number;

const boundaryFlag = (cmd: string, flag: string, io: IOCtx): number => {
  io.err.write(`grc-sim: ${cmd}: option ${flag} is outside this lab's simulated surface — run it on a real machine to explore\n`);
  return SIM_BOUNDARY_EXIT;
};

/** Split argv into single-letter flags and operands; flags taking values are declared. */
function parseFlags(
  cmd: string,
  args: string[],
  known: string,
  valueFlags: string,
  io: IOCtx,
): { flags: Map<string, string>; operands: string[] } | number {
  const flags = new Map<string, string>();
  const operands: string[] = [];
  let noMoreFlags = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (noMoreFlags || a === "-" || !a.startsWith("-")) {
      operands.push(a);
      continue;
    }
    if (a === "--") {
      noMoreFlags = true;
      continue;
    }
    if (a.startsWith("--")) return boundaryFlag(cmd, a, io);
    for (let j = 1; j < a.length; j++) {
      const f = a[j]!;
      if (!known.includes(f)) return boundaryFlag(cmd, `-${f}`, io);
      if (valueFlags.includes(f)) {
        const inline = a.slice(j + 1);
        const v = inline !== "" ? inline : args[++i];
        if (v === undefined) {
          io.err.write(`${cmd}: option requires an argument -- '${f}'\n`);
          return 1;
        }
        flags.set(f, v);
        j = a.length;
        break;
      }
      flags.set(f, "");
    }
  }
  return { flags, operands };
}

/** Concatenate file operands (or stdin). Returns null after writing the error. */
function gatherInput(cmd: string, operands: string[], io: IOCtx, m: Machine): { text: string; failed: boolean } {
  const files = operands.filter((o) => o !== "-");
  if (files.length === 0) return { text: io.stdin ?? "", failed: false };
  let text = "";
  let failed = false;
  for (const f of operands) {
    if (f === "-") {
      text += io.stdin ?? "";
      continue;
    }
    const node = m.vfs.lookup(m.resolve(f));
    if (!node) {
      io.err.write(`${cmd}: ${f}: No such file or directory\n`);
      failed = true;
      continue;
    }
    if (node.t === "dir") {
      io.err.write(`${cmd}: ${f}: Is a directory\n`);
      failed = true;
      continue;
    }
    text += node.content;
  }
  return { text, failed };
}

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// ---------------------------------------------------------------------------
// pending-stdin prediction (ISC-122): would this command read interactive stdin?
// ---------------------------------------------------------------------------

export function stdinWillBeRead(name: string, args: string[]): boolean {
  const nonFlag = (skipValues: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a !== "-" && a.startsWith("-")) {
        const letter = a[1];
        if (letter !== undefined && skipValues.includes(letter) && a.length === 2) i++;
        continue;
      }
      out.push(a);
    }
    return out;
  };
  switch (name) {
    case "cat":
    case "wc":
    case "sort":
    case "uniq":
    case "sha256sum":
    case "cksum":
    case "tac":
      return nonFlag("").length === 0 || nonFlag("").every((a) => a === "-");
    case "grep":
      return nonFlag("e").length <= 1;
    case "head":
    case "tail":
      return nonFlag("n").length === 0;
    case "cut":
      return nonFlag("df").length === 0;
    case "awk":
      return nonFlag("Fv").length <= 1;
    case "tee":
    case "tr":
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// ls
// ---------------------------------------------------------------------------

function lsImpl(args: string[], io: IOCtx, m: Machine): number {
  const parsed = parseFlags("ls", args, "laC1wd", "w", io);
  if (typeof parsed === "number") return parsed;
  const { flags, operands } = parsed;
  const long = flags.has("l");
  const all = flags.has("a");
  const onePerLine = flags.has("1");
  const columns = flags.has("C") || (!long && !onePerLine && io.ttyOut);
  const width = flags.has("w") ? Number.parseInt(flags.get("w")!, 10) : m.cols;

  const targets = operands.length === 0 ? ["."] : operands;
  let exit = 0;
  const fileEntries: { name: string; node: VNode }[] = [];
  const dirEntries: { name: string; abs: string }[] = [];
  for (const t of targets) {
    const abs = m.resolve(t);
    let node = m.vfs.lstat(abs);
    if (!node) {
      io.err.write(`ls: cannot access '${t}': No such file or directory\n`);
      exit = 2;
      continue;
    }
    // symlink operands: -l shows the link itself; otherwise dereference (GNU behavior)
    if (node.t === "symlink" && !long) node = m.vfs.lookup(abs) ?? node;
    if (node.t === "dir" && !flags.has("d")) dirEntries.push({ name: t, abs });
    else fileEntries.push({ name: t, node });
  }

  const out = io.out;
  const renderNames = (names: string[]) => {
    if (names.length === 0) return;
    if (columns) out.write(columnize(names, width));
    else out.write(names.join("\n") + "\n");
  };

  const renderLong = (entries: { name: string; node: VNode }[], withTotal: boolean) => {
    if (withTotal) {
      const totalBlocks = entries.reduce((acc, e) => acc + blocksOf(e.node), 0);
      out.write(`total ${totalBlocks}\n`);
    }
    const linksW = Math.max(...entries.map((e) => String(linkCount(e.node)).length), 1);
    const ownerW = Math.max(...entries.map((e) => e.node.owner.length), 1);
    const groupW = Math.max(...entries.map((e) => e.node.group.length), 1);
    const sizeW = Math.max(...entries.map((e) => String(sizeOf(e.node)).length), 1);
    for (const e of entries) {
      const n = e.node;
      const nameOut = n.t === "symlink" ? `${e.name} -> ${n.target}` : e.name;
      out.write(
        `${modeString(n)} ${String(linkCount(n)).padStart(linksW)} ${n.owner.padEnd(ownerW)} ${n.group.padEnd(groupW)} ` +
          `${String(sizeOf(n)).padStart(sizeW)} ${lsDate(n.mtime, m.now())} ${nameOut}\n`,
      );
    }
  };

  fileEntries.sort((a, b) => byteCompare(a.name, b.name));
  if (fileEntries.length > 0) {
    if (long) renderLong(fileEntries, false);
    else renderNames(fileEntries.map((e) => e.name));
  }

  dirEntries.sort((a, b) => byteCompare(a.name, b.name));
  const needHeaders = dirEntries.length + fileEntries.length > 1;
  dirEntries.forEach((d, idx) => {
    if (fileEntries.length > 0 || idx > 0) out.write("\n");
    if (needHeaders) out.write(`${d.name}:\n`);
    const node = m.vfs.lookup(d.abs)!;
    let names = [...node.children!.keys()];
    if (!all) names = names.filter((n) => !n.startsWith("."));
    names.sort(byteCompare);
    const entryFor = (n: string): { name: string; node: VNode } =>
      n === "." ? { name: ".", node } : n === ".." ? { name: "..", node: m.vfs.lookup(parentPath(d.abs)) ?? node } : { name: n, node: node.children!.get(n)! };
    const listed = (all ? [".", "..", ...names] : names).map(entryFor);
    if (long) renderLong(listed, true);
    else renderNames(listed.map((e) => e.name));
  });
  return exit;
}

function blocksOf(n: VNode): number {
  if (n.t === "dir") return 4;
  if (n.t === "symlink") return 0;
  const bytes = byteLength(n.content);
  return bytes === 0 ? 0 : Math.ceil(bytes / 4096) * 4;
}

function linkCount(n: VNode): number {
  if (n.t !== "dir") return 1;
  let count = 2;
  for (const child of n.children!.values()) if (child.t === "dir") count++;
  return count;
}

function modeString(n: VNode): string {
  const typeChar = n.t === "dir" ? "d" : n.t === "symlink" ? "l" : "-";
  let bits = "";
  for (const shift of [6, 3, 0]) {
    const m3 = (n.mode >> shift) & 7;
    bits += (m3 & 4 ? "r" : "-") + (m3 & 2 ? "w" : "-") + (m3 & 1 ? "x" : "-");
  }
  return typeChar + bits;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SIX_MONTHS_MS = 15778476 * 1000;

function lsDate(mtime: number, now: number): string {
  const d = new Date(mtime);
  const mon = MONTHS[d.getUTCMonth()]!;
  const day = String(d.getUTCDate()).padStart(2);
  const recent = mtime > now - SIX_MONTHS_MS && mtime < now + 3600 * 1000;
  if (recent) {
    return `${mon} ${day} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  return `${mon} ${day}  ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

function grepImpl(args: string[], io: IOCtx, m: Machine): number {
  const parsed = parseFlags("grep", args, "qcivnEr", "", io);
  if (typeof parsed === "number") return parsed;
  const { flags, operands } = parsed;
  if (operands.length === 0) {
    io.err.write("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
    return 2;
  }
  const [pattern, ...fileArgs] = operands as [string, ...string[]];
  let re: RegExp;
  try {
    re = new RegExp(flags.has("E") ? pattern : breToJs(pattern), flags.has("i") ? "i" : "");
  } catch {
    io.err.write(`grep: invalid pattern\n`);
    return 2;
  }
  const invert = flags.has("v");
  const quiet = flags.has("q");
  const count = flags.has("c");
  const lineNo = flags.has("n");

  interface Source {
    label: string;
    lines: string[];
  }
  const sources: Source[] = [];
  let hadError = false;
  if (flags.has("r")) {
    const roots = fileArgs.length > 0 ? fileArgs : ["."];
    for (const root of roots) {
      const abs = m.resolve(root);
      const node = m.vfs.lookup(abs);
      if (!node) {
        io.err.write(`grep: ${root}: No such file or directory\n`);
        hadError = true;
        continue;
      }
      const walk = (display: string, n: VNode) => {
        if (n.t === "file") sources.push({ label: display, lines: splitLines(n.content) });
        else if (n.t === "dir") {
          for (const name of [...n.children!.keys()].sort(byteCompare)) walk(`${display}/${name}`, n.children!.get(name)!);
        }
      };
      if (node.t === "dir") {
        for (const name of [...node.children!.keys()].sort(byteCompare)) walk(`${root}/${name}`, node.children!.get(name)!);
      } else walk(root, node);
    }
  } else if (fileArgs.length === 0) {
    sources.push({ label: "(standard input)", lines: splitLines(io.stdin ?? "") });
  } else {
    for (const f of fileArgs) {
      const node = m.vfs.lookup(m.resolve(f));
      if (!node) {
        io.err.write(`grep: ${f}: No such file or directory\n`);
        hadError = true;
        continue;
      }
      if (node.t === "dir") {
        io.err.write(`grep: ${f}: Is a directory\n`);
        hadError = true;
        continue;
      }
      sources.push({ label: f, lines: splitLines(node.content) });
    }
  }

  const showLabel = flags.has("r") || sources.length > 1;
  let anyMatch = false;
  for (const src of sources) {
    let matches = 0;
    src.lines.forEach((line, idx) => {
      const matched = re.test(line) !== invert;
      if (!matched) return;
      anyMatch = true;
      matches++;
      if (quiet || count) return;
      const prefix = (showLabel ? src.label + ":" : "") + (lineNo ? `${idx + 1}:` : "");
      io.out.write(prefix + line + "\n");
    });
    if (count && !quiet) io.out.write((showLabel ? src.label + ":" : "") + matches + "\n");
  }
  if (hadError && !quiet) return 2;
  return anyMatch ? 0 : 1;
}

/** Convert a POSIX BRE to a JS regex source (taught patterns are simple). */
export function breToJs(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\") {
      const n = pattern[i + 1];
      if (n !== undefined && "(){}|+?".includes(n)) {
        out += n; // BRE escaped → JS meta
        i++;
        continue;
      }
      out += "\\" + (n ?? "\\");
      i++;
      continue;
    }
    if ("(){}|+?".includes(c)) {
      out += "\\" + c; // literal in BRE
      continue;
    }
    out += c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// remaining tools
// ---------------------------------------------------------------------------

export const COREUTILS: Record<string, CoreutilImpl> = {
  ls: lsImpl,
  grep: grepImpl,
  awk: runAwk,

  cat: (args, io, m) => {
    const parsed = parseFlags("cat", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    const { text, failed } = gatherInput("cat", parsed.operands, io, m);
    io.out.write(text);
    return failed ? 1 : 0;
  },

  wc: (args, io, m) => {
    const parsed = parseFlags("wc", args, "lwc", "", io);
    if (typeof parsed === "number") return parsed;
    const { flags, operands } = parsed;
    const which = flags.size === 0 ? ["l", "w", "c"] : (["l", "w", "c"] as const).filter((f) => flags.has(f));
    const countsOf = (text: string): number[] => {
      const counts: number[] = [];
      for (const f of which) {
        if (f === "l") counts.push((text.match(/\n/g) ?? []).length);
        else if (f === "w") counts.push(text.split(/\s+/).filter((w) => w !== "").length);
        else counts.push(byteLength(text));
      }
      return counts;
    };
    const rows: { counts: number[]; label: string | null }[] = [];
    let failed = false;
    if (operands.length === 0) {
      rows.push({ counts: countsOf(io.stdin ?? ""), label: null });
    } else {
      for (const f of operands) {
        const node = m.vfs.lookup(m.resolve(f));
        if (!node || node.t !== "file") {
          io.err.write(`wc: ${f}: No such file or directory\n`);
          failed = true;
          continue;
        }
        rows.push({ counts: countsOf(node.content), label: f });
      }
      if (rows.length > 1) {
        const totals = which.map((_, i) => rows.reduce((a, r) => a + r.counts[i]!, 0));
        rows.push({ counts: totals, label: "total" });
      }
    }
    if (m.variant === "zsh-macos") {
      // BSD wc pads every count to 8 columns (fixture m01x-wc-pipe-macos)
      for (const r of rows) {
        io.out.write(r.counts.map((c) => String(c).padStart(8)).join("") + (r.label !== null ? " " + r.label : "") + "\n");
      }
      return failed ? 1 : 0;
    }
    // GNU width rule: digits of the total byte size of the file operands; bare digits for a
    // single count from a single source (matches piped `wc -l` captures)
    let width: number;
    if (operands.length === 0) {
      width = which.length > 1 ? 7 : 1;
    } else if (operands.length === 1 && which.length === 1) {
      width = 1;
    } else {
      const totalBytes = operands.reduce((acc, f) => {
        const node = m.vfs.lookup(m.resolve(f));
        return acc + (node && node.t === "file" ? byteLength(node.content) : 0);
      }, 0);
      width = String(totalBytes).length;
    }
    for (const r of rows) {
      const nums = r.counts.map((c) => String(c).padStart(width)).join(" ");
      io.out.write(nums + (r.label !== null ? " " + r.label : "") + "\n");
    }
    return failed ? 1 : 0;
  },

  head: (args, io, m) => headTail(true, args, io, m),
  tail: (args, io, m) => headTail(false, args, io, m),

  sort: (args, io, m) => {
    const parsed = parseFlags("sort", args, "rnu", "", io);
    if (typeof parsed === "number") return parsed;
    const { text, failed } = gatherInput("sort", parsed.operands, io, m);
    let lines = splitLines(text);
    if (parsed.flags.has("n")) {
      lines.sort((a, b) => {
        const na = Number.parseFloat(a) || 0;
        const nb = Number.parseFloat(b) || 0;
        return na - nb || byteCompare(a, b);
      });
    } else lines.sort(byteCompare);
    if (parsed.flags.has("r")) lines.reverse();
    if (parsed.flags.has("u")) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    io.out.write(lines.map((l) => l + "\n").join(""));
    return failed ? 2 : 0;
  },

  uniq: (args, io, m) => {
    const parsed = parseFlags("uniq", args, "cd", "", io);
    if (typeof parsed === "number") return parsed;
    const { text, failed } = gatherInput("uniq", parsed.operands, io, m);
    const lines = splitLines(text);
    const groups: { line: string; n: number }[] = [];
    for (const l of lines) {
      const last = groups[groups.length - 1];
      if (last && last.line === l) last.n++;
      else groups.push({ line: l, n: 1 });
    }
    for (const g of groups) {
      if (parsed.flags.has("d") && g.n < 2) continue;
      if (parsed.flags.has("c")) io.out.write(`${String(g.n).padStart(7)} ${g.line}\n`);
      else io.out.write(g.line + "\n");
    }
    return failed ? 1 : 0;
  },

  cut: (args, io, m) => {
    const parsed = parseFlags("cut", args, "df", "df", io);
    if (typeof parsed === "number") return parsed;
    const fieldSpec = parsed.flags.get("f");
    if (fieldSpec === undefined) {
      io.err.write("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n");
      return 1;
    }
    const delim = parsed.flags.get("d") ?? "\t";
    const wanted = parseFieldList(fieldSpec);
    if (wanted === null) {
      io.err.write(`cut: invalid field value '${fieldSpec}'\n`);
      return 1;
    }
    const { text, failed } = gatherInput("cut", parsed.operands, io, m);
    for (const line of splitLines(text)) {
      if (!line.includes(delim)) {
        io.out.write(line + "\n");
        continue;
      }
      const parts = line.split(delim);
      io.out.write(parts.filter((_, i) => wanted(i + 1)).join(delim) + "\n");
    }
    return failed ? 1 : 0;
  },

  tr: (args, io, m) => {
    const parsed = parseFlags("tr", args, "d", "", io);
    if (typeof parsed === "number") return parsed;
    const { flags, operands } = parsed;
    const input = io.stdin ?? "";
    if (flags.has("d")) {
      if (operands.length !== 1) {
        io.err.write("tr: missing operand\n");
        return 1;
      }
      const del = new Set(expandTrSet(operands[0]!));
      io.out.write([...input].filter((c) => !del.has(c)).join(""));
      return 0;
    }
    if (operands.length < 2) {
      io.err.write(`tr: missing operand${operands.length === 1 ? ` after '${operands[0]}'` : ""}\n`);
      return 1;
    }
    const set1 = expandTrSet(operands[0]!);
    const set2 = expandTrSet(operands[1]!);
    const map = new Map<string, string>();
    set1.forEach((c, i) => map.set(c, set2[Math.min(i, set2.length - 1)] ?? c));
    io.out.write([...input].map((c) => map.get(c) ?? c).join(""));
    return 0;
  },

  touch: (args, io, m) => {
    const parsed = parseFlags("touch", args, "d", "d", io);
    if (typeof parsed === "number") return parsed;
    let when = m.now();
    const d = parsed.flags.get("d");
    if (d !== undefined) {
      const t = parseTouchDate(d);
      if (t === null) {
        io.err.write(`touch: invalid date format '${d}'\n`);
        return 1;
      }
      when = t;
    }
    if (parsed.operands.length === 0) {
      io.err.write("touch: missing file operand\nTry 'touch --help' for more information.\n");
      return 1;
    }
    let failed = false;
    for (const f of parsed.operands) {
      const abs = m.resolve(f);
      const node = m.vfs.lookup(abs);
      if (node) {
        node.mtime = when;
        continue;
      }
      if (!m.vfs.writeFile(abs, "", { owner: m.user, now: when })) {
        io.err.write(`touch: cannot touch '${f}': No such file or directory\n`);
        failed = true;
        continue;
      }
      m.recordWrite(abs);
    }
    return failed ? 1 : 0;
  },

  mkdir: (args, io, m) => {
    const parsed = parseFlags("mkdir", args, "p", "", io);
    if (typeof parsed === "number") return parsed;
    if (parsed.operands.length === 0) {
      io.err.write("mkdir: missing operand\nTry 'mkdir --help' for more information.\n");
      return 1;
    }
    let failed = false;
    for (const d of parsed.operands) {
      const r = m.vfs.mkdir(m.resolve(d), { parents: parsed.flags.has("p"), owner: m.user, now: m.now() });
      if (r === "exists" && !parsed.flags.has("p")) {
        io.err.write(`mkdir: cannot create directory ‘${d}’: File exists\n`);
        failed = true;
      } else if (r === "noent") {
        io.err.write(`mkdir: cannot create directory ‘${d}’: No such file or directory\n`);
        failed = true;
      }
    }
    return failed ? 1 : 0;
  },

  rm: (args, io, m) => {
    const parsed = parseFlags("rm", args, "rRf", "", io);
    if (typeof parsed === "number") return parsed;
    const recursive = parsed.flags.has("r") || parsed.flags.has("R");
    const force = parsed.flags.has("f");
    if (parsed.operands.length === 0) {
      if (force) return 0;
      io.err.write("rm: missing operand\nTry 'rm --help' for more information.\n");
      return 1;
    }
    let failed = false;
    for (const f of parsed.operands) {
      const abs = m.resolve(f);
      const node = m.vfs.lstat(abs);
      if (!node) {
        if (!force) {
          io.err.write(`rm: cannot remove '${f}': No such file or directory\n`);
          failed = true;
        }
        continue;
      }
      if (node.t === "dir" && !recursive) {
        io.err.write(`rm: cannot remove '${f}': Is a directory\n`);
        failed = true;
        continue;
      }
      m.vfs.remove(abs);
    }
    return failed ? 1 : 0;
  },

  rmdir: (args, io, m) => {
    const parsed = parseFlags("rmdir", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    let failed = false;
    for (const f of parsed.operands) {
      const abs = m.resolve(f);
      const node = m.vfs.lookup(abs);
      if (!node || node.t !== "dir") {
        io.err.write(`rmdir: failed to remove '${f}': ${!node ? "No such file or directory" : "Not a directory"}\n`);
        failed = true;
        continue;
      }
      if (node.children!.size > 0) {
        io.err.write(`rmdir: failed to remove '${f}': Directory not empty\n`);
        failed = true;
        continue;
      }
      m.vfs.remove(abs);
    }
    return failed ? 1 : 0;
  },

  cp: (args, io, m) => {
    const parsed = parseFlags("cp", args, "rR", "", io);
    if (typeof parsed === "number") return parsed;
    const recursive = parsed.flags.has("r") || parsed.flags.has("R");
    const ops = parsed.operands;
    if (ops.length < 2) {
      io.err.write(`cp: missing ${ops.length === 0 ? "file operand" : `destination file operand after '${ops[0]}'`}\nTry 'cp --help' for more information.\n`);
      return 1;
    }
    const destArg = ops[ops.length - 1]!;
    const sources = ops.slice(0, -1);
    const destAbs = m.resolve(destArg);
    const destIsDir = m.vfs.isDir(destAbs);
    if (sources.length > 1 && !destIsDir) {
      io.err.write(`cp: target '${destArg}' is not a directory\n`);
      return 1;
    }
    let failed = false;
    for (const src of sources) {
      const srcAbs = m.resolve(src);
      const node = m.vfs.lookup(srcAbs);
      if (!node) {
        io.err.write(`cp: cannot stat '${src}': No such file or directory\n`);
        failed = true;
        continue;
      }
      if (node.t === "dir" && !recursive) {
        io.err.write(`cp: -r not specified; omitting directory '${src}'\n`);
        failed = true;
        continue;
      }
      const target = destIsDir ? `${destAbs === "/" ? "" : destAbs}/${baseName(srcAbs)}` : destAbs;
      const parent = m.vfs.lookup(parentPath(target));
      if (!parent || parent.t !== "dir") {
        io.err.write(`cp: cannot create regular file '${destArg}': No such file or directory\n`);
        failed = true;
        continue;
      }
      const copy = cloneTree(node, m.now());
      parent.children!.set(baseName(target), copy);
      m.recordWrite(target);
    }
    return failed ? 1 : 0;
  },

  mv: (args, io, m) => {
    const parsed = parseFlags("mv", args, "f", "", io);
    if (typeof parsed === "number") return parsed;
    const ops = parsed.operands;
    if (ops.length < 2) {
      io.err.write(`mv: missing ${ops.length === 0 ? "file operand" : `destination file operand after '${ops[0]}'`}\nTry 'mv --help' for more information.\n`);
      return 1;
    }
    const destArg = ops[ops.length - 1]!;
    const sources = ops.slice(0, -1);
    const destAbs = m.resolve(destArg);
    const destIsDir = m.vfs.isDir(destAbs);
    if (sources.length > 1 && !destIsDir) {
      io.err.write(`mv: target '${destArg}' is not a directory\n`);
      return 1;
    }
    let failed = false;
    for (const src of sources) {
      const srcAbs = m.resolve(src);
      const node = m.vfs.lstat(srcAbs);
      if (!node) {
        io.err.write(`mv: cannot stat '${src}': No such file or directory\n`);
        failed = true;
        continue;
      }
      const target = destIsDir ? `${destAbs === "/" ? "" : destAbs}/${baseName(srcAbs)}` : destAbs;
      const parent = m.vfs.lookup(parentPath(target));
      if (!parent || parent.t !== "dir") {
        io.err.write(`mv: cannot move '${src}' to '${destArg}': No such file or directory\n`);
        failed = true;
        continue;
      }
      m.vfs.remove(srcAbs);
      parent.children!.set(baseName(target), node);
      m.recordWrite(target);
    }
    return failed ? 1 : 0;
  },

  chmod: (args, io, m) => {
    // mode argument may start with '-' (e.g. -x); parse manually
    const ops = args.filter((a) => a !== "");
    if (ops.length < 2) {
      io.err.write("chmod: missing operand\nTry 'chmod --help' for more information.\n");
      return 1;
    }
    const modeArg = ops[0]!;
    let apply: ((mode: number) => number) | null = null;
    if (/^[0-7]{3,4}$/.test(modeArg)) {
      const bits = Number.parseInt(modeArg, 8);
      apply = () => bits;
    } else {
      apply = parseSymbolicMode(modeArg);
    }
    if (apply === null) {
      io.err.write(`chmod: invalid mode: '${modeArg}'\n`);
      return 1;
    }
    let failed = false;
    for (const f of ops.slice(1)) {
      const node = m.vfs.lookup(m.resolve(f));
      if (!node) {
        io.err.write(`chmod: cannot access '${f}': No such file or directory\n`);
        failed = true;
        continue;
      }
      node.mode = apply(node.mode);
    }
    return failed ? 1 : 0;
  },

  which: (args, io, m) => {
    let allFound = args.length > 0;
    for (const name of args) {
      const path = m.getVar("PATH") ?? "";
      let found = false;
      for (const dir of path.split(":")) {
        if (dir === "") continue;
        const abs = dir + "/" + name;
        const node = m.vfs.lookup(abs);
        if (node && node.t !== "dir" && (node.mode & 0o111) !== 0) {
          io.out.write(abs + "\n");
          found = true;
          break;
        }
      }
      if (!found) allFound = false;
    }
    return allFound ? 0 : 1;
  },

  env: (args, io, m) => {
    let i = 0;
    const overlays: [string, string][] = [];
    while (i < args.length && args[i]!.includes("=") && !args[i]!.startsWith("-")) {
      const a = args[i]!;
      const eq = a.indexOf("=");
      overlays.push([a.slice(0, eq), a.slice(eq + 1)]);
      i++;
    }
    if (i >= args.length) {
      for (const [k, v] of overlays) m.setVar(k, v, true);
      for (const name of m.exported) io.out.write(`${name}=${m.getVar(name) ?? ""}\n`);
      return 0;
    }
    const saved: [string, string | undefined][] = overlays.map(([k]) => [k, m.getVar(k)]);
    for (const [k, v] of overlays) m.setVar(k, v, true);
    try {
      return m.dispatch(args.slice(i), io);
    } finally {
      for (const [k, old] of saved) {
        if (old === undefined) m.vars.delete(k);
        else m.vars.set(k, old);
      }
    }
  },

  man: (args, io, m) => {
    const topic = args.find((a) => !a.startsWith("-"));
    if (topic === undefined) {
      io.err.write("What manual page do you want?\nFor example, try 'man man'.\n");
      return 1;
    }
    const page = MAN_PAGES[topic];
    if (page === undefined) {
      io.err.write(`No manual entry for ${topic}\n`);
      return 16;
    }
    io.out.write(page);
    void m;
    return 0;
  },

  date: (args, io, m) => {
    let fmt = "%a %b %e %H:%M:%S %Z %Y";
    for (const a of args) {
      if (a === "-u") continue; // sim box runs UTC already
      if (a.startsWith("+")) {
        fmt = a.slice(1);
        continue;
      }
      return boundaryFlag("date", a, io);
    }
    const rendered = strftime(fmt, new Date(m.now()));
    if (rendered === null) return boundaryFlag("date", `+${fmt}`, io);
    io.out.write(rendered + "\n");
    return 0;
  },

  whoami: (_args, io, m) => {
    io.out.write(m.user + "\n");
    return 0;
  },

  hostname: (_args, io, m) => {
    io.out.write(m.host + "\n");
    return 0;
  },

  id: (args, io, m) => {
    if (args.length > 0) return boundaryFlag("id", args[0]!, io);
    io.out.write(`uid=1000(${m.user}) gid=1000(${m.user}) groups=1000(${m.user})\n`);
    return 0;
  },

  uname: (args, io, m) => {
    const kernel = m.variant === "zsh-macos" ? "Darwin" : "Linux";
    if (args.length === 0 || args[0] === "-s") {
      io.out.write(kernel + "\n");
      return 0;
    }
    if (args[0] === "-n") {
      io.out.write(m.host + "\n");
      return 0;
    }
    // -a et al. embed the HOST kernel build string — not pinned by the contract image,
    // so inventing one would violate the honesty rules.
    return boundaryFlag("uname", args[0]!, io);
  },

  file: (args, io, m) => {
    const parsed = parseFlags("file", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    let failed = false;
    for (const f of parsed.operands) {
      const node = m.vfs.lookup(m.resolve(f));
      if (!node) {
        io.out.write(`${f}: cannot open \`${f}' (No such file or directory)\n`);
        failed = true;
        continue;
      }
      if (node.t === "dir") {
        io.out.write(`${f}: directory\n`);
        continue;
      }
      if (node.content === "") {
        io.out.write(`${f}: empty\n`);
        continue;
      }
      if (node.content.startsWith("#!")) {
        const interp = node.content.slice(0, node.content.indexOf("\n"));
        io.out.write(`${f}: ${interp.includes("bash") ? "Bourne-Again shell script" : "a script"}, ASCII text executable\n`);
        continue;
      }
      io.out.write(`${f}: ASCII text\n`);
    }
    return failed ? 1 : 0;
  },

  ln: (args, io, m) => {
    const parsed = parseFlags("ln", args, "s", "", io);
    if (typeof parsed === "number") return parsed;
    if (!parsed.flags.has("s")) return boundaryFlag("ln", "(hard links)", io);
    const [target, linkArg] = parsed.operands;
    if (target === undefined || linkArg === undefined) {
      io.err.write("ln: missing file operand\nTry 'ln --help' for more information.\n");
      return 1;
    }
    const abs = m.resolve(linkArg);
    if (!m.vfs.symlink(abs, target, { owner: m.user, now: m.now() })) {
      io.err.write(`ln: failed to create symbolic link '${linkArg}': File exists\n`);
      return 1;
    }
    m.recordWrite(abs);
    return 0;
  },

  mktemp: (args, io, m) => {
    const parsed = parseFlags("mktemp", args, "d", "", io);
    if (typeof parsed === "number") return parsed;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let state = (m.entropy = (m.entropy * 1103515245 + 12345) >>> 0);
    let suffix = "";
    for (let i = 0; i < 10; i++) {
      suffix += chars[state % chars.length];
      state = (state * 1103515245 + 12345) >>> 0;
    }
    const path = `/tmp/tmp.${suffix}`;
    if (parsed.flags.has("d")) m.vfs.mkdir(path, { owner: m.user, now: m.now() });
    else {
      m.vfs.writeFile(path, "", { owner: m.user, now: m.now(), mode: 0o600 });
      m.recordWrite(path);
    }
    io.out.write(path + "\n");
    return 0;
  },

  dirname: (args, io) => {
    if (args.length === 0) {
      io.err.write("dirname: missing operand\nTry 'dirname --help' for more information.\n");
      return 1;
    }
    for (const a of args) {
      const trimmed = a.replace(/\/+$/, "");
      const i = trimmed.lastIndexOf("/");
      io.out.write((i === -1 ? "." : i === 0 ? "/" : trimmed.slice(0, i)) + "\n");
    }
    return 0;
  },

  basename: (args, io) => {
    if (args.length === 0) {
      io.err.write("basename: missing operand\nTry 'basename --help' for more information.\n");
      return 1;
    }
    const trimmed = args[0]!.replace(/\/+$/, "");
    let base = trimmed.slice(trimmed.lastIndexOf("/") + 1);
    if (base === "") base = "/";
    const suffix = args[1];
    if (suffix !== undefined && base !== suffix && base.endsWith(suffix)) base = base.slice(0, -suffix.length);
    io.out.write(base + "\n");
    return 0;
  },

  diff: (args, io, m) => {
    const parsed = parseFlags("diff", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    const [fa, fb] = parsed.operands;
    if (fa === undefined || fb === undefined) {
      io.err.write("diff: missing operand\n");
      return 2;
    }
    const ca = m.vfs.readFile(m.resolve(fa));
    const cb = m.vfs.readFile(m.resolve(fb));
    if (ca === null || cb === null) {
      io.err.write(`diff: ${ca === null ? fa : fb}: No such file or directory\n`);
      return 2;
    }
    const hunks = normalDiff(splitLines(ca), splitLines(cb));
    io.out.write(hunks);
    return hunks === "" ? 0 : 1;
  },

  sha256sum: (args, io, m) => {
    const parsed = parseFlags("sha256sum", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    if (parsed.operands.length === 0) {
      io.out.write(`${sha256Hex(io.stdin ?? "")}  -\n`);
      return 0;
    }
    let failed = false;
    for (const f of parsed.operands) {
      const content = m.vfs.readFile(m.resolve(f));
      if (content === null) {
        io.err.write(`sha256sum: ${f}: No such file or directory\n`);
        failed = true;
        continue;
      }
      io.out.write(`${sha256Hex(content)}  ${f}\n`);
    }
    return failed ? 1 : 0;
  },

  cksum: (args, io, m) => {
    const parsed = parseFlags("cksum", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    if (parsed.operands.length === 0) {
      const r = posixCksum(io.stdin ?? "");
      io.out.write(`${r.crc} ${r.length}\n`);
      return 0;
    }
    let failed = false;
    for (const f of parsed.operands) {
      const content = m.vfs.readFile(m.resolve(f));
      if (content === null) {
        io.err.write(`cksum: ${f}: No such file or directory\n`);
        failed = true;
        continue;
      }
      const r = posixCksum(content);
      io.out.write(`${r.crc} ${r.length} ${f}\n`);
    }
    return failed ? 1 : 0;
  },

  tee: (args, io, m) => {
    const parsed = parseFlags("tee", args, "a", "", io);
    if (typeof parsed === "number") return parsed;
    const input = io.stdin ?? "";
    io.out.write(input);
    let failed = false;
    for (const f of parsed.operands) {
      const abs = m.resolve(f);
      if (!m.vfs.writeFile(abs, input, { append: parsed.flags.has("a"), owner: m.user, now: m.now() })) {
        io.err.write(`tee: ${f}: No such file or directory\n`);
        failed = true;
        continue;
      }
      m.recordWrite(abs);
    }
    return failed ? 1 : 0;
  },

  sleep: (args, io, m) => {
    if (args.length === 0) {
      io.err.write("sleep: missing operand\nTry 'sleep --help' for more information.\n");
      return 1;
    }
    let total = 0;
    for (const a of args) {
      const match = /^(\d+(?:\.\d+)?)(s|m|h|d)?$/.exec(a);
      if (!match) {
        io.err.write(`sleep: invalid time interval '${a}'\n`);
        return 1;
      }
      const mult = match[2] === "m" ? 60 : match[2] === "h" ? 3600 : match[2] === "d" ? 86400 : 1;
      total += Number.parseFloat(match[1]!) * mult;
    }
    m.skewMs += total * 1000; // sim clock advances; no real waiting
    return 0;
  },

  // --- macOS-host commands (zsh variant only; nodes seeded per MACOS_EXTRA_COMMANDS) ---
  // Outputs pinned to captured fixtures m03-sw-vers / m03-csrutil-status / m03-spctl-status /
  // m03-fdesetup-status (macos-host contract, sw_vers 26.5.1 build 25F80). Holes in the
  // structured sw_vers fixture are pinned to the captured host values — honest provenance.

  sw_vers: (args, io) => {
    if (args.length > 0) return boundaryFlag("sw_vers", args[0]!, io);
    io.out.write("ProductName:\t\tmacOS\nProductVersion:\t\t26.5.1\nBuildVersion:\t\t25F80\n");
    return 0;
  },

  csrutil: (args, io) => {
    if (args[0] !== "status") return boundaryFlag("csrutil", args[0] ?? "(no subcommand)", io);
    io.out.write("System Integrity Protection status: enabled.\n");
    return 0;
  },

  spctl: (args, io) => {
    if (args[0] !== "--status") return boundaryFlag("spctl", args[0] ?? "(no subcommand)", io);
    io.out.write("assessments enabled\n");
    return 0;
  },

  fdesetup: (args, io) => {
    if (args[0] !== "status") return boundaryFlag("fdesetup", args[0] ?? "(no subcommand)", io);
    io.out.write("FileVault is On.\n");
    return 0;
  },

  tac: (args, io, m) => {
    const parsed = parseFlags("tac", args, "", "", io);
    if (typeof parsed === "number") return parsed;
    const { text, failed } = gatherInput("tac", parsed.operands, io, m);
    io.out.write(
      splitLines(text)
        .reverse()
        .map((l) => l + "\n")
        .join(""),
    );
    return failed ? 1 : 0;
  },
};

function parseTouchDate(spec: string): number | null {
  if (spec.startsWith("@")) {
    const s = Number.parseInt(spec.slice(1), 10);
    return Number.isNaN(s) ? null : s * 1000;
  }
  // "YYYY-MM-DD HH:MM[:SS]" or ISO — interpreted as UTC (the contract box runs UTC)
  const iso = spec.includes("T") || !spec.includes(" ") ? spec : spec.replace(" ", "T");
  const withZone = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : t;
}

function parseSymbolicMode(spec: string): ((mode: number) => number) | null {
  const fns: ((mode: number) => number)[] = [];
  for (const clause of spec.split(",")) {
    const m = /^([ugoa]*)([-+=])([rwx]+)$/.exec(clause);
    if (!m) return null;
    const who = m[1] === "" ? "a" : m[1]!;
    const op = m[2]!;
    let permBits = 0;
    for (const p of m[3]!) permBits |= p === "r" ? 4 : p === "w" ? 2 : 1;
    let mask = 0;
    if (who.includes("u") || who.includes("a")) mask |= permBits << 6;
    if (who.includes("g") || who.includes("a")) mask |= permBits << 3;
    if (who.includes("o") || who.includes("a")) mask |= permBits;
    let whoMask = 0;
    if (who.includes("u") || who.includes("a")) whoMask |= 0o700;
    if (who.includes("g") || who.includes("a")) whoMask |= 0o070;
    if (who.includes("o") || who.includes("a")) whoMask |= 0o007;
    fns.push((mode) => (op === "+" ? mode | mask : op === "-" ? mode & ~mask : (mode & ~whoMask) | mask));
  }
  return (mode) => fns.reduce((acc, fn) => fn(acc), mode);
}

function cloneTree(n: VNode, now: number): VNode {
  const copy: VNode = { ...n, mtime: now, children: null };
  delete copy.sim;
  if (n.children) {
    copy.children = new Map();
    for (const [k, v] of n.children) copy.children.set(k, cloneTree(v, now));
  }
  return copy;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** GNU date directive subset; returns null when the format uses an unsupported directive. */
export function strftime(fmt: string, d: Date): string | null {
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]!;
    if (c !== "%") {
      out += c;
      continue;
    }
    const dir = fmt[++i];
    switch (dir) {
      case "Y":
        out += String(d.getUTCFullYear());
        break;
      case "m":
        out += String(d.getUTCMonth() + 1).padStart(2, "0");
        break;
      case "d":
        out += String(d.getUTCDate()).padStart(2, "0");
        break;
      case "e":
        out += String(d.getUTCDate()).padStart(2);
        break;
      case "H":
        out += String(d.getUTCHours()).padStart(2, "0");
        break;
      case "M":
        out += String(d.getUTCMinutes()).padStart(2, "0");
        break;
      case "S":
        out += String(d.getUTCSeconds()).padStart(2, "0");
        break;
      case "s":
        out += String(Math.floor(d.getTime() / 1000));
        break;
      case "a":
        out += WEEKDAYS[d.getUTCDay()]!;
        break;
      case "b":
        out += MONTHS[d.getUTCMonth()]!;
        break;
      case "Z":
        out += "UTC";
        break;
      case "F":
        out += `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        break;
      case "T":
        out += `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
        break;
      case "%":
        out += "%";
        break;
      default:
        return null;
    }
  }
  return out;
}

/** Classic `diff` normal format from an LCS alignment. */
export function normalDiff(a: string[], b: string[]): string {
  const la = a.length;
  const lb = b.length;
  const lcs: number[][] = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));
  for (let i = la - 1; i >= 0; i--) {
    for (let j = lb - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  // walk the table into an op sequence, then group maximal non-match runs into hunks
  const ops: ("M" | "D" | "A")[] = [];
  let i = 0;
  let j = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      ops.push("M");
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push("D");
      i++;
    } else {
      ops.push("A");
      j++;
    }
  }
  while (i < la) {
    ops.push("D");
    i++;
  }
  while (j < lb) {
    ops.push("A");
    j++;
  }

  const range = (x: number, y: number) => (x === y ? String(x) : `${x},${y}`);
  let out = "";
  let ai = 0;
  let bi = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k] === "M") {
      ai++;
      bi++;
      k++;
      continue;
    }
    const sa = ai;
    const sb = bi;
    let dCount = 0;
    let aCount = 0;
    while (k < ops.length && ops[k] !== "M") {
      if (ops[k] === "D") {
        dCount++;
        ai++;
      } else {
        aCount++;
        bi++;
      }
      k++;
    }
    if (dCount > 0 && aCount > 0) {
      out += `${range(sa + 1, sa + dCount)}c${range(sb + 1, sb + aCount)}\n`;
      for (let x = sa; x < sa + dCount; x++) out += `< ${a[x]}\n`;
      out += "---\n";
      for (let x = sb; x < sb + aCount; x++) out += `> ${b[x]}\n`;
    } else if (dCount > 0) {
      out += `${range(sa + 1, sa + dCount)}d${sb}\n`;
      for (let x = sa; x < sa + dCount; x++) out += `< ${a[x]}\n`;
    } else {
      out += `${sa}a${range(sb + 1, sb + aCount)}\n`;
      for (let x = sb; x < sb + aCount; x++) out += `> ${b[x]}\n`;
    }
  }
  return out;
}

function headTail(isHead: boolean, args: string[], io: IOCtx, m: Machine): number {
  const cmd = isHead ? "head" : "tail";
  const parsed = parseFlags(cmd, args, "n", "n", io);
  if (typeof parsed === "number") return parsed;
  const nRaw = parsed.flags.get("n") ?? "10";
  const n = Number.parseInt(nRaw.replace(/^[+-]/, ""), 10);
  if (Number.isNaN(n)) {
    io.err.write(`${cmd}: invalid number of lines: '${nRaw}'\n`);
    return 1;
  }
  const { text, failed } = gatherInput(cmd, parsed.operands, io, m);
  const lines = splitLines(text);
  const chosen = isHead ? lines.slice(0, n) : lines.slice(Math.max(0, lines.length - n));
  io.out.write(chosen.map((l) => l + "\n").join(""));
  return failed ? 1 : 0;
}

function parseFieldList(spec: string): ((n: number) => boolean) | null {
  const ranges: [number, number][] = [];
  for (const part of spec.split(",")) {
    const m = /^(\d*)-(\d*)$|^(\d+)$/.exec(part);
    if (!m) return null;
    if (m[3] !== undefined) ranges.push([Number(m[3]), Number(m[3])]);
    else {
      const lo = m[1] === "" ? 1 : Number(m[1]);
      const hi = m[2] === "" ? Number.MAX_SAFE_INTEGER : Number(m[2]);
      if (m[1] === "" && m[2] === "") return null;
      ranges.push([lo, hi]);
    }
  }
  return (n: number) => ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

function expandTrSet(spec: string): string[] {
  const out: string[] = [];
  let i = 0;
  const classes: Record<string, string> = {
    "[:upper:]": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "[:lower:]": "abcdefghijklmnopqrstuvwxyz",
    "[:digit:]": "0123456789",
    "[:space:]": " \t\n\v\f\r",
  };
  while (i < spec.length) {
    let matchedClass = false;
    for (const [cls, chars] of Object.entries(classes)) {
      if (spec.startsWith(cls, i)) {
        out.push(...chars);
        i += cls.length;
        matchedClass = true;
        break;
      }
    }
    if (matchedClass) continue;
    if (spec[i] === "\\" && i + 1 < spec.length) {
      const e = spec[i + 1]!;
      out.push(e === "n" ? "\n" : e === "t" ? "\t" : e === "\\" ? "\\" : e);
      i += 2;
      continue;
    }
    if (i + 2 < spec.length && spec[i + 1] === "-") {
      const lo = spec.charCodeAt(i);
      const hi = spec.charCodeAt(i + 2);
      for (let c = lo; c <= hi; c++) out.push(String.fromCharCode(c));
      i += 3;
      continue;
    }
    out.push(spec[i]!);
    i++;
  }
  return out;
}
