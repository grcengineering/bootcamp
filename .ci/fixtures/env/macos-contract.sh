#!/usr/bin/env bash
# Executable environment contract — macOS captures (root ISC-55; RedTeam finding 4).
# Runs a manifest command under a clean, pinned zsh environment on a real Mac and emits
# the sanitized provenance block. Volatile host details (user dotfiles, PATH additions)
# are excluded by construction: zsh -f skips all rc files; env is rebuilt from scratch.
#
# Usage: macos-contract.sh <cwd> <command...>
set -euo pipefail
CWD="${1:?usage: macos-contract.sh <cwd> <command...>}"; shift

exec /usr/bin/env -i \
  HOME="$PWD/.capture-home" \
  USER=analyst \
  LOGNAME=analyst \
  SHELL=/bin/zsh \
  TERM=dumb \
  COLUMNS=80 \
  LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
  PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  /bin/zsh -f -c "cd '$CWD' && $*"
