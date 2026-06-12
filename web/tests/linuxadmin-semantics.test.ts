/**
 * Module-02 Linux-admin engine semantics (web ISA ISC-60; coverage companion to
 * tests/fidelity-m02.test.ts, which is the byte-level acceptance oracle).
 *
 * Covers the surfaces the captures exercise only one way: interactive dialogues,
 * boundary/error paths, state persistence across snapshot/restore, the sim clock's
 * effect on the journal/heartbeats, and the real-math anchors (drunken-bishop randomart
 * vs the committed key's captured art; openssh-key-v1 sizes vs the real 399/411 bytes).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createM02Session, restoreM02Session, collect, m02SeedInputs, FIXTURES } from "./helpers-m02";
import { drunkenBishop, fingerprintOfPubLine, b64decode, b64encode, sha256Bytes } from "../src/engines/linuxadmin";
import { createShellEngine } from "../src/engines/shell";

const BOUNDARY = /grc-sim: .* outside this lab's simulated surface/;

describe("formatters", () => {
  test("fmtAgo coarse units across the systemd ranges", async () => {
    const { fmtAgo, fmtDuration } = await import("../src/engines/linuxadmin/format");
    const t = Date.parse("2026-05-27T09:00:00Z");
    expect(fmtAgo(t + 6_000, t)).toBe("6s ago");
    expect(fmtAgo(t + 5 * 60_000 + 13_000, t)).toBe("5min ago");
    expect(fmtAgo(t + 3 * 3_600_000, t)).toBe("3h ago");
    expect(fmtAgo(t + 72 * 3_600_000, t)).toBe("3 days ago");
    expect(fmtDuration(120)).toBe("120ms");
    expect(fmtDuration(4_000)).toBe("4s");
    expect(fmtDuration(90_000)).toBe("1min");
  });
});

describe("real-math anchors", () => {
  const pub = readFileSync(join(FIXTURES, "seeds/m02/home/.ssh/id_ed25519.pub"), "utf8");
  const anchor = JSON.parse(readFileSync(join(FIXTURES, "captured/m02x-seedkey-randomart.json"), "utf8"));

  test("fingerprint of the committed key equals the real ssh-keygen fingerprint", () => {
    const fp = fingerprintOfPubLine(pub)!;
    expect(anchor.stdout).toContain(fp.fingerprint); // SHA256:JVB5… from the real tool
  });

  test("drunken bishop reproduces the real randomart byte-for-byte", () => {
    const { digest } = fingerprintOfPubLine(pub)!;
    const art = drunkenBishop(digest, "ED25519 256").join("\n");
    const realArt = anchor.stdout.split("\n").slice(1, 12).join("\n");
    expect(art).toBe(realArt);
  });

  test("fingerprintOfPubLine rejects non-ed25519 material", () => {
    expect(fingerprintOfPubLine("ssh-rsa AAAA me@host")).toBeNull();
    expect(fingerprintOfPubLine("garbage")).toBeNull();
  });

  test("sha256/base64 round-trip sanity", () => {
    expect(b64encode(b64decode("aGVsbG8="))).toBe("aGVsbG8=");
    expect(b64encode(b64decode("aGVsbG8h"))).toBe("aGVsbG8h");
    expect(b64encode(b64decode("aGk="))).toBe("aGk=");
    // FIPS vector: sha256("abc")
    const abc = sha256Bytes([0x61, 0x62, 0x63]);
    expect(abc.slice(0, 4)).toEqual([0xba, 0x78, 0x16, 0xbf]);
  });
});

describe("ssh-keygen", () => {
  test("generated private files match real openssh-key-v1 sizes (399 default / 411 seeded comment)", () => {
    const s = createM02Session();
    expect(collect(s, 'ssh-keygen -t ed25519 -N "" -f /home/grcops/.ssh/k1 -C "grcops@web-01"').exit).toBe(0);
    expect(s.readFile("/home/grcops/.ssh/k1")!.length).toBe(399);
    expect(collect(s, 'ssh-keygen -t ed25519 -N "" -f /home/grcops/.ssh/k2 -C "grcops@web-01 admin"').exit).toBe(0);
    expect(s.readFile("/home/grcops/.ssh/k2")!.length).toBe(411); // the committed key's canon size
    expect(s.readFile("/home/grcops/.ssh/k1.pub")).toMatch(/^ssh-ed25519 [A-Za-z0-9+/]+ grcops@web-01\n$/);
  });

  test("interactive 3-prompt dialogue (file → passphrase → retype) generates at the default path-prompted location", () => {
    const s = createM02Session();
    const got = collect(s, "ssh-keygen -t ed25519", ["/home/grcops/.ssh/mykey", "", ""]);
    expect(got.exit).toBe(0);
    expect(got.stderr).toContain("Enter file in which to save the key (/home/grcops/.ssh/id_ed25519): ");
    expect(got.stderr).toContain("Enter passphrase (empty for no passphrase): ");
    expect(got.stderr).toContain("Enter same passphrase again: ");
    expect(got.stdout.split("Generating public/private ed25519 key pair.").length).toBe(2); // banner once (resume-idempotent)
    expect(got.stdout).toContain("The key's randomart image is:");
    expect(s.exists("/home/grcops/.ssh/mykey.pub")).toBe(true);
  });

  test("interactive dialogue with empty file answer uses the default path", () => {
    const s = createM02Session();
    collect(s, "rm /home/grcops/.ssh/id_ed25519"); // default target must not exist
    const got = collect(s, "ssh-keygen -t ed25519", ["", "", ""]);
    expect(got.exit).toBe(0);
    expect(s.exists("/home/grcops/.ssh/id_ed25519")).toBe(true);
  });

  test("boundaries: bad type, unknown option, existing target, missing directory", () => {
    const s = createM02Session();
    expect(collect(s, "ssh-keygen -t rsa").stderr).toMatch(BOUNDARY);
    expect(collect(s, "ssh-keygen -b 2048").stderr).toMatch(BOUNDARY);
    expect(collect(s, 'ssh-keygen -t ed25519 -N "" -f /home/grcops/.ssh/id_ed25519').stderr).toMatch(BOUNDARY); // exists
    expect(collect(s, 'ssh-keygen -t ed25519 -N "" -f /nosuch/dir/key').stderr).toMatch(BOUNDARY);
  });
});

describe("sudo", () => {
  test("interactive prompt → correct password → cached on the next call", () => {
    const s = createM02Session();
    const first = collect(s, "sudo whoami", ["labpass"]);
    expect(first.stderr).toBe("[sudo] password for grcops: ");
    expect(first.stdout).toBe("root\n");
    const second = collect(s, "sudo whoami");
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe("root\n");
  });

  test("credential cache expires after 15 sim-minutes", () => {
    const s = createM02Session();
    collect(s, "sudo whoami", ["labpass"]);
    expect(collect(s, "sleep 901").exit).toBe(0); // sim clock skew
    const again = collect(s, "sudo whoami", ["labpass"]);
    expect(again.stderr).toBe("[sudo] password for grcops: ");
    expect(again.stdout).toBe("root\n");
  });

  test("sudo -k clears the cache; nested sudo passes through as root", () => {
    const s = createM02Session();
    collect(s, "sudo whoami", ["labpass"]);
    expect(collect(s, "sudo sudo whoami").stdout).toBe("root\n"); // inner sudo: already root → pass-through
    collect(s, "sudo -k");
    const reauth = collect(s, "echo labpass | sudo -S whoami");
    expect(reauth.stderr).toBe("[sudo] password for grcops: "); // cache really cleared
    expect(reauth.stdout).toBe("root\n");
  });

  test("interactive `sudo passwd intern` chains both dialogues (3 lines total)", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S useradd -m intern");
    collect(s, "sudo -k");
    const got = collect(s, "sudo passwd intern", ["labpass", "Pw!2026", "Pw!2026"]);
    expect(got.stderr).toBe("[sudo] password for grcops: New password: Retype new password: passwd: password updated successfully\n");
    expect(got.exit).toBe(0);
    // the new password now works for ssh password auth (state plumbed through)
    const login = collect(s, "ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no intern@web-01 whoami", ["Pw!2026"]);
    expect(login.stdout).toBe("grcops\n"); // same box: command runs in this session
    expect(login.exit).toBe(0);
  });

  test("option boundary + wrong-password interactive ends the attempt honestly", () => {
    const s = createM02Session();
    expect(collect(s, "sudo -u root whoami").stderr).toMatch(BOUNDARY);
    const wrong = collect(s, "sudo whoami", ["nope"]);
    expect(wrong.exit).toBe(1);
    expect(wrong.stderr).toContain("Sorry, try again.");
  });

  test("sudo inside a script falls back to piped semantics (no dialogue suspension)", () => {
    const s = createM02Session();
    collect(s, "printf '#!/usr/bin/env bash\\nsudo whoami\\n' > esc.sh");
    const got = collect(s, "bash esc.sh");
    expect(got.exit).toBe(1);
    expect(got.stderr).toContain("sudo: no password was provided");
  });
});

describe("systemctl + journalctl semantics", () => {
  const install = (s: ReturnType<typeof createM02Session>) =>
    collect(s, "echo labpass | sudo -S apt install -y ./evidence-collector_1.0.0_all.deb");

  test("installed-but-never-started unit reads inactive (dead) with no since line", () => {
    const s = createM02Session();
    install(s);
    const got = collect(s, "systemctl status evidence-collector");
    expect(got.stdout).toContain("Active: inactive (dead)\n");
    expect(got.stdout).not.toContain("Duration:");
    expect(got.exit).toBe(3);
  });

  test("root status shows the unit's journal tail; restart reallocates state", () => {
    const s = createM02Session();
    install(s);
    collect(s, "sudo systemctl start evidence-collector");
    const status = collect(s, "sudo systemctl status evidence-collector");
    expect(status.stdout).toContain("Started evidence-collector.service - GRC evidence collector.");
    expect(collect(s, "sudo systemctl restart evidence-collector").exit).toBe(0);
    expect(collect(s, "systemctl is-active evidence-collector").stdout).toBe("active\n");
    expect(collect(s, "sudo systemctl restart ssh").exit).toBe(0);
    expect(collect(s, "ps -o user,pid,comm -C sshd").stdout).toContain(" 742 sshd"); // canon pid pinned
  });

  test("heartbeats accumulate on the sim clock while the collector runs", () => {
    const s = createM02Session();
    install(s);
    collect(s, "sudo systemctl start evidence-collector");
    collect(s, "sleep 601"); // two intervals
    const j = collect(s, "sudo journalctl -u evidence-collector");
    const beats = j.stdout.split("\n").filter((l) => l.includes("heartbeat ok")).length;
    expect(beats).toBeGreaterThanOrEqual(3);
    collect(s, "sudo systemctl stop evidence-collector");
    const j2 = collect(s, "sudo journalctl -u evidence-collector -n 1");
    expect(j2.stdout).toContain("Stopped evidence-collector.service");
  });

  test("verb/argument error surfaces", () => {
    const s = createM02Session();
    expect(collect(s, "systemctl").stderr).toMatch(BOUNDARY);
    expect(collect(s, "systemctl status").stderr).toMatch(BOUNDARY);
    expect(collect(s, "systemctl start").stderr).toMatch(BOUNDARY);
    expect(collect(s, "systemctl frobnicate ssh").stderr).toMatch(BOUNDARY);
    expect(collect(s, "echo labpass | sudo -S systemctl reload evidence-collector").stderr)
      .toContain("Unit evidence-collector.service not found.");
    expect(collect(s, "sudo systemctl enable nosuch").stderr).toContain("Unit file nosuch.service does not exist.");
    expect(collect(s, "sudo systemctl reload nosuch").stderr).toContain("not found");
    expect(collect(s, "systemctl reload ssh").exit).toBe(4); // non-root
    expect(collect(s, "sudo daemon-reload 2>/dev/null || sudo systemctl daemon-reload").exit).toBe(0);
    expect(collect(s, "systemctl daemon-reload").exit).toBe(1);
    expect(collect(s, "systemctl is-active nosuch").stdout).toBe("inactive\n");
    expect(collect(s, "systemctl is-enabled nosuch").exit).toBe(1);
  });

  test("reload on a stopped unit fails as systemd does; stopped status carries Duration", () => {
    const s = createM02Session();
    install(s);
    collect(s, "sudo systemctl start evidence-collector");
    collect(s, "sleep 2");
    collect(s, "sudo systemctl stop evidence-collector");
    expect(collect(s, "sudo systemctl reload evidence-collector").stderr).toContain("is not active");
    const st = collect(s, "systemctl status evidence-collector");
    expect(st.stdout).toContain("Duration: ");
    expect(st.stdout).toContain("(code=killed, signal=TERM)");
  });

  test("journalctl filters: -t, -n, --since datetime, -q, bad since, unknown flag, --unit=", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S whoami");
    expect(collect(s, "sudo journalctl -t sshd -n 2").stdout).toContain("sshd[742]");
    expect(collect(s, 'sudo journalctl --since "2026-05-27 09:30:00" --unit=ssh').stdout).toBe("-- No entries --\n");
    expect(collect(s, 'sudo journalctl --since "garbage"').stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo journalctl --follow").stderr).toMatch(BOUNDARY);
    const q = collect(s, "journalctl -q -u ssh");
    expect(q.stderr).toBe("No journal files were opened due to insufficient permissions.\n");
    expect(collect(s, "sudo journalctl --no-pager -u ssh").stdout).toContain("Server listening");
  });

  test("removing the sim state file reinitializes the model (files hold the truth)", () => {
    const s = createM02Session();
    collect(s, "rm /run/grc-sim/state.json");
    expect(collect(s, "systemctl is-active ssh").stdout).toBe("active\n");
  });
});

describe("users + identity", () => {
  test("id error paths and root identity under sudo", () => {
    const s = createM02Session();
    expect(collect(s, "id -u").stderr).toMatch(BOUNDARY);
    expect(collect(s, "id a b").stderr).toMatch(BOUNDARY);
    expect(collect(s, "echo labpass | sudo -S id").stdout).toBe("uid=0(root) gid=0(root) groups=0(root)\n");
  });

  test("useradd/usermod flag and operand boundaries", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S true");
    expect(collect(s, "sudo useradd -m -s /bin/bash x").stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo useradd").stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo useradd a b").stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo usermod intern").stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo usermod -aG sudo nosuchuser").stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo usermod --badflag x").stderr).toMatch(BOUNDARY);
    // --create-home long form + separate -a -G form + already-member idempotence
    expect(collect(s, "sudo useradd --create-home intern").exit).toBe(0);
    expect(collect(s, "sudo usermod -a -G sudo intern").exit).toBe(0);
    expect(collect(s, "sudo usermod -a --groups sudo intern").exit).toBe(0);
    expect(collect(s, "id intern").stdout).toBe("uid=1002(intern) gid=1002(intern) groups=1002(intern),27(sudo)\n");
  });

  test("passwd boundaries and mismatch path", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S useradd -m intern");
    expect(collect(s, "passwd").stderr).toMatch(BOUNDARY);
    expect(collect(s, "passwd -d intern").stderr).toMatch(BOUNDARY);
    expect(collect(s, "echo labpass | sudo -S passwd nosuchuser").stderr).toMatch(BOUNDARY);
    const mism = collect(s, "sudo passwd intern", ["one", "two"]);
    expect(mism.exit).toBe(10);
    expect(mism.stderr).toContain("Sorry, passwords do not match.");
  });
});

describe("ssh client semantics", () => {
  test("password dialogue: wrong password refused, correct password accepted + journaled", () => {
    const s = createM02Session();
    const bad = collect(s, "ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no grcops@web-01 true", ["wrong"]);
    expect(bad.exit).toBe(255);
    expect(bad.stderr).toContain("Permission denied, please try again.");
    const ok = collect(s, "ssh -o PubkeyAuthentication=no grcops@web-01 true", ["labpass"]);
    expect(ok.exit).toBe(0);
    collect(s, "echo labpass | sudo -S true");
    const j = collect(s, "sudo journalctl -u ssh | grep Accepted");
    expect(j.stdout).toContain("Accepted password for grcops from 10.0.0.5"); // module §4.7 canon address
  });

  test("key login journals the committed key's real fingerprint", () => {
    const s = createM02Session();
    collect(s, "ssh -o StrictHostKeyChecking=accept-new grcops@web-01 true");
    collect(s, "echo labpass | sudo -S true");
    const j = collect(s, "sudo journalctl -u ssh | grep publickey");
    expect(j.stdout).toContain("ssh2: ED25519 SHA256:JVB5ZHzrL5HkRD8yBNMssHoCBCmnRK3bzYTzvKAumBM");
  });

  test("hardening without reload changes nothing; reload makes it bite (the §6 task-4 lesson)", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S true");
    collect(s, "printf 'PasswordAuthentication no\\nPermitRootLogin no\\n' | sudo tee -a /etc/ssh/sshd_config");
    const before = collect(s, "ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o BatchMode=yes grcops@web-01 true");
    expect(before.stderr).toContain("(publickey,password)"); // config edited, daemon not reloaded
    collect(s, "sudo systemctl reload ssh");
    const after = collect(s, "ssh -o PubkeyAuthentication=no -o BatchMode=yes grcops@web-01 true");
    expect(after.stderr).toContain("(publickey)."); // password method gone
  });

  test("flags/targets: bare login, -tt, PreferredAuthentications, unknown flag, no target, unknown user", () => {
    const s = createM02Session();
    expect(collect(s, "ssh -o StrictHostKeyChecking=accept-new -tt grcops@web-01").exit).toBe(0); // bare login: same box
    expect(collect(s, "ssh -X web-01").stderr).toMatch(BOUNDARY);
    expect(collect(s, "ssh").stderr).toMatch(BOUNDARY);
    const unknownUser = collect(s, "ssh -o BatchMode=yes nobody9@web-01 true");
    expect(unknownUser.exit).toBe(255);
    const preferred = collect(s, "ssh -o PreferredAuthentications=password -o BatchMode=yes grcops@web-01 true");
    expect(preferred.exit).toBe(255);
  });
});

describe("apt semantics", () => {
  test("tty vs pipe: the stability WARNING only appears off-tty (real apt behavior)", () => {
    const s = createM02Session();
    const tty = collect(s, "apt list --installed");
    expect(tty.stderr).toBe("");
    expect(tty.stdout).toContain("Listing...\nadduser/now");
    const piped = collect(s, "apt list --installed | grep adduser");
    expect(piped.stderr).toContain("WARNING: apt does not have a stable CLI interface");
  });

  test("install inserts the package into the DB in C-locale order; boundaries hold", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S apt install -y ./evidence-collector_1.0.0_all.deb");
    const list = collect(s, "apt list --installed").stdout.split("\n");
    const idx = list.findIndex((l) => l.startsWith("evidence-collector/"));
    expect(idx).toBeGreaterThan(0);
    expect(list[idx - 1]! < list[idx]!).toBe(true);
    expect(list[idx]! < list[idx + 1]!).toBe(true);
    expect(collect(s, "apt list").stderr).toMatch(BOUNDARY);
    expect(collect(s, "sudo apt install").stderr).toMatch(BOUNDARY);
    expect(collect(s, "apt update").stderr).toMatch(BOUNDARY);
    expect(collect(s, "apt").stderr).toMatch(BOUNDARY);
    // a missing local deb path falls through to the offline unlocatable error
    collect(s, "rm evidence-collector_1.0.0_all.deb");
    const gone = collect(s, "sudo apt install -y ./evidence-collector_1.0.0_all.deb | cat");
    expect(gone.exit).toBe(0); // pipeline exit is cat's; apt's E: line is on stderr
    expect(gone.stderr).toContain("E: Unable to locate package");
  });
});

describe("ps + stat", () => {
  test("ps reflects unit state; -C without match exits 1; option boundaries", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S systemctl stop ssh");
    const none = collect(s, "ps -o user,pid,comm -C sshd");
    expect(none.stdout).toBe("USER         PID COMMAND\n");
    expect(none.exit).toBe(1);
    collect(s, "sudo systemctl start ssh");
    collect(s, "sudo apt install -y ./evidence-collector_1.0.0_all.deb");
    collect(s, "sudo systemctl start evidence-collector");
    const aux = collect(s, "ps aux");
    expect(aux.stdout).toContain("bash /usr/loc"); // 80-col truncation, as captured
    expect(aux.stdout).toContain("sleep 300");
    expect(collect(s, "ps -ef").stderr).toMatch(BOUNDARY);
    expect(collect(s, "ps -o pid -C sshd").stderr).toMatch(BOUNDARY);
  });

  test("stat formats and error paths", () => {
    const s = createM02Session();
    expect(collect(s, 'stat -c "%A %U %G" /etc/ssh/sshd_config').stdout).toBe("-rw-r----- root root\n");
    expect(collect(s, 'stat -c "%a %s %n" /etc/ssh/sshd_config').stdout).toBe("640 3243 /etc/ssh/sshd_config\n");
    expect(collect(s, 'stat -c "%a%%%s" /etc/ssh/sshd_config').stdout).toBe("640%3243\n");
    const miss = collect(s, 'stat -c "%A" /nosuch');
    expect(miss.exit).toBe(1);
    expect(miss.stderr).toContain("No such file or directory");
    expect(collect(s, "stat /etc/passwd").stderr).toMatch(BOUNDARY);
    expect(collect(s, "stat -L /etc/passwd").stderr).toMatch(BOUNDARY);
    expect(collect(s, 'stat -c "%Y" /etc/passwd').stderr).toMatch(BOUNDARY);
  });
});

describe("persistence + non-admin gating", () => {
  test("snapshot/restore carries the whole system model (VFS-backed state)", () => {
    const s = createM02Session();
    collect(s, "echo labpass | sudo -S apt install -y ./evidence-collector_1.0.0_all.deb");
    collect(s, "sudo systemctl start evidence-collector");
    collect(s, "sudo systemctl enable evidence-collector");
    const snap = s.snapshot();
    const r = restoreM02Session(snap);
    expect(collect(r, "systemctl is-active evidence-collector").stdout).toBe("active\n");
    expect(collect(r, "systemctl is-enabled evidence-collector").stdout).toBe("enabled\n");
    expect(collect(r, "id grcops").stdout).toContain("27(sudo)");
  });

  test("non-admin sessions keep userland behavior (m01 box untouched)", () => {
    const engine = createShellEngine();
    const s = engine.create({
      variant: "bash-linux", seed: { files: [], tools: {} }, epoch: "2026-06-01T09:00:00Z",
      cols: 80, user: "analyst", host: "workstation", home: "/home/analyst",
    });
    const run = (l: string) => collect(s, l);
    expect(run("id").stdout).toBe("uid=1000(analyst) gid=1000(analyst) groups=1000(analyst)\n");
    expect(run("useradd -m x").stderr).toMatch(BOUNDARY);   // installed-but-unsimulated on userland
    expect(run("ps aux").stderr).toMatch(BOUNDARY);
    expect(run("systemctl status ssh").exit).toBe(127);      // not installed on the userland box
    expect(run("systemctl status ssh").stderr).toContain("command not found");
    expect(run("sudo whoami").exit).toBe(127);
  });
});
