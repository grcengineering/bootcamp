/**
 * GENERATED — do not edit. Source: .ci/fixtures/generate-m02-assets.ts over the committed
 * docker-linux-booted captures (.ci/fixtures/captured/m02-*.json) and env assets.
 * Every constant here is replayed reality; provenance is the named fixture id.
 */

/** m02-apt-install-deb (stdout, byte-exact incl. dpkg \r progress segments) */
export const APT_INSTALL_STDOUT = "Reading package lists...\nBuilding dependency tree...\nReading state information...\nThe following NEW packages will be installed:\n  evidence-collector\n0 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.\nNeed to get 0 B/992 B of archives.\nAfter this operation, 0 B of additional disk space will be used.\nGet:1 /home/grcops/evidence-collector_1.0.0_all.deb evidence-collector all 1.0.0 [992 B]\nSelecting previously unselected package evidence-collector.\r\n(Reading database ... \r(Reading database ... 5%\r(Reading database ... 10%\r(Reading database ... 15%\r(Reading database ... 20%\r(Reading database ... 25%\r(Reading database ... 30%\r(Reading database ... 35%\r(Reading database ... 40%\r(Reading database ... 45%\r(Reading database ... 50%\r(Reading database ... 55%\r(Reading database ... 60%\r(Reading database ... 65%\r(Reading database ... 70%\r(Reading database ... 75%\r(Reading database ... 80%\r(Reading database ... 85%\r(Reading database ... 90%\r(Reading database ... 95%\r(Reading database ... 100%\r(Reading database ... 5827 files and directories currently installed.)\r\nPreparing to unpack .../evidence-collector_1.0.0_all.deb ...\r\nUnpacking evidence-collector (1.0.0) ...\r\nSetting up evidence-collector (1.0.0) ...\r\n";
/** m02-apt-install-deb (stderr after the sudo prompt: WARNING + debconf notice) */
export const APT_INSTALL_STDERR = "\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\ndebconf: delaying package configuration, since apt-utils is not installed\n";
/** m02-apt-reinstall (stdout) */
export const APT_REINSTALL_STDOUT = "Reading package lists...\nBuilding dependency tree...\nReading state information...\nevidence-collector is already the newest version (1.0.0).\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n";
/** m02-apt-install-notfound (stdout) */
export const APT_NOTFOUND_STDOUT = "Reading package lists...\nBuilding dependency tree...\nReading state information...\n";
/** shared apt stderr preamble when output is not a tty (m02-apt-* captures) */
export const APT_WARNING = "\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\n";
/** m02-apt-install-notfound (stderr tail after WARNING — %s = package name) */
export const APT_NOTFOUND_E_LINE = "E: Unable to locate package nginx\n";
/** m02-apt-nonroot (stderr, byte-exact) */
export const APT_NONROOT_STDERR = "\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\nE: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n";
/** m02-sudo-usage (stderr, byte-exact) */
export const SUDO_USAGE = "usage: sudo -h | -K | -k | -V\nusage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]\nusage: sudo -l [-ABkNnS] [-g group] [-h host] [-p prompt] [-U user]\n            [-u user] [command [arg ...]]\nusage: sudo [-ABbEHkNnPS] [-r role] [-t type] [-C num] [-D directory]\n            [-g group] [-h host] [-p prompt] [-R directory] [-T timeout]\n            [-u user] [VAR=value] [-i | -s] [command [arg ...]]\nusage: sudo -e [-ABkNnS] [-r role] [-t type] [-C num] [-D directory]\n            [-g group] [-h host] [-p prompt] [-R directory] [-T timeout]\n            [-u user] file ...\n";
/** m02-passwd-mismatch (stderr after the sudo prompt; exit 10) */
export const PASSWD_MISMATCH_STDERR = "New password: Retype new password: Sorry, passwords do not match.\npasswd: Authentication token manipulation error\npasswd: password unchanged\n";
export const PASSWD_MISMATCH_EXIT = 10;

/** env/evidence-collector.service — the unit bytes the scenario .deb installs */
export const EC_UNIT_FILE = "[Unit]\nDescription=GRC evidence collector\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/evidence-collector\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\n";
/** env/evidence-collector — the daemon script bytes the scenario .deb installs */
export const EC_SCRIPT = "#!/usr/bin/env bash\n# The fictional GRC evidence collector daemon (module 02 scenario asset).\n# Real enough that systemd reports it active (running); it emits one journal line per interval.\nwhile true; do\n  echo \"evidence-collector: heartbeat ok\"\n  sleep 300\ndone\n";
