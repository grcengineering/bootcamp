/**
 * Module-02 systemd surface: systemctl (status/start/stop/restart/reload/enable/disable/
 * is-active/is-enabled) + journalctl (taught filters).
 *
 * Output shapes are byte-pinned to the docker-linux-booted captures (fixture ids in
 * comments); volatile values (timestamps, PIDs, memory) sit inside the captures' declared
 * holes and the sim pins module-canon scenario constants there (web ISA ISC-132).
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import {
  M02, readState, writeState, allocPid, journalAppend, expandHeartbeats,
  snapshotPasswordAuth, type AdminState, type UnitRuntime, type JournalEntry,
} from "./state";
import { fmtSinceTs, fmtAgo, fmtDuration, fmtJournalLine } from "./format";
import { boundary } from "./users";

interface UnitDef {
  desc: string;
  fragment: string;
  docs: string[];
  triggeredBy: string | null;
  execStartPre: string | null;
  comm: string;
  tasks: number;
  memory: string; // pinned from capture (inside the {{memory}} hole)
  cpu: string;    // pinned from capture (inside the {{cpu}} hole)
  stopCpu: string;
  execStart: string;
  cgroup: (u: UnitRuntime) => string[];
}

const UNIT_DEFS: Record<string, UnitDef> = {
  ssh: {
    desc: "OpenBSD Secure Shell server",
    fragment: "/usr/lib/systemd/system/ssh.service",
    docs: ["man:sshd(8)", "man:sshd_config(5)"],
    triggeredBy: "ssh.socket",
    execStartPre: "/usr/sbin/sshd -t",
    comm: "sshd",
    tasks: 1,
    memory: "1.0M (peak: 1.5M)", // m02-systemctl-status-ssh capture
    cpu: "10ms",
    stopCpu: "10ms",
    execStart: "/usr/sbin/sshd",
    cgroup: (u) => [`└─${u.mainPid} "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups"`],
  },
  "evidence-collector": {
    desc: "GRC evidence collector",
    fragment: "/etc/systemd/system/evidence-collector.service",
    docs: [],
    triggeredBy: null,
    execStartPre: null,
    comm: "bash",
    tasks: 2,
    memory: "2.1M (peak: 2.1M)", // m02-systemctl-status-ec-canon capture
    cpu: "3ms",
    stopCpu: "2ms",               // m02-systemctl-status-ec-stopped capture
    execStart: "/usr/local/bin/evidence-collector",
    cgroup: (u) => [`├─${u.mainPid} bash /usr/local/bin/evidence-collector`, `└─${u.childPid} sleep 300`],
  },
};

function unitName(arg: string): string {
  return arg.endsWith(".service") ? arg.slice(0, -".service".length) : arg;
}

function getUnit(st: AdminState, name: string): UnitRuntime | null {
  const u = st.units[name];
  return u && u.installed ? u : null;
}

// ---------------------------------------------------------------------------
// journal side effects of unit lifecycle (line shapes from journalctl captures)
// ---------------------------------------------------------------------------

function journalStart(st: AdminState, name: string, t: number, u: UnitRuntime): void {
  const def = UNIT_DEFS[name]!;
  journalAppend(st, { t, ident: "systemd", pid: 1, msg: `Started ${name}.service - ${def.desc}.`, unit: name });
  if (name === "ssh") {
    journalAppend(st, { t, ident: "sshd", pid: u.mainPid, msg: "Server listening on 0.0.0.0 port 22.", unit: name });
    journalAppend(st, { t, ident: "sshd", pid: u.mainPid, msg: "Server listening on :: port 22.", unit: name });
  }
}

function journalStop(st: AdminState, name: string, t: number): void {
  const def = UNIT_DEFS[name]!;
  journalAppend(st, { t, ident: "systemd", pid: 1, msg: `Stopping ${name}.service - ${def.desc}...`, unit: name });
  journalAppend(st, { t, ident: "systemd", pid: 1, msg: `${name}.service: Deactivated successfully.`, unit: name });
  journalAppend(st, { t, ident: "systemd", pid: 1, msg: `Stopped ${name}.service - ${def.desc}.`, unit: name });
}

/** Reload line pair (+ sshd re-listen lines) — pinned by m02-journalctl-after-reload. */
function journalReload(st: AdminState, name: string, t: number, u: UnitRuntime): void {
  const def = UNIT_DEFS[name]!;
  journalAppend(st, { t, ident: "systemd", pid: 1, msg: `Reloading ${name}.service - ${def.desc}...`, unit: name });
  if (name === "ssh") {
    journalAppend(st, { t, ident: "sshd", pid: u.mainPid, msg: "Server listening on 0.0.0.0 port 22.", unit: name });
    journalAppend(st, { t, ident: "sshd", pid: u.mainPid, msg: "Server listening on :: port 22.", unit: name });
  }
  journalAppend(st, { t, ident: "systemd", pid: 1, msg: `Reloaded ${name}.service - ${def.desc}.`, unit: name });
}

