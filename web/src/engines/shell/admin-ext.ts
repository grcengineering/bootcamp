/**
 * Module-02 Linux-admin plug-in seam (web ISA ISC-60).
 *
 * Mirrors the curl-ext pattern: registers the admin command family into the COREUTILS
 * dispatch table once, with per-machine gating — a session created WITHOUT `adminLab`
 * keeps the exact pre-existing behavior (original coreutil impl where one exists, the
 * honest sim-boundary message otherwise), so module-01/03 fidelity is untouched.
 * Binaries that only exist on the booted box (sudo/systemctl/journalctl/ssh/ssh-keygen)
 * are added to the VFS only when the session declares `adminLab` (see index.ts buildVfs).
 */
import type { IOCtx, Machine } from "./interpreter";
import { SIM_BOUNDARY_EXIT } from "./interpreter";
import { COREUTILS, type CoreutilImpl } from "./coreutils";
import { ADMIN_COMMANDS, sudoImpl, getLab, attachAdminLab as attach } from "../linuxadmin";
import type { AdminLabOptions } from "./types";

export { ADMIN_EXTRA_COMMANDS } from "../linuxadmin";

export function attachAdminLab(m: Machine, opts: AdminLabOptions): void {
  attach(m, opts);
}

function gated(name: string, impl: CoreutilImpl, orig: CoreutilImpl | undefined): CoreutilImpl {
  return (args: string[], io: IOCtx, m: Machine): number => {
    if (getLab(m) !== null) return impl(args, io, m);
    if (orig !== undefined) return orig(args, io, m);
    // non-admin box, command installed but unsimulated — the standing honest boundary
    io.err.write(`grc-sim: ${name}: command is outside this lab's simulated surface — run it on a real machine to explore\n`);
    return SIM_BOUNDARY_EXIT;
  };
}

/**
 * GNU compatibility shims active only on the admin box (module 02's §5.3 canon uses
 * `tail -1` and `[[:space:]]`, both outside module 01's taught flag subset — the booted
 * captures are the acceptance for these forms):
 *  - head/tail: bare numeric `-N` → `-n N`
 *  - grep: POSIX bracket classes → explicit sets the m01 grep engine understands
 */
function gnuShim(name: string, orig: CoreutilImpl): CoreutilImpl {
  return (args: string[], io: IOCtx, m: Machine): number => {
    if (getLab(m) === null) return orig(args, io, m);
    if (name === "grep") {
      const mapped = args.map((a) =>
        a.replaceAll("[:space:]", " \\t\\r\\n\\v\\f").replaceAll("[:blank:]", " \\t"),
      );
      return orig(mapped, io, m);
    }
    const out: string[] = [];
    for (const a of args) {
      if (/^-\d+$/.test(a)) out.push("-n", a.slice(1));
      else out.push(a);
    }
    return orig(out, io, m);
  };
}

let registered = false;

/** Register the admin family in the coreutils dispatch table (called once by the engine entry). */
export function registerAdminCommands(): void {
  if (registered) return;
  registered = true;
  const table = COREUTILS as Record<string, CoreutilImpl>;
  for (const [name, impl] of Object.entries(ADMIN_COMMANDS)) {
    table[name] = gated(name, impl as CoreutilImpl, table[name]);
  }
  table["sudo"] = gated("sudo", sudoImpl as CoreutilImpl, table["sudo"]);
  for (const name of ["head", "tail", "grep"]) {
    const orig = table[name];
    if (orig !== undefined) table[name] = gnuShim(name, orig);
  }
}
