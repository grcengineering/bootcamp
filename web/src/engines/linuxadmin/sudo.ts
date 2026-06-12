/**
 * Module-02 sudo: the supervised root gateway (§4.4) with the real prompt flow.
 *
 * Byte contract (fixtures): m02-sudo-whoami / -useradd / -usermod / -passwd (prompt),
 * m02-sudo-wrongpw (Sorry, try again ×2 + 3-attempt failure), m02-sudo-nopw-eof,
 * m02-sudo-notsudoer, m02-sudo-cached (credential caching), m02-sudo-usage,
 * m02-sudo-journal (the evidence-producing journal lines).
 *
 * Interactive prompts ride the engine's dialogue machinery; piped stdin behaves like
 * the harness's `sudo -S` (first line = password). One declared divergence: a sudo in
 * the middle of an UNCACHED pipeline consumes the pipe's first line as the password
 * (real sudo prompts on /dev/tty, which the sim does not model) — the taught flow primes
 * the cache first, exactly as the m02-harden-tee capture does.
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import { PendingStdinSignal } from "../shell/interpreter";
import { SUDO_USAGE } from "./generated/m02-assets";
import { canDialogue, getLab, readState, writeState, allocPid, journalAppend } from "./state";
import { isInSudoGroup, parsePasswd, boundary } from "./users";

const CACHE_MS = 15 * 60_000;

/** Inner commands that themselves read dialogue lines when run interactively under sudo. */
const INNER_DIALOGUES: Record<string, { lines: number; prompts: string[] }> = {
  passwd: { lines: 2, prompts: ["New password: ", "Retype new password: "] },
};

function resolveCommandPath(m: Machine, name: string): string {
  if (name.includes("/")) return m.resolve(name);
  for (const dir of (m.getVar("PATH") ?? "").split(":")) {
    if (dir === "") continue;
    const abs = dir === "/" ? "/" + name : dir + "/" + name;
    const node = m.vfs.lookup(abs);
    if (node && node.t !== "dir" && (node.mode & 0o111) !== 0) return abs;
  }
  return `/usr/bin/${name}`;
}

function runAsRoot(m: Machine, argv: string[], io: IOCtx): number {
  // m02-sudo-journal ordering: COMMAND + session-open are logged BEFORE the wrapped
  // command runs (a `sudo journalctl` sees its own elevation but not its own close)
  const st = readState(m);
  const now = m.now();
  const pid = allocPid(st);
  const cmdPath = resolveCommandPath(m, argv[0]!);
  const rendered = [cmdPath, ...argv.slice(1)].join(" ");
  const uid = parsePasswd(m).find((u) => u.name === m.user)?.uid ?? 0;
  journalAppend(st, { t: now, ident: "sudo", pid, msg: `  ${m.user} : PWD=${m.cwd} ; USER=root ; COMMAND=${rendered}`, unit: null });
  journalAppend(st, { t: now, ident: "sudo", pid, msg: `pam_unix(sudo:session): session opened for user root(uid=0) by (uid=${uid})`, unit: null });
  writeState(m, st);
  const saved = m.user;
  m.user = "root";
  try {
    return m.dispatch(argv, io);
  } finally {
    m.user = saved;
    const st2 = readState(m);
    journalAppend(st2, { t: m.now(), ident: "sudo", pid, msg: "pam_unix(sudo:session): session closed for user root", unit: null });
    writeState(m, st2);
  }
}

export function sudoImpl(args: string[], io: IOCtx, m: Machine): number {
  const lab = getLab(m)!;
  const argv = [...args];
  // -S is implicit in the sim (piped stdin is always the password source); -k clears cache
  while (argv[0] === "-S" || argv[0] === "-k") {
    if (argv[0] === "-k") {
      const st = readState(m);
      delete st.sudoAuth[m.user];
      writeState(m, st);
    }
    argv.shift();
  }
  if (argv.length === 0) {
    io.err.write(SUDO_USAGE); // m02-sudo-usage
    return 1;
  }
  if (argv[0]!.startsWith("-")) return boundary("sudo", `option ${argv[0]}`, io);
  if (m.user === "root") return m.dispatch(argv, io);

  const st = readState(m);
  const cached = st.sudoAuth[m.user] !== undefined && m.now() - st.sudoAuth[m.user]! < CACHE_MS;
  if (cached) return runAsRoot(m, argv, io); // m02-sudo-cached: no prompt

  // need a password: interactive → dialogue; piped/script → -S semantics
  if (canDialogue(m, io)) {
    io.err.write(`[sudo] password for ${m.user}: `);
    const inner = INNER_DIALOGUES[argv[0]!];
    if (inner !== undefined) {
      // chain the wrapped command's own prompts onto this dialogue (e.g. sudo passwd)
      throw new PendingStdinSignal(false, 1 + inner.lines, ["", ...inner.prompts]);
    }
    throw new PendingStdinSignal(false, 1);
  }

  const lines = (io.stdin ?? "").split("\n");
  let consumed = 0;
  const promptOnce = () => {
    if (!(m.dialogueResume && consumed === 0)) io.err.write(`[sudo] password for ${m.user}: `);
  };
  if (m.dialogueResume) {
    // prompt already emitted while the learner typed
  } else {
    promptOnce();
  }

  if (!isInSudoGroup(m, m.user)) {
    consumed = 1; // sudo reads (and discards) one password attempt before refusing
    io.err.write(`${m.user} is not in the sudoers file.\n`); // m02-sudo-notsudoer
    return 1;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (consumed >= lines.length || (consumed === lines.length - 1 && lines[consumed] === "")) {
      // out of input — m02-sudo-nopw-eof
      io.err.write("\nsudo: no password was provided\nsudo: a password is required\n");
      return 1;
    }
    if (attempt > 0) io.err.write(`[sudo] password for ${m.user}: `);
    const pw = lines[consumed++]!;
    if (pw === lab.password || pw === st.passwords[m.user]) {
      st.sudoAuth[m.user] = m.now();
      writeState(m, st);
      const rest = lines.slice(consumed).join("\n");
      return runAsRoot(m, argv, { ...io, stdin: rest });
    }
    if (attempt < 2) {
      io.err.write("Sorry, try again.\n"); // m02-sudo-wrongpw
    } else {
      io.err.write("sudo: 3 incorrect password attempts\n");
      return 1;
    }
  }
  return 1;
}
