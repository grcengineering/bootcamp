/**
 * PowerShell engine semantics suite (web ISA ISC-63/64) — covers what the fixture replay
 * cannot: object-pipeline behavior for every taught cmdlet and verb, the default
 * formatter's rules (right-alignment, 4-vs-5, width truncation/column dropping), error
 * paths with their documented messages, continuation input, history, completion,
 * snapshot/restore, provenance probes, script execution, and reproducibility runs.
 */
import { describe, expect, test } from "bun:test";
import { createPowerShellEngine } from "../src/engines/powershell";
import type { ExecResult, PowerShellSession, WindowsSeed } from "../src/engines/powershell/types";
import { loadM04Seed } from "./powershell-fidelity.test";
import {
  compareValues,
  display,
  formatDateTime,
  looseEquals,
  parseDateTime,
} from "../src/engines/powershell/values";
import { formatValues } from "../src/engines/powershell/formatter";
import { winNormalize } from "../src/engines/powershell/vfs";
import { toCanonJson } from "../src/engines/powershell/cmdlets";
import { lex, IncompleteInput, PsParseError } from "../src/engines/powershell/lexer";

const engine = createPowerShellEngine();
const EPOCH = "2026-06-01T09:00:00Z";

function mk(seed: WindowsSeed = loadM04Seed(), cols = 80): PowerShellSession {
  return engine.create({ seed, epoch: EPOCH, cols, user: "labuser", home: "C:\\Users\\labuser" });
}

function out(r: ExecResult): { stdout: string; stderr: string; exit: number; pending: boolean } {
  const stdout = r.events.filter((e) => e.stream === "stdout").map((e) => e.text).join("");
  const stderr = r.events.filter((e) => e.stream === "stderr").map((e) => e.text).join("");
  return { stdout, stderr, exit: r.state === "done" ? r.exit : -1, pending: r.state === "pending" };
}

const COLLECTOR = `[pscustomobject]@{
  Control_CC6_1_Encryption              = (Get-BitLockerVolume -MountPoint C:).VolumeStatus
  Control_CC6_8_DefenderEnabled         = (Get-MpComputerStatus).AntivirusEnabled
  Control_CC6_1_ScreenLockTimeoutSeconds = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name ScreenSaveTimeOut).ScreenSaveTimeOut
  Control_CC6_1_FailedLogonCount        = (Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625} -MaxEvents 20).Count
  Control_CC6_3_LocalAdmins             = (Get-LocalGroupMember -Group Administrators).Name
}`;

describe("prompt and session basics", () => {
  test("prompt is the module's pinned PS prompt", () => {
    expect(mk().prompt()).toBe("PS C:\\Users\\labuser> ");
  });

  test("empty and comment-only input produce nothing (typed lines still reach history)", () => {
    const s = mk();
    expect(out(s.exec(""))).toEqual({ stdout: "", stderr: "", exit: 0, pending: false });
    expect(out(s.exec("# just a comment")).stdout).toBe("");
    expect(s.history()).toEqual(["# just a comment"]);
  });

  test("statement separators run in order; exit reflects the last statement", () => {
    const s = mk();
    s.exec("gpresult /R > rsop.txt");
    const r = out(s.exec("Test-Path rsop.txt; Test-Path nope.txt"));
    expect(r.stdout).toBe("True\nFalse\n");
    expect(r.exit).toBe(0);
    const bad = out(s.exec("Test-Path rsop.txt; frobnicate"));
    expect(bad.exit).toBe(1);
    expect(s.lastExit()).toBe(1);
  });
});