// ---------------------------------------------------------------------------
// systemctl status rendering (templates: m02-systemctl-status-* captures)
// ---------------------------------------------------------------------------

function renderStatus(out: string[], name: string, u: UnitRuntime, st: AdminState, m: Machine): number {
  const def = UNIT_DEFS[name]!;
  const now = m.now();
  const bullet = u.active ? "●" : "○";
  out.push(`${bullet} ${name}.service - ${def.desc}`);
  out.push(`     Loaded: loaded (${def.fragment}; ${u.enabled ? "enabled" : "disabled"}; preset: enabled)`);
  if (u.active) {
    out.push(`     Active: active (running) since ${fmtSinceTs(u.sinceMs)}; ${fmtAgo(now, u.sinceMs)}`);
    if (def.triggeredBy) out.push(`TriggeredBy: ● ${def.triggeredBy}`);
    if (def.docs.length > 0) {
      out.push(`       Docs: ${def.docs[0]}`);
      for (const d of def.docs.slice(1)) out.push(`             ${d}`);
    }
    if (def.execStartPre) out.push(`    Process: ${u.mainPid - 1} ExecStartPre=${def.execStartPre} (code=exited, status=0/SUCCESS)`);
    out.push(`   Main PID: ${u.mainPid} (${def.comm})`);
    out.push(`      Tasks: ${def.tasks} (limit: ${M02.tasksLimit})`);
    out.push(`     Memory: ${def.memory}`);
    out.push(`        CPU: ${def.cpu}`);
    out.push(`     CGroup: /system.slice/${name}.service`);
    for (const line of def.cgroup(u)) out.push(`             ${line}`);
  } else if (u.everRan) {
    out.push(`     Active: inactive (dead) since ${fmtSinceTs(u.sinceMs)}; ${fmtAgo(now, u.sinceMs)}`);
    out.push(`   Duration: ${fmtDuration(u.sinceMs - u.startedMs)}`);
    out.push(`    Process: ${u.mainPid} ExecStart=${def.execStart} (code=killed, signal=TERM)`);
    out.push(`   Main PID: ${u.mainPid} (code=killed, signal=TERM)`);
    out.push(`        CPU: ${def.stopCpu}`);
  } else {
    out.push(`     Active: inactive (dead)`);
  }
  // root sees the unit's journal tail (last 10 lines); non-root cannot read the system
  // journal and gets no tail — verified real behavior of the booted contract box
  if (m.user === "root") {
    const tail = st.journal.filter((e) => e.unit === name).slice(-10);
    if (tail.length > 0) {
      out.push("");
      for (const e of tail) out.push(fmtJournalLine(e));
    }
  }
  return u.active ? 0 : 3;
}

// ---------------------------------------------------------------------------
// systemctl
// ---------------------------------------------------------------------------

