# Module 03 — macOS Fundamentals

*Loop stage: LOCATE. Original content. Module 03 of the Common Core (Tier 1, role-split by fleet). Conforms to the standard module anatomy. Third-party material is confined to §8. Mac-heavy workforces collect most of their endpoint control-truth from the subsystems taught here.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Map** the seven macOS security subsystems an endpoint control draws on — FileVault, SIP, Gatekeeper, TCC, Keychain, launchd, and MDM/configuration profiles — to the control claim each one carries the truth of.
2. **Explain**, to an auditor with no Mac background, *where* a given endpoint claim ("the disk is encrypted," "the OS is tamper-protected") physically lives on the machine and why that location is authoritative.
3. **Query** each subsystem's live state from the command line using its canonical status tool, and **read** the output well enough to state the control verdict.
4. **Diagnose** the difference between a control that is genuinely *failing* and a check that merely *could not run* (wrong privilege, unmanaged device, tool returned nothing), so a missing answer is never silently scored as a pass.
5. **Compose** the individual subsystem queries into one endpoint compliance-evidence packet, each line labeled to the control it evidences, written to a kept artifact.
6. **Produce** a deterministic evaluation step that turns each raw status string into a machine-readable PASS / FAIL / UNKNOWN verdict, so the packet can be re-run and compared next quarter.

Each objective is checked by the Assessment in §7. If you can already produce the §7 packet unaided against an unseen machine, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

This is a **LOCATE** module. The whole job of a GRC engineer is to take a claim about a system and find where the truth of that claim physically lives, then reach it programmatically. On a Mac fleet, the claims an auditor cares about — "laptops are encrypted," "the operating system can't be quietly tampered with," "only notarized software runs," "an app can't read the camera without consent," "the device is centrally managed" — are not stored in a spreadsheet someone fills in. They are *states held by specific operating-system subsystems*, and each subsystem will tell you its state if you ask it the right way. Knowing which subsystem owns which claim, and which command interrogates it, is the entire LOCATE-and-QUERY step of the loop applied to the endpoint. Everything downstream — collecting this at fleet scale over an MDM API, evaluating it as policy-as-code, emitting it as continuous evidence — is this same idea, scaled. If you don't know that disk-encryption truth lives in FileVault and is read by `fdesetup status`, you can't automate the control; you can only ask a human to "go check."

---

## 3. The Mental Model

Start from the question the auditor actually asks: *"prove this laptop is encrypted."* A legacy answer is a screenshot of a settings pane, pasted into a folder once a year. An engineered answer asks the machine directly and keeps the machine's own reply as evidence. To do that, you need a mental map of *who on the machine knows what* — because macOS does not have one place that holds "the security posture." It has a handful of separate subsystems, each guarding one slice of reality, each with its own way of being asked.

Hold the device as a stack of trust, built from the silicon upward, and notice that each layer answers a different kind of claim.

At the very bottom is the hardware and the boot process. The question here is: *can the operating system itself be trusted, or could it have been quietly modified?* macOS answers this with **System Integrity Protection (SIP)** — a kernel-level lock, configured before the OS even finishes booting, that forbids even an administrator from altering protected system files, directories, and processes. SIP is the reason "the OS is the OS we shipped" is a defensible claim rather than a hope. When SIP is *enabled*, tampering with core system components is blocked outright; when it's *disabled* (which requires deliberately booting into recovery mode), that protection is gone and the machine should not be trusted to report honestly about itself. So SIP is foundational: it's the claim that every claim above it rests on.

One layer up is the data at rest. The question: *if this laptop is lost or stolen, is the disk readable?* That's **FileVault** — full-volume encryption of the startup disk, tied to the user's credentials and the hardware. "Encrypted at rest" is one of the most common endpoint controls in any framework, and its truth lives entirely in FileVault's status. Either the volume is encrypted (and a thief gets ciphertext) or it isn't (and a thief gets your files). There is no middle "sort of."

Next is *what software is even allowed to run*. macOS answers this with **Gatekeeper** and the related idea of **notarization**: by default the machine will only launch software that comes from identified, Apple-checked sources, refusing unsigned or un-notarized code. The claim Gatekeeper carries is "this endpoint won't casually execute arbitrary downloaded binaries." Closely related but distinct is **TCC** — *Transparency, Consent, and Control* — the subsystem that gates access to *privacy-sensitive resources*: the camera, the microphone, the screen, your contacts, your files. Gatekeeper asks "is this app allowed to run at all?"; TCC asks "now that it's running, is it allowed to touch the webcam?" Different question, different subsystem, different control.

