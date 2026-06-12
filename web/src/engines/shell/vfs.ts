/**
 * In-memory virtual filesystem for the shell engine (web ISA ISC-42).
 *
 * Pure TypeScript, DOM-free. Nodes carry mode/owner/group/mtime; size derives from content.
 * Serialization is plain JSON (used by SessionSnapshot.vfs).
 */

export type FileType = "file" | "dir" | "symlink";

export interface VNode {
  t: FileType;
  mode: number;
  owner: string;
  group: string;
  /** sim-clock ms since Unix epoch. */
  mtime: number;
  content: string; // files
  target: string; // symlinks
  children: Map<string, VNode> | null; // dirs
  /** Marks a simulated binary (TS-implemented coreutil) installed at this path. */
  sim?: string;
}

export interface SerializedNode {
  t: FileType;
  mode: number;
  owner: string;
  group: string;
  mtime: number;
  content?: string;
  target?: string;
  children?: Record<string, SerializedNode>;
  sim?: string;
}

export function normalize(path: string, cwd: string, home: string): string {
  let p = path;
  if (p === "~") p = home;
  else if (p.startsWith("~/")) p = home + p.slice(1);
  if (!p.startsWith("/")) p = (cwd === "/" ? "" : cwd) + "/" + p;
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}

export class VFS {
  root: VNode;

  constructor(root?: VNode) {
    this.root = root ?? mkdirNode("root");
  }

  /** Resolve an absolute normalized path to a node (follows symlinks, bounded). */
  lookup(abs: string, depth = 0): VNode | null {
    if (depth > 16) return null;
    if (abs === "/") return this.root;
    let node: VNode = this.root;
    let nodePath = "/";
    const segs = abs.slice(1).split("/");
    for (let i = 0; i < segs.length; i++) {
      if (node.t === "symlink") {
        const resolved = this.followLink(nodePath, node, depth);
        if (!resolved) return null;
        node = resolved;
      }
      if (node.t !== "dir" || !node.children) return null;
      const next = node.children.get(segs[i]!);
      if (!next) return null;
      node = next;
      nodePath = nodePath === "/" ? "/" + segs[i]! : nodePath + "/" + segs[i]!;
    }
    if (node.t === "symlink") return this.followLink(nodePath, node, depth);
    return node;
  }

  /** Follow a symlink found at atPath — relative targets resolve against its directory. */
  private followLink(atPath: string, node: VNode, depth: number): VNode | null {
    const base = parentPath(atPath);
    const targetAbs = node.target.startsWith("/") ? normalize(node.target, "/", "/") : normalize(node.target, base, base);
    return this.lookup(targetAbs, depth + 1);
  }

  /** Like lookup but does NOT follow a trailing symlink. */
  lstat(abs: string): VNode | null {
    if (abs === "/") return this.root;
    const parent = this.lookup(parentPath(abs));
    if (!parent || parent.t !== "dir" || !parent.children) return null;
    return parent.children.get(baseName(abs)) ?? null;
  }

  exists(abs: string): boolean {
    return this.lookup(abs) !== null;
  }

  isDir(abs: string): boolean {
    return this.lookup(abs)?.t === "dir";
  }

  readFile(abs: string): string | null {
    const n = this.lookup(abs);
    return n && n.t === "file" ? n.content : null;
  }

  listNames(abs: string): string[] | null {
    const n = this.lookup(abs);
    if (!n || n.t !== "dir" || !n.children) return null;
    return [...n.children.keys()].sort(byteCompare);
  }

  /** Create or replace a file. Returns false if the parent is missing or path is a dir. */
  writeFile(abs: string, content: string, opts: { append?: boolean; owner: string; now: number; mode?: number }): boolean {
    const parent = this.lookup(parentPath(abs));
    if (!parent || parent.t !== "dir" || !parent.children) return false;
    const name = baseName(abs);
    const existing = parent.children.get(name);
    if (existing) {
      const real = existing.t === "symlink" ? this.lookup(existing.target) : existing;
      if (!real || real.t !== "file") return false;
      real.content = opts.append ? real.content + content : content;
      real.mtime = opts.now;
      return true;
    }
    parent.children.set(name, {
      t: "file",
      mode: opts.mode ?? 0o644,
      owner: opts.owner,
      group: opts.owner,
      mtime: opts.now,
      content,
      target: "",
      children: null,
    });
    return true;
  }

