/**
 * Python engine adapter — Pyodide (REAL CPython compiled to WASM) (web ISA ISC-67/68).
 *
 * Engine class: real-engine-wasm. Module-05 taught snippets run on actual CPython 3.14
 * semantics; stdout/stderr/tracebacks are the interpreter's own.
 *
 * Environment split (ISC-73 / ISC-105):
 *  - This core is DOM-free and takes a loaded Pyodide-like instance from an injected
 *    loader. `bun test` injects the npm package's node-capable build directly
 *    (tests/engines-python.test.ts) — real interpreter, no browser.
 *  - In the browser, Pyodide runs in a Web Worker against the SELF-HOSTED dist at
 *    /engines/pyodide/ (copied by scripts/fetch-engines.ts — design-inputs suggested a
 *    CDN; rejected, violates same-origin). See worker.ts / browser.ts loader glue.
 *
 * Version pin (ISC-128): PYODIDE_VERSION below is asserted against the live interpreter
 * at load() — a silent dist/package drift fails loudly.
 */
import { type EngineAdapter, type EngineRunResult, errorMessage } from "../adapters";

/** Pinned Pyodide release (package.json + self-hosted dist must both match). */
export const PYODIDE_VERSION = "314.0.0";
export const PYODIDE_INDEX_URL = "/engines/pyodide/";
/** Lab working directory inside the Pyodide FS. */
export const PY_LAB_DIR = "/lab";

/** The slice of the Pyodide API the adapter consumes (node and browser builds agree). */
export interface PyodideLike {
  version: string;
  runPython(code: string, opts?: { globals?: unknown }): unknown;
  globals: { get(name: string): (() => PyProxyLike) };
  FS: {
    writeFile(path: string, data: string): void;
    readFile(path: string, opts: { encoding: "utf8" }): string;
    mkdirTree(path: string): void;
    chdir(path: string): void;
  };
  setStdout(opts: { batched: (line: string) => void }): void;
  setStderr(opts: { batched: (line: string) => void }): void;
}

interface PyProxyLike {
  destroy?(): void;
}

export class PythonEngineAdapter implements EngineAdapter {
  readonly id = "python";
  private loader: () => Promise<PyodideLike>;
  private py: PyodideLike | null = null;

  constructor(loader: () => Promise<PyodideLike>) {
    this.loader = loader;
  }

  async load(): Promise<void> {
    if (this.py) return;
    const py = await this.loader();
    if (py.version !== PYODIDE_VERSION) {
      throw new Error(`pyodide version drift: pinned ${PYODIDE_VERSION}, loaded ${py.version} (ISC-128)`);
    }
    py.FS.mkdirTree(PY_LAB_DIR);
    this.py = py;
  }

  /**
   * Run Python source with `files` materialized into the lab dir (cwd) first.
   * Fresh globals per run — taught snippets behave like `python3 script.py`, not a REPL
   * accumulating state. Exceptions → exit 1 with CPython's own traceback on stderr;
   * SystemExit honors its code. A bare trailing expression's repr lands in artifacts.
   */
  async run(input: string, files?: Record<string, string>): Promise<EngineRunResult> {
    await this.load();
    const py = this.py!;
    const out: string[] = [];
    const err: string[] = [];
    py.setStdout({ batched: (line) => out.push(line) });
    py.setStderr({ batched: (line) => err.push(line) });

    for (const [path, content] of Object.entries(files ?? {})) {
      const full = path.startsWith("/") ? path : `${PY_LAB_DIR}/${path}`;
      const parent = full.slice(0, full.lastIndexOf("/"));
      if (parent) py.FS.mkdirTree(parent);
      py.FS.writeFile(full, content);
    }
    py.FS.chdir(PY_LAB_DIR);

    // Script semantics, not a REPL: evict lab-dir modules from sys.modules so each run
    // imports the CURRENT file bytes (otherwise a learner's edit to validator.py would be
    // shadowed by the interpreter's import cache — observed under test, not hypothetical).
    py.runPython(
      [
        "import sys",
        "for _name, _mod in list(sys.modules.items()):",
        `    if (getattr(_mod, '__file__', '') or '').startswith('${PY_LAB_DIR}/'):`,
        "        del sys.modules[_name]",
      ].join("\n"),
    );

    const namespace = py.globals.get("dict")();
    let exit = 0;
    let repr: string | undefined;
    try {
      const value = py.runPython(input, { globals: namespace });
      if (value !== undefined) {
        repr = String(value);
        (value as PyProxyLike)?.destroy?.();
      }
    } catch (e) {
      const msg = errorMessage(e);
      const sysExit = msg.match(/SystemExit: (\d+)\s*$/);
      exit = sysExit ? Number(sysExit[1]) : /SystemExit\s*$/.test(msg.trimEnd()) ? 0 : 1;
      if (exit !== 0) err.push(msg.trimEnd());
    } finally {
      namespace.destroy?.();
    }

    const stdout = out.length ? out.join("\n") + "\n" : "";
    const stderr = err.length ? err.join("\n") + "\n" : "";
    return { stdout, stderr, exit, ...(repr !== undefined ? { artifacts: { repr } } : {}) };
  }

  /** Probe: read a file the learner's code wrote (e.g. report.json) — null when absent. */
  readLabFile(path: string): string | null {
    if (!this.py) return null;
    try {
      return this.py.FS.readFile(path.startsWith("/") ? path : `${PY_LAB_DIR}/${path}`, { encoding: "utf8" });
    } catch {
      return null;
    }
  }
}
