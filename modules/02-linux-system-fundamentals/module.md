# Module 02 — Linux System Fundamentals

*Loop stage: LOCATE — the operating system is where server and endpoint control-truth physically lives. Original content. Module 02 of the Common Core. Conforms to the standard module anatomy; third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Map** the Linux filesystem hierarchy to the question "where does the truth about this control physically live?", and **state** which directory holds configuration, which holds logs, and which holds running-state — without guessing.
2. **Describe** what a process is, how a service differs from a process, and how `systemd` turns "a program I ran once" into "a service the OS keeps running, supervises, and starts on boot."
3. **Navigate** users, groups, and the `sudo` boundary, and **explain** why "who can become root" is the single most consequential access-control fact on a Linux host.
4. **Diagnose** a file's permission and ownership bits from `ls -l` output, and **state** whether a given user can read, write, or execute it — turning a cryptic ten-character string into a yes/no access verdict.
5. **Configure** SSH for key-only authentication by editing `sshd_config`, and **explain** why disabling password login is a control, not a preference.
6. **Query** `journald` and `/var/log` for authentication events, and **produce** durable evidence that an auth control held — proving a claim from the host's own records rather than from a screenshot.
7. **Produce** a one-page compliance-evidence writeup that proves three hardening controls on a real host, each backed by the exact command whose output is the evidence.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided on a fresh host, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

Module 01 taught you to interrogate reality through a text interface; this module teaches you *what reality you are interrogating* when the system is a Linux server or endpoint. This is the **LOCATE** stage of the irreducible loop: before you can query, evaluate, or collect evidence about a control, you have to know where the truth about that control actually sits on the machine. "Only key-based SSH is allowed" is a sentence in a policy document — but on the host it is a specific line in a specific file, and either that line says what the policy claims or it doesn't. "Engineers cannot become root without approval" is a governance assertion — on the host it is membership in one group, visible in one command's output. A GRC engineer who cannot locate the control's physical home is stuck taking the system's word for it through a vendor dashboard. Learning the OS is learning to read the source of truth directly, so that every later evidence pipeline is built on ground truth instead of a screenshot somebody could have faked.

---

## 3. The Mental Model

Start where the last module left off. You now know that a command is just a program — a file on disk that the kernel runs. Push one level deeper and ask the question this whole module turns on: **when a control "exists" on a Linux host, where, physically, does it exist?**

The unhelpful answer is "in the configuration." The useful answer is that a running Linux system is made of exactly three kinds of thing, and every control lives in one of them. Hold these three apart in your head and the OS stops being a fog of commands and becomes a small, navigable map.

**First: files that persist.** Almost everything on Linux is a file, and the durable truth of the system is written into files that survive a reboot. The configuration that says "SSH refuses passwords" is a file. The record of who logged in last night is a file. The program that runs your web service is a file. There is an old design instinct here worth naming, because it explains the whole filesystem: instead of inventing a hundred different ways to store settings and state, Linux mostly just uses *text files in known locations*, and gives you the same handful of tools to read them all. The filesystem hierarchy — `/etc` for configuration, `/var/log` for logs, `/home` for people's data, `/usr` for installed programs — is not arbitrary clutter. It is a *convention about where each kind of truth lives*, agreed across the entire ecosystem, so that you can walk onto an unfamiliar machine and know where to look. For a GRC engineer, the hierarchy is a map of where evidence is kept.

**Second: processes that run.** A file on disk is inert. When the kernel loads a program's instructions into memory and starts executing them, that running instance is a **process** — a program that is *currently alive*, with its own slice of memory, its own identity number, and an owner (some user, on whose authority it acts). The same program file can be running as zero, one, or many processes at once. This distinction is load-bearing: the *file* `sshd` sitting in a directory is just bytes; the *process* `sshd` that is alive right now is the thing actually deciding whether to let a login in. When you check a control, you often care about both — is it configured correctly (the file), and is it actually running with that configuration (the process)?

