/**
 * Shell builtins (web ISA ISC-43/44/47/48): cd, export, echo, printf, pwd, history,
 * clear, exit, true/false, test/[, :, set, bash/sh, command.
 */
import type { IOCtx, Machine } from "./interpreter";
import { ScriptExitSignal, SIM_BOUNDARY_EXIT } from "./interpreter";

export type BuiltinImpl = (args: string[], io: IOCtx, m: Machine) => number;

export const BUILTINS: Record<string, BuiltinImpl> = {
  cd: cdBuiltin,
  export: exportBuiltin,
  echo: echoBuiltin,
  printf: printfBuiltin,
  pwd: (_args, io, m) => {
    io.out.write(m.cwd + "\n");
    return 0;
  },
  history: (_args, io, m) => {
    m.history.forEach((line, i) => io.out.write(`${String(i + 1).padStart(5)}  ${line}\n`));
    return 0;
  },
  clear: (_args, io) => {
    io.out.write("\x1b[H\x1b[2J\x1b[3J");
    return 0;
  },
  exit: (args, _io, m) => {
    const code = args[0] !== undefined ? Number.parseInt(args[0], 10) & 0xff : m.lastExit;
    throw new ScriptExitSignal(Number.isNaN(code) ? 2 : code);
  },
  true: () => 0,
  false: () => 1,
  ":": () => 0,
  test: (args, io, m) => evalTest(args, io, m, "test"),
  "[": (args, io, m) => {
    if (args[args.length - 1] !== "]") {
      io.err.write(`${m.errPrefix()}[: missing \`]'\n`);
      return 2;
    }
    return evalTest(args.slice(0, -1), io, m, "[");
  },
  set: setBuiltin,
  shift: (args, _io, m) => {
    const n = args[0] !== undefined ? Number.parseInt(args[0], 10) : 1;
    const f = m.frame();
    if (Number.isNaN(n) || n < 0 || n > f.positional.length) return 1;
    f.positional.splice(0, n);
    return 0;
  },
  unset: (args, _io, m) => {
    for (const a of args) {
      m.vars.delete(a);
      m.exported.delete(a);
    }
    return 0;
  },
  bash: shellBuiltin,
  sh: shellBuiltin,
  command: commandBuiltin,
};

function cdBuiltin(args: string[], io: IOCtx, m: Machine): number {
  let target: string;
  let printIt = false;
  if (args.length === 0) target = m.home;
  else if (args[0] === "-") {
    target = m.prevCwd;
    printIt = true;
  } else target = args[0]!;
  const abs = m.resolve(target);
  const node = m.vfs.lookup(abs);
  if (!node) {
    io.err.write(m.variant === "zsh-macos" ? `cd: no such file or directory: ${target}\n` : `bash: cd: ${target}: No such file or directory\n`);
    return 1;
  }
  if (node.t !== "dir") {
    io.err.write(m.variant === "zsh-macos" ? `cd: not a directory: ${target}\n` : `bash: cd: ${target}: Not a directory\n`);
    return 1;
  }
  m.prevCwd = m.cwd;
  m.cwd = abs;
  m.setVar("OLDPWD", m.prevCwd, true);
  m.setVar("PWD", abs, true);
  if (printIt) io.out.write(abs + "\n");
  return 0;
}

function exportBuiltin(args: string[], _io: IOCtx, m: Machine): number {
  for (const a of args) {
    const eq = a.indexOf("=");
    if (eq === -1) {
      m.exported.add(a);
      if (!m.vars.has(a)) m.vars.set(a, "");
    } else {
      m.setVar(a.slice(0, eq), a.slice(eq + 1), true);
    }
  }
  return 0;
}

function echoBuiltin(args: string[], io: IOCtx): number {
  let newline = true;
  let escapes = false;
  let i = 0;
  while (i < args.length && /^-[neE]+$/.test(args[i]!)) {
    for (const f of args[i]!.slice(1)) {
      if (f === "n") newline = false;
      else if (f === "e") escapes = true;
      else escapes = false;
    }
    i++;
  }
  let text = args.slice(i).join(" ");
  let suppressNewline = false;
  if (escapes) {
    const r = interpretEscapes(text, true);
    text = r.text;
    suppressNewline = r.stopped;
  }
  io.out.write(text + (newline && !suppressNewline ? "\n" : ""));
  return 0;
}

