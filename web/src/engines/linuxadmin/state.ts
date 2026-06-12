/**
 * Module-02 Linux-admin system model (web ISA ISC-60) — state layer.
 *
 * The simulated host is the docker-linux-booted contract box (web-01, Ubuntu 24.04,
 * systemd as PID 1). ALL persistent state lives in the session VFS so snapshot/restore
 * carries it for free, mirroring the module's own mental model ("files hold the durable
 * truth"): users in /etc/passwd + /etc/group, unit files in /etc + /usr/lib/systemd,
 * and runtime state (unit activity, journal, counters) under /run/grc-sim — the sim's
 * stand-in for systemd's /run state.
 *
 * Honesty: every rendered string in this family is pinned to a captured fixture
 * (.ci/fixtures/captured/m02-*.json); scenario constants (PID 742, May 27 timestamps,
 * 10.0.0.5) are module-prose canon placed inside the captures' declared entropy holes.
 */
import type { Machine } from "../shell/interpreter";

export const RUN_DIR = "/run/grc-sim";
export const STATE_PATH = `${RUN_DIR}/state.json`;
export const APT_DB_PATH = "/var/lib/grc-sim/apt-installed.txt";

/** Scenario constants (module 02 prose canon + booted-contract values). */
export const M02 = {
  host: "web-01",
  adminUser: "grcops",
  password: "labpass",            // baked into the capture image (manifest contract)
  sshdPid: 742,                   // §4.2 canon
  bootIso: "2026-05-27T09:00:41Z",
  firstSshChildPid: 1402,         // §4.7 canon (sshd[1402])
  clientIp: "10.0.0.5",           // §4.7 canon (inside the capture's client-ip hole)
  firstClientPort: 50321,
  tasksLimit: 19284,              // pinned from m02-systemctl-status-ssh capture
  journaldPid: 22,                // pinned from booted capture (ps aux)
} as const;

export interface UnitRuntime {
  installed: boolean;
  enabled: boolean;
  active: boolean;
  sinceMs: number;      // last start (active) or last stop (inactive)
  startedMs: number;    // last start time (for Duration on stop)
  mainPid: number;
  childPid: number;
  lastHeartbeatMs: number; // evidence-collector heartbeat high-water mark
  everRan: boolean;
}

export interface JournalEntry {
  t: number;            // sim ms
  ident: string;        // systemd | sshd | sudo | evidence-collector
  pid: number;
  msg: string;
  unit: string | null;  // unit attribution for -u (ssh, evidence-collector); null = none
}

export interface AdminState {
  units: Record<string, UnitRuntime>;
  journal: JournalEntry[];
  nextPid: number;
  nextPort: number;
  sudoAuth: Record<string, number>;       // user → last-auth sim ms
  passwords: Record<string, string>;      // set via passwd (seeded with the scenario account)
  sshdEffective: { passwordAuthentication: "yes" | "no" }; // config AS LOADED (start/reload)
}

export interface AdminLab {
  password: string;
}

const LABS = new WeakMap<Machine, AdminLab>();

export function attachAdminLab(m: Machine, opts: { password?: string }): void {
  LABS.set(m, { password: opts.password ?? M02.password });
  // bootstrap runtime state on first attach (restore finds it already in the VFS)
  if (!m.vfs.exists(STATE_PATH)) {
    m.vfs.mkdir(RUN_DIR, { parents: true, owner: "root", now: m.epochMs });
    writeState(m, initialState(m));
  }
}

export function getLab(m: Machine): AdminLab | null {
  return LABS.get(m) ?? null;
}

/**
 * May this command suspend the session for an interactive dialogue (sudo/passwd/ssh
 * prompts)? Mirrors the engine's pending-stdin guard: only the FIRST command of an
 * interactive line may suspend — a resumed line re-executes from the start, so commands
 * that already completed must not run twice. The suspending command's own pre-prompt
 * output is safe: every dialogue impl is resume-idempotent (prompts and banners are
 * gated on Machine.dialogueResume; state side effects like known_hosts writes are
 * naturally skipped on re-execution). Scripts, pipelines, and later commands fall
 * through to piped-stdin semantics.
 */
