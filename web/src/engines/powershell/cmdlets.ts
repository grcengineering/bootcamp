/**
 * Taught-subset cmdlet implementations (web ISA ISC-63/64).
 *
 * Each cmdlet reads the simulated box's typed object stores (module 04 §3: "you go asking
 * the responsible subsystem") and emits PsValue streams. Output text is never produced
 * here — only objects; the formatter renders them, which is what makes any learner
 * property-selection render correctly (DESIGN-INPUTS risk 1 mitigation).
 *
 * Error strings: where a real, documented message exists it is used verbatim. Each such
 * string is locked to a doc-cited fixture — .ci/fixtures/captured/m04-err-*.json (source
 * pwsh-authored, match authored-with-citation) carries the Microsoft Learn citation and
 * powershell-fidelity.test.ts byte-asserts the engine against it, so the FIXTURE is the
 * source of truth and the manifest-lint citation gate covers the provenance (not just a
 * code comment). Where the boundary is the SIM's (not Windows'), the message says so
 * honestly instead of inventing Windows-flavored text.
 */
import type { Arg, Expr } from "./parser";
import {
  display,
  formatDateTime,
  getProp,
  hashGet,
  isPsHash,
  isPsObject,
  looseEquals,
  makeObject,
  compareValues,
  parseDateTime,
  type PsObject,
  type PsValue,
} from "./values";
import { winNormalize, type WinVfs } from "./vfs";
import type { WindowsSeed } from "./types";

export class CmdletError extends Error {}

export interface Host {
  seed: WindowsSeed;
  vfs: WinVfs;
  cwd: string;
  cols: number;
  /** The exact input line being executed (file provenance, ISC-126). */
  currentLine: string;
  scriptDepth: number;
}

export interface CmdletResult {
  values: PsValue[];
  /** Collection-semantics queries (logs, group membership, unfiltered volumes) keep
   *  array shape under member access — the committed lab bundles require it. */
  collection: boolean;
}

export interface CmdletCtx {
  host: Host;
  evalValue: (e: Expr) => PsValue;
}

type Cmdlet = (ctx: CmdletCtx, args: Arg[], input: CmdletResult | null) => CmdletResult;

// ---------------------------------------------------------------------------------------
// argument plumbing

interface ArgSpec { value?: string[]; switch?: string[] }
interface ReadArgs { named: Map<string, Expr>; sw: Set<string>; pos: Expr[] }

function readArgs(cmd: string, args: Arg[], spec: ArgSpec): ReadArgs {
  const valueParams = (spec.value ?? []).map((s) => s.toLowerCase());
  const switchParams = (spec.switch ?? []).map((s) => s.toLowerCase());
  const out: ReadArgs = { named: new Map(), sw: new Set(), pos: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.kind === "param") {
      const lower = a.name.toLowerCase();
      if (switchParams.includes(lower)) { out.sw.add(lower); continue; }
      if (!valueParams.includes(lower)) {
        // Real PS 5.1 parameter-binder message (Microsoft Learn, ParameterBindingException).
        // Locked by fixture m04-err-param-notfound (citation + byte-assert).
        throw new CmdletError(`${cmd} : A parameter cannot be found that matches parameter name '${a.name}'.`);
      }
      const next = args[i + 1];
      if (!next || next.kind !== "val") {
        // Locked by fixture m04-err-param-missingarg (citation + byte-assert).
        throw new CmdletError(`${cmd} : Missing an argument for parameter '${a.name}'.`);
      }
      out.named.set(lower, next.value);
      i++;
      continue;
    }
    out.pos.push(a.value);
  }
  return out;
}

function asText(v: PsValue): string {
  return display(v);
}

function noPipelineInput(cmd: string, input: CmdletResult | null): void {
  if (input !== null) {
    throw new CmdletError(`${cmd} : this lab's taught subset does not pipe input into ${cmd}.`);
  }
}

function requireInput(cmd: string, input: CmdletResult | null): CmdletResult {
  if (input === null) {
    throw new CmdletError(`${cmd} : this lab's taught subset uses ${cmd} as a pipeline stage (pipe Get-* output into it).`);
  }
  return input;
}

/** Seed scalars that look like ISO local datetimes become typed datetimes. */
function seedValue(v: string | number | boolean): PsValue {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) return parseDateTime(v);
  return v;
}

// ---------------------------------------------------------------------------------------
// evidence cmdlets (the named subsystems)

