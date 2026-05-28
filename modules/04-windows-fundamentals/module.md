# Module 04 — Windows Fundamentals

*Loop stage: LOCATE. Original content. Tier-1 Foundations, role-split by fleet (the Windows half of endpoint evidence; macOS is Module 03). On a Windows fleet, PowerShell is simultaneously the administrator's language and the GRC engineer's evidence-collection instrument — this module teaches it as the second of those two, and only enough of the first to make the second honest.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-Windows colleague, why a Windows endpoint keeps the truth of its security state in named subsystems (the registry, the Security event log, BitLocker, Defender, policy) rather than in scattered files — and what that means for *where you go to evidence a control*.
2. **Describe** the PowerShell pipeline as a stream of typed objects (not text), and trace how a `Get-*` command's output flows into the next stage with its properties intact.
3. **Navigate** a live Windows endpoint's compliance-relevant state from the shell — disk encryption, antimalware posture, the effective screen-lock policy, recent failed sign-ins, and who holds local administrator rights — naming the subsystem each answer comes from.
4. **Compose** a single `Get-*` query that selects exactly the properties a control cares about and shapes them into a structured record, and **explain** why selecting properties (not screen-scraping text) is what makes the evidence durable.
5. **Diagnose** whether a control finding is a real failure, a collection error, or an "evaluated but not applicable" result — distinguishing "the endpoint is non-compliant" from "I couldn't read the endpoint."
6. **Produce** a re-runnable PowerShell script that collects a Windows endpoint compliance bundle, maps each reading to a named control (SOC 2 CC6), and exports it to machine-readable JSON/CSV — and **explain** the SOC 2 CC6 claim each field is evidence *for*.
7. **Map** the difference between on-premises Active Directory and cloud Entra ID identity, and state which endpoint controls are enforced locally versus by conditional-access policy in the cloud.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on to APIs (Module 06).

---

## 2. Why this matters for GRC

This module lives at the **LOCATE** stage of the loop: before you can query, evaluate, or evidence a control, you have to know *where the truth of the claim physically sits*. On a Windows fleet, claims like "every laptop is encrypted," "endpoint protection is on and current," "the screen locks itself," and "no one has standing local-admin rights they shouldn't" are not stored in one file you can `cat`. They live in distinct subsystems — BitLocker, Defender, the policy engine, the local account database, the Security event log — and PowerShell is the one instrument that can interrogate all of them and hand each answer back as a structured object you can keep. Learning Windows here is not learning to *administer* Windows; it is learning to reach into a Windows endpoint, ask it the exact question a control asks, and walk away with proof. Everything later in the curriculum — APIs that pull the same posture from an MDM at fleet scale, policy-as-code that judges it, evidence pipelines that store it — is this same act of locating control-truth, scaled off the single machine.

---

## 3. The Mental Model

Start with the question that makes the whole module click: **on a Windows machine, where does the answer to a control question actually live?**

On a Unix box (Module 02) the instinct is "it's a file" — `/etc/ssh/sshd_config`, `/var/log/auth.log`. Windows breaks that instinct on purpose, and you have to replace it rather than fight it. Windows keeps its operating state in a small number of **named subsystems**, each of which is a managed component with its own job, its own data, and its own way of being asked. Encryption status is owned by **BitLocker**. Antimalware health is owned by **Defender**. Security-relevant happenings — every sign-in, every failure, every privilege use — are written, as structured records, into the **Security event log**. The rules a machine has been *told* to follow (lock the screen after N minutes, require a password) are resolved by the **policy engine** and ultimately reflected in the **registry**, Windows' single hierarchical settings database. Who is allowed to do administrative things is held in the **local account database** and, increasingly, decided in the cloud. The mental shift is this: *you do not go looking for a file; you go asking the responsible subsystem.* The first competence on Windows is knowing which subsystem owns the claim you're trying to evidence.