export function systemctlImpl(args: string[], io: IOCtx, m: Machine): number {
  const verb = args[0];
  if (verb === undefined) return boundary("systemctl", "the no-verb form", io);
  const flagless = args.slice(1).filter((a) => a !== "--no-pager" && a !== "-n" && !/^\d+$/.test(a) && !a.startsWith("--lines"));
  const target = flagless[0];

  const st = readState(m);
  expandHeartbeats(st, m.now());

  switch (verb) {
    case "status": {
      if (target === undefined) return boundary("systemctl", "status without a unit", io);
      const name = unitName(target);
      const u = getUnit(st, name);
      if (u === null || !UNIT_DEFS[name]) {
        io.err.write(`Unit ${name}.service could not be found.\n`); // m02-systemctl-status-ec-notfound
        writeState(m, st);
        return 4;
      }
      const lines: string[] = [];
      const code = renderStatus(lines, name, u, st, m);
      io.out.write(lines.join("\n") + "\n");
      writeState(m, st);
      return code;
    }

    case "start":
    case "stop":
    case "restart": {
      if (target === undefined) return boundary("systemctl", `${verb} without a unit`, io);
      const name = unitName(target);
      const u = getUnit(st, name);
      if (m.user !== "root") {
        // m02-systemctl-nonroot-stop (same shape for start/restart)
        io.err.write(`Failed to ${verb} ${name}.service: Access denied\nSee system logs and 'systemctl status ${name}.service' for details.\n`);
        return 4;
      }
      if (u === null || !UNIT_DEFS[name]) {
        io.err.write(`Failed to ${verb} ${name}.service: Unit ${name}.service not found.\n`); // m02-systemctl-start-notfound
        return 5;
      }
      const now = m.now();
      if ((verb === "stop" || verb === "restart") && u.active) {
        expandHeartbeats(st, now);
        u.active = false;
        u.sinceMs = now;
        journalStop(st, name, now);
      }
      if ((verb === "start" || verb === "restart") && !u.active) {
        u.active = true;
        u.everRan = true;
        u.startedMs = now;
        u.sinceMs = now;
        u.mainPid = name === "ssh" ? M02.sshdPid : allocPid(st);
        u.childPid = allocPid(st);
        u.lastHeartbeatMs = 0;
        journalStart(st, name, now, u);
        if (name === "evidence-collector") expandHeartbeats(st, now);
        if (name === "ssh") st.sshdEffective.passwordAuthentication = snapshotPasswordAuth(m);
      }
      writeState(m, st);
      return 0;
    }

    case "reload": {
      if (target === undefined) return boundary("systemctl", "reload without a unit", io);
      const name = unitName(target);
      const u = getUnit(st, name);
      if (m.user !== "root") {
        io.err.write(`Failed to reload ${name}.service: Access denied\nSee system logs and 'systemctl status ${name}.service' for details.\n`);
        return 4;
      }
      if (u === null || !UNIT_DEFS[name]) {
        io.err.write(`Failed to reload ${name}.service: Unit ${name}.service not found.\n`);
        return 5;
      }
      if (!u.active) {
        io.err.write(`Failed to reload ${name}.service: Unit ${name}.service is not active.\n`);
        return 1;
      }
      journalReload(st, name, m.now(), u);
      if (name === "ssh") st.sshdEffective.passwordAuthentication = snapshotPasswordAuth(m);
      writeState(m, st);
      return 0; // m02-systemctl-reload-ssh: silent success
    }

    case "enable":
    case "disable": {
      if (target === undefined) return boundary("systemctl", `${verb} without a unit`, io);
      const name = unitName(target);
      const u = getUnit(st, name);
      if (m.user !== "root") {
        io.err.write(`Failed to ${verb} unit: Access denied\n`); // m02-systemctl-nonroot-enable
        return 1;
      }
      if (u === null || !UNIT_DEFS[name]) {
        io.err.write(`Failed to ${verb} unit: Unit file ${name}.service does not exist.\n`);
        return 1;
      }
      const link = `/etc/systemd/system/multi-user.target.wants/${name}.service`;
      if (verb === "enable" && !u.enabled) {
        u.enabled = true;
        m.vfs.mkdir("/etc/systemd/system/multi-user.target.wants", { parents: true, owner: "root", now: m.now() });
        m.vfs.symlink(link, UNIT_DEFS[name]!.fragment, { owner: "root", now: m.now() });
        io.err.write(`Created symlink ${link} → ${UNIT_DEFS[name]!.fragment}.\n`); // m02-systemctl-enable-ec
      } else if (verb === "disable" && u.enabled) {
        u.enabled = false;
        m.vfs.remove(link);
        io.err.write(`Removed "${link}".\n`); // m02-systemctl-disable-ec
      }
      writeState(m, st);
      return 0;
    }

    case "is-active": {
      const u = target !== undefined ? getUnit(st, unitName(target)) : null;
      const active = u !== null && u.active;
      io.out.write(active ? "active\n" : "inactive\n"); // m02-systemctl-{start,stop}-ec posts
      return active ? 0 : 3;
    }
    case "is-enabled": {
      const u = target !== undefined ? getUnit(st, unitName(target)) : null;
      const enabled = u !== null && u.enabled;
      io.out.write(enabled ? "enabled\n" : "disabled\n"); // m02-systemctl-{enable,disable}-ec posts
      return enabled ? 0 : 1;
    }
    case "daemon-reload":
      return m.user === "root" ? 0 : (io.err.write("Failed to reload daemon: Access denied\n"), 1);

    default:
      return boundary("systemctl", `verb '${verb}'`, io);
  }
}