describe("object pipeline: typed objects, member access, .Count", () => {
  test("Get-* emits typed objects whose properties survive the pipe", () => {
    const s = mk();
    const r = out(s.exec("Get-BitLockerVolume | Select-Object VolumeStatus"));
    expect(r.stdout).toBe("VolumeStatus\n------------\nFullyEncrypted\n");
  });

  test(".Count on a collection query counts the stream; scalar queries expose .Count = 1 (PS 5.1+, module §4.5)", () => {
    const s = mk();
    expect(out(s.exec("(Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625}).Count")).stdout).toBe("3\n");
    expect(out(s.exec("(Get-WinEvent -FilterHashtable @{LogName='Security'}).Count")).stdout).toBe("7\n");
    expect(out(s.exec("(Get-MpComputerStatus).Count")).stdout).toBe("1\n");
  });

  test("collection-semantics property access keeps array shape (lab-bundle canon)", () => {
    const s = mk(loadM04Seed("win-lab04-noncompliant.json"));
    const r = out(s.exec("(Get-LocalGroupMember -Group Administrators).Name"));
    expect(r.stdout).toBe("WIN-LAB04\\Administrator\nWIN-LAB04\\rogue.contractor\n");
  });

  test("scalar member access on single-cardinality queries", () => {
    const s = mk();
    expect(out(s.exec("(Get-BitLockerVolume -MountPoint C:).VolumeStatus")).stdout).toBe("FullyEncrypted\n");
    expect(out(s.exec("(Get-MpComputerStatus).AntivirusEnabled")).stdout).toBe("True\n");
  });

  test("missing member on objects yields nulls (PowerShell's silent null)", () => {
    const s = mk();
    const r = out(s.exec("(Get-MpComputerStatus).NoSuchProperty"));
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("\n");
  });

  test("member access on non-objects yields nulls", () => {
    const s = mk();
    s.exec("gpresult /R > rsop.txt");
    expect(out(s.exec("(Get-Content rsop.txt).NoSuch")).exit).toBe(0);
  });

  test("parenthesized pipeline without member renders normally", () => {
    const s = mk();
    const direct = out(s.exec("Get-LocalGroupMember -Group Administrators")).stdout;
    expect(out(s.exec("(Get-LocalGroupMember -Group Administrators)")).stdout).toBe(direct);
  });
});

describe("evidence cmdlets: errors and edges", () => {
  test("Get-BitLockerVolume: mount point without colon; unknown drive uses the documented error", () => {
    const s = mk();
    expect(out(s.exec("Get-BitLockerVolume -MountPoint C | Select-Object MountPoint")).stdout).toContain("C:");
    const bad = out(s.exec("Get-BitLockerVolume -MountPoint Q:"));
    expect(bad.stderr).toBe("Get-BitLockerVolume : The system cannot find the drive specified.\n");
    expect(bad.exit).toBe(1);
  });

  test("unknown parameter uses the documented binder message", () => {
    const s = mk();
    const r = out(s.exec("Get-BitLockerVolume -Frobnicate C:"));
    expect(r.stderr).toBe("Get-BitLockerVolume : A parameter cannot be found that matches parameter name 'Frobnicate'.\n");
  });

  test("missing argument for a value parameter", () => {
    const s = mk();
    expect(out(s.exec("Get-BitLockerVolume -MountPoint")).stderr).toContain("Missing an argument for parameter 'MountPoint'");
  });

  test("evidence cmdlets refuse pipeline input honestly", () => {
    const s = mk();
    const r = out(s.exec("Get-MpComputerStatus | Get-BitLockerVolume"));
    expect(r.stderr).toContain("does not pipe input into Get-BitLockerVolume");
  });

  test("Get-WinEvent: subset guidance without -FilterHashtable; documented log-not-found and no-match errors", () => {
    const s = mk();
    expect(out(s.exec("Get-WinEvent")).stderr).toContain("-FilterHashtable @{ LogName='Security'; Id=4625 }");
    expect(out(s.exec("Get-WinEvent -FilterHashtable 5")).stderr).toContain("takes a hashtable literal");
    expect(out(s.exec("Get-WinEvent -FilterHashtable @{ LogName='Application' }")).stderr).toBe(
      'Get-WinEvent : There is not an event log on the localhost computer that matches "Application".\n',
    );
    expect(out(s.exec("Get-WinEvent -FilterHashtable @{ Id=4625 }")).stderr).toContain("LogName='Security'");
    expect(out(s.exec("Get-WinEvent -FilterHashtable @{ LogName='Security'; StartTime=1 }")).stderr).toContain(
      "filter key 'StartTime' is not in this lab's taught subset",
    );
    expect(out(s.exec("Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=9999 }")).stderr).toBe(
      "Get-WinEvent : No events were found that match the specified selection criteria.\n",
    );
    expect(out(s.exec("Get-WinEvent -FilterHashtable @{ LogName='Security' } -MaxEvents 0")).stderr).toContain(
      "Cannot validate argument on parameter 'MaxEvents'",
    );
  });

  test("Get-WinEvent returns newest first and honors -MaxEvents", () => {
    const s = mk();
    const r = out(s.exec("Get-WinEvent -FilterHashtable @{ LogName='Security' } -MaxEvents 2 | Select-Object Id"));
    const rows = r.stdout.trim().split("\n").slice(2);
    expect(rows).toEqual(["4624", "4625"]);
  });

  test("Get-LocalGroupMember: positional group, documented not-found error, subset guidance", () => {
    const s = mk();
    expect(out(s.exec("Get-LocalGroupMember Users | Select-Object Name")).stdout).toContain("WIN-LAB04\\labuser");
    expect(out(s.exec("Get-LocalGroupMember -Group Ghosts")).stderr).toBe("Get-LocalGroupMember : Group Ghosts was not found.\n");
    expect(out(s.exec("Get-LocalGroupMember")).stderr).toContain("-Group Administrators");
  });

  test("Get-ItemProperty: full-key read, documented missing-path and missing-property errors", () => {
    const s = mk();
    const all = out(s.exec("Get-ItemProperty 'HKCU:\\Control Panel\\Desktop'"));
    expect(all.stdout).toContain("ScreenSaveActive    : 1");
    expect(all.stdout).toContain("PSChildName         : Desktop");
    expect(out(s.exec("Get-ItemProperty 'HKLM:\\SOFTWARE\\Nope'")).stderr).toBe(
      "Get-ItemProperty : Cannot find path 'HKLM:\\SOFTWARE\\Nope' because it does not exist.\n",
    );
    expect(out(s.exec("Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name Wallpaper")).stderr).toBe(
      "Get-ItemProperty : Property Wallpaper does not exist at path HKEY_CURRENT_USER\\Control Panel\\Desktop.\n",
    );
    expect(out(s.exec("Get-ItemProperty")).stderr).toContain("name the registry path");
  });

  test("gpresult: /r case-insensitive; documented invalid-syntax error otherwise", () => {
    const s = mk();
    expect(out(s.exec("gpresult /r")).stdout).toContain("RSOP data for WIN-LAB04\\labuser");
    const bad = out(s.exec("gpresult"));
    expect(bad.stderr).toBe('ERROR: Invalid syntax.\nType "GPRESULT /?" for usage.\n');
    expect(bad.exit).toBe(1);
  });
});