const getBitLockerVolume: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Get-BitLockerVolume", input);
  const r = readArgs("Get-BitLockerVolume", args, { value: ["MountPoint"] });
  const toObj = (v: WindowsSeed["bitlockerVolumes"][number]): PsObject =>
    makeObject("BitLockerVolume", [
      ["MountPoint", v.MountPoint],
      ["VolumeType", v.VolumeType],
      ["VolumeStatus", v.VolumeStatus],
      ["EncryptionPercentage", v.EncryptionPercentage],
    ]);
  const mp = r.named.get("mountpoint");
  if (mp === undefined) {
    return { values: ctx.host.seed.bitlockerVolumes.map(toObj), collection: true };
  }
  const want = asText(ctx.evalValue(mp)).replace(/:$/, "").toLowerCase();
  const hit = ctx.host.seed.bitlockerVolumes.find(
    (v) => v.MountPoint.replace(/:$/, "").toLowerCase() === want,
  );
  if (!hit) {
    // Win32 ERROR_INVALID_DRIVE text (Microsoft Learn, system error codes).
    // Locked by fixture m04-err-bitlocker-baddrive (citation + byte-assert).
    throw new CmdletError("Get-BitLockerVolume : The system cannot find the drive specified.");
  }
  return { values: [toObj(hit)], collection: false };
};

const getMpComputerStatus: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Get-MpComputerStatus", input);
  readArgs("Get-MpComputerStatus", args, {});
  const entries: Array<[string, PsValue]> = Object.entries(ctx.host.seed.defenderStatus).map(
    ([k, v]) => [k, seedValue(v)],
  );
  return { values: [makeObject("MSFT_MpComputerStatus", entries)], collection: false };
};

const getWinEvent: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Get-WinEvent", input);
  const r = readArgs("Get-WinEvent", args, { value: ["FilterHashtable", "MaxEvents"] });
  const fhExpr = r.named.get("filterhashtable");
  if (fhExpr === undefined) {
    throw new CmdletError(
      "Get-WinEvent : this lab's taught subset queries the log via -FilterHashtable @{ LogName='Security'; Id=4625 }.",
    );
  }
  const fh = ctx.evalValue(fhExpr);
  if (!isPsHash(fh)) {
    throw new CmdletError("Get-WinEvent : -FilterHashtable takes a hashtable literal: @{ LogName='Security'; Id=4625 }.");
  }
  for (const [k] of fh.entries) {
    if (!["logname", "id"].includes(k.toLowerCase())) {
      throw new CmdletError(`Get-WinEvent : filter key '${k}' is not in this lab's taught subset (LogName, Id).`);
    }
  }
  const logName = fh.entries.length ? hashGet(fh, "LogName") : undefined;
  if (logName === undefined) {
    throw new CmdletError("Get-WinEvent : this lab's taught subset queries the log via -FilterHashtable @{ LogName='Security'; Id=4625 }.");
  }
  if (asText(logName).toLowerCase() !== "security") {
    // Real Get-WinEvent message shape (Microsoft Learn, Get-WinEvent reference).
    // Locked by fixture m04-err-winevent-nolog (citation + byte-assert).
    throw new CmdletError(`Get-WinEvent : There is not an event log on the localhost computer that matches "${asText(logName)}".`);
  }
  const idFilter = hashGet(fh, "Id");
  let events = [...ctx.host.seed.securityLog]
    .map((e) => ({ ...e, dt: parseDateTime(e.TimeCreated) }))
    .sort((a, b) => b.dt.ms - a.dt.ms);
  if (idFilter !== undefined) {
    events = events.filter((e) => looseEquals(e.Id, idFilter));
  }
  const maxExpr = r.named.get("maxevents");
  if (maxExpr !== undefined) {
    const n = ctx.evalValue(maxExpr);
    if (typeof n !== "number" || n < 1) {
      throw new CmdletError("Get-WinEvent : Cannot validate argument on parameter 'MaxEvents'.");
    }
    events = events.slice(0, n);
  }
  if (events.length === 0) {
    // Real Get-WinEvent message (Microsoft Learn, Get-WinEvent reference).
    throw new CmdletError("Get-WinEvent : No events were found that match the specified selection criteria.");
  }
  return {
    values: events.map((e) =>
      makeObject("EventLogRecord", [
        ["TimeCreated", e.dt],
        ["Id", e.Id],
        ["LevelDisplayName", e.LevelDisplayName],
        ["ProviderName", e.ProviderName],
        ["Message", e.Message],
      ]),
    ),
    collection: true,
  };
};