Now, how do you ask? Through **PowerShell** — and the single idea you must internalize about PowerShell is that **it pipes objects, not text.** This is the cleanest break from the Unix shell you learned in Module 01. There, a pipe carried a stream of characters and the next program had to re-parse those characters to find the field it wanted. PowerShell carries a stream of **objects**: structured things with named **properties** already attached. When you run a command that asks BitLocker about a drive, what comes back is not a paragraph of text describing the drive — it is an object whose `.VolumeStatus` property *is* the encryption state and whose `.MountPoint` property *is* the drive letter. When you send that object down a pipe, the next stage receives it with every property intact and can pick the ones it wants by name. You never write a regex to find the encryption status inside a line of output; you ask the object for its `VolumeStatus` property. Hold this distinction — *text streams force you to parse, object streams let you select* — and most of PowerShell stops being syntax to memorize.

There is a naming convention that turns this from a pile of trivia into something you can navigate without a manual. Almost every PowerShell command is a **Verb-Noun** pair: a verb saying what you're doing and a noun saying what you're doing it to. The verbs are drawn from an approved, small list, and the most important one for a GRC engineer is **`Get-`** — it reads, it never changes anything, and it is therefore *safe to run on a production endpoint while collecting evidence.* `Get-BitLockerVolume` reads encryption state. `Get-MpComputerStatus` reads Defender's status ("Mp" is Defender's old "Malware Protection" lineage). `Get-WinEvent` reads the event logs. The discipline this convention enables is the heart of the module: **an evidence collector is a script made almost entirely of `Get-` commands** — it observes the machine and writes down what it sees, and it changes nothing, because evidence collection that mutates the thing it's measuring is not evidence, it's an intervention.

