/**
 * Module-02 Linux-admin engine (web ISA ISC-60) — public surface.
 *
 * Pure DOM-free TypeScript. Registered into the shell engine through the plug-in seam
 * (src/engines/shell/admin-ext.ts); active only on sessions created with `adminLab`
 * options. Acceptance oracle: the docker-linux-booted fixtures replayed by
 * web/tests/fidelity-m02.test.ts.
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import type { SeedFile, SeedSpec } from "../shell/types";
import { attachAdminLab, getLab, M02 } from "./state";
import { idImpl, useraddImpl, usermodImpl, passwdImpl } from "./users";
import { systemctlImpl, journalctlImpl } from "./systemd";
import { aptImpl } from "./apt";
import { sshImpl } from "./ssh";
import { sshKeygenImpl } from "./sshkeys";
import { psImpl, statImpl } from "./ps";

export { attachAdminLab, getLab, M02 } from "./state";
export { generateKey, drunkenBishop, fingerprintOfPubLine, sha256Bytes, b64decode, b64encode } from "./sshkeys";
export { parsePasswd, parseGroup, isInSudoGroup } from "./users";
export { snapshotPasswordAuth } from "./state";

type Impl = (args: string[], io: IOCtx, m: Machine) => number;

/** The module-02 command family. `id`/`ps`/user tools self-gate on lab presence. */
export const ADMIN_COMMANDS: Record<string, Impl> = {
  id: idImpl,
  useradd: useraddImpl,
  usermod: usermodImpl,
  passwd: passwdImpl,
  systemctl: systemctlImpl,
  journalctl: journalctlImpl,
  apt: aptImpl,
  ssh: sshImpl,
  "ssh-keygen": sshKeygenImpl,
  ps: psImpl,
  stat: statImpl,
};

/** sudo is wired separately (lazy import keeps the table acyclic-free for tests). */
export { sudoImpl } from "./sudo";

/**
 * Binaries the booted box has that the userland box does not (added to /usr/bin when a
 * session is created with adminLab). useradd/usermod/passwd/apt/ps/id already exist on
 * both images; sudo/systemctl/journalctl/ssh/ssh-keygen are booted-only.
 */
export const ADMIN_EXTRA_COMMANDS: readonly string[] = ["sudo", "systemctl", "journalctl", "ssh", "ssh-keygen", "adduser"];

// ---------------------------------------------------------------------------
// m02 seed assembly
// ---------------------------------------------------------------------------

/** Canon mtimes (module 02 scenario constants — match .ci/fixtures/seeds/m02/apply-seed.sh). */
const T_0900 = Date.parse("2026-05-27T09:00:00Z");
const T_0902 = Date.parse("2026-05-27T09:02:00Z");
const T_0905 = Date.parse("2026-05-27T09:05:00Z");

export interface M02SeedInputs {
  /** Raw file contents from .ci/fixtures/seeds/m02 (delivered via the sync bridge). */
  etcPasswd: string;
  etcGroup: string;
  etcHostname: string;
  sshdConfig: string;          // the 3243-byte scenario baseline
  sshServiceUnit: string;      // /usr/lib/systemd/system/ssh.service
  skel: Record<string, string>; // .bashrc/.profile/.bash_logout
  aptInstalled: string;        // captured `apt list --installed` lines (no header)
  idEd25519: string;           // committed 411-byte scenario private key
  idEd25519Pub: string;
  authorizedKeys: string;
  debPlaceholder: string;      // 992-byte stand-in for the baked .deb
  labSetupTool: string;        // seeds/m02/bin/lab-setup source
}

/**
 * Build the SeedSpec for the module-02 box (mirrors apply-seed.sh: same files, same
 * modes/owners, same canon mtimes — one world for capture and sim).
 */
export function buildM02Seed(inputs: M02SeedInputs): SeedSpec {
  const home = `/home/${M02.adminUser}`;
  const files: SeedFile[] = [
    { path: "/etc/passwd", content: inputs.etcPasswd, mode: 0o644, owner: "root", mtimeMs: T_0900 },
    { path: "/etc/group", content: inputs.etcGroup, mode: 0o644, owner: "root", mtimeMs: T_0900 },
    { path: "/etc/hostname", content: inputs.etcHostname, mode: 0o644, owner: "root", mtimeMs: T_0900 },
    { path: "/etc/ssh/sshd_config", content: inputs.sshdConfig, mode: 0o640, owner: "root", mtimeMs: T_0902 },
    { path: "/usr/lib/systemd/system/ssh.service", content: inputs.sshServiceUnit, mode: 0o644, owner: "root", mtimeMs: T_0900 },
    { path: "/etc/systemd/system", dir: true, owner: "root" },
    { path: "/var/lib/grc-sim/apt-installed.txt", content: inputs.aptInstalled, mode: 0o644, owner: "root", mtimeMs: T_0900 },
    { path: "/var/log", dir: true, owner: "root" },
    { path: `${home}/.ssh`, dir: true, mode: 0o700, owner: M02.adminUser, mtimeMs: T_0905 },
    { path: `${home}/.ssh/id_ed25519`, content: inputs.idEd25519, mode: 0o600, owner: M02.adminUser, mtimeMs: T_0905 },
    { path: `${home}/.ssh/id_ed25519.pub`, content: inputs.idEd25519Pub, mode: 0o644, owner: M02.adminUser, mtimeMs: T_0905 },
    // deliberately 644 — §6 task 3's over-permission finding
    { path: `${home}/.ssh/authorized_keys`, content: inputs.authorizedKeys, mode: 0o644, owner: M02.adminUser, mtimeMs: T_0905 },
    { path: `${home}/evidence-collector_1.0.0_all.deb`, content: inputs.debPlaceholder, mode: 0o644, owner: M02.adminUser, mtimeMs: T_0900 },
  ];
  for (const [name, content] of Object.entries(inputs.skel)) {
    files.push({ path: `/etc/skel/${name}`, content, mode: 0o644, owner: "root", mtimeMs: T_0900 });
    files.push({ path: `${home}/${name}`, content, mode: 0o644, owner: M02.adminUser, mtimeMs: T_0900 });
  }
  return { files, tools: { "lab-setup": inputs.labSetupTool } };
}