const getLocalGroupMember: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Get-LocalGroupMember", input);
  const r = readArgs("Get-LocalGroupMember", args, { value: ["Group"] });
  const gExpr = r.named.get("group") ?? r.pos[0];
  if (gExpr === undefined) {
    throw new CmdletError("Get-LocalGroupMember : name the group to read: Get-LocalGroupMember -Group Administrators.");
  }
  const gname = asText(ctx.evalValue(gExpr));
  const key = Object.keys(ctx.host.seed.localGroups).find((k) => k.toLowerCase() === gname.toLowerCase());
  if (key === undefined) {
    // Real message shape (Microsoft Learn, Get-LocalGroupMember reference).
    // Locked by fixture m04-err-localgroup-nogroup (citation + byte-assert).
    throw new CmdletError(`Get-LocalGroupMember : Group ${gname} was not found.`);
  }
  return {
    values: ctx.host.seed.localGroups[key].map((m) =>
      makeObject("LocalPrincipal", [
        ["ObjectClass", m.ObjectClass],
        ["Name", m.Name],
        ["PrincipalSource", m.PrincipalSource],
      ]),
    ),
    collection: true,
  };
};

const HIVES: Record<string, string> = {
  HKCU: "HKEY_CURRENT_USER",
  HKLM: "HKEY_LOCAL_MACHINE",
};

const getItemProperty: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Get-ItemProperty", input);
  const r = readArgs("Get-ItemProperty", args, { value: ["Path", "Name"] });
  const pExpr = r.named.get("path") ?? r.pos[0];
  if (pExpr === undefined) {
    throw new CmdletError("Get-ItemProperty : name the registry path to read, e.g. Get-ItemProperty 'HKCU:\\Control Panel\\Desktop'.");
  }
  const path = asText(ctx.evalValue(pExpr));
  const key = Object.keys(ctx.host.seed.registry).find((k) => k.toLowerCase() === path.toLowerCase());
  if (key === undefined) {
    // Real provider message shape (Microsoft Learn, Get-ItemProperty reference).
    // Locked by fixture m04-err-itemproperty-nopath (citation + byte-assert).
    throw new CmdletError(`Get-ItemProperty : Cannot find path '${path}' because it does not exist.`);
  }
  const values = ctx.host.seed.registry[key];
  const drive = key.split(":")[0].toUpperCase();
  const expanded = `${HIVES[drive] ?? drive}${key.slice(drive.length + 1)}`;
  const lastSep = expanded.lastIndexOf("\\");
  const provider = "Microsoft.PowerShell.Core\\Registry";
  const psProps: Array<[string, PsValue]> = [
    ["PSPath", `${provider}::${expanded}`],
    ["PSParentPath", `${provider}::${expanded.slice(0, lastSep)}`],
    ["PSChildName", expanded.slice(lastSep + 1)],
    ["PSDrive", drive],
    ["PSProvider", provider],
  ];
  const nExpr = r.named.get("name");
  let picked: Array<[string, PsValue]>;
  if (nExpr !== undefined) {
    const want = asText(ctx.evalValue(nExpr));
    const hit = Object.keys(values).find((k) => k.toLowerCase() === want.toLowerCase());
    if (hit === undefined) {
      // Real provider message shape (Microsoft Learn, registry provider errors).
      // Locked by fixture m04-err-itemproperty-noprop (citation + byte-assert).
      throw new CmdletError(`Get-ItemProperty : Property ${want} does not exist at path ${expanded}.`);
    }
    picked = [[hit, seedValue(values[hit])]];
  } else {
    picked = Object.entries(values).map(([k, v]) => [k, seedValue(v)]);
  }
  return {
    values: [makeObject("System.Management.Automation.PSCustomObject", [...picked, ...psProps])],
    collection: false,
  };
};

const gpresult: Cmdlet = (ctx, args, input) => {
  noPipelineInput("gpresult", input);
  const flags = args.map((a) => (a.kind === "val" ? asText(ctx.evalValue(a.value)) : `-${a.name}`));
  if (flags.length === 1 && flags[0].toLowerCase() === "/r") {
    return { values: [ctx.host.seed.gpresultReport], collection: false };
  }
  // Real gpresult.exe invalid-syntax error shape (Microsoft Learn, gpresult command reference).
  throw new CmdletError('ERROR: Invalid syntax.\nType "GPRESULT /?" for usage.');
};

// ---------------------------------------------------------------------------------------
// pipeline verbs