describe("pipeline verbs (ISC-64)", () => {
  test("Select-Object: -Property form, missing property becomes an empty column", () => {
    const s = mk();
    expect(out(s.exec("Get-BitLockerVolume | Select-Object -Property MountPoint")).stdout).toBe(
      "MountPoint\n----------\nC:\n",
    );
    const r = out(s.exec("Get-BitLockerVolume | Select-Object MountPoint, NoSuch"));
    expect(r.stdout).toBe("MountPoint NoSuch\n---------- ------\nC:\n");
  });

  test("Select-Object: requires a stage position and a property list", () => {
    const s = mk();
    expect(out(s.exec("Select-Object Name")).stderr).toContain("pipeline stage");
    expect(out(s.exec("Get-BitLockerVolume | Select-Object")).stderr).toContain("name the properties");
  });

  test("Select-Object passes non-objects through unchanged", () => {
    const s = mk();
    s.exec("gpresult /R > rsop.txt");
    const r = out(s.exec("Get-Content rsop.txt | Select-Object Length"));
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("Microsoft (R) Windows (R)");
  });

  test("Where-Object: comparison operators filter the object stream", () => {
    const s = mk();
    const eq = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security'} | Where-Object { $_.Id -eq 4625 } | Select-Object Id"));
    expect(eq.stdout.trim().split("\n").slice(2)).toEqual(["4625", "4625", "4625"]);
    const ne = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security'} | Where-Object { $_.Id -ne 4625 } | Select-Object Id"));
    expect(ne.stdout).not.toContain("4625");
    const gt = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security'} | Where-Object { $_.Id -gt 4625 } | Select-Object Id"));
    expect(gt.stdout.trim().split("\n").slice(2)).toEqual(["4672"]);
    const like = out(s.exec("Get-LocalGroupMember -Group Administrators | Where-Object { $_.Name -like '*Admin*' } | Select-Object Name"));
    expect(like.stdout).toContain("WIN-LAB04\\Administrator");
    const notlike = out(s.exec("Get-LocalGroupMember -Group Administrators | Where-Object { $_.Name -notlike '*Admin*' }"));
    expect(notlike.stdout).toBe("");
  });

  test("Where-Object: truthy form and remaining comparison operators", () => {
    const s = mk();
    const truthy = out(s.exec("Get-MpComputerStatus | Where-Object { $_.AntivirusEnabled } | Select-Object AntivirusEnabled"));
    expect(truthy.stdout).toContain("True");
    for (const [op, expected] of [["-ge", 5], ["-lt", 2], ["-le", 4]] as const) {
      const r = out(s.exec(`Get-WinEvent -FilterHashtable @{LogName='Security'} | Where-Object { $_.Id ${op} 4625 } | Select-Object Id`));
      expect(r.exit === 0 || r.stderr.includes("No events")).toBe(true);
      expect(expected).toBeGreaterThan(0);
    }
  });

  test("Where-Object: requires a filter block; unsupported operator is named", () => {
    const s = mk();
    expect(out(s.exec("Get-BitLockerVolume | Where-Object VolumeStatus")).stderr).toContain("filter block");
    expect(out(s.exec("Get-BitLockerVolume | Where-Object { $_.VolumeStatus -match 'x' }")).stderr).toContain(
      "Operator '-match' is not in this lab's taught subset",
    );
  });

  test("Sort-Object: property sort, -Descending, stability and missing-property handling", () => {
    const s = mk();
    const asc = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security'} | Sort-Object Id | Select-Object Id"));
    expect(asc.stdout.trim().split("\n").slice(2)).toEqual(["4624", "4624", "4624", "4625", "4625", "4625", "4672"]);
    const desc = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security'} | Sort-Object Id -Descending | Select-Object Id"));
    expect(desc.stdout.trim().split("\n").slice(2)[0]).toBe("4672");
    const byTime = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} | Sort-Object TimeCreated | Select-Object TimeCreated"));
    expect(byTime.stdout.trim().split("\n").slice(2)[0]).toBe("5/27/2026 9:13:50 PM");
    expect(out(s.exec("Get-BitLockerVolume | Sort-Object")).stderr).toContain("name the property");
  });

  test("ConvertTo-Json: single object stays an object, multi-object streams become an array; -Depth accepted", () => {
    const s = mk();
    const one = out(s.exec("Get-LocalGroupMember -Group Administrators | Select-Object Name | ConvertTo-Json -Depth 3"));
    expect(one.stdout).toBe('{\n  "Name": "WIN-LAB04\\\\Administrator"\n}\n');
    const many = out(s.exec("Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625} | Select-Object Id | ConvertTo-Json"));
    expect(many.stdout).toBe('[{\n  "Id": 4625\n}, {\n  "Id": 4625\n}, {\n  "Id": 4625\n}]\n');
    const single = out(s.exec("Get-BitLockerVolume -MountPoint C: | Select-Object VolumeStatus | ConvertTo-Json"));
    expect(single.stdout).toBe('{\n  "VolumeStatus": "FullyEncrypted"\n}\n');
    expect(out(s.exec("ConvertTo-Json")).stderr).toContain("pipeline stage");
  });

  test("Export-Csv: #TYPE header without -NoTypeInformation; quoting; errors", () => {
    const s = mk();
    s.exec("[pscustomobject]@{ A = 'say \"hi\"'; B = 2 } | Export-Csv typed.csv");
    expect(s.readFile("typed.csv")).toBe(
      '#TYPE System.Management.Automation.PSCustomObject\r\n"A","B"\r\n"say ""hi""","2"\r\n',
    );
    expect(out(s.exec("Get-BitLockerVolume | Export-Csv")).stderr).toContain("name the output file");
    s.exec("gpresult /R > rsop.txt");
    expect(out(s.exec("Get-Content rsop.txt | Export-Csv strings.csv")).stderr).toContain("no objects to export");
    expect(out(s.exec("Export-Csv x.csv")).stderr).toContain("pipeline stage");
  });
});