function interpretEscapes(s: string, allowStop: boolean): { text: string; stopped: boolean } {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== "\\" || i + 1 >= s.length) {
      out += c;
      continue;
    }
    const n = s[i + 1]!;
    i++;
    switch (n) {
      case "n":
        out += "\n";
        break;
      case "t":
        out += "\t";
        break;
      case "r":
        out += "\r";
        break;
      case "a":
        out += "\x07";
        break;
      case "b":
        out += "\b";
        break;
      case "f":
        out += "\f";
        break;
      case "v":
        out += "\v";
        break;
      case "\\":
        out += "\\";
        break;
      case "0": {
        const m = /^[0-7]{1,3}/.exec(s.slice(i + 1));
        if (m) {
          out += String.fromCharCode(parseInt(m[0], 8));
          i += m[0].length;
        } else out += "\0";
        break;
      }
      case "c":
        if (allowStop) return { text: out, stopped: true };
        out += "\\c";
        break;
      default:
        out += "\\" + n;
    }
  }
  return { text: out, stopped: false };
}

function printfBuiltin(args: string[], io: IOCtx, m: Machine): number {
  if (args.length === 0) {
    io.err.write("printf: usage: printf [-v var] format [arguments]\n");
    return 2;
  }
  const format = args[0]!;
  let rest = args.slice(1);
  let out = "";
  let cycles = 0;
  do {
    let consumed = 0;
    let i = 0;
    while (i < format.length) {
      const c = format[i]!;
      if (c === "\\") {
        const r = interpretEscapes(format.slice(i, i + 2), false);
        out += r.text;
        i += 2;
        continue;
      }
      if (c !== "%") {
        out += c;
        i++;
        continue;
      }
      const spec = /^%([-0]?\d*)(?:\.(\d+))?([sdioxXc%])/.exec(format.slice(i));
      if (!spec) {
        out += c;
        i++;
        continue;
      }
      const [whole, widthRaw, precision, conv] = spec as unknown as [string, string, string | undefined, string];
      i += whole.length;
      if (conv === "%") {
        out += "%";
        continue;
      }
      const arg = rest[consumed];
      consumed++;
      let rendered: string;
      if (conv === "s") {
        rendered = arg ?? "";
        if (precision !== undefined) rendered = rendered.slice(0, Number(precision));
      } else if (conv === "c") {
        rendered = (arg ?? "").slice(0, 1);
      } else {
        let nval = arg === undefined ? 0 : Number.parseInt(arg, 10);
        if (Number.isNaN(nval)) {
          io.err.write(`${m.shellName()}: printf: ${arg}: invalid number\n`);
          nval = 0;
        }
        rendered =
          conv === "x" ? nval.toString(16) : conv === "X" ? nval.toString(16).toUpperCase() : conv === "o" ? nval.toString(8) : String(nval);
      }
      if (widthRaw !== "" && widthRaw !== undefined) {
        const left = widthRaw.startsWith("-");
        const zero = widthRaw.startsWith("0") && conv !== "s";
        const width = Math.abs(Number.parseInt(widthRaw, 10)) || 0;
        rendered = left ? rendered.padEnd(width) : rendered.padStart(width, zero ? "0" : " ");
      }
      out += rendered;
    }
    rest = rest.slice(consumed);
    cycles++;
    if (consumed === 0) break; // format has no conversions — never loop
  } while (rest.length > 0 && cycles < 10_000);
  io.out.write(out);
  return 0;
}

function evalTest(args: string[], io: IOCtx, m: Machine, name: string): number {
  try {
    return testExpr(args, m) ? 0 : 1;
  } catch (e) {
    io.err.write(`${m.errPrefix()}${name}: ${(e as Error).message}\n`);
    return 2;
  }
}

