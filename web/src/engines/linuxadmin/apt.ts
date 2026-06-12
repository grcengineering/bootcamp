/**
 * Module-02 apt: `apt list --installed` (the host SBOM, §4.8) and the scenario
 * `apt install ./evidence-collector_1.0.0_all.deb` flow.
 *
 * The package DB is the seeded capture of the pinned image's real `apt list --installed`
 * (/var/lib/grc-sim/apt-installed.txt); the install transcript is the REAL captured apt
 * output for the baked .deb, replayed byte-for-byte (fixture m02-apt-install-deb) —
 * deterministic because the box is offline and the .deb is local. Any other package name
 * fails exactly as the offline box fails (m02-apt-install-notfound). apt's stability
 * WARNING goes to stderr only when output is not a tty (real behavior; the captures ran
 * pipe-context and the fidelity suite replays them the same way).
 */
import type { IOCtx, Machine } from "../shell/interpreter";
import {
  APT_INSTALL_STDOUT, APT_INSTALL_STDERR, APT_REINSTALL_STDOUT, APT_NOTFOUND_STDOUT,
  APT_NOTFOUND_E_LINE, APT_WARNING, APT_NONROOT_STDERR, EC_UNIT_FILE, EC_SCRIPT,
} from "./generated/m02-assets";
import { APT_DB_PATH, readState, writeState } from "./state";
import { boundary } from "./users";

const EC_DEB = "evidence-collector_1.0.0_all.deb";
const EC_LINE = "evidence-collector/now 1.0.0 all [installed,local]";

function db(m: Machine): string[] {
  return (m.vfs.readFile(APT_DB_PATH) ?? "").split("\n").filter((l) => l !== "");
}

function warn(io: IOCtx): void {
  if (!io.ttyOut) io.err.write(APT_WARNING);
}

export function aptImpl(args: string[], io: IOCtx, m: Machine): number {
  const sub = args[0];

  if (sub === "list") {
    if (!args.includes("--installed")) return boundary("apt", "list without --installed", io);
    warn(io);
    io.out.write("Listing...\n" + db(m).join("\n") + "\n"); // m02-apt-list-installed
    return 0;
  }

  if (sub === "install") {
    const operands = args.slice(1).filter((a) => !a.startsWith("-"));
    const target = operands[0];
    if (target === undefined) return boundary("apt", "install without a package", io);
    if (m.user !== "root") {
      // m02-apt-nonroot (captured stderr embeds the WARNING — split for tty honesty)
      warn(io);
      io.err.write(APT_NONROOT_STDERR.startsWith(APT_WARNING) ? APT_NONROOT_STDERR.slice(APT_WARNING.length) : APT_NONROOT_STDERR);
      return 100;
    }
    const isDebPath = target.endsWith(EC_DEB) && (target.startsWith("./") || target.startsWith("/") || target === EC_DEB);
    if (isDebPath && m.vfs.exists(m.resolve(target))) {
      warn(io);
      if (db(m).some((l) => l.startsWith("evidence-collector/"))) {
        io.out.write(APT_REINSTALL_STDOUT); // m02-apt-reinstall
        return 0;
      }
      io.out.write(APT_INSTALL_STDOUT); // m02-apt-install-deb (incl. dpkg \r progress)
      const debconf = APT_INSTALL_STDERR.startsWith(APT_WARNING) ? APT_INSTALL_STDERR.slice(APT_WARNING.length) : APT_INSTALL_STDERR;
      io.err.write(debconf);
      // dpkg unpacks the package's real payload (the same bytes the capture image bakes)
      m.vfs.writeFile("/usr/local/bin/evidence-collector", EC_SCRIPT, { owner: "root", now: m.now(), mode: 0o755 });
      m.vfs.mkdir("/etc/systemd/system", { parents: true, owner: "root", now: m.now() });
      m.vfs.writeFile("/etc/systemd/system/evidence-collector.service", EC_UNIT_FILE, { owner: "root", now: m.now(), mode: 0o644 });
      const lines = db(m);
      const at = lines.findIndex((l) => l > EC_LINE); // C-locale byte order (apt's list order)
      if (at === -1) lines.push(EC_LINE); else lines.splice(at, 0, EC_LINE);
      m.vfs.writeFile(APT_DB_PATH, lines.join("\n") + "\n", { owner: "root", now: m.now() });
      const st = readState(m);
      st.units["evidence-collector"] = {
        installed: true, enabled: false, active: false,
        sinceMs: 0, startedMs: 0, mainPid: 0, childPid: 0, lastHeartbeatMs: 0, everRan: false,
      };
      writeState(m, st);
      return 0;
    }
    // offline box: no package lists — every name is unlocatable (m02-apt-install-notfound)
    io.out.write(APT_NOTFOUND_STDOUT);
    warn(io);
    io.err.write(APT_NOTFOUND_E_LINE.replace("nginx", target));
    return 100;
  }

  return boundary("apt", sub === undefined ? "the no-subcommand form" : `subcommand '${sub}'`, io);
}
