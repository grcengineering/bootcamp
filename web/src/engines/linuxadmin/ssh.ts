/**
 * Module-02 ssh client: scripted-but-stateful handshake against the simulated box itself
 * (web-01 IS this machine — design-inputs: "interactive ssh flows are scripted dialogues").
 *
 * Auth honors the system model: key login requires the client keypair + a matching
 * authorized_keys line; password auth follows the sshd_config AS LOADED at the last
 * start/reload (editing the file without a reload changes nothing — the §6 task-4 lesson).
 * Every login appends the real journal line shapes (fixtures m02-journalctl-*), with the
 * module-canon client address 10.0.0.5 inside the captures' client-ip hole.
 *
 * Client message strings are byte-pinned to fixtures (incl. their real \r\n endings):
 * m02-ssh-login, m02-ssh-second, m02-ssh-unknown-host, m02-ssh-password-offered,
 * m02-ssh-password-refused, m02-ssh-hostkey-ask.
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import { PendingStdinSignal } from "../shell/interpreter";
import { M02, canDialogue, readState, writeState, allocPid, allocPort, journalAppend, getLab } from "./state";
import { fingerprintOfPubLine } from "./sshkeys";
import { userByName } from "./users";
import { boundary } from "./users";

const LOCAL_HOSTS = new Set([M02.host, "localhost", "127.0.0.1", "::1"]);

interface SshOpts {
  strict: string | null;        // StrictHostKeyChecking
  pubkeyAuth: boolean;
  batchMode: boolean;
  preferred: string | null;     // PreferredAuthentications
}

function parseOpt(opts: SshOpts, kv: string): void {
  const eq = kv.indexOf("=");
  const k = (eq === -1 ? kv : kv.slice(0, eq)).toLowerCase();
  const v = (eq === -1 ? "" : kv.slice(eq + 1)).toLowerCase();
  if (k === "stricthostkeychecking") opts.strict = v;
  else if (k === "pubkeyauthentication") opts.pubkeyAuth = v !== "no";
  else if (k === "batchmode") opts.batchMode = v === "yes";
  else if (k === "preferredauthentications") opts.preferred = v;
}

function deniedMethods(m: Machine, passwordOffered: boolean): string {
  return passwordOffered ? "publickey,password" : "publickey";
}

function appendLoginJournal(m: Machine, user: string, method: "publickey" | "password", fp: string | null, runCmd: boolean): void {
  const st = readState(m);
  const now = m.now();
  const port = allocPort(st);
  const child = st.nextPid === M02.firstSshChildPid ? allocPid(st) : allocPid(st);
  const suffix = method === "publickey" ? ` ssh2: ED25519 ${fp}` : " ssh2";
  journalAppend(st, { t: now, ident: "sshd", pid: child, msg: `Accepted ${method} for ${user} from ${M02.clientIp} port ${port}${suffix}`, unit: "ssh" });
  journalAppend(st, { t: now, ident: "sshd", pid: child, msg: `pam_unix(sshd:session): session opened for user ${user}(uid=${userByName(m, user)?.uid ?? 0}) by (uid=0)`, unit: "ssh" });
  if (runCmd) {
    const dpid = allocPid(st);
    journalAppend(st, { t: now, ident: "sshd", pid: dpid, msg: `Received disconnect from ${M02.clientIp} port ${port}:11: disconnected by user`, unit: "ssh" });
    journalAppend(st, { t: now, ident: "sshd", pid: dpid, msg: `Disconnected from user ${user} ${M02.clientIp} port ${port}`, unit: "ssh" });
    journalAppend(st, { t: now, ident: "sshd", pid: child, msg: `pam_unix(sshd:session): session closed for user ${user}`, unit: "ssh" });
  }
  writeState(m, st);
}

export function sshImpl(args: string[], io: IOCtx, m: Machine): number {
  const opts: SshOpts = { strict: null, pubkeyAuth: true, batchMode: false, preferred: null };
  let target: string | null = null;
  const remoteCmd: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (target === null) {
      if (a === "-o") { parseOpt(opts, args[++i] ?? ""); continue; }
      if (a === "-t" || a === "-tt") continue;
      if (a.startsWith("-")) return boundary("ssh", `option ${a}`, io);
      target = a;
      continue;
    }
    remoteCmd.push(a);
  }
  if (target === null) return boundary("ssh", "the no-target form", io);

  let user = m.user;
  let host = target;
  const at = target.indexOf("@");
  if (at !== -1) { user = target.slice(0, at); host = target.slice(at + 1); }

  if (!LOCAL_HOSTS.has(host)) {
    io.err.write(`ssh: Could not resolve hostname ${host}: Name or service not known\r\n`); // m02-ssh-unknown-host
    return 255;
  }

  // host-key trust (known_hosts is a real file on the VFS)
  const knownHostsPath = `${m.home}/.ssh/known_hosts`;
  const known = (m.vfs.readFile(knownHostsPath) ?? "").split("\n").some((l) => l.startsWith(`${host} `));
  if (!known) {
    if (opts.strict === "accept-new" || opts.strict === "no") {
      m.vfs.mkdir(`${m.home}/.ssh`, { parents: true, owner: m.user, now: m.now() });
      m.vfs.writeFile(knownHostsPath, `${host} ssh-ed25519 (simulated host key)\n`, { append: true, owner: m.user, now: m.now() });
      io.err.write(`Warning: Permanently added '${host}' (ED25519) to the list of known hosts.\r\n`); // m02-ssh-login
    } else {
      // default = ask; with no input available the verification fails (m02-ssh-hostkey-ask)
      io.err.write("Host key verification failed.\r\n");
      return 255;
    }
  }

  const lab = getLab(m);
  const st = readState(m);
  const passwordOffered = st.sshdEffective.passwordAuthentication === "yes";

  // public key path: client keypair + matching authorized_keys line on the "server"
  const pubLine = (m.vfs.readFile(`${m.home}/.ssh/id_ed25519.pub`) ?? "").trim();
  const haveKey = opts.pubkeyAuth && pubLine !== "" && m.vfs.exists(`${m.home}/.ssh/id_ed25519`) && opts.preferred !== "password";
  const authKeys = (m.vfs.readFile(`/home/${user}/.ssh/authorized_keys`) ?? "").split("\n").map((l) => l.trim());
  if (haveKey && authKeys.includes(pubLine)) {
    const fp = fingerprintOfPubLine(pubLine)?.fingerprint ?? "SHA256:unknown";
    appendLoginJournal(m, user, "publickey", fp, true);
    if (remoteCmd.length > 0) return m.dispatch(remoteCmd, { ...io, stdin: "" });
    return 0; // bare login: same box, same prompt — faithfully nothing else to print
  }

  // password path
  if (!passwordOffered || opts.batchMode || userByName(m, user) === null) {
    io.err.write(`${user}@${host}: Permission denied (${deniedMethods(m, passwordOffered)}).\r\n`); // m02-ssh-password-{offered,refused}
    return 255;
  }
  if (canDialogue(m, io)) {
    io.err.write(`${user}@${host}'s password: `);
    throw new PendingStdinSignal(false, 1);
  }
  const typed = (io.stdin ?? "").split("\n")[0] ?? "";
  if (!m.dialogueResume) io.err.write(`${user}@${host}'s password: `);
  if (typed !== "" && typed === st.passwords[user]) {
    appendLoginJournal(m, user, "password", null, true);
    if (remoteCmd.length > 0) return m.dispatch(remoteCmd, { ...io, stdin: "" });
    return 0;
  }
  // wording mirrors the captured refusal line; the per-retry prompt loop is not modeled
  io.err.write(`Permission denied, please try again.\r\n${user}@${host}: Permission denied (${deniedMethods(m, passwordOffered)}).\r\n`);
  void lab;
  return 255;
}