// ---------------------------------------------------------------------------
// journalctl (fixtures: m02-journalctl-*)
// ---------------------------------------------------------------------------

const JOURNAL_HINT =
  "Hint: You are currently not seeing messages from other users and the system.\n" +
  "      Users in groups 'adm', 'systemd-journal' can see all messages.\n" +
  "      Pass -q to turn off this notice.\n";

export function journalctlImpl(args: string[], io: IOCtx, m: Machine): number {
  let unit: string | null = null;
  let ident: string | null = null;
  let sinceMs: number | null = null;
  let lastN: number | null = null;
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-u" || a === "--unit") unit = unitName(args[++i] ?? "");
    else if (a.startsWith("--unit=")) unit = unitName(a.slice(7));
    else if (a === "-t" || a === "--identifier") ident = args[++i] ?? "";
    else if (a === "--since") {
      const v = args[++i] ?? "";
      const norm = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v.replace(" ", "T") + (v.includes(":") ? "Z" : "");
      const t = Date.parse(norm);
      if (Number.isNaN(t)) return boundary("journalctl", `--since format '${v}'`, io);
      sinceMs = t;
    } else if (a === "-n" || a === "--lines") lastN = Number(args[++i] ?? "10");
    else if (a === "-q" || a === "--quiet") quiet = true;
    else if (a === "--no-pager") continue;
    else return boundary("journalctl", `option ${a}`, io);
  }

  if (m.user !== "root") {
    // m02-journalctl-user-scope: the grcops account is not in adm/systemd-journal
    if (!quiet) io.err.write(JOURNAL_HINT);
    io.err.write("No journal files were opened due to insufficient permissions.\n");
    return 0;
  }

  const st = readState(m);
  expandHeartbeats(st, m.now());
  writeState(m, st);

  let entries: JournalEntry[] = st.journal;
  if (unit !== null) entries = entries.filter((e) => e.unit === unit);
  if (ident !== null) entries = entries.filter((e) => e.ident === ident);
  if (sinceMs !== null) entries = entries.filter((e) => e.t >= sinceMs!);
  if (lastN !== null) entries = entries.slice(-lastN);

  if (entries.length === 0) {
    io.out.write("-- No entries --\n"); // m02-journalctl-noentries
    return 0;
  }
  io.out.write(entries.map(fmtJournalLine).join("\n") + "\n");
  return 0;
}