const selectObject: Cmdlet = (ctx, args, input) => {
  const inp = requireInput("Select-Object", input);
  const r = readArgs("Select-Object", args, { value: ["Property"] });
  const propExpr = r.named.get("property") ?? r.pos[0];
  if (propExpr === undefined) {
    throw new CmdletError("Select-Object : name the properties to keep, e.g. Select-Object MountPoint, VolumeStatus.");
  }
  const list = propExpr.t === "arr" ? propExpr.items : [propExpr];
  const names = list.map((e) => asText(ctx.evalValue(e)));
  return {
    values: inp.values.map((v) => {
      if (!isPsObject(v)) return v;
      return makeObject(
        `Selected.${v.typeName}`,
        names.map((n) => {
          const hit = getProp(v, n);
          return [hit ? hit.name : n, hit ? hit.value : null] as [string, PsValue];
        }),
      );
    }),
    collection: inp.collection,
  };
};

const whereObject: Cmdlet = (ctx, args, input) => {
  const inp = requireInput("Where-Object", input);
  const r = readArgs("Where-Object", args, {});
  const sb = r.pos[0];
  if (!sb || sb.t !== "sb") {
    throw new CmdletError("Where-Object : this lab's taught subset takes a filter block: Where-Object { $_.Property -eq value }.");
  }
  const want = sb.value === null ? null : ctx.evalValue(sb.value);
  const keep = (v: PsValue): boolean => {
    if (!isPsObject(v)) return false;
    const pv = getProp(v, sb.prop)?.value ?? null;
    switch (sb.op) {
      case null:
        return pv !== null && pv !== false && pv !== 0 && pv !== "";
      case "eq": return looseEquals(pv, want);
      case "ne": return !looseEquals(pv, want);
      case "gt": return compareValues(pv, want) > 0;
      case "ge": return compareValues(pv, want) >= 0;
      case "lt": return compareValues(pv, want) < 0;
      case "le": return compareValues(pv, want) <= 0;
      case "like": return likeMatch(pv, want);
      default: return !likeMatch(pv, want); // notlike (parser admits no other op)
    }
  };
  return { values: inp.values.filter(keep), collection: inp.collection };
};

function likeMatch(v: PsValue, pattern: PsValue): boolean {
  const re = new RegExp(
    "^" + display(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    "i",
  );
  return re.test(display(v));
}

const sortObject: Cmdlet = (ctx, args, input) => {
  const inp = requireInput("Sort-Object", input);
  const r = readArgs("Sort-Object", args, { value: ["Property"], switch: ["Descending"] });
  const propExpr = r.named.get("property") ?? r.pos[0];
  if (propExpr === undefined) {
    throw new CmdletError("Sort-Object : name the property to sort on, e.g. Sort-Object TimeCreated.");
  }
  const prop = asText(ctx.evalValue(propExpr));
  const dir = r.sw.has("descending") ? -1 : 1;
  const keyed = inp.values.map((v, i) => ({
    v,
    i,
    key: isPsObject(v) ? getProp(v, prop)?.value ?? null : null,
  }));
  keyed.sort((a, b) => dir * compareValues(a.key, b.key) || a.i - b.i);
  return { values: keyed.map((k) => k.v), collection: inp.collection };
};

// ---------------------------------------------------------------------------------------
// export surfaces (the machine-readable record, module 04 §5.4)

/**
 * Canon JSON shape: 2-space indent, scalar arrays inline — the byte shape of the module's
 * §5.4 block and the committed lab bundles (labs/setup.sh, sample-bundle-compliant.json).
 * DELIBERATE DIVERGENCE from real PS 5.1 ConvertTo-Json (4-space, exploded arrays), which
 * matches neither canon source (DESIGN-INPUTS fidelity note 2; fixture notes carry this).
 */
export function toCanonJson(v: PsValue, indent = 0): string {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map((x) => toCanonJson(x, indent)).join(", ")}]`;
  if (isPsObject(v) || isPsHash(v)) {
    const pad = " ".repeat(indent + 2);
    const body = v.entries
      .map(([k, val]) => `${pad}${JSON.stringify(k)}: ${toCanonJson(val, indent + 2)}`)
      .join(",\n");
    return `{\n${body}\n${" ".repeat(indent)}}`;
  }
  return JSON.stringify(formatDateTime(v)); // datetime
}

const convertToJson: Cmdlet = (ctx, args, input) => {
  const inp = requireInput("ConvertTo-Json", input);
  const r = readArgs("ConvertTo-Json", args, { value: ["Depth"] });
  const depth = r.named.get("depth");
  if (depth !== undefined) ctx.evalValue(depth); // accepted, not needed at the taught depth
  if (inp.values.length === 0) return { values: [], collection: false };
  const v: PsValue = inp.values.length === 1 ? inp.values[0] : inp.values;
  return { values: [toCanonJson(v)], collection: false };
};

function csvCell(v: PsValue): string {
  let text: string;
  if (v === null) text = "";
  else if (Array.isArray(v)) text = "System.Object[]"; // real PS 5.1 behavior — see fixture note
  else if (isPsHash(v)) text = "System.Collections.Hashtable";
  else text = display(v);
  return `"${text.replace(/"/g, '""')}"`;
}

