/**
 * Module-02 user/group/identity commands: id, useradd, usermod, passwd.
 *
 * State = the real files (/etc/passwd, /etc/group), parsed and rewritten the way the
 * real tools do. Every error/success string is byte-pinned to a captured fixture
 * (named in comments). Root requirement is enforced via the effective sim user
 * (sudo swaps Machine.user during the wrapped command).
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import { PendingStdinSignal, SIM_BOUNDARY_EXIT } from "../shell/interpreter";
import { PASSWD_MISMATCH_STDERR, PASSWD_MISMATCH_EXIT } from "./generated/m02-assets";
import { canDialogue, readState, writeState } from "./state";

export const boundary = (cmd: string, what: string, io: IOCtx): number => {
  io.err.write(`grc-sim: ${cmd}: ${what} is outside this lab's simulated surface — run it on a real machine to explore\n`);
  return SIM_BOUNDARY_EXIT;
};

export interface PwEntry { name: string; uid: number; gid: number; gecos: string; home: string; shell: string }
export interface GrEntry { name: string; gid: number; members: string[] }

export function parsePasswd(m: Machine): PwEntry[] {
  const raw = m.vfs.readFile("/etc/passwd") ?? "";
  const out: PwEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line === "") continue;
    const f = line.split(":");
    if (f.length < 7) continue;
    out.push({ name: f[0]!, uid: Number(f[2]), gid: Number(f[3]), gecos: f[4]!, home: f[5]!, shell: f[6]! });
  }
  return out;
}

export function parseGroup(m: Machine): GrEntry[] {
  const raw = m.vfs.readFile("/etc/group") ?? "";
  const out: GrEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line === "") continue;
    const f = line.split(":");
    if (f.length < 4) continue;
    out.push({ name: f[0]!, gid: Number(f[2]), members: f[3] === "" ? [] : f[3]!.split(",") });
  }
  return out;
}

export function userByName(m: Machine, name: string): PwEntry | null {
  return parsePasswd(m).find((u) => u.name === name) ?? null;
}

/** Supplementary groups for a user, in /etc/group file order (matches real `id` output). */
export function supplementaryGroups(m: Machine, name: string): GrEntry[] {
  return parseGroup(m).filter((g) => g.members.includes(name));
}

export function isInSudoGroup(m: Machine, name: string): boolean {
  return supplementaryGroups(m, name).some((g) => g.name === "sudo" || g.name === "wheel");
}

function appendLine(m: Machine, path: string, line: string): void {
  const raw = m.vfs.readFile(path) ?? "";
  const next = raw.endsWith("\n") || raw === "" ? raw + line + "\n" : raw + "\n" + line + "\n";
  m.vfs.writeFile(path, next, { owner: "root", now: m.now() });
}

// ---------------------------------------------------------------------------
// id (fixtures: m02-id-self, m02-id-grcops, m02-id-intern, m02-id-nouser)
// ---------------------------------------------------------------------------