**Third: the supervisor that keeps things running.** Here is the gap that the third concept fills. A process you start by hand dies when you log out, doesn't come back after a reboot, and nobody is watching it. That is fine for a one-off command and catastrophic for, say, an audit-log shipper that must run *always*. So a modern Linux system has one master process — on most current distributions, **`systemd`** — that the kernel starts first and that then starts, stops, supervises, and restarts everything else according to written definitions. A program promoted into `systemd`'s care is called a **service** (or **unit**). The difference between "a program I ran" and "a service" is the difference between a thing that happens once and a thing the OS *guarantees keeps happening* — and continuous controls are, by definition, things that must keep happening. Logging that stops after a reboot isn't a logging control; it's a logging incident waiting to be discovered at audit time.

Now layer identity over all three, because every one of them answers to a person. Linux is **multi-user** from the ground up: every file has an owner, every process runs as some user, and every action is permitted or denied based on *who you are*. Each user has a numeric ID; users belong to **groups**; and one user — **root**, ID 0 — is special in that the kernel does not check its permissions at all. Root can do anything. That single fact reorganizes how you think about a Linux host's security: the entire access-control system is, at bottom, walls between ordinary users and *the ability to become root*. The bridge across that wall is **`sudo`** — a gate that lets specifically-authorized users run specifically-permitted commands *as* root, and writes a log entry every time they do. So "who can become root" is not one access question among many; it is *the* question, and the answer is visible in group membership and a configuration file.

Finally, the way the system *grants or denies* each of those users access to each of those files is one compact mechanism: **permissions**. Every file carries, baked into its metadata, who owns it, which group it belongs to, and exactly what the owner, the group, and everyone-else is each allowed to do — read, write, or execute. This is not a database somewhere; it is three trios of bits attached to the file itself. Learn to read those bits and you can answer, for any file, "can this user touch this?" — which is the atomic access-control question that scales up into every IAM model you will meet later.

So the full picture: **files** hold the durable truth (and the filesystem hierarchy tells you where), **processes** are that truth in motion, **`systemd`** is what keeps the right processes alive, **users and groups and `sudo`** decide who acts, and **permissions** decide who may touch what. Five ideas. A Linux control is always some specific, checkable fact within one of them — and your job is to know which one, go there, and read it.

---

## 4. Concepts

### 4.1 The filesystem hierarchy is a map of where truth lives

You already know the filesystem is a single tree rooted at `/`. The concept to add now is that the top-level directories are a *shared convention about what kind of thing lives where*, so evidence is never a scavenger hunt. The four you will use constantly:

- `/etc` — system-wide **configuration**, almost all plain text. This is where controls are *declared*. SSH's behavior lives in `/etc/ssh/sshd_config`; the list of users lives in `/etc/passwd`; who is in which group lives in `/etc/group`.
- `/var/log` — **logs**: the system's append-only memory of what happened. Authentication events, service output, kernel messages. This is where controls are *witnessed*.
- `/home` — each non-root user's **personal directory** (e.g. `/home/grcops`), where their files and SSH keys live.
- `/usr` and `/bin` — installed **programs**. The files that *become* processes.

The instinct to build: when handed a control, ask "is this a declaration, a record, or a running thing?" — that tells you whether you're going to `/etc`, `/var/log`, or to the process list. Example: *"is root login over SSH disabled?"* is a declaration → it lives in `/etc/ssh/sshd_config`.

### 4.2 Processes: a program that is currently alive

