/**
 * Condensed manual pages for taught commands (web ISA ISC-52).
 *
 * These are curriculum reference pages, NOT the real manuals — every page is labeled
 * with the CONDENSED banner so the sim never passes authored text off as the box's
 * man output (the contract image is minimized and has no man-db anyway).
 */

export const CONDENSED_BANNER = "CONDENSED — curriculum reference, not the full manual";

function page(name: string, oneLine: string, synopsis: string, body: string): string {
  return (
    `${name.toUpperCase()}(1)${" ".repeat(Math.max(1, 30 - name.length))}${CONDENSED_BANNER}\n\n` +
    `NAME\n       ${name} - ${oneLine}\n\n` +
    `SYNOPSIS\n       ${synopsis}\n\n` +
    `DESCRIPTION\n${body
      .trim()
      .split("\n")
      .map((l) => "       " + l)
      .join("\n")}\n`
  );
}

export const MAN_PAGES: Record<string, string> = {
  pwd: page("pwd", "print name of current/working directory", "pwd", "Print the full filename of the current working directory."),
  cd: page("cd", "change the working directory", "cd [dir]", "Change the current directory to dir. With no argument, change to $HOME.\n`cd -` returns to the previous directory."),
  ls: page(
    "ls",
    "list directory contents",
    "ls [-l] [-a] [-C] [-w COLS] [file...]",
    "List information about files (the current directory by default).\n-l  long listing format\n-a  include hidden entries (names starting with .)\n-C  list entries by columns\n-w  assume screen width COLS",
  ),
  cat: page("cat", "concatenate files and print on the standard output", "cat [file...]", "Concatenate file(s) to standard output. With no file, read standard input."),
  grep: page(
    "grep",
    "print lines that match patterns",
    "grep [-qcivnEr] PATTERNS [file...]",
    "Search for PATTERNS in each file (or standard input).\n-q  quiet: exit status only\n-c  count matching lines\n-i  ignore case\n-v  select non-matching lines\n-n  prefix output with line numbers\n-E  extended regular expressions\n-r  recursive\nExit status is 0 if any line is selected, 1 otherwise.",
  ),
  wc: page("wc", "print newline, word, and byte counts", "wc [-lwc] [file...]", "-l lines, -w words, -c bytes. With no file, read standard input."),
  head: page("head", "output the first part of files", "head [-n NUM] [file...]", "Print the first NUM lines (default 10)."),
  tail: page("tail", "output the last part of files", "tail [-n NUM] [file...]", "Print the last NUM lines (default 10)."),
  sort: page("sort", "sort lines of text files", "sort [-rnu] [file...]", "-r reverse, -n numeric, -u unique."),
  uniq: page("uniq", "report or omit repeated lines", "uniq [-c] [file]", "Filter adjacent matching lines. -c prefixes counts. Pair with sort."),
  cut: page("cut", "remove sections from each line of files", "cut -d DELIM -f LIST [file...]", "Select fields (-f) split on DELIM (-d, default TAB)."),
  tr: page("tr", "translate or delete characters", "tr [-d] SET1 [SET2]", "Translate characters in SET1 to SET2, or delete SET1 with -d. Reads standard input."),
  echo: page("echo", "display a line of text", "echo [-n] [-e] [string...]", "-n no trailing newline; -e interpret backslash escapes."),
  printf: page("printf", "format and print data", "printf FORMAT [argument...]", "Print arguments under control of FORMAT (%s %d, \\n escapes)."),
  chmod: page("chmod", "change file mode bits", "chmod MODE file...", "MODE is symbolic ([ugoa][-+=][rwx]) or octal (e.g. 755). `chmod +x script.sh` makes a script executable."),
  mkdir: page("mkdir", "make directories", "mkdir [-p] directory...", "-p makes parent directories as needed and is quiet when the directory exists."),
  rm: page("rm", "remove files or directories", "rm [-rf] file...", "-r recursive (directories), -f force (no error for missing files). Removal is real — there is no undo."),
  cp: page("cp", "copy files and directories", "cp [-r] source dest", "-r copies directories recursively."),
  mv: page("mv", "move (rename) files", "mv source dest", "Rename source to dest, or move into a destination directory."),
  touch: page("touch", "change file timestamps / create empty files", "touch [-d DATE] file...", "Create the file if missing; otherwise update its modification time."),
  which: page("which", "locate a command", "which command...", "Print the full path of each command found on PATH."),
  env: page("env", "run a program in a modified environment / print it", "env [NAME=VALUE...] [command]", "With no command, print the exported environment."),
  date: page("date", "print the system date and time", "date [+FORMAT]", "Print the current time (sim clock) in the given FORMAT (%Y %m %d %H %M %S %s...)."),
  whoami: page("whoami", "print effective user name", "whoami", "Print the user name associated with the current effective user ID."),
  id: page("id", "print user identity", "id", "Print uid, gid, and groups."),
  uname: page("uname", "print system information", "uname [-s] [-n]", "-s kernel name (default), -n network node hostname."),
  file: page("file", "determine file type", "file file...", "Classify files (directory, ASCII text, shell script, empty...)."),
  ln: page("ln", "make links between files", "ln -s target linkname", "-s makes symbolic links."),
  mktemp: page("mktemp", "create a temporary file or directory", "mktemp [-d]", "Create a unique /tmp path and print it. -d makes a directory."),
  dirname: page("dirname", "strip last component from file name", "dirname path", "Print path with its last component removed."),
  basename: page("basename", "strip directory from file name", "basename path [suffix]", "Print path with leading directories (and optional suffix) removed."),
  diff: page("diff", "compare files line by line", "diff file1 file2", "Output the differences in normal format; exit 0 when identical, 1 when different."),
  sha256sum: page("sha256sum", "compute SHA256 message digest", "sha256sum [file...]", "Print checksum and name for each file (or standard input as -)."),
  cksum: page("cksum", "checksum and count the bytes in a file", "cksum [file...]", "Print POSIX CRC checksum, byte count, and name."),
  tee: page("tee", "read from standard input and write to standard output and files", "tee [-a] [file...]", "-a appends instead of overwriting."),
  sleep: page("sleep", "delay for a specified amount of time", "sleep NUMBER[smhd]", "Pause for NUMBER seconds (the lab advances its simulated clock instead of waiting)."),
  history: page("history", "display the command history list", "history", "Print the numbered history of commands entered in this session."),
  test: page("test", "check file types and compare values", "test EXPRESSION | [ EXPRESSION ]", "-f file exists and is regular; -d directory; -x executable; -z/-n string empty/non-empty; = != -eq -ne -lt -gt comparisons. Exit 0 = true."),
  bash: page("bash", "GNU Bourne-Again SHell", "bash script.sh [args...]", "Run a script with bash (no execute permission needed, unlike ./script.sh)."),
  awk: page("awk", "pattern scanning and processing language", "awk [-F fs] 'program' [file...]", "Run program against each input record. Patterns select records; actions (print...) process them. $1..$N are fields, NR/NF record/field counts."),
  man: page("man", "an interface to the system reference manuals", "man command", "Display the condensed curriculum reference page for a taught command."),
};
