/**
 * Minimal in-memory fs for isomorphic-git (web ISA ISC-66) — DOM-free, dependency-free.
 *
 * Implements exactly the `fs.promises` subset isomorphic-git consumes (readFile, writeFile,
 * unlink, readdir, mkdir, rmdir, stat, lstat, readlink, symlink, rename) over a path-keyed
 * node map. Errors carry node-style `code` properties because isomorphic-git branches on
 * them (ENOENT/EEXIST/ENOTDIR/ENOTEMPTY).
 *
 * mtime is a monotonic counter, not wall clock: git object hashing never reads mtime, and
 * the status cache only needs change detection — keeping the sim deterministic (ISC-132).
 */

interface FileNode {
  kind: "file";
  data: Uint8Array;
  mode: number;
  ino: number;
  mtimeMs: number;
}
interface DirNode {
  kind: "dir";
  mode: number;
  ino: number;
  mtimeMs: number;
}
interface LinkNode {
  kind: "symlink";
  target: string;
  ino: number;
  mtimeMs: number;
}
type Node = FileNode | DirNode | LinkNode;

function fsError(code: string, path: string, op: string): Error & { code: string } {
  const e = new Error(`${code}: ${op} '${path}'`) as Error & { code: string };
  e.code = code;
  return e;
}

export function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

