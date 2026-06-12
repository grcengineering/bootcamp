/**
 * Shared module-02 test plumbing: builds the simulated web-01 box from the committed
 * .ci/fixtures/seeds/m02 assets (the same world the booted captures ran in).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { createShellEngine } from "../src/engines/shell";
import type { ExecResult, ShellSession, ShellSessionOptions } from "../src/engines/shell/types";
import { buildM02Seed, M02, type M02SeedInputs } from "../src/engines/linuxadmin";

export const FIXTURES = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures");
export const manifest = parse(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));
export const contract = manifest.meta.contracts["docker-linux-booted"];
export const M02_EPOCH = manifest.seeds.m02.epoch as string;

const SEED_DIR = join(FIXTURES, "seeds/m02");
const read = (rel: string) => readFileSync(join(SEED_DIR, rel), "utf8");

export function m02SeedInputs(): M02SeedInputs {
  return {
    etcPasswd: read("system/etc/passwd"),
    etcGroup: read("system/etc/group"),
    etcHostname: read("system/etc/hostname"),
    sshdConfig: read("system/etc/ssh/sshd_config"),
    sshServiceUnit: read("system/usr/lib/systemd/system/ssh.service"),
    skel: {
      ".bashrc": read("system/etc/skel/.bashrc"),
      ".profile": read("system/etc/skel/.profile"),
      ".bash_logout": read("system/etc/skel/.bash_logout"),
    },
    aptInstalled: read("system/var/apt-installed.txt"),
    idEd25519: read("home/.ssh/id_ed25519"),
    idEd25519Pub: read("home/.ssh/id_ed25519.pub"),
    authorizedKeys: read("home/.ssh/authorized_keys"),
    debPlaceholder: read("home/evidence-collector_1.0.0_all.deb"),
    labSetupTool: read("bin/lab-setup"),
  };
}

const engine = createShellEngine();

export function createM02Session(user: string = contract.user as string, extraOpts: Partial<ShellSessionOptions> = {}): ShellSession {
  const inputs = m02SeedInputs();
  if (user !== M02.adminUser) {
    // user-override entries (m02-sudo-notsudoer): the capture's pre_root created the
    // account before the session; mirror that in the seed files
    inputs.etcPasswd += `${user}:x:1002:1002::/home/${user}:/bin/sh\n`;
    inputs.etcGroup += `${user}:x:1002:\n`;
    const s = buildM02Seed(inputs);
    s.files.push({ path: `/home/${user}`, dir: true, mode: 0o750, owner: user });
    return engine.create({
      variant: "bash-linux", seed: s, epoch: M02_EPOCH, cols: contract.cols,
      user, host: contract.hostname, home: `/home/${user}`,
      adminLab: { password: contract.password },
      ...extraOpts,
    });
  }
  return engine.create({
    variant: "bash-linux", seed: buildM02Seed(inputs), epoch: M02_EPOCH, cols: contract.cols,
    user, host: contract.hostname, home: contract.home,
    adminLab: { password: contract.password },
    ...extraOpts,
  });
}

export function restoreM02Session(snap: ReturnType<ShellSession["snapshot"]>): ShellSession {
  return engine.restore(snap, {
    variant: "bash-linux", seed: { files: [], tools: {} }, epoch: M02_EPOCH, cols: contract.cols,
    user: contract.user, host: contract.hostname, home: contract.home,
    adminLab: { password: contract.password },
  });
}

export interface Streams { stdout: string; stderr: string; exit: number }

export function collect(session: ShellSession, line: string, dialogue: string[] = [], sendEof = false): Streams {
  let r: ExecResult = session.exec(line);
  const events = [...r.events];
  for (const d of dialogue) {
    if (r.state !== "pending") break;
    r = session.feedStdin(d + "\n");
    events.push(...r.events);
  }
  if (r.state === "pending") {
    void sendEof;
    r = session.eof();
    events.push(...r.events);
  }
  return {
    stdout: events.filter((e) => e.stream === "stdout").map((e) => e.text).join(""),
    stderr: events.filter((e) => e.stream === "stderr").map((e) => e.text).join(""),
    exit: r.state === "done" ? r.exit : -1,
  };
}