Then there are the **secrets** the machine holds on the user's behalf — passwords, certificates, keys. Those live in the **Keychain**, an encrypted, access-controlled store. The relevant claim is usually not "is there a keychain" (there always is) but "are credentials stored in the protected store rather than in plaintext somewhere a script could read them."

Running across all of this is the question of *what the machine does on its own* — the daemons and agents that start at boot or login and run in the background. macOS manages all of them through **launchd**, the first process to start and the parent of everything else; the things it launches are described by small declarative job files. For GRC this matters two ways: a control might *require* something to be running (a logging agent, the MDM client), and an investigation might need to know *what is* running that shouldn't be.

Finally, sitting above the single device, is the question of *who controls this machine's settings, and can they be enforced centrally?* That's **Mobile Device Management (MDM)** and the **configuration profiles** it pushes — signed bundles of settings that dictate things a user can't override: the screen must lock after N minutes, FileVault must be on, this Wi-Fi or certificate is installed. An *enrolled, managed* device is one where the org's policy is actually enforced rather than merely requested; an *unmanaged* device is one where every setting is a suggestion. So MDM is the claim that the other claims are *governed* — that encryption isn't just on today but is *required* to be on.

That's the whole map: **SIP** (is the OS trustworthy?), **FileVault** (is the data encrypted?), **Gatekeeper/notarization** (can only trusted software run?), **TCC** (is privileged resource access gated?), **Keychain** (are secrets stored safely?), **launchd** (what runs in the background?), **MDM/profiles** (is all of the above centrally enforced?). Seven subsystems, seven slices of control-truth. The skill of this module is *not* memorizing flags. It is internalizing this map so that, handed any endpoint control, your first move is to name the subsystem that owns its truth — and only then reach for the command that reads it. The commands are the easy part and they're in §4. The map is the part that makes you a GRC engineer instead of someone who pastes screenshots.

One discipline carries through everything below, and it is the difference between an analyst and an auditor: **a check that did not run is not a pass.** If you run a status command without the privilege it needs, or on a device that isn't managed, you may get an empty result, an error, or a misleading default. Treating "no answer" as "everything's fine" is how real findings get missed. Every evaluation you build in this module has three outcomes, never two: PASS, FAIL, and **UNKNOWN** — and UNKNOWN is a result you must surface, not swallow.

---

## 4. Concepts

> Commands are shown in our own words; the canonical reference for each tool is Apple's, cited in §8. The behavior described is universal macOS behavior, not anyone's prose.

### 4.1 FileVault — disk encryption, read with `fdesetup status`

FileVault is full-volume encryption of the startup disk. The claim it carries is "data at rest is encrypted." You read its state with `fdesetup status`, which reports, in plain English, whether FileVault is on:

```
$ fdesetup status
FileVault is On.
```

The control logic is binary and unambiguous: the literal phrase **`FileVault is On`** means the encryption control passes; **`FileVault is Off`** means it fails. Mid-encryption states exist ("Encryption in progress…") and your evaluator should treat them honestly — in-progress is *not yet* fully encrypted, so it is not a clean pass. The point for GRC: the verdict comes from matching a known string, which means it can be automated.

### 4.2 SIP — OS tamper-protection, read with `csrutil status`

System Integrity Protection is the boot-time lock that stops even root from modifying protected system files. You read it with `csrutil status`:

```
$ csrutil status
System Integrity Protection status: enabled.
```

`enabled` is the pass; `disabled` is a fail and a flag — a disabled SIP means the machine was deliberately taken into recovery mode to turn it off, and nothing the OS reports about itself afterward can be fully trusted. SIP is the control beneath the controls.

### 4.3 Gatekeeper — software-origin enforcement, read with `spctl --status`

Gatekeeper enforces that only software from identified, Apple-checked sources runs by default. `spctl --status` reports whether that assessment is active:

```
$ spctl --status
assess, enabled
```

`assessments enabled` (the exact phrasing has varied across releases, hence Tier-B treatment in examples) is the pass. When assessments are disabled, the machine will launch unsigned, un-notarized code without complaint — the execution-control claim is false. Note the *related* concept of **notarization**: Apple scans and stamps developer software so Gatekeeper can verify it; you don't query notarization per-machine, but you should be able to explain in one sentence why Gatekeeper is the enforcement point and notarization is the supply-side check.

### 4.4 TCC — privacy-resource consent