export function canDialogue(m: Machine, io: { stdin: string | null }): boolean {
  return io.stdin === null && m.interactive && !m.dialogueResume && m.execCount === 0;
}

export function readState(m: Machine): AdminState {
  const raw = m.vfs.readFile(STATE_PATH);
  if (raw === null) {
    const st = initialState(m);
    writeState(m, st);
    return st;
  }
  return JSON.parse(raw) as AdminState;
}

export function writeState(m: Machine, st: AdminState): void {
  m.vfs.mkdir(RUN_DIR, { parents: true, owner: "root", now: m.epochMs });
  m.vfs.writeFile(STATE_PATH, JSON.stringify(st), { owner: "root", now: m.now() });
}

/**
 * Boot state of the scenario box: sshd enabled + active since boot (canon PID 742),
 * evidence-collector NOT installed (the §6 apt flow installs it), journal carrying the
 * real boot lines (formats pinned by the journalctl captures; times are scenario canon).
 */
function initialState(m: Machine): AdminState {
  const boot = Date.parse(M02.bootIso);
  return {
    units: {
      ssh: {
        installed: true, enabled: true, active: true,
        sinceMs: boot, startedMs: boot, mainPid: M02.sshdPid, childPid: 0,
        lastHeartbeatMs: 0, everRan: true,
      },
    },
    journal: [
      { t: boot, ident: "systemd", pid: 1, msg: "Started ssh.service - OpenBSD Secure Shell server.", unit: "ssh" },
      { t: boot, ident: "sshd", pid: M02.sshdPid, msg: "Server listening on 0.0.0.0 port 22.", unit: "ssh" },
      { t: boot, ident: "sshd", pid: M02.sshdPid, msg: "Server listening on :: port 22.", unit: "ssh" },
    ],
    nextPid: M02.firstSshChildPid,
    nextPort: M02.firstClientPort,
    sudoAuth: {},
    passwords: { [M02.adminUser]: M02.password },
    // seed sshd_config leaves PasswordAuthentication commented → effective default yes
    // (verified real: m02-ssh-password-offered)
    sshdEffective: { passwordAuthentication: snapshotPasswordAuth(m) },
  };
}

/** Parse the running config the way sshd does: comments stripped, FIRST directive wins. */
export function snapshotPasswordAuth(m: Machine): "yes" | "no" {
  const raw = m.vfs.readFile("/etc/ssh/sshd_config") ?? "";
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const sp = t.search(/[ \t]/);
    if (sp === -1) continue;
    if (t.slice(0, sp).toLowerCase() === "passwordauthentication") {
      return t.slice(sp).trim().toLowerCase() === "no" ? "no" : "yes";
    }
  }
  return "yes"; // sshd default
}

export function allocPid(st: AdminState): number {
  return st.nextPid++;
}

export function allocPort(st: AdminState): number {
  const p = st.nextPort;
  st.nextPort += 16;
  return p;
}

/** Append a journal entry (and keep order by time for renderers). */
export function journalAppend(st: AdminState, e: JournalEntry): void {
  st.journal.push(e);
}

/** Materialize evidence-collector heartbeats (one every 300 s while active) up to `untilMs`. */
export function expandHeartbeats(st: AdminState, untilMs: number): void {
  const u = st.units["evidence-collector"];
  if (!u || !u.active) return;
  let t = u.lastHeartbeatMs === 0 ? u.sinceMs : u.lastHeartbeatMs + 300_000;
  while (t <= untilMs) {
    journalAppend(st, { t, ident: "evidence-collector", pid: u.mainPid, msg: "evidence-collector: heartbeat ok", unit: "evidence-collector" });
    u.lastHeartbeatMs = t;
    t += 300_000;
  }
}