The last piece of the model is the part that trips up every newcomer who treats a Windows endpoint as an island: **not all of a control's truth is on the machine.** Historically, who you are and what you're allowed to do came from **Active Directory** — an on-premises directory service, a server in a closet that the laptop trusts. Today, identity has largely moved to the cloud as **Entra ID**, and with it moved a whole class of controls. Whether a sign-in required a second factor, whether an untrusted location was blocked, whether a non-compliant device was refused access — those decisions are made by **conditional-access policy in the cloud at the moment of sign-in**, and the *evidence* for them lives in the cloud's logs, not in the endpoint's registry. So a complete Windows control story has two halves: the **locally-enforced** half you collect from the endpoint with `Get-` (encryption, the local antimalware engine, the screen-lock setting, local-admin membership, the endpoint's own record of failed logons), and the **cloud-enforced** half you collect later via API from Entra ID (conditional access, MFA enforcement, device-compliance gating). This module owns the local half and teaches you exactly where the seam is, so you never claim an endpoint script proved something only the cloud could.

So the full picture: a control makes a **claim**; the claim's truth is owned by a named **subsystem**; you ask that subsystem with a `Get-` command in **PowerShell**; the answer comes back as an **object** whose **properties** you select; you shape those properties into a record and label each one with the control it evidences; and you stay honest about which claims the endpoint can prove and which belong to **Entra ID** in the cloud. That is endpoint evidence collection on Windows, and it is mechanical once the model is in place.

---

## 4. Concepts

### 4.1 The pipeline carries objects, and you select properties by name

Run a `Get-` command and you get back one or more objects, each with named properties. The operation you will use constantly is selecting just the properties a control cares about:

```powershell
Get-BitLockerVolume | Select-Object MountPoint, VolumeStatus, EncryptionPercentage
```

`Get-BitLockerVolume` emits one object per volume; the pipe hands those objects to `Select-Object`, which keeps only the three named properties and drops the rest. You did not parse anything — you named the fields you wanted. This is why a property selection written today still works after a Windows update redraws the console output: you bound to the *property*, not to the *text layout*.

### 4.2 BitLocker — the disk-encryption subsystem (the encryption claim)

The control claim "this laptop is encrypted at rest" is owned by BitLocker, and you read it with `Get-BitLockerVolume`. The property that decides the claim is `VolumeStatus`: the value `FullyEncrypted` means the volume's encryption is complete and the claim is satisfied; values like `EncryptionInProgress` or `FullyDecrypted` mean it is not (yet) satisfied. The operating-system drive is the one that matters for the "laptop is encrypted" control — a machine with an encrypted USB stick but a plaintext C: drive fails the control. Read it, don't assume it.

### 4.3 Defender — the antimalware subsystem (the endpoint-protection claim)

The claim "endpoint protection is running and current" is owned by Defender, read with `Get-MpComputerStatus`. One command returns a single status object with the properties a control needs: `AntivirusEnabled` (is real-time protection actually on), `RealTimeProtectionEnabled`, and the signature-age fields that tell you whether definitions are current rather than weeks stale. The GRC subtlety: "installed" is not "enabled," and "enabled" is not "up to date." A control that only checks installation passes a machine whose protection was switched off in January — so you evidence the *enabled* and *current* properties, not mere presence.

### 4.4 The registry and policy — the screen-lock claim (effective vs intended)

Settings such as "the screen locks after inactivity" are configured by policy and ultimately reflected in the **registry**, Windows' hierarchical settings database (keys and values, like a tree of folders holding typed settings). The screen-lock timeout lives in a known registry value you can read directly, and the *intended* policy can be inspected with the policy-resolution tooling (`gpresult` produces a report of what Group Policy has told the machine to do). The distinction a GRC engineer must hold: **what was intended (the policy) is not always what is effective (the value actually in force).** A policy can be set centrally and yet not have applied to a given endpoint. The defensible evidence is the *effective* value on the machine, read from the registry — what the endpoint is actually doing, not what someone meant for it to do.

### 4.5 The Security event log — the failed-logon claim (events as evidence)

Windows writes security-relevant happenings as structured records into the **Security event log**, queried with `Get-WinEvent`. Each record is an object with an `Id` (the event type — a failed sign-in has its own well-known event ID), a `TimeCreated`, and a message. The control question "are there signs of unauthorized access attempts" becomes: pull the recent failed-logon events and look at how many there are and when. The key reframe from Module 01 carries over here — *the log is just structured data you query*, except now the records arrive as objects with typed fields instead of lines of text, so you filter by `Id` and read `TimeCreated` directly rather than grepping a file. A handful of failures is normal human typo noise; a burst is a signal, and a control can be written to flag when the count crosses a threshold.

### 4.6 Local administrators — the standing-privilege claim

The claim "local-admin rights are limited to who should have them" is read from the local account database with `Get-LocalGroupMember -Group Administrators`, which returns one object per member of the local Administrators group. The control isn't satisfied by a count; it's satisfied by the *membership matching an approved list*. This is the cleanest example of why evidence and evaluation are different loop stages: the endpoint can only tell you *who is in the group* (LOCATE/QUERY); deciding whether that membership is *correct* requires comparing it to an authoritative approved list (EVALUATE) — which is why the collector's job is to faithfully record the membership, and the policy layer's job is to judge it.

### 4.7 Active Directory vs Entra ID — drawing the seam honestly

`Get-` commands on the endpoint can prove the locally-enforced controls: encryption, the local Defender engine, the effective screen-lock value, the endpoint's own failed-logon records, local-admin membership. They **cannot** prove cloud-enforced controls. Whether multi-factor authentication was required, whether a sign-in from an untrusted location was blocked, whether a non-compliant device was refused — those are decided by **conditional-access policy in Entra ID at sign-in time**, and their evidence lives in the cloud's sign-in logs, reachable later by API (Module 06). The professional move is to label your endpoint bundle as covering the *local* half and to name the *cloud* half explicitly as out of scope for an endpoint script — never to let a reader infer that "the laptop script checked MFA," because it structurally cannot.

### 4.8 Read-only by construction — why an evidence collector is all `Get-`

An evidence collector should observe and never alter. Built almost entirely from `Get-` commands, it cannot change configuration, cannot disable a protection, cannot rotate a key — by construction it can only read and report. This is not a stylistic preference; it is what lets you run the collector on a live production endpoint during business hours without risk, and it is what makes the output trustworthy as evidence: a measurement that can't perturb the thing it measures.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. PowerShell is shown with representative output; your exact output will differ, and these examples assume an elevated session where required. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 Reading the encryption claim from the responsible subsystem

Control claim: *the operating-system drive is encrypted at rest* (SOC 2 CC6.1 — logical/physical access protections).

```powershell
PS C:\> Get-BitLockerVolume -MountPoint C: | Select-Object MountPoint, VolumeStatus, EncryptionPercentage

MountPoint VolumeStatus   EncryptionPercentage
---------- ------------   --------------------
C:         FullyEncrypted                  100
```

You asked BitLocker — the subsystem that owns the claim — not the filesystem. The answer came back as an object; `Select-Object` kept the three properties the control needs. `VolumeStatus = FullyEncrypted` is the pass condition. Had it read `EncryptionInProgress`, the claim would not yet be satisfied and the difference is in the property value, which is exactly why you record the value and not a yes/no you decided in your head.

### 5.2 One command, the whole endpoint-protection posture

Control claim: *endpoint protection is enabled and current* (SOC 2 CC6.8 — prevention/detection of malicious software).

```powershell
PS C:\> Get-MpComputerStatus | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureAge

AntivirusEnabled RealTimeProtectionEnabled AntivirusSignatureAge
---------------- ------------------------- ---------------------
            True                      True                     1
```

A single object carries the whole posture. `AntivirusEnabled = True` and `RealTimeProtectionEnabled = True` answer "is it on"; `AntivirusSignatureAge = 1` (days) answers "is it current." A control that only checked installation would have missed a machine where these read `False` — which is the entire point of evidencing the *behavioral* properties rather than mere presence.

### 5.3 Failed logons as queried, structured evidence

Control claim: *failed authentication attempts are monitored* (SOC 2 CC6.1). A failed sign-in is recorded in the Security log under a well-known event ID.

```powershell
PS C:\> Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=4625 } -MaxEvents 20 |
        Select-Object TimeCreated, Id

TimeCreated            Id
-----------            --
5/27/2026 9:14:03 PM 4625
5/27/2026 9:13:58 PM 4625
5/27/2026 9:13:50 PM 4625
```

`Get-WinEvent` returned the most recent failed-logon records as objects; you selected the timestamp and the event ID. Three failures in sixteen seconds reads differently from three failures across three days — and because the records are typed objects, a collector can simply count them and a control can flag when the count crosses a threshold. The collector's job is to record the count faithfully; the threshold judgment is the EVALUATE stage.

### 5.4 Shaping a labeled, control-mapped record

The point of collection is a record that an auditor can read without knowing PowerShell. We assemble selected properties into one object and tag each with the control it evidences.

```powershell
PS C:\> [pscustomobject]@{
          Control_CC6_1_Encryption   = (Get-BitLockerVolume -MountPoint C:).VolumeStatus
          Control_CC6_8_Defender     = (Get-MpComputerStatus).AntivirusEnabled
          Control_CC6_1_FailedLogons = (Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625} -MaxEvents 20).Count
        } | ConvertTo-Json

{
  "Control_CC6_1_Encryption": "FullyEncrypted",
  "Control_CC6_8_Defender": true,
  "Control_CC6_1_FailedLogons": 3
}
```

Each field is named for the SOC 2 CC6 control it supports, and `ConvertTo-Json` turns the object into a portable, machine-readable artifact — the exact shape a downstream evidence pipeline (or this module's happy-path test) can parse and evaluate without re-running anything on the endpoint. Notice every command was a `Get-`: the collector observed and changed nothing.

---

## 6. Guided Lab

> Original lab. ~60–75 minutes. Tier-B content (environment-dependent). You need a Windows 10/11 endpoint (the curriculum lab VM, or your own managed Windows machine) and a PowerShell session **run as Administrator** (BitLocker, Defender, the Security log, and local-group membership require elevation). No prior PowerShell experience assumed. *If you are on a macOS fleet, do Module 03 instead and take this one at awareness level.*

**Scenario.** You are asked to produce, from one Windows endpoint, a single machine-readable evidence bundle that an auditor can read against SOC 2 CC6 — proving disk encryption, endpoint-protection posture, the effective screen-lock setting, recent failed-logon activity, and local-administrator membership — and to make it re-runnable so the same machine can be re-evidenced next quarter and compared.

**Tasks.**

1. Open PowerShell **as Administrator**. Run `Get-BitLockerVolume -MountPoint C:` and pipe it to `Select-Object MountPoint, VolumeStatus`. Write down, in words, which subsystem owns the encryption claim and which property decides it. *(Objectives 1, 3)*
2. Run `Get-MpComputerStatus` and select `AntivirusEnabled`, `RealTimeProtectionEnabled`, and a signature-age property. State the difference between "installed," "enabled," and "current," and which property proves each. *(Objectives 3, 4)*
3. Read the **effective** screen-lock timeout from the registry, then run `gpresult` to see the **intended** policy. Write one sentence on why your evidence should cite the effective value, not the intended one. *(Objectives 3, 5)*
4. Use `Get-WinEvent` with a filter for the failed-logon event ID, limited to the last 20 events, and select `TimeCreated`. Count them. *(Objectives 3, 4)*
5. Run `Get-LocalGroupMember -Group Administrators` and select the member names. State why this is LOCATE/QUERY evidence and why deciding "is this membership correct?" is a *different* loop stage. *(Objectives 3, 5)*
6. Assemble the readings from tasks 1–5 into one `[pscustomobject]` whose **field names map to SOC 2 CC6 controls**, then export it two ways: `ConvertTo-Json` to `bundle.json` and `Export-Csv` to `bundle.csv`. Confirm both files exist and contain your readings. *(Objectives 4, 6)*
7. Put the whole sequence into `Collect-EndpointCompliance.ps1`, run it twice, and confirm both runs produce structurally identical bundles (same fields, same control labels). Write one sentence connecting "it produced the same structured bundle twice" to continuous assurance. Then write one more sentence naming **one control this endpoint script cannot prove** and which cloud subsystem owns it. *(Objectives 5, 6, 7)*

**Deliverables:** `bundle.json`, `bundle.csv`, `Collect-EndpointCompliance.ps1`, and a 5–7 sentence written explanation covering: which subsystem owns each control claim; why you selected properties rather than parsed text; why effective beats intended for the screen-lock; what the failed-logon count does and does not prove; why the collector is all `Get-`; and the one control that belongs to Entra ID, not the endpoint.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* Windows endpoint (or a fresh sample posture bundle provided at assessment time), the learner must, unaided and within 40 minutes, deliver:

- A re-runnable PowerShell script that collects a Windows endpoint compliance bundle — disk encryption (BitLocker), endpoint protection (Defender), the effective screen-lock setting, the last 20 failed logons, and local-administrator membership — built **entirely from `Get-` (read-only) commands**, with **each field labeled to a SOC 2 CC6 control**, exported to **both JSON and CSV**, and structurally identical across two consecutive runs.
- A spoken or written walkthrough that correctly: names which subsystem owns each control claim; explains why property selection (not text parsing) makes the evidence durable; distinguishes a real non-compliance from a collection error from a not-applicable result; states the SOC 2 CC6 claim each field is evidence for; and names at least one control the endpoint script cannot prove and the Entra ID subsystem that owns it.

**Rubric** (each row Pass / Not-yet; all must be Pass). See `assessment/rubric.md`.

A "Not-yet" on any row routes the learner back to the specific concept section, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3).

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are for learners who want a different voice or more breadth. None of this is load-bearing — a learner who clicks zero links still meets every objective.*

- **Learn PowerShell in a Month of Lunches, 4th Ed.** — the universally-recommended on-ramp for non-programmers; one short chapter per "lunch." https://www.manning.com/books/learn-powershell-in-a-month-of-lunches-fourth-edition — *use if you want a paced, gentle second pass over §3–§4 (the pipeline and `Get-*`).*
- **Microsoft Learn — Get started with Windows PowerShell** — free, hands-on, authoritative. https://learn.microsoft.com/training/paths/get-started-windows-powershell/ — *use for an interactive drill on the object pipeline and `Select-Object` from §4.1.*
- **Microsoft Learn — SC-900: Security, Compliance & Identity Fundamentals** — covers Entra ID, conditional access, and MFA: the cloud-enforced half this module deliberately scopes out. https://learn.microsoft.com/training/paths/describe-concepts-of-security-compliance-identity/ — *use to fill in the §4.7 seam (Active Directory vs Entra ID, conditional access) before Module 06.*
- **John Savill's PowerShell Master Class (YouTube)** — a long, free, deep video walkthrough of PowerShell for administration. https://www.youtube.com/watch?v=UVUd9_k9C6A — *use if you prefer video and want more breadth on the admin side of §3 than this GRC-scoped module covers.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