  mkdir(abs: string, opts: { parents?: boolean; owner: string; now: number }): "ok" | "exists" | "noent" {
    if (this.exists(abs)) return opts.parents && this.isDir(abs) ? "ok" : "exists";
    const parent = parentPath(abs);
    if (!this.isDir(parent)) {
      if (!opts.parents) return "noent";
      const r = this.mkdir(parent, opts);
      if (r !== "ok") return r;
    }
    const pnode = this.lookup(parent)!;
    pnode.children!.set(baseName(abs), {
      t: "dir",
      mode: 0o755,
      owner: opts.owner,
      group: opts.owner,
      mtime: opts.now,
      content: "",
      target: "",
      children: new Map(),
    });
    pnode.mtime = opts.now;
    return "ok";
  }

  symlink(abs: string, target: string, opts: { owner: string; now: number }): boolean {
    const parent = this.lookup(parentPath(abs));
    if (!parent || parent.t !== "dir" || !parent.children || parent.children.has(baseName(abs))) return false;
    parent.children.set(baseName(abs), {
      t: "symlink",
      mode: 0o777,
      owner: opts.owner,
      group: opts.owner,
      mtime: opts.now,
      content: "",
      target,
      children: null,
    });
    return true;
  }

  remove(abs: string): boolean {
    const parent = this.lookup(parentPath(abs));
    if (!parent || parent.t !== "dir" || !parent.children) return false;
    return parent.children.delete(baseName(abs));
  }

  /** Deep copy a node (for cp -r / snapshots / clean sub-environments). */
  static cloneNode(n: VNode): VNode {
    return {
      ...n,
      children: n.children ? new Map([...n.children.entries()].map(([k, v]) => [k, VFS.cloneNode(v)])) : null,
    };
  }

  clone(): VFS {
    return new VFS(VFS.cloneNode(this.root));
  }

  serialize(): SerializedNode {
    return serializeNode(this.root);
  }

  static deserialize(s: SerializedNode): VFS {
    return new VFS(deserializeNode(s));
  }
}

export function parentPath(abs: string): string {
  const i = abs.lastIndexOf("/");
  return i <= 0 ? "/" : abs.slice(0, i);
}

export function baseName(abs: string): string {
  return abs.slice(abs.lastIndexOf("/") + 1);
}

/** C-locale (byte-order) name comparison — what GNU ls does in the contract image. */
export function byteCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sizeOf(n: VNode): number {
  return n.t === "dir" ? 4096 : n.t === "symlink" ? n.target.length : byteLength(n.content);
}

export function byteLength(s: string): number {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : (i++, 4);
  }
  return len;
}

function mkdirNode(owner: string): VNode {
  return { t: "dir", mode: 0o755, owner, group: owner, mtime: 0, content: "", target: "", children: new Map() };
}

function serializeNode(n: VNode): SerializedNode {
  const out: SerializedNode = { t: n.t, mode: n.mode, owner: n.owner, group: n.group, mtime: n.mtime };
  if (n.t === "file") out.content = n.content;
  if (n.t === "symlink") out.target = n.target;
  if (n.sim) out.sim = n.sim;
  if (n.children) {
    out.children = {};
    for (const [k, v] of n.children) out.children[k] = serializeNode(v);
  }
  return out;
}

function deserializeNode(s: SerializedNode): VNode {
  return {
    t: s.t,
    mode: s.mode,
    owner: s.owner,
    group: s.group,
    mtime: s.mtime,
    content: s.content ?? "",
    target: s.target ?? "",
    children: s.children
      ? new Map(Object.entries(s.children).map(([k, v]) => [k, deserializeNode(v)]))
      : s.t === "dir"
        ? new Map()
        : null,
    ...(s.sim ? { sim: s.sim } : {}),
  };
}