TCC (*Transparency, Consent, and Control*) gates access to privacy-sensitive resources: camera, microphone, screen recording, contacts, and protected files. Unlike the others, TCC's authoritative store is a protected database the system guards tightly, so the *control* you typically evidence is "TCC's protections are intact and consent is enforced," and at fleet scale the grants are *managed via MDM profile* (PPPC — Privacy Preferences Policy Control payloads) rather than read ad hoc. The concept to hold: Gatekeeper decides *whether an app runs*; TCC decides *what a running app may touch*. They are different controls and an auditor who conflates them will mis-scope the evidence.

### 4.5 Keychain — protected secret storage

The Keychain is macOS's encrypted, access-controlled store for passwords, keys, and certificates. The GRC-relevant claim is rarely "does a keychain exist" (one always does) — it's "are credentials kept in the protected store instead of in plaintext config files a process could read." You can list keychains in scope:

```
$ security list-keychains
    "/Users/analyst/Library/Keychains/login.keychain-db"
    "/Library/Keychains/System.keychain"
```

For evidence purposes, the presence and use of the protected store, plus the absence of plaintext-credential anti-patterns, is what you're attesting to — not dumping secrets (never do that in an evidence packet).

### 4.6 launchd — what runs at boot and login

launchd is the first process the kernel starts and the parent of every background service; the jobs it manages are described by declarative property-list files in well-known directories (system daemons, global agents, and per-user agents). For GRC this is two questions: *is a required agent running* (the MDM client, the logging/endpoint-security agent the control mandates) and *is anything running that shouldn't be*. You enumerate managed jobs with `launchctl`:

```
$ launchctl list | head -3
PID     Status  Label
541     0       com.apple.example.agent
-       0       com.vendor.security.daemon
```

The skill here is reading the map: a label present and a sane status means the service is loaded; absence of a *required* label is a finding, not a non-event.

### 4.7 MDM & configuration profiles — central enforcement

MDM enrollment and the configuration profiles it delivers are how an organization *enforces* settings the user cannot override — screen-lock timeout, mandatory FileVault, certificates, restrictions. Two commands carry the truth. `profiles status` reports whether the device is enrolled and managed:

```
$ profiles status -type enrollment
Enrolled via DEP: Yes
MDM enrollment: Yes (User Approved)
```

`Yes` on MDM enrollment is the pass for "this device is centrally managed." And `system_profiler SPConfigurationProfileDataType` enumerates the actual installed profiles, so you can prove a *specific* required profile (say, a screen-lock policy) is present:

```
$ system_profiler SPConfigurationProfileDataType
Configuration Profiles:
    ScreenLock Policy:
        Payloads: com.apple.screensaver (askForPassword=1, idleTime=600)
```

The combined claim: the device is enrolled (`profiles status`) **and** the required policy payload is installed (`system_profiler`). One without the other is an incomplete control. An unmanaged device fails this regardless of its other settings, because nothing prevents a user from turning them off tomorrow.

### 4.8 The three-valued verdict — PASS, FAIL, UNKNOWN

This is the concept that makes the rest defensible. Every status command above can return three kinds of thing: a string that clearly means the control passes, a string that clearly means it fails, or *something else* — empty output, an error, a permission complaint, an unexpected format. The third case is **UNKNOWN**, and it is its own verdict. A common, dangerous bug is to write an evaluator that says `if output contains "On" then PASS else FAIL` — which silently scores a permission error or an unmanaged device as a clean FAIL or, worse, mis-parses and reports PASS. The correct shape always asks two questions in order: *does the output match the known-good string?* → PASS; else *does it match the known-bad string?* → FAIL; else → UNKNOWN, surfaced for a human. A control whose state could not be determined is a gap in your evidence, and gaps are findings.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Commands are run on macOS; output is representative and abbreviated — your exact strings will differ by OS version (Worked examples are Tier-B content, reviewed when tooling shifts). The *evaluation logic* shown here is exactly what the §6 lab and the §7 assessment exercise — and exactly what the offline happy-path test verifies against committed sample outputs.

### 5.1 One subsystem, end to end: encryption-at-rest

Claim to verify: *"the startup disk is encrypted at rest."* The truth lives in FileVault (§3 map). You ask the subsystem and keep its reply:

```
$ fdesetup status | tee evidence/filevault.txt
FileVault is On.
```

`tee` lets the reply both print to your screen and land in `evidence/filevault.txt` as a kept artifact. Now the verdict is a string match: the line contains `FileVault is On`, so the encryption control is **PASS**, and the evidence file is the raw machine reply, not a screenshot. Re-run it next quarter against the same machine and you can compare byte-for-byte. That is the LOCATE→QUERY→EVIDENCE arc in three lines.

### 5.2 The trap: when "no answer" looks like an answer