A process is a running program, and the OS gives each one an identity so it can be inspected and controlled. The command `ps` lists processes; `ps aux` shows every process on the system with its owner, its **PID** (process ID — the number that uniquely names it while it lives), and the command that started it. Two facts about a process are control-relevant above all others: **what it is** (which program) and **who it runs as** (which user's authority it wields). A web server running as `root` when it only needs to run as an unprivileged service account is a finding, because if that process is compromised, the attacker inherits root. Inline:

```
$ ps -o user,pid,comm -C sshd
USER       PID COMMAND
root       742 sshd
```

That one line tells you sshd is alive (PID 742) and running as root — which, for the SSH daemon, is expected, because binding a privileged port and switching identity per login genuinely requires it.

### 4.3 Services and `systemd`: making a program a permanent, supervised thing

`systemd` is the init system — the first process the kernel starts (PID 1) and the parent of the supervised world. You interact with it through one verb-first command, `systemctl`. The four operations you need:

- `systemctl status <name>` — is this service running right now, and what's its recent output?
- `systemctl start` / `stop` — run it / halt it now.
- `systemctl enable` / `disable` — make it start on boot / not.

The distinction between **active** (running now) and **enabled** (will start on boot) is exactly the distinction that bites at audit time: a logging agent that is *active* today but not *enabled* will silently vanish on the next reboot, and your "continuous" control will have a gap nobody noticed. A real continuous control must be both. Inline — a healthy service reads like this:

```
$ systemctl status evidence-collector
● evidence-collector.service - GRC evidence collector
     Loaded: loaded (/etc/systemd/system/evidence-collector.service; enabled)
     Active: active (running) since Wed 2026-05-27 09:14:02 UTC
```

`enabled` and `active (running)` together are the two-word proof the control will both run now and survive a reboot.

### 4.4 Users, groups, and the `sudo` boundary

Every account is a line in `/etc/passwd`; every group is a line in `/etc/group`; membership is what grants elevated capability. The command that answers "who am I and what am I a member of?" is `id`:

```
$ id grcops
uid=1001(grcops) gid=1001(grcops) groups=1001(grcops),27(sudo)
```

Read it as facts: this account is `grcops`, numeric ID 1001, and — the control-relevant part — it is a member of the `sudo` group (on some distributions the equivalent group is named `wheel`). Membership in that group is what permits `sudo`. So the question *"can this person become root?"* is answered by looking at one group list. `sudo` itself is the supervised gateway: it lets an authorized user run a command *as root*, prompts for their own password, and records the elevation in the auth log — meaning every privilege escalation is, by design, an evidence-producing event. The least-privilege control you will prove in the lab is two-sided: the *intended* admin **is** in the sudo group, and ordinary accounts **are not**.

### 4.5 Permissions: reading the ten-character verdict

`ls -l` prints, for each file, a ten-character string that fully describes who may do what. Decode it left to right:

```
$ ls -l /etc/ssh/sshd_config
-rw-r----- 1 root root 3243 May 27 09:02 /etc/ssh/sshd_config
```

The first character is the type (`-` = file, `d` = directory, `l` = symlink). The next nine are **three trios**: owner, then group, then everyone-else, each trio being read / write / execute (`r` `w` `x`, with `-` meaning "not allowed"). So `rw-r-----` means: the owner (`root`) may read and write; the group (`root`) may read only; everyone else gets nothing. Pair that with the two names after the count — first the owning **user**, then the owning **group**. Now you can answer the atomic question for any user: find which trio applies to them (are they the owner? in the group? neither?) and read off their three bits. For sensitive files the finding is usually *over*-permission: a private SSH key or a config that everyone-else can read is a control failure, because confidentiality lives in those last three bits.

### 4.6 SSH key-based authentication: a control, not a preference

SSH is how you reach a remote host, and *how it authenticates you* is a security control with real consequences. Password authentication means anyone on the network can guess, spray, or brute-force their way in; an exposed host with passwords enabled is attacked continuously within minutes of coming online. **Key-based authentication** replaces the guessable secret with a cryptographic key pair: a private key that never leaves your machine and a matching public key placed on the host. The host proves you hold the private key without it ever crossing the wire, and there is nothing to guess. Hardening SSH means editing `/etc/ssh/sshd_config` so that `PasswordAuthentication no` and `PermitRootLogin no` are the *effective* directives, then reloading the daemon. One parsing subtlety that matters for evidence: `sshd` ignores commented lines and, when a directive appears more than once, the **last one wins** — so a naive `grep` for the keyword can be fooled by a commented decoy or an earlier overridden line. Reading the config the way `sshd` reads it is the difference between real evidence and a false pass.

### 4.7 Logs and `journald`: where the control is witnessed

A configuration proves a control was *set*; the logs prove it was *exercised*. On `systemd` hosts the central log is the **journal**, queried with `journalctl`; older or text-oriented logs also land under `/var/log` (e.g. `/var/log/auth.log` or `/var/log/secure` for authentication events). Authentication is the highest-value log stream for GRC: it records every login, every `sudo` elevation, every failure. `journalctl -u ssh` shows the SSH service's own records; filtering for failed and accepted logins lets you demonstrate that, for instance, *no password logins succeeded because none were even possible*. Inline:

```
$ journalctl -u ssh --since "2026-05-27" | grep -i "accepted"
May 27 09:31:54 web-01 sshd[1402]: Accepted publickey for grcops from 10.0.0.5
```

`Accepted publickey` — not `Accepted password` — is the log line that *witnesses* your SSH control holding in practice. That line, captured, is durable evidence in a way a screenshot never is.

### 4.8 Package management: where installed software comes from

Programs arrive on a Linux host through a **package manager** — `apt` on Debian/Ubuntu-family systems, `dnf`/`yum` on Red Hat-family — which installs software from signed repositories and records exactly what is present and at what version. For GRC this is the inventory and patch-state primitive: "what is installed, at which version, and is it the patched one?" is answered from the package database, not by hunting through the filesystem. `apt list --installed` (or `dnf list installed`) is the software bill of materials of the host. You will install one service via the package manager in the lab; the deeper point is that *the package database is itself an evidence source* for vulnerability and patch-compliance controls later in the curriculum.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Commands are shown with representative output; your exact output, hostnames, IDs, and timestamps will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 Proving the least-privilege control from `id`

Claim to verify: *"the operations account `grcops` can administer the host, and the contractor account `intern` cannot."* Two commands, two facts:

```
$ id grcops
uid=1001(grcops) gid=1001(grcops) groups=1001(grcops),27(sudo)
$ id intern
uid=1002(intern) gid=1002(intern) groups=1002(intern)
```

Read the `groups=` field on each. `grcops` is in `sudo` → it can elevate, as intended. `intern` is in no privileged group → it cannot, as intended. The control is two-sided and *both sides* are now evidenced from the host's own account database. Notice you did not trust a dashboard or an org chart; you asked the kernel's own notion of identity. That pair of lines, pasted into your writeup, *is* the access-control evidence.

### 5.2 Reading a permission string to a yes/no verdict

Claim to verify: *"the SSH private key is not readable by anyone but its owner."* The control lives entirely in the permission bits:

```
$ ls -l /home/grcops/.ssh/id_ed25519
-rw------- 1 grcops grcops 411 May 27 09:05 /home/grcops/.ssh/id_ed25519
```

Decode: type `-` (file); owner trio `rw-` (grcops may read/write); group trio `---`; other trio `---`. So only `grcops` can read the private key — group and everyone-else get nothing. **Pass.** Contrast a failure you would flag instantly:

```
-rw-r--r-- 1 grcops grcops 411 May 27 09:05 /home/grcops/.ssh/id_ed25519
```

Here the last two trios are `r--` `r--`: every account on the box can read the private key. That is a confidentiality failure, visible in three characters, and you would not have to run anything else to know it. The ten-character string *is* the verdict.

### 5.3 Evaluating the SSH config the way `sshd` does

Claim to verify: *"this host refuses password logins."* The naive approach — `grep PasswordAuthentication sshd_config` — is a trap, because configs contain commented decoys and overridden lines. Suppose the file contains:

```
#PasswordAuthentication yes
PasswordAuthentication no
```

A bare `grep` returns *both* lines and a careless reader sees `yes` first and panics — or worse, sees it and records a false finding. `sshd` ignores the commented line entirely and, on duplicates, honors the *last* effective directive. Resolving it correctly:

```
$ grep -v '^[[:space:]]*#' sshd_config | grep -i '^[[:space:]]*PasswordAuthentication' | tail -1
PasswordAuthentication no
```

We strip comment lines, keep only real `PasswordAuthentication` directives, and take the last one. The effective value is `no` → **pass**. The lesson is general: *evidence must be evaluated by the same rules the enforcing program uses*, or it isn't evidence — it's a guess that happens to look official.

### 5.4 Confirming the service is both running and persistent

Claim to verify: *"the evidence-collection service is running and will survive a reboot."* Both facts come from one command, but you must read *two* fields, not one:

```
$ systemctl status evidence-collector
● evidence-collector.service - GRC evidence collector
     Loaded: loaded (/etc/systemd/system/evidence-collector.service; enabled)
     Active: active (running) since Wed 2026-05-27 09:14:02 UTC
```

`Active: active (running)` proves it is up now. `enabled` (inside the `Loaded:` line) proves it will start on boot. A service that is `active` but `disabled` passes a careless check today and fails silently after the next reboot — the exact shape of a control that "was working when we tested it" and quietly lapsed. Recording *both* words is what makes this evidence of a *continuous* control rather than a point-in-time snapshot.

---

## 6. Guided Lab

> Original lab. ~90–120 minutes. Tier-B content (environment-dependent). You need a fresh Linux instance you control with `sudo`/root access — the curriculum lab VM, a throwaway cloud instance, or a local virtual machine. You will modify SSH; keep a second session open so a misconfiguration cannot lock you out.

**Scenario.** You have been handed a freshly provisioned Linux host and a three-line hardening standard. You must implement each control, then produce a one-page evidence writeup that *proves* each control from the host's own commands — the kind of artifact an auditor accepts because it is reproducible, not a screenshot.

> **Interactive lab.** This lab runs in your browser on the bootcamp site (Module 02 → Interactive lab) on a simulated Ubuntu host (`web-01`) whose command outputs are CI-verified against a real systemd-enabled Linux machine — the same commands on a real box give the same answers.

**The standard (your three controls):**
1. Administration is done by a named non-root user with `sudo`; direct root login is not used.
2. SSH accepts key-based authentication only — no passwords, no root login.
3. A defined background service is installed, running, and enabled to start on boot.

**Tasks.**

1. **Create the admin user.** Create a non-root user (e.g. `grcops`), set up its `.ssh` directory and `authorized_keys` with your public key, and add it to the `sudo` (or `wheel`) group. Verify with `id grcops` and confirm the `sudo` group appears in the output. *(Objectives 3, 7)*
2. **Verify least privilege is two-sided.** Confirm an ordinary account (create `intern` if none exists) is **not** in any privileged group via `id intern`. Capture both `id` outputs — they are your access-control evidence. *(Objectives 3, 7)*
3. **Inspect key file permissions.** Run `ls -l` on the new user's `.ssh` directory and `authorized_keys`. Decode each permission string in writing to a per-user read/write/execute verdict, and confirm the private material is owner-only. Fix anything over-permissioned with `chmod`. *(Objectives 4, 7)*
4. **Harden SSH.** Edit `/etc/ssh/sshd_config` so that `PasswordAuthentication no` and `PermitRootLogin no` are the **effective** directives. Reload the daemon. From a *new* terminal, confirm you can still log in with your key and that a password login is refused. *(Objectives 5, 7)*
5. **Evaluate the config correctly.** Resolve the *effective* `PasswordAuthentication` and `PermitRootLogin` values the way `sshd` does — comments ignored, last directive wins — not with a naive single `grep`. State each effective value and why your resolution method is trustworthy. *(Objectives 5, 7)*
6. **Install and enable a service.** Use the package manager to install a small service (or define a minimal `systemd` unit), then `start` and `enable` it. Run `systemctl status` and record **both** `active (running)` and `enabled`. State, in one sentence, what would happen at the next reboot if you had skipped `enable`. *(Objectives 2, 7)*
7. **Witness an auth event in the log.** Log in again with your key, then query `journalctl -u ssh` (or `/var/log/auth.log`) and find the line proving a `publickey` login succeeded — and the absence of any successful `password` login. Capture that line. *(Objectives 6, 7)*
8. **Assemble the writeup.** Produce a one-page evidence document: for each of the three controls, state the control, the exact command run, and the relevant line of its output — clearly enough that a reviewer could re-run every command and reach the same verdict. *(Objective 7)*

**Deliverables:** the one-page `evidence-writeup.md` containing, per control: the control statement, the command, the evidence line, and a one-sentence verdict. Plus the captured raw outputs (`id` for both users, the decoded `ls -l`, the resolved `sshd_config` directives, the `systemctl status` two-field result, and the `journalctl` auth line).

---

## 7. Assessment

**Competency artifact (not a quiz).** On a *fresh, unseen* Linux instance provided at assessment time, the learner must, unaided and within 60 minutes, implement the three-control hardening standard from §6 and deliver a **one-page compliance-evidence writeup** that proves each control from the host's own commands. The writeup must, for every control, give the control statement, the exact command, the evidence line from its output, and a one-sentence pass/fail verdict — reproducible enough that the assessor re-running the commands reaches the identical verdict.

The artifact passes only if every control below is correctly implemented *and* correctly evidenced:

- A named non-root admin user exists and is in the `sudo`/`wheel` group (`id`), and a non-privileged account is demonstrably **not** (two-sided least privilege).
- SSH password authentication and root login are the **effective** `no` directives, resolved the way `sshd` parses them (not a naive grep), with a key login shown working.
- The defined service is both `active (running)` and `enabled` (`systemctl status`), with the learner stating why both fields matter.
- An authentication event is located in `journald`/`/var/log` proving a `publickey` (not `password`) login.

**Rubric** (each row Pass / Not-yet; all must be Pass):

| Criterion | Objective | Pass means | On Not-yet return to |
|---|---|---|---|
| Locate the truth | Obj 1 | For each control, goes to the correct home (`/etc` config, the process/service, or `/var/log`) without guessing | §4.1 |
| Service permanence | Obj 2 | Reads *both* `active (running)` and `enabled`; states the reboot consequence of skipping `enable` | §4.3, §5.4 |
| Privilege boundary | Obj 3 | Evidences least privilege two-sided from `id` — admin in `sudo`, ordinary user not | §4.4, §5.1 |
| Permission verdict | Obj 4 | Decodes `ls -l` trios to a correct per-user read/write/execute verdict; flags over-permission | §4.5, §5.2 |
| SSH hardening | Obj 5 | `PasswordAuthentication`/`PermitRootLogin` effective `no`, resolved as `sshd` parses; key login works | §4.6, §5.3 |
| Log evidence | Obj 6 | Locates a `publickey` auth event in the journal/log; distinguishes it from a password login | §4.7 |
| Defensible writeup | Obj 7 | One-page artifact: control + command + evidence line + verdict, reproducible by the assessor | §6 |

A "Not-yet" on any row routes the learner back to the specific concept section named, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3).

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; a learner who clicks zero links still meets every objective. These are for learners who want a different voice, more breadth, or hands-on reps. None of this is load-bearing.*

- **Linux Journey** — a free, interactive on-ramp that drills navigation, permissions, processes, and users in the browser. https://linuxjourney.com/ — *use first if §4.1–4.5 felt fast; the Grasshopper and Journeyman tracks rehearse exactly those concepts at a gentler pace.*
- **Linux Foundation LFS101 — "Introduction to Linux" (edX)** — the authoritative, structured, free-to-audit backbone covering the filesystem, processes, users, and package management end to end. https://www.edx.org/learn/linux/the-linux-foundation-introduction-to-linux — *use as the systematic second pass over everything in §4.*
- **"How Linux Works, 3rd Ed." — Brian Ward** — the book for the *why* underneath this module: boot, processes, `systemd`, logging, and networking explained from first principles. https://nostarch.com/howlinuxworks3 — *use to go deeper on §4.2–4.3 and §4.7 (the process/service/log internals).*
- **KodeKloud — "The Linux Basics Course"** — browser-based labs with disposable terminals, so you can rehearse `systemctl` and package management without standing up your own VM. https://kodekloud.com/courses/the-linux-basics-course/ — *use for extra hands-on reps on §4.3 and §4.8 before the §6 lab.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