function testExpr(args: string[], m: Machine): boolean {
  if (args.length === 0) return false;
  if (args[0] === "!" && args.length > 1) return !testExpr(args.slice(1), m);
  if (args.length === 1) return args[0] !== "";
  if (args.length === 2) {
    const [op, operand] = args as [string, string];
    const node = () => m.vfs.lookup(m.resolve(operand));
    switch (op) {
      case "-f":
        return node()?.t === "file";
      case "-d":
        return node()?.t === "dir";
      case "-e":
        return node() !== null;
      case "-x": {
        const n = node();
        return n !== null && (n.mode & 0o111) !== 0;
      }
      case "-s": {
        const n = node();
        return n?.t === "file" && n.content.length > 0;
      }
      case "-r":
      case "-w":
        return node() !== null;
      case "-z":
        return operand === "";
      case "-n":
        return operand !== "";
      default:
        throw new Error(`${op}: unary operator expected`);
    }
  }
  if (args.length === 3) {
    const [a, op, b] = args as [string, string, string];
    switch (op) {
      case "=":
      case "==":
        return a === b;
      case "!=":
        return a !== b;
      case "-eq":
      case "-ne":
      case "-lt":
      case "-le":
      case "-gt":
      case "-ge": {
        const na = Number.parseInt(a, 10);
        const nb = Number.parseInt(b, 10);
        if (Number.isNaN(na)) throw new Error(`${a}: integer expression expected`);
        if (Number.isNaN(nb)) throw new Error(`${b}: integer expression expected`);
        switch (op) {
          case "-eq":
            return na === nb;
          case "-ne":
            return na !== nb;
          case "-lt":
            return na < nb;
          case "-le":
            return na <= nb;
          case "-gt":
            return na > nb;
          default:
            return na >= nb;
        }
      }
      default:
        throw new Error(`${op}: binary operator expected`);
    }
  }
  throw new Error("too many arguments");
}

function setBuiltin(args: string[], io: IOCtx, m: Machine): number {
  const flags = m.frame().flags;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-o" || a === "+o") {
      const opt = args[++i];
      if (opt === "pipefail") flags.pipefail = a === "-o";
      continue;
    }
    if (/^[-+][a-z]+$/.test(a)) {
      const on = a.startsWith("-");
      for (const f of a.slice(1)) {
        if (f === "e") flags.errexit = on;
        else if (f === "u") flags.nounset = on;
        else if (f === "o") {
          const opt = args[i + 1];
          if (opt === "pipefail") {
            flags.pipefail = on;
            i++;
          }
        }
        // -x and others: accepted, no-op in the sim
      }
      continue;
    }
    io.err.write(`${m.errPrefix()}set: ${a}: invalid option\n`);
    return 2;
  }
  return 0;
}

function shellBuiltin(args: string[], io: IOCtx, m: Machine): number {
  if (args[0] === "-c") {
    if (args[1] === undefined) {
      io.err.write(`${m.shellName()}: -c: option requires an argument\n`);
      return 2;
    }
    return m.runProgram(args[1], io);
  }
  const scriptArg = args.find((a) => !a.startsWith("-"));
  if (scriptArg === undefined) {
    io.err.write(`grc-sim: ${m.shellName()}: nested interactive shells are outside this lab's simulated surface — run it on a real machine to explore\n`);
    return SIM_BOUNDARY_EXIT;
  }
  const abs = m.resolve(scriptArg);
  const node = m.vfs.lookup(abs);
  if (!node || node.t !== "file") {
    io.err.write(`${m.shellName()}: ${scriptArg}: No such file or directory\n`);
    return 127;
  }
  const rest = args.slice(args.indexOf(scriptArg) + 1);
  return m.runScriptFile(abs, scriptArg, node.content, rest, io);
}

function commandBuiltin(args: string[], io: IOCtx, m: Machine): number {
  if (args[0] === "-v") {
    const name = args[1];
    if (name === undefined) return 1;
    if (BUILTINS[name]) {
      io.out.write(name + "\n");
      return 0;
    }
    const path = m.getVar("PATH") ?? "";
    for (const dir of path.split(":")) {
      if (dir === "") continue;
      const abs = dir + "/" + name;
      const node = m.vfs.lookup(abs);
      if (node && node.t !== "dir" && (node.mode & 0o111) !== 0) {
        io.out.write(abs + "\n");
        return 0;
      }
    }
    return 1;
  }
  if (args.length === 0) return 0;
  return m.dispatch(args, io);
}