Claim: *"SIP is enabled."* Imagine the check is run inside an automation context that didn't capture stderr, on a machine where the tool errored:

```
$ csrutil status
$ echo "[$(csrutil status 2>/dev/null)]"
[]
```

The output is *empty*. A naive evaluator written as "if it says enabled, PASS, otherwise FAIL" would mark this **FAIL** — but that's wrong: we don't actually know the SIP state, we know the *check didn't return an answer*. The correct verdict is **UNKNOWN**, and an UNKNOWN must be surfaced for a human to investigate (was it a privilege problem? a broken automation path?). Scoring it FAIL would generate a false finding; scoring it PASS would hide a real gap. This is §4.8 made concrete, and it is the single most important habit in the module: a check that did not run is never a pass *and* never a clean fail — it's UNKNOWN.

### 5.3 Two subsystems, one control: "centrally enforced screen lock"

A screen-lock control is only real if it's *enforced*, which means two facts must both hold: the device is MDM-managed, and the screen-lock policy profile is installed. One subsystem can't answer it alone.

```
$ profiles status -type enrollment | tee evidence/mdm.txt
MDM enrollment: Yes (User Approved)
$ system_profiler SPConfigurationProfileDataType | tee evidence/profiles.txt
Configuration Profiles:
    ScreenLock Policy:
        Payloads: com.apple.screensaver (askForPassword=1, idleTime=600)
```

Evaluation: enrollment line contains `MDM enrollment: Yes` → managed; the profiles output contains a `ScreenLock Policy` payload with `askForPassword=1` → policy present. Both true → the *combined* control is **PASS**. Had enrollment said `No`, the control would FAIL even with a local screen-lock setting present, because an unmanaged user can revert it. This is why §3 calls MDM "the claim that the other claims are governed."

### 5.4 The packet: many subsystems, each labeled to its control

The deliverable a GRC engineer actually ships is not one check — it's a labeled packet. Conceptually:

```
$ ./collect-endpoint-evidence.sh > evidence/packet.txt
$ cat evidence/packet.txt
CONTROL: Encryption at rest (SOC2 CC6.1)      | SUBSYSTEM: FileVault | VERDICT: PASS    | RAW: FileVault is On.
CONTROL: OS tamper protection (CC6.8)         | SUBSYSTEM: SIP       | VERDICT: PASS    | RAW: ...status: enabled.
CONTROL: Software execution control (CC6.8)   | SUBSYSTEM: Gatekeeper| VERDICT: PASS    | RAW: assessments enabled
CONTROL: Centrally managed (CC1.x)            | SUBSYSTEM: MDM       | VERDICT: PASS    | RAW: MDM enrollment: Yes
CONTROL: Screen-lock policy enforced (CC6.1)  | SUBSYSTEM: MDM/prof  | VERDICT: UNKNOWN | RAW: <profile query returned nothing>
```

Every line names the control, the subsystem that owns its truth, the three-valued verdict, and the raw reply that justifies it. The `UNKNOWN` row is not a flaw in the packet — it is the packet doing its job, telling you exactly which control's truth couldn't be established so a human follows up. This labeled, re-runnable, raw-evidence-bearing artifact is the whole point of the module, and it's exactly what §6 builds.

---

## 6. Guided Lab

> Original lab. ~60–90 minutes. Tier-B content (environment-dependent). You need a macOS machine for the *real* collection (steps 2–5). If you don't have one to hand, you can still build and verify the *evaluation logic* — the part that's actually GRC engineering — against the bundled sample outputs, which is exactly what CI does (`labs/happy-path.sh`). No prior Mac admin experience assumed.

**Scenario.** You've been asked to produce an endpoint compliance-evidence packet for one Mac, built entirely from the CLI, proving five controls — encryption at rest, OS tamper protection, software-execution control, central management, and an enforced screen-lock policy — with each line labeled to the control it evidences and a defensible PASS / FAIL / UNKNOWN verdict for each.

**Setup.** Run `bash labs/setup.sh ./lab03` to generate the bundled `samples/` directory: committed *sample outputs* of each macOS command (`fdesetup`, `csrutil`, `spctl`, `profiles`, `system_profiler`), including one deliberately empty/erroring sample so you must handle UNKNOWN. These let you build and test your evaluator with no Mac.

**Tasks.**

