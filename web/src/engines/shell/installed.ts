/**
 * The declared installed-command set of the simulated box (web ISC-120).
 *
 * Mirrors .ci/fixtures/env/Dockerfile.userland: ubuntu:24.04 minimal userland
 * (coreutils, bash/dash, grep, sed, mawk, findutils, diffutils, util-linux,
 * debianutils, ncurses-bin, tar/gzip, dpkg/apt, perl-base, login tools) plus the
 * two explicit installs: nano and libfaketime (faketime).
 *
 * Commands present here but not in COREUTILS/BUILTINS produce the honest
 * sim-boundary message (exit 64), NEVER invented output. Commands absent here
 * fail exactly as the pinned container fails: `bash: X: command not found` (127)
 * — captured negative space (m01-vim-not-installed, m01-cmd-not-found).
 *
 * Set verified against the built image 2026-06-12 (docker run … command -v):
 * NOT installed: vim, vi, htop, python3, less, curl, wget, git, ssh, gawk,
 * `file`, and the faketime CLI (libfaketime ships only the library).
 * Installed but surprising: man (Ubuntu's minimized stub — the sim serves the
 * labeled CONDENSED curriculum page instead, per ISC-52), ps, top, seq.
 */
export const INSTALLED_COMMANDS: ReadonlySet<string> = new Set([
  // shells
  "bash", "sh", "dash",
  // coreutils + procps (verified present in the image)
  "man", "ps", "top",
  "basename", "cat", "chgrp", "chmod", "chown", "cksum", "comm", "cp", "csplit", "cut", "date", "dd", "df", "dir",
  "dirname", "du", "echo", "env", "expand", "expr", "factor", "false", "fmt", "fold", "head", "id", "install", "join",
  "link", "ln", "logname", "ls", "md5sum", "mkdir", "mkfifo", "mknod", "mktemp", "mv", "nice", "nl", "nohup", "nproc",
  "numfmt", "od", "paste", "pathchk", "pr", "printenv", "printf", "ptx", "pwd", "readlink", "realpath", "rm", "rmdir",
  "seq", "sha1sum", "sha256sum", "sha512sum", "shred", "shuf", "sleep", "sort", "split", "stat", "stdbuf", "stty",
  "sum", "sync", "tac", "tail", "tee", "test", "timeout", "touch", "tr", "true", "truncate", "tsort", "tty", "uname",
  "unexpand", "uniq", "unlink", "users", "vdir", "wc", "who", "whoami", "yes",
  // text/search toolchain in the base image
  "grep", "egrep", "fgrep", "sed", "awk", "mawk", "find", "xargs", "diff", "cmp", "diff3", "sdiff",
  // util-linux / debianutils / misc base
  "clear", "reset", "tput", "more", "mount", "umount", "su", "runuser", "login", "which", "tempfile", "run-parts",
  "hostname", "tar", "gzip", "gunzip", "zcat", "perl", "getent", "ldconfig", "locale", "find", "groups",
  // package tooling (present in the image; outside the simulated surface)
  "dpkg", "apt", "apt-get", "apt-cache", "apt-config",
  // user management (present in the image; root tools)
  "useradd", "usermod", "userdel", "groupadd", "passwd", "chsh", "chfn",
  // explicit installs in Dockerfile.userland (libfaketime ships no CLI binary)
  "nano", "rnano",
]);

/**
 * Extra commands on the macos-host contract box (zsh variant; module 03 surface).
 * Outputs are pinned to the captured fixtures (see provenance.sw_vers in
 * .ci/fixtures/captured/m03-*.json) — never invented.
 */
export const MACOS_EXTRA_COMMANDS: ReadonlySet<string> = new Set([
  "sw_vers", "csrutil", "spctl", "fdesetup", "defaults", "profiles", "system_profiler", "log", "open", "vim", "vi", "file",
]);