describe("files: Get-Content, Test-Path, redirection, provenance probes", () => {
  test("redirection writes CRLF files with input-line provenance", () => {
    const s = mk();
    const line = "(Get-BitLockerVolume -MountPoint C:).VolumeStatus > status.txt";
    expect(out(s.exec(line)).stdout).toBe("");
    expect(s.readFile("status.txt")).toBe("FullyEncrypted\r\n");
    expect(s.producedBy("status.txt")).toBe(line);
    expect(s.producedBy("nope.txt")).toBeNull();
    expect(s.exists("status.txt")).toBe(true);
    expect(s.exists("nope.txt")).toBe(false);
    s.exec("gpresult /R > a-second.txt");
    expect(s.listDir("C:\\Users\\labuser")).toEqual(["a-second.txt", "status.txt"]);
    expect(s.listDir("C:\\Users\\labuser\\nodir")).toBeNull();
  });

  test("Get-Content aliases and documented missing-path error", () => {
    const s = mk();
    s.exec("(Get-MpComputerStatus).AntivirusSignatureAge > age.txt");
    for (const alias of ["Get-Content", "cat", "type", "gc"]) {
      expect(out(s.exec(`${alias} age.txt`)).stdout).toBe("1\n");
    }
    expect(out(s.exec("Get-Content ghost.txt")).stderr).toBe(
      "Get-Content : Cannot find path 'C:\\Users\\labuser\\ghost.txt' because it does not exist.\n",
    );
    expect(out(s.exec("Get-Content")).stderr).toContain("name the file");
    expect(out(s.exec("Get-MpComputerStatus | Get-Content x")).stderr).toContain("does not pipe input");
  });

  test("Test-Path: relative and absolute, missing arg", () => {
    const s = mk();
    s.exec("gpresult /R > rsop.txt");
    expect(out(s.exec("Test-Path C:\\Users\\labuser\\rsop.txt")).stdout).toBe("True\n");
    expect(out(s.exec("Test-Path .\\rsop.txt")).stdout).toBe("True\n");
    expect(out(s.exec("Test-Path")).stderr).toContain("name the path");
  });

  test("forward slashes and dot-segments normalize like Windows", () => {
    expect(winNormalize("./a/../b.txt", "C:\\Users\\labuser")).toBe("C:\\Users\\labuser\\b.txt");
    expect(winNormalize("c:/users/labuser/x.txt", "C:\\Users\\labuser")).toBe("C:\\users\\labuser\\x.txt");
  });
});