export function idImpl(args: string[], io: IOCtx, m: Machine): number {
  if (args.some((a) => a.startsWith("-"))) return boundary("id", `option ${args.find((a) => a.startsWith("-"))}`, io);
  if (args.length > 1) return boundary("id", "multiple operands", io);
  const name = args[0] ?? m.user;
  if (name === "root") {
    io.out.write("uid=0(root) gid=0(root) groups=0(root)\n");
    return 0;
  }
  const u = userByName(m, name);
  if (u === null) {
    io.err.write(`id: ‘${name}’: no such user\n`); // m02-id-nouser (GNU quotes)
    return 1;
  }
  const groups = parseGroup(m);
  const primary = groups.find((g) => g.gid === u.gid)?.name ?? String(u.gid);
  const supp = supplementaryGroups(m, u.name);
  const list = [`${u.gid}(${primary})`, ...supp.map((g) => `${g.gid}(${g.name})`)];
  io.out.write(`uid=${u.uid}(${u.name}) gid=${u.gid}(${primary}) groups=${list.join(",")}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// useradd (fixtures: m02-useradd-nonroot, m02-sudo-useradd, m02-useradd-exists)
// ---------------------------------------------------------------------------

export function useraddImpl(args: string[], io: IOCtx, m: Machine): number {
  let makeHome = false;
  let name: string | null = null;
  for (const a of args) {
    if (a === "-m" || a === "--create-home") { makeHome = true; continue; }
    if (a.startsWith("-")) return boundary("useradd", `option ${a}`, io);
    if (name !== null) return boundary("useradd", "multiple operands", io);
    name = a;
  }
  if (name === null) return boundary("useradd", "no-operand form", io);
  if (m.user !== "root") {
    io.err.write("useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n");
    return 1;
  }
  if (userByName(m, name) !== null) {
    io.err.write(`useradd: user '${name}' already exists\n`);
    return 9;
  }
  const uids = parsePasswd(m).map((u) => u.uid).filter((u) => u >= 1000 && u < 60000);
  const uid = uids.length === 0 ? 1000 : Math.max(...uids) + 1;
  appendLine(m, "/etc/passwd", `${name}:x:${uid}:${uid}::/home/${name}:/bin/sh`);
  appendLine(m, "/etc/group", `${name}:x:${uid}:`);
  if (makeHome) {
    const home = `/home/${name}`;
    m.vfs.mkdir(home, { parents: true, owner: name, now: m.now() });
    const dir = m.vfs.lookup(home)!;
    dir.mode = 0o750; // drwxr-x--- (m02-sudo-useradd post stat)
    dir.owner = name;
    dir.group = name;
    for (const skel of m.vfs.listNames("/etc/skel") ?? []) {
      const content = m.vfs.readFile(`/etc/skel/${skel}`);
      if (content === null) continue;
      m.vfs.writeFile(`${home}/${skel}`, content, { owner: name, now: m.now(), mode: 0o644 });
      const node = m.vfs.lookup(`${home}/${skel}`)!;
      node.owner = name;
      node.group = name;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// usermod (fixtures: m02-usermod-nonroot, m02-sudo-usermod, m02-usermod-badgroup)
// ---------------------------------------------------------------------------

export function usermodImpl(args: string[], io: IOCtx, m: Machine): number {
  let group: string | null = null;
  let name: string | null = null;
  let append = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-aG" || a === "-Ga") { append = true; group = args[++i] ?? null; continue; }
    if (a === "-a" || a === "--append") { append = true; continue; }
    if (a === "-G" || a === "--groups") { group = args[++i] ?? null; continue; }
    if (a.startsWith("-")) return boundary("usermod", `option ${a}`, io);
    if (name !== null) return boundary("usermod", "multiple operands", io);
    name = a;
  }
  if (name === null || group === null || !append) return boundary("usermod", "this flag form", io);
  if (m.user !== "root") {
    io.err.write("usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.\n");
    return 1;
  }
  const groups = parseGroup(m);
  if (!groups.some((g) => g.name === group)) {
    io.err.write(`usermod: group '${group}' does not exist\n`);
    return 6;
  }
  if (userByName(m, name) === null) return boundary("usermod", "unknown-user error path", io);
  const raw = m.vfs.readFile("/etc/group") ?? "";
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i]!.split(":");
    if (f[0] !== group || f.length < 4) continue;
    const members = f[3] === "" ? [] : f[3]!.split(",");
    if (!members.includes(name)) members.push(name);
    f[3] = members.join(",");
    lines[i] = f.join(":");
  }
  m.vfs.writeFile("/etc/group", lines.join("\n"), { owner: "root", now: m.now() });
  return 0;
}

// ---------------------------------------------------------------------------
// passwd (fixtures: m02-sudo-passwd, m02-passwd-mismatch, m02-passwd-nonroot)
// ---------------------------------------------------------------------------

export function passwdImpl(args: string[], io: IOCtx, m: Machine): number {
  if (args.some((a) => a.startsWith("-"))) return boundary("passwd", `option ${args[0]}`, io);
  const target = args[0];
  if (target === undefined) return boundary("passwd", "the self-service flow", io);
  if (m.user !== "root") {
    io.err.write(`passwd: You may not view or modify password information for ${target}.\n`);
    return 1;
  }
  if (userByName(m, target) === null) return boundary("passwd", "unknown-user error path", io);

  // interactive: collect 2 lines via the dialogue machinery (prompt shown while typing;
  // resumed run skips re-emitting prompts — concatenated bytes equal the piped capture)
  if (canDialogue(m, io)) {
    io.err.write("New password: ");
    throw new PendingStdinSignal(false, 2, ["", "Retype new password: "]);
  }
  const lines = (io.stdin ?? "").split("\n");
  if (!m.dialogueResume) io.err.write("New password: Retype new password: ");
  const pw1 = lines[0] ?? "";
  const pw2 = lines[1] ?? "";
  if (pw1 !== pw2 || pw1 === "") {
    io.err.write(PASSWD_MISMATCH_STDERR.slice("New password: Retype new password: ".length));
    return PASSWD_MISMATCH_EXIT;
  }
  const st = readState(m);
  st.passwords[target] = pw1;
  writeState(m, st);
  io.err.write("passwd: password updated successfully\n");
  return 0;
}