1. On paper, before touching a command, draw the §3 map and write next to each of the five controls *which subsystem owns its truth* and *which command reads it*. Check yourself against §4. *(Objectives 1, 2)*
2. *(macOS, or read the matching `samples/` file)* Run `fdesetup status` and `csrutil status`. For each, state the control, the exact known-good string, and your verdict. *(Objective 3)*
3. *(macOS, or samples)* Run `spctl --status`, `profiles status -type enrollment`, and `system_profiler SPConfigurationProfileDataType`. Capture each raw reply into a file under `evidence/`. *(Objectives 3, 5)*
4. Write `evaluate.sh`: a function that takes a control's raw output and returns `PASS`, `FAIL`, or `UNKNOWN` using the §4.8 two-questions-then-default shape — match known-good → PASS, else match known-bad → FAIL, else → UNKNOWN. Deliberately feed it the empty/erroring sample and confirm it returns `UNKNOWN`, *not* `FAIL`. *(Objectives 4, 6)*
5. Write `collect-endpoint-evidence.sh` that runs each query (or, off-Mac, reads each `samples/` file), passes the raw output through `evaluate.sh`, and emits one labeled packet line per control in the §5.4 format: `CONTROL | SUBSYSTEM | VERDICT | RAW`. Redirect collection errors to a separate `collection-errors.log` so the packet stays clean. *(Objectives 5, 6)*
6. Run the collector twice. Confirm the packet is byte-for-byte identical across runs (deterministic), and write one sentence connecting "identical packet twice" to continuous monitoring. *(Objective 6)*
7. Find the line in your packet whose verdict is `UNKNOWN`. Write two sentences: which control's truth couldn't be established, and why scoring it as PASS *or* clean FAIL would have been a defect. *(Objective 4)*

**Deliverables:** `evaluate.sh`, `collect-endpoint-evidence.sh`, the `evidence/` raw-reply files, the generated `packet.txt`, `collection-errors.log`, and a 5–7 sentence written explanation covering: the subsystem→control map; why two subsystems are needed for the screen-lock control; how your evaluator handles UNKNOWN and why that matters; and what re-running the packet identically proves for continuous assurance.

---

## 7. Assessment

**Competency artifact (not a quiz).** Given a *fresh, unseen* set of endpoint status outputs provided at assessment time (or a real, unfamiliar Mac), the learner must, unaided and within 40 minutes, deliver:

- An **endpoint compliance-evidence packet** covering at least the five controls — encryption at rest (FileVault), OS tamper protection (SIP), software-execution control (Gatekeeper), central management (MDM enrollment), and an enforced screen-lock policy (MDM profile) — produced from the CLI, with **each line labeled to the control and subsystem**, carrying the raw reply, and a **three-valued verdict** (PASS / FAIL / UNKNOWN).
- A **deterministic evaluator** that derives each verdict by matching known-good then known-bad strings and defaulting to UNKNOWN — demonstrably returning UNKNOWN (not FAIL) on a check that could not run.
- A **spoken or written walkthrough** that correctly: names the subsystem that owns each control's truth; explains why the screen-lock control requires *two* subsystems; identifies the UNKNOWN line and explains why scoring it PASS or clean FAIL would be a defect; and states what re-running the packet identically proves about continuous assurance.

**Scoring.** Score against `assessment/rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner back to the specific concept section named in the rubric — not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3) when any objective falls below the `assessment_passrate_threshold` in `meta.yaml`.

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These are for a different voice, more breadth, or the canonical specs you may need to cite to an auditor.*

- **Apple Platform Security Guide** — the authoritative reference for SIP, FileVault, Gatekeeper, notarization, TCC, and the Keychain; this is the document an auditor expects you to cite. https://support.apple.com/guide/security/welcome/web — *use to ground any control claim in §4 in Apple's own canonical wording.*
- **Apple Platform Deployment Guide** — the official reference for MDM, configuration profiles, enrollment, and ABM/ADE. https://support.apple.com/guide/deployment/welcome/web — *use to deepen §4.7 (MDM/profiles) beyond what the control packet needs.*
- **scriptingosx.com — Armin Briegel** — clear, practitioner-level writing on `launchd`, `defaults`, and configuration profiles, aimed at people who aren't full-time Mac engineers. https://scriptingosx.com/ — *use for a longer, friendlier treatment of §4.6 (launchd) and the profile tooling.*
- **drduh/macOS-Security-and-Privacy-Guide** — a community hardening guide with hands-on commands for FileVault, the Keychain, and privacy controls. https://github.com/drduh/macOS-Security-and-Privacy-Guide — *use for extra hands-on practice after §6; treat it as a hardening reference, not a control spec.*
- **MacAdmins.org** — the practitioner community (Slack + monthly sessions) where Mac fleet management and the tooling behind these subsystems is discussed; continuing education for anyone owning a Mac fleet's controls. https://www.macadmins.org/ — *use as an ongoing channel, not a one-time read.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
