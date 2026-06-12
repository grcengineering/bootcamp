/**
 * Windows-flavored virtual filesystem for the WIN-LAB04 session (web ISA ISC-63).
 *
 * Case-insensitive paths, backslash separators (forward slashes tolerated on input),
 * implicit directories. Files written by the session use \r\n line endings (Windows);
 * read-back probes return content as stored. Provenance (the input line that last
 * wrote a file) backs the artifact_produced_by verifier (ISC-126).
 */

export interface WinFileRecord { path: string; content: string; producedBy: string | null }

export interface SerializedWinVfs { files: WinFileRecord[] }

/** Resolve to a normalized absolute Windows path (uppercase drive, \ separators). */
export function winNormalize(path: string, cwd: string): string {
  let p = path.replace(/\//g, "\\");
  if (!/^[A-Za-z]:/.test(p)) {
    p = p.replace(/^\.\\/, "");
    p = cwd.replace(/\\$/, "") + "\\" + p;
  }
  const drive = p.slice(0, 2).toUpperCase();
  const rest = p.slice(2);
  const segs: string[] = [];
  for (const seg of rest.split("\\")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { segs.pop(); continue; }
    segs.push(seg);
  }
  return drive + "\\" + segs.join("\\");
}

export class WinVfs {
  private map = new Map<string, WinFileRecord>();

  constructor(private home: string) {}

  write(path: string, cwd: string, content: string, producedBy: string | null): void {
    const full = winNormalize(path, cwd);
    this.map.set(full.toLowerCase(), { path: full, content, producedBy });
  }

  read(path: string, cwd: string): string | null {
    const rec = this.map.get(winNormalize(path, cwd).toLowerCase());
    return rec ? rec.content : null;
  }

  exists(path: string, cwd: string): boolean {
    const full = winNormalize(path, cwd);
    if (this.map.has(full.toLowerCase())) return true;
    return this.isDir(full);
  }

  producedBy(path: string, cwd: string): string | null {
    const rec = this.map.get(winNormalize(path, cwd).toLowerCase());
    return rec ? rec.producedBy : null;
  }

  /** Immediate children (files and implicit subdirectories) of a directory, sorted. */
  listDir(path: string, cwd: string): string[] | null {
    const full = winNormalize(path, cwd);
    if (!this.isDir(full)) return null;
    const prefix = full.toLowerCase() + "\\";
    const names = new Set<string>();
    for (const rec of this.map.values()) {
      const lower = rec.path.toLowerCase();
      if (!lower.startsWith(prefix)) continue;
      const tail = rec.path.slice(prefix.length);
      names.add(tail.split("\\")[0]);
    }
    return [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  private isDir(full: string): boolean {
    const lower = full.toLowerCase();
    if (lower === this.home.toLowerCase()) return true;
    const prefix = lower + "\\";
    for (const key of this.map.keys()) if (key.startsWith(prefix)) return true;
    return false;
  }

  /** Remove every file under home, then re-add the given records (reseed, ISC-117). */
  resetHome(records: WinFileRecord[]): void {
    const prefix = this.home.toLowerCase() + "\\";
    for (const key of [...this.map.keys()]) if (key.startsWith(prefix)) this.map.delete(key);
    for (const rec of records) this.map.set(rec.path.toLowerCase(), { ...rec });
  }

  serialize(): SerializedWinVfs {
    return { files: [...this.map.values()].map((r) => ({ ...r })) };
  }

  static deserialize(blob: SerializedWinVfs, home: string): WinVfs {
    const vfs = new WinVfs(home);
    for (const rec of blob.files) vfs.map.set(rec.path.toLowerCase(), { ...rec });
    return vfs;
  }
}
