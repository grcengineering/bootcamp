/**
 * SimFs — tiny in-memory file store for the structured-sim builders (modules 13/15).
 *
 * This is deliberately NOT the shell engine's VFS: builder exercises operate on a small,
 * honest file model (evidence stores, capstone repos) without permissions/processes.
 * It implements exactly the operations the ported lab validators perform:
 * mkdir -p, write (>), append (>>), read, -e/-f existence (including `dir/` form), ls.
 */
import type { ReadonlyFs } from "./types";
import { normalizePath, posixDirname } from "./types";

export class SimFs implements ReadonlyFs {
  private files: Map<string, string>;
  private dirs: Set<string>;

  // Explicit constructor: bun's coverage counts implicit field-initializer ctors as unhittable.
  constructor() {
    this.files = new Map();
    this.dirs = new Set();
  }

  /** mkdir -p: create the directory and all ancestors. */
  mkdirp(path: string): void {
    let p = normalizePath(path);
    while (p !== "." && p !== "/") {
      this.dirs.add(p);
      p = posixDirname(p);
    }
  }

  /** Write (creates parents, like the models' controlled writes — `>` over a fresh path). */
  write(path: string, content: string): void {
    const p = normalizePath(path);
    this.mkdirp(posixDirname(p));
    this.files.set(p, content);
  }

  /** Append (`>>`); creates the file (and parents) when absent, like bash. */
  append(path: string, content: string): void {
    const p = normalizePath(path);
    const prev = this.files.get(p);
    if (prev === undefined) this.write(p, content);
    else this.files.set(p, prev + content);
  }

  remove(path: string): void {
    this.files.delete(normalizePath(path));
  }

  read(path: string): string | null {
    return this.files.get(normalizePath(path)) ?? null;
  }

  isFile(path: string): boolean {
    return this.files.has(normalizePath(path));
  }

  isDir(path: string): boolean {
    return this.dirs.has(normalizePath(path));
  }

  /** `[ -e path ]` — true for files and directories; accepts the `dir/` trailing-slash form. */
  exists(path: string): boolean {
    const p = normalizePath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  /** Sorted entry names directly inside a directory (glob-order, like `ls`). */
  list(dir: string): string[] {
    const d = normalizePath(dir);
    const prefix = d === "." ? "" : d + "/";
    const names = new Set<string>();
    for (const f of this.files.keys()) {
      if (prefix === "" ? !f.includes("/") : f.startsWith(prefix) && !f.slice(prefix.length).includes("/")) {
        names.add(prefix === "" ? f : f.slice(prefix.length));
      }
    }
    for (const sub of this.dirs) {
      if (prefix !== "" && sub.startsWith(prefix) && !sub.slice(prefix.length).includes("/")) {
        names.add(sub.slice(prefix.length));
      }
      if (prefix === "" && !sub.includes("/")) names.add(sub);
    }
    return [...names].sort();
  }

  /**
   * Flat snapshot in the capture harness's convention: files → content,
   * directories → `"path/" : "<dir>"`. Used to byte-compare sim state with what the real
   * bash run left on disk (web/tests/fixtures/builder-captures.json `evidence` blocks).
   */
  snapshot(scope?: string): Record<string, string> {
    const s = scope ? normalizePath(scope) : null;
    const within = (p: string) => (s === null ? true : p === s || p.startsWith(s + "/"));
    const rel = (p: string) => (s === null ? p : p === s ? "" : p.slice(s.length + 1));
    const out: Record<string, string> = {};
    for (const d of [...this.dirs].sort()) {
      if (within(d) && rel(d) !== "") out[rel(d) + "/"] = "<dir>";
    }
    for (const [f, content] of [...this.files.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (within(f)) out[rel(f)] = content;
    }
    return out;
  }

  /** Seed many files at once (e.g. a setup.sh-equivalent staging step). */
  seed(files: Record<string, string>): void {
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith("/")) this.mkdirp(path);
      else this.write(path, content);
    }
  }
}