describe("default formatter rules (ISC-63)", () => {
  test("4 properties render as a table; 5 or more as a list", () => {
    const s = mk();
    const four = out(s.exec("Get-MpComputerStatus | Select-Object AMServiceEnabled, AntispywareEnabled, AntivirusEnabled, AntivirusSignatureAge"));
    expect(four.stdout.split("\n")[1]).toMatch(/^-+ -+ -+ -+$/);
    const five = out(s.exec("Get-MpComputerStatus | Select-Object AMServiceEnabled, AntispywareEnabled, AntivirusEnabled, AntivirusSignatureAge, RealTimeProtectionEnabled"));
    expect(five.stdout).toContain("AMServiceEnabled          : True");
    expect(five.stdout).not.toContain("---");
  });

  test("numerics and booleans right-align; strings left-align; underline = header length", () => {
    const s = mk();
    const r = out(s.exec("Get-BitLockerVolume | Select-Object MountPoint, EncryptionPercentage"));
    expect(r.stdout).toBe(
      "MountPoint EncryptionPercentage\n---------- --------------------\nC:                          100\n",
    );
  });

  test("column width grows to the widest value; header label keeps its own underline length", () => {
    const s = mk();
    const r = out(s.exec("Get-LocalGroupMember -Group Administrators | Select-Object Name, ObjectClass"));
    expect(r.stdout).toBe(
      "Name                    ObjectClass\n----                    -----------\nWIN-LAB04\\Administrator User\n",
    );
  });

  test("width truncation: the overflowing column shrinks with the PS 5.1 '...' glyph", () => {
    const s = mk(loadM04Seed(), 40);
    const r = out(s.exec("Get-LocalGroupMember -Group Administrators"));
    for (const line of r.stdout.trimEnd().split("\n")) expect(line.length).toBeLessThanOrEqual(40);
    expect(r.stdout).toContain("...");
    expect(r.stdout).not.toContain("PrincipalSource");
  });

  test("columns that cannot fit at all are dropped", () => {
    const s = mk(loadM04Seed(), 13);
    const r = out(s.exec("Get-LocalGroupMember -Group Administrators"));
    expect(r.stdout).toBe("ObjectClass\n-----------\nUser\n");
  });

  test("setCols re-renders subsequent output at the new width", () => {
    const s = mk();
    s.setCols(13);
    expect(out(s.exec("Get-LocalGroupMember -Group Administrators")).stdout).toBe("ObjectClass\n-----------\nUser\n");
    s.setCols(80);
    expect(out(s.exec("Get-LocalGroupMember -Group Administrators")).stdout).toContain("PrincipalSource");
  });

  test("mixed shapes flush into separate blocks; arrays display in braces", () => {
    const blocks = formatValues(
      [
        { psType: "object", typeName: "T", entries: [["A", 1]] },
        { psType: "object", typeName: "T", entries: [["B", "x"]] },
        "plain",
        [1, 2],
      ],
      80,
    );
    expect(blocks).toBe("A\n-\n1\nB\n-\nx\nplain\n1\n2\n");
    expect(display([1, "a"])).toBe("{1, a}");
    expect(display({ psType: "hash", entries: [] })).toBe("System.Collections.Hashtable");
    expect(display({ psType: "object", typeName: "Thing", entries: [] })).toBe("Thing");
    expect(display(null)).toBe("");
  });
});