const exportCsv: Cmdlet = (ctx, args, input) => {
  const inp = requireInput("Export-Csv", input);
  const r = readArgs("Export-Csv", args, { value: ["Path"], switch: ["NoTypeInformation"] });
  const pExpr = r.named.get("path") ?? r.pos[0];
  if (pExpr === undefined) {
    throw new CmdletError("Export-Csv : name the output file, e.g. Export-Csv bundle.csv -NoTypeInformation.");
  }
  const objs = inp.values.filter(isPsObject);
  if (objs.length === 0) {
    throw new CmdletError("Export-Csv : the pipeline carried no objects to export.");
  }
  const header = objs[0].entries.map(([k]) => k);
  const lines: string[] = [];
  if (!r.sw.has("notypeinformation")) lines.push(`#TYPE ${objs[0].typeName}`);
  lines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));
  for (const o of objs) {
    lines.push(header.map((h) => csvCell(getProp(o, h)?.value ?? null)).join(","));
  }
  const path = asText(ctx.evalValue(pExpr));
  ctx.host.vfs.write(path, ctx.host.cwd, lines.join("\r\n") + "\r\n", ctx.host.currentLine);
  return { values: [], collection: false };
};

// ---------------------------------------------------------------------------------------
// file inspection (confirming the deliverables exist and contain the readings)

const getContent: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Get-Content", input);
  const r = readArgs("Get-Content", args, { value: ["Path"] });
  const pExpr = r.named.get("path") ?? r.pos[0];
  if (pExpr === undefined) {
    throw new CmdletError("Get-Content : name the file to read, e.g. Get-Content bundle.json.");
  }
  const path = asText(ctx.evalValue(pExpr));
  const content = ctx.host.vfs.read(path, ctx.host.cwd);
  if (content === null) {
    // Real provider message shape (Microsoft Learn, Get-Content reference).
    // Locked by fixture m04-err-getcontent-nopath (citation + byte-assert).
    throw new CmdletError(`Get-Content : Cannot find path '${winNormalize(path, ctx.host.cwd)}' because it does not exist.`);
  }
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return { values: lines, collection: true };
};

const testPath: Cmdlet = (ctx, args, input) => {
  noPipelineInput("Test-Path", input);
  const r = readArgs("Test-Path", args, { value: ["Path"] });
  const pExpr = r.named.get("path") ?? r.pos[0];
  if (pExpr === undefined) {
    throw new CmdletError("Test-Path : name the path to test, e.g. Test-Path bundle.json.");
  }
  return { values: [ctx.host.vfs.exists(asText(ctx.evalValue(pExpr)), ctx.host.cwd)], collection: false };
};

// ---------------------------------------------------------------------------------------
// dispatch

export const CMDLETS: Record<string, { canonical: string; run: Cmdlet }> = {
  "get-bitlockervolume": { canonical: "Get-BitLockerVolume", run: getBitLockerVolume },
  "get-mpcomputerstatus": { canonical: "Get-MpComputerStatus", run: getMpComputerStatus },
  "get-winevent": { canonical: "Get-WinEvent", run: getWinEvent },
  "get-localgroupmember": { canonical: "Get-LocalGroupMember", run: getLocalGroupMember },
  "get-itemproperty": { canonical: "Get-ItemProperty", run: getItemProperty },
  "gpresult": { canonical: "gpresult", run: gpresult },
  "select-object": { canonical: "Select-Object", run: selectObject },
  "where-object": { canonical: "Where-Object", run: whereObject },
  "sort-object": { canonical: "Sort-Object", run: sortObject },
  "convertto-json": { canonical: "ConvertTo-Json", run: convertToJson },
  "export-csv": { canonical: "Export-Csv", run: exportCsv },
  "get-content": { canonical: "Get-Content", run: getContent },
  "test-path": { canonical: "Test-Path", run: testPath },
};

export const ALIASES: Record<string, string> = {
  select: "select-object",
  where: "where-object",
  sort: "sort-object",
  cat: "get-content",
  type: "get-content",
  gc: "get-content",
};

/** Verbs whose cmdlets mutate state — outside the read-only evidence session (module 04 §4.8). */
export const MUTATING_VERBS = [
  "set", "new", "remove", "enable", "disable", "stop", "start", "add", "clear", "rename", "restart",
];