function baseOf(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface MemStats {
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export class MemFs {
  private nodes = new Map<string, Node>();
  private nextIno = 2;
  // whole-second steps: isomorphic-git's index stat-cache compares mtime at second
  // granularity — sub-second ticks would make distinct writes look identical
  private tick = 1000;
  /** isomorphic-git consumes this shape: `{ promises: {...} }`. */
  readonly promises: {
    readFile(path: string, opts?: { encoding?: string } | string): Promise<Uint8Array | string>;
    writeFile(path: string, data: Uint8Array | string, opts?: unknown): Promise<void>;
    unlink(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;
    rmdir(path: string): Promise<void>;
    stat(path: string): Promise<MemStats>;
    lstat(path: string): Promise<MemStats>;
    readlink(path: string): Promise<string>;
    symlink(target: string, path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
  };

  constructor() {
    this.nodes.set("/", { kind: "dir", mode: 0o755, ino: 1, mtimeMs: 0 });
    // bind the promises facade once (isomorphic-git destructures methods)
    this.promises = {
      readFile: async (p, opts) => this.readFile(p, opts),
      writeFile: async (p, d) => this.writeFile(p, d),
      unlink: async (p) => this.unlink(p),
      readdir: async (p) => this.readdir(p),
      mkdir: async (p) => this.mkdir(p),
      rmdir: async (p) => this.rmdir(p),
      stat: async (p) => this.stat(p),
      lstat: async (p) => this.stat(p),
      readlink: async (p) => this.readlink(p),
      symlink: async (t, p) => this.symlink(t, p),
      rename: async (a, b) => this.rename(a, b),
    };
  }

  private node(p: string): Node | undefined {
    return this.nodes.get(normalizePath(p));
  }

  readFile(path: string, opts?: { encoding?: string } | string): Uint8Array | string {
    const n = this.node(path);
    if (!n) throw fsError("ENOENT", path, "open");
    if (n.kind === "dir") throw fsError("EISDIR", path, "read");
    if (n.kind === "symlink") return this.readFile(n.target, opts);
    const encoding = typeof opts === "string" ? opts : opts?.encoding;
    return encoding === "utf8" ? dec.decode(n.data) : n.data;
  }

  writeFile(path: string, data: Uint8Array | string, mode = 0o644): void {
    const p = normalizePath(path);
    const parent = this.node(parentOf(p));
    if (!parent || parent.kind !== "dir") throw fsError("ENOENT", path, "open");
    const existing = this.node(p);
    if (existing?.kind === "dir") throw fsError("EISDIR", path, "open");
    const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
    this.nodes.set(p, {
      kind: "file",
      data: bytes,
      mode: existing?.kind === "file" ? existing.mode : mode,
      ino: existing?.ino ?? this.nextIno++,
      mtimeMs: (this.tick += 1000),
    });
  }

  unlink(path: string): void {
    const p = normalizePath(path);
    const n = this.nodes.get(p);
    if (!n) throw fsError("ENOENT", path, "unlink");
    if (n.kind === "dir") throw fsError("EISDIR", path, "unlink");
    this.nodes.delete(p);
  }

  readdir(path: string): string[] {
    const p = normalizePath(path);
    const n = this.nodes.get(p);
    if (!n) throw fsError("ENOENT", path, "scandir");
    if (n.kind !== "dir") throw fsError("ENOTDIR", path, "scandir");
    const prefix = p === "/" ? "/" : p + "/";
    const names: string[] = [];
    for (const key of this.nodes.keys()) {
      if (key !== "/" && key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
        names.push(baseOf(key));
      }
    }
    return names.sort();
  }

  mkdir(path: string): void {
    const p = normalizePath(path);
    if (this.nodes.has(p)) throw fsError("EEXIST", path, "mkdir");
    const parent = this.nodes.get(parentOf(p));
    if (!parent) throw fsError("ENOENT", path, "mkdir");
    if (parent.kind !== "dir") throw fsError("ENOTDIR", path, "mkdir");
    this.nodes.set(p, { kind: "dir", mode: 0o755, ino: this.nextIno++, mtimeMs: this.tick++ });
  }

  /** mkdir -p convenience for engine seeding (not part of the isomorphic-git surface). */
  mkdirp(path: string): void {
    const p = normalizePath(path);
    const parts = p.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur += "/" + part;
      if (!this.nodes.has(cur)) this.mkdir(cur);
    }
  }

  rmdir(path: string): void {
    const p = normalizePath(path);
    const n = this.nodes.get(p);
    if (!n) throw fsError("ENOENT", path, "rmdir");
    if (n.kind !== "dir") throw fsError("ENOTDIR", path, "rmdir");
    if (this.readdir(p).length > 0) throw fsError("ENOTEMPTY", path, "rmdir");
    this.nodes.delete(p);
  }

  stat(path: string): MemStats {
    const n = this.node(path);
    if (!n) throw fsError("ENOENT", path, "stat");
    const size = n.kind === "file" ? n.data.byteLength : 0;
    const mode = n.kind === "file" ? 0o100000 + n.mode : n.kind === "dir" ? 0o040000 + n.mode : 0o120777;
    return {
      mode,
      size,
      ino: n.ino,
      mtimeMs: n.mtimeMs,
      ctimeMs: n.mtimeMs,
      uid: 1000,
      gid: 1000,
      dev: 1,
      isFile: () => n.kind === "file",
      isDirectory: () => n.kind === "dir",
      isSymbolicLink: () => n.kind === "symlink",
    };
  }

  readlink(path: string): string {
    const n = this.node(path);
    if (!n) throw fsError("ENOENT", path, "readlink");
    if (n.kind !== "symlink") throw fsError("EINVAL", path, "readlink");
    return n.target;
  }

  symlink(target: string, path: string): void {
    const p = normalizePath(path);
    if (this.nodes.has(p)) throw fsError("EEXIST", path, "symlink");
    this.nodes.set(p, { kind: "symlink", target, ino: this.nextIno++, mtimeMs: this.tick++ });
  }

  rename(oldPath: string, newPath: string): void {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    const n = this.nodes.get(from);
    if (!n) throw fsError("ENOENT", oldPath, "rename");
    const moves: Array<[string, string]> = [[from, to]];
    if (n.kind === "dir") {
      for (const key of this.nodes.keys()) {
        if (key.startsWith(from + "/")) moves.push([key, to + key.slice(from.length)]);
      }
    }
    for (const [a, b] of moves) {
      const node = this.nodes.get(a)!;
      this.nodes.delete(a);
      this.nodes.set(b, node);
    }
  }

  /** Probe: does a path exist (engine/verifier surface). */
  exists(path: string): boolean {
    return this.nodes.has(normalizePath(path));
  }
}