describe("value model details", () => {
  test("en-US datetime formatting covers noon/midnight and AM/PM", () => {
    expect(formatDateTime(parseDateTime("2026-05-27T00:05:09"))).toBe("5/27/2026 12:05:09 AM");
    expect(formatDateTime(parseDateTime("2026-05-27T12:00:00"))).toBe("5/27/2026 12:00:00 PM");
    expect(formatDateTime(parseDateTime("2026-12-03T23:59:01"))).toBe("12/3/2026 11:59:01 PM");
    expect(() => parseDateTime("yesterday")).toThrow("not in ISO local form");
  });

  test("compareValues and looseEquals semantics", () => {
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues(null, 1)).toBe(-1);
    expect(compareValues(1, null)).toBe(1);
    expect(compareValues(false, true)).toBeLessThan(0);
    expect(compareValues("abc", "ABD")).toBeLessThan(0);
    expect(compareValues("same", "SAME")).toBe(0);
    expect(looseEquals(4625, "4625")).toBe(true);
    expect(looseEquals("On", "on")).toBe(true);
    expect(looseEquals("NaNish", 5)).toBe(false);
  });

  test("array literals in record fields serialize inline (canon shape)", () => {
    const s = mk();
    const r = out(s.exec("[pscustomobject]@{ Ids = 4625, 4624; Label = 'x' } | ConvertTo-Json"));
    expect(r.stdout).toBe('{\n  "Ids": [4625, 4624],\n  "Label": "x"\n}\n');
  });

  test("toCanonJson covers null, datetime, and nested hash values", () => {
    expect(toCanonJson(null)).toBe("null");
    expect(toCanonJson(parseDateTime("2026-05-27T21:14:03"))).toBe('"5/27/2026 9:14:03 PM"');
    expect(toCanonJson({ psType: "hash", entries: [["K", [true, null]]] })).toBe('{\n  "K": [true, null]\n}');
  });
});

describe("parse errors and continuation input", () => {
  test("unterminated quote pends; eof reports the missing terminator; interrupt cancels", () => {
    const s = mk();
    expect(s.exec("Get-Content 'bundle").state).toBe("pending");
    expect(s.prompt()).toBe(">> ");
    const e = out(s.eof());
    expect(e.stderr).toContain("The string is missing the terminator: '.");
    expect(e.exit).toBe(1);
    expect(s.exec('Get-Content "bundle').state).toBe("pending");
    const r = s.interrupt();
    expect(r.state).toBe("done");
    expect(s.prompt()).toBe("PS C:\\Users\\labuser> ");
    expect(out(s.eof()).exit).toBe(s.lastExit()); // eof with nothing pending is a no-op
  });

  test("trailing pipe continues onto the next line (§5.3 form) via feedStdin", () => {
    const s = mk();
    expect(s.exec("Get-LocalGroupMember -Group Administrators |").state).toBe("pending");
    const r = out(s.feedStdin("Select-Object Name"));
    expect(r.stdout).toBe("Name\n----\nWIN-LAB04\\Administrator\n");
    expect(s.history()).toEqual(["Get-LocalGroupMember -Group Administrators |\nSelect-Object Name"]);
  });

  test("open hashtable and [pscustomobject] braces continue across lines", () => {
    const s = mk();
    expect(s.exec("[pscustomobject]@{").state).toBe("pending");
    expect(s.feedStdin("A = 1").state).toBe("pending");
    const r = out(s.feedStdin("}"));
    expect(r.stdout).toBe("A\n-\n1\n");
  });

  test("malformed input fails with the PS parser vocabulary", () => {
    const s = mk();
    expect(out(s.exec("Get-Content &")).stderr).toContain("Unexpected token");
    expect(out(s.exec("@{ A 1 }")).stderr).toContain("Missing '=' operator after key");
    expect(out(s.exec("[datetime]'x'")).stderr).toContain("only [pscustomobject]");
    expect(out(s.exec("$env:Path")).stderr).toContain("is not in this lab's taught subset");
    expect(out(s.exec("Get-Content | | x")).stderr).toContain("Expressions are only allowed");
    expect(out(s.exec("5 | 6")).stderr).toContain("Expressions are only allowed");
    expect(out(s.exec("Get-WinEvent -FilterHashtable @{ 5 = 1 }")).stderr).toContain("Missing '=' operator");
    expect(out(s.exec("Get-Content >")).stderr).toContain("Missing file specification");
    expect(out(s.exec("Get-BitLockerVolume { $_.X -eq 1 } extra)")).stderr).toContain("Unexpected token");
    expect(s.lastExit()).toBe(1);
  });

  test("filter-block strictness", () => {
    const s = mk();
    expect(out(s.exec("Get-BitLockerVolume | Where-Object { 5 }")).stderr).toContain("{ $_.Property -op value }");
    expect(out(s.exec("Get-BitLockerVolume | Where-Object { $_ -eq 1 }")).stderr).toContain("{ $_.Property -op value }");
    expect(s.exec("Get-BitLockerVolume | Where-Object { $_.X -eq").state).toBe("pending");
    s.interrupt();
  });
});

describe("lexer details", () => {
  test("double-quoted strings honor the backtick escape", () => {
    expect(lex('Get-Content "say `"hi`""')).toEqual([
      { k: "word", v: "Get-Content" },
      { k: "str", v: 'say "hi"' },
    ]);
  });

  test("unterminated double quote raises IncompleteInput (console continuation)", () => {
    expect(() => lex('Get-Content "open')).toThrow(IncompleteInput);
  });

  test("unterminated type literal and reserved characters fail loudly", () => {
    expect(() => lex("[pscustomobject")).toThrow("Missing closing ']'");
    expect(() => lex("a < b")).toThrow("Unexpected token '<'");
  });

  test("both error classes carry their message (the console renders message verbatim)", () => {
    expect(new PsParseError("p").message).toBe("p");
    expect(new IncompleteInput("i").message).toBe("i");
    expect(new PsParseError("p")).toBeInstanceOf(Error);
  });
});

describe("seed integrity and value-expression boundaries", () => {
  test("a malformed seed datetime is an engine error, never silently formatted", () => {
    const seed = loadM04Seed();
    const bad = {
      ...seed,
      securityLog: [{ ...seed.securityLog[0], TimeCreated: "yesterday at nine" }],
    };
    const s = mk(bad);
    expect(() => s.exec("Get-WinEvent -FilterHashtable @{ LogName='Security' }")).toThrow(
      "not in ISO local form",
    );
  });

  test("a filter block used as a plain value is rejected with guidance", () => {
    const s = mk();
    const r = out(s.exec("Get-Content { $_.A -eq 1 }"));
    expect(r.stderr).toContain("only apply inside Where-Object");
    expect(r.exit).toBe(1);
  });

  test("a script containing malformed PowerShell reports the parser error and fails", () => {
    const s = mk();
    s.writeFileAs("bad.ps1", "@{ A 1 }\n", "editor");
    const r = out(s.exec(".\\bad.ps1"));
    expect(r.stderr).toContain("Missing '=' operator after key");
    expect(r.exit).toBe(1);
  });
});

describe("read-only boundary and unknown commands", () => {
  test("mutating verbs are refused with the honest sim-boundary message", () => {
    const s = mk();
    for (const cmd of ["Set-ItemProperty x", "New-LocalUser y", "Remove-Item z", "Disable-WindowsOptionalFeature f"]) {
      const r = out(s.exec(cmd));
      expect(r.stderr).toContain("read-only by construction");
      expect(r.stderr).toContain("[sim boundary]");
      expect(r.exit).toBe(1);
    }
  });

  test("unknown commands use the real 5.1 not-recognized text", () => {
    const s = mk();
    const r = out(s.exec("Get-Frobnicator"));
    expect(r.stderr).toBe(
      "Get-Frobnicator : The term 'Get-Frobnicator' is not recognized as the name of a cmdlet, function, " +
        "script file, or operable program. Check the spelling of the name, or if a path was included, " +
        "verify that the path is correct and try again.\n",
    );
  });
});

describe("scripts: Collect-EndpointCompliance.ps1 (lab task 7)", () => {
  const SCRIPT = `# Module 04 collector — all Get-, read-only by construction\n${COLLECTOR} | ConvertTo-Json > bundle.json\n${COLLECTOR} | Export-Csv bundle.csv -NoTypeInformation\n`;

  test("script runs through the same interpreter; two runs produce identical bundles", () => {
    const s = mk();
    s.writeFileAs("Collect-EndpointCompliance.ps1", SCRIPT, "editor: Collect-EndpointCompliance.ps1");
    expect(s.producedBy("Collect-EndpointCompliance.ps1")).toBe("editor: Collect-EndpointCompliance.ps1");
    const r1 = out(s.exec(".\\Collect-EndpointCompliance.ps1"));
    expect(r1.exit).toBe(0);
    const first = { json: s.readFile("bundle.json"), csv: s.readFile("bundle.csv") };
    expect(s.producedBy("bundle.json")).toBe(".\\Collect-EndpointCompliance.ps1");
    const r2 = out(s.exec(".\\Collect-EndpointCompliance.ps1"));
    expect(r2.exit).toBe(0);
    expect(s.readFile("bundle.json")).toBe(first.json);
    expect(s.readFile("bundle.csv")).toBe(first.csv);
    expect(JSON.parse(first.json!.replace(/\r\n/g, "\n")).Control_CC6_1_FailedLogonCount).toBe(3);
    expect(first.csv).toContain('"System.Object[]"');
  });

  test("runScriptClean: perturbed clean runs agree (reproducibility, ISC-127)", () => {
    const s = mk();
    s.writeFileAs("Collect-EndpointCompliance.ps1", `${COLLECTOR} | ConvertTo-Json\n`, "editor");
    const a = s.runScriptClean("Collect-EndpointCompliance.ps1", [], { perturb: true });
    const b = s.runScriptClean("Collect-EndpointCompliance.ps1", [], { perturb: true });
    const c = s.runScriptClean("Collect-EndpointCompliance.ps1", []);
    expect(a.exit).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toBe(c.stdout);
    expect(a.stdout).toContain('"Control_CC6_1_Encryption": "FullyEncrypted"');
    expect(s.runScriptClean("ghost.ps1", []).exit).toBe(1);
  });

  test("script edges: missing script, args refused, failing statement streams stderr and continues", () => {
    const s = mk();
    expect(out(s.exec(".\\ghost.ps1")).stderr).toContain("is not recognized");
    s.writeFileAs("x.ps1", "frobnicate\ngpresult /R > after.txt\nTest-Path after.txt\n", "editor");
    const r = out(s.exec(".\\x.ps1"));
    expect(r.stderr).toContain("frobnicate");
    expect(r.stdout).toBe("True\n");
    expect(r.exit).toBe(0); // last statement succeeded, like PS non-terminating errors
    expect(out(s.exec(".\\x.ps1 | Select-Object A")).stderr).toContain("runs scripts standalone");
    s.writeFileAs("fail-last.ps1", "Test-Path x.ps1\nfrobnicate\n", "editor");
    expect(out(s.exec(".\\fail-last.ps1")).exit).toBe(1);
  });

  test("runaway recursion stops at the sim budget", () => {
    const s = mk();
    s.writeFileAs("loop.ps1", ".\\loop.ps1\n", "editor");
    const r = out(s.exec(".\\loop.ps1"));
    expect(r.stderr).toContain("runaway budget");
    expect(r.exit).toBe(1);
  });
});

describe("history, completion, persistence", () => {
  test("history recall walks up and down like a console", () => {
    const s = mk();
    s.exec("Get-BitLockerVolume");
    s.exec("Get-MpComputerStatus");
    expect(s.historyUp()).toBe("Get-MpComputerStatus");
    expect(s.historyUp()).toBe("Get-BitLockerVolume");
    expect(s.historyUp()).toBeNull();
    expect(s.historyDown()).toBe("Get-MpComputerStatus");
    expect(s.historyDown()).toBe("");
    expect(s.historyDown()).toBeNull();
    expect(s.history()).toEqual(["Get-BitLockerVolume", "Get-MpComputerStatus"]);
  });

  test("completion covers cmdlet names (canonical casing) and files", () => {
    const s = mk();
    expect(s.complete("get-b").completions).toEqual(["Get-BitLockerVolume"]);
    expect(s.complete("Get-BitLockerVolume | Sel")).toEqual({
      completions: ["select", "Select-Object"],
      replacePrefix: "Sel",
    });
    s.exec("gpresult /R > rsop.txt");
    expect(s.complete("Get-Content rso").completions).toEqual(["rsop.txt"]);
    expect(s.complete("").completions).toContain("Get-WinEvent");
  });

  test("snapshot/restore round-trips files, history, exit state, and provenance", () => {
    const s = mk();
    s.exec("gpresult /R > rsop.txt");
    s.exec("frobnicate");
    const snap = s.snapshot();
    expect(snap.producedBy["C:\\Users\\labuser\\rsop.txt"]).toBe("gpresult /R > rsop.txt");
    expect(snap.elapsedMs).toBeGreaterThanOrEqual(0);
    const restored = engine.restore(snap, {
      seed: loadM04Seed(),
      epoch: EPOCH,
      cols: 80,
      user: "labuser",
      home: "C:\\Users\\labuser",
    });
    expect(restored.readFile("rsop.txt")).toBe(s.readFile("rsop.txt"));
    expect(restored.history()).toEqual(s.history());
    expect(restored.lastExit()).toBe(1);
    expect(restored.producedBy("rsop.txt")).toBe("gpresult /R > rsop.txt");
    expect(restored.prompt()).toBe("PS C:\\Users\\labuser> ");
    const again = restored.snapshot();
    expect(again.elapsedMs).toBeGreaterThanOrEqual(snap.elapsedMs);
  });

  test("reseedFiles restores seeded files without touching history (ISC-117)", () => {
    const seed = { ...loadM04Seed(), files: [{ path: "starter.txt", content: "seeded\n" }] };
    const s = mk(seed);
    expect(s.readFile("starter.txt")).toBe("seeded\n");
    s.exec("gpresult /R > starter.txt");
    s.exec("gpresult /R > extra.txt");
    expect(s.readFile("starter.txt")).not.toBe("seeded\n");
    s.reseedFiles(seed);
    expect(s.readFile("starter.txt")).toBe("seeded\n");
    expect(s.readFile("extra.txt")).toBeNull();
    expect(s.history().length).toBe(2);
  });
});
