# Module 01 — Terminal & Command Line Basics

*Original content. Module 01 of the Common Core. Conforms to the standard module anatomy. This module is the worked proof that the production model yields real, original, first-principles teaching material — third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, what a terminal is and how it differs from a shell — using the historical origin, not jargon.
2. **Describe** the read–evaluate–print loop a shell runs, and trace what happens between pressing Enter and seeing output.
3. **Navigate** a filesystem and inspect files using only the keyboard, and **state** your location and what is around you at any time.
4. **Compose** small programs with pipes and redirection to transform text, and **explain** why this composition is the source of the command line's power.
5. **Diagnose** a failed command from its exit code and its error stream, distinguishing "the command broke" from "the command ran and reported a problem."
6. **Produce** a short, re-runnable script that turns a manual sequence of commands into one reproducible action, and **explain** why that reproducibility is a GRC primitive.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

The entire job of a GRC engineer is to take a *claim about a system* ("only admins can do X," "every laptop is encrypted") and turn it into something a machine can check and re-check, emitting durable proof. The command line is where claims become checks. It is the first place in the curriculum you stop *describing* a control in a document and start *interrogating reality* directly: ask the system a question, get a text answer, save that answer as evidence, and — because it's just text and just commands — run the exact same question again next quarter and get a comparable answer. Reproducible text-in/text-out is not a developer convenience; it is the atomic unit of continuous assurance. Everything later in the curriculum — APIs, policy-as-code, evidence pipelines — is this idea, scaled.

---

## 3. The Mental Model

Start with a question that sounds trivial and isn't: **when you "use the terminal," what is actually there?**

Peel it back to the irreducible parts.

A computer runs programs. A program is just a list of instructions that consumes some input and produces some output. That's the whole of it. For a program to be useful to a human, two things must happen: the human must be able to send it input, and the program must be able to show the human its output.

Decades ago, "the computer" was a room-sized machine and you were not in the room. You sat at a separate device — often literally an electric typewriter bolted to a roll of paper — connected to the computer by a wire. You typed; your keystrokes travelled down the wire to the computer. The computer's output travelled back and was printed, character by character, onto the paper in front of you. That device — the thing at the *end* of the wire, where the human sat — was called the **terminal**. The word means exactly what it says: an endpoint. The terminal itself was almost stupid. It did not know what a file was. It could do two things: turn your keystrokes into signals, and turn returning signals into visible characters. Input and output. Nothing else.

We no longer have the room or the wire or the paper. But the *shape* survived. The black window on your screen is a **terminal emulator**: a piece of software pretending to be that old endpoint device. It still does only the same two things — capture what you type, draw the characters that come back. It still does not know what a file is. When people say "type it in the terminal," they are describing a dumb text window. The intelligence is somewhere else.

Where? Behind the terminal sits a completely separate program called the **shell**. The shell is the thing with the intelligence, and its entire existence is one loop, repeated forever:

1. Print a small piece of text to mark "I'm ready" — the **prompt**.
2. Wait. Read one line of whatever you type, until you press Enter.
3. **Interpret** that line: figure out which program you're asking for and what you're handing it.
4. Ask the operating system to **run** that program. Wait for it to finish.
5. Let that program's output flow back through the terminal to your eyes.
6. Go back to step 1.

This loop has a name worth keeping: **read, evaluate, print, loop** — a REPL. Internalise it, because every confusing moment at the command line dissolves once you can say *which step of the loop am I in?* A prompt sitting there = step 1, waiting for you. No prompt, cursor frozen = step 4, a program is still running and hasn't given control back. An error and then a fresh prompt = the loop completed, the program ran, it just didn't like something.

One more demolition of a beginner illusion. A "command" is, almost always, **not a special word the shell knows**. It is the *name of a program that exists as a file on disk*. When you type `ls`, you are not invoking a shell feature; you are asking the shell to find a program literally named `ls` sitting in a directory somewhere, and run it. The shell knows *where to look* for these program-files because it carries a list of directories called the **PATH**. "Command not found" almost never means the command is fake — it means the shell walked its PATH and found no program by that name. This single reframe — *commands are just programs, the shell is just a finder-and-runner, the kernel is what actually runs them* — is the foundation everything else is built on.

So the full picture, smallest to largest: **you** type into a **terminal emulator** (dumb text I/O), which feeds a **shell** (a REPL that finds and launches programs), which asks the **operating system kernel** (the only thing that can actually create a running program) to execute a **program** (instructions over input → output). Four parts. Hold all four and the command line is no longer mysterious; it's mechanical.

The last piece of the model is the part that makes the command line *powerful* rather than merely usable, and it deserves its own concept section: every program is born wired to exactly three streams.

---

## 4. Concepts

### 4.1 The prompt is information, not decoration

The text before your cursor is the shell telling you facts: often who you are, what machine you're on, and *where you are* in the filesystem. You will spend this module learning to read it instead of looking past it. When something behaves unexpectedly, the prompt is the first witness: it frequently shows you're not where you assumed.

### 4.2 The filesystem is a tree, and you are always standing somewhere in it

Files live in directories; directories live in directories; it bottoms out at a single root, written `/`. There is no "outside" the tree. At every moment your shell session is *standing in* exactly one directory — your **current working directory** — and most commands act relative to where you're standing unless told otherwise. Three questions, three programs:

- *Where am I?* → `pwd` (print working directory)
- *What's around me?* → `ls` (list)
- *Move me there* → `cd` (change directory)

A **path** is just directions through the tree. Starting from root (`/etc/ssh/sshd_config`) is an *absolute* path — unambiguous from anywhere. Starting from where you stand (`logs/auth.log`) is a *relative* path — meaningless until you know the working directory. `.` means "here," `..` means "the directory above here." That is the entire navigation system; everything else is practice.

### 4.3 The three streams — the actual core of this module

When the kernel starts a program, it hands that program three pre-connected channels. Not optional, not advanced — every program gets them at birth:

- **stdin** ("standard input," channel 0) — where the program reads input *from*. By default, your keyboard.
- **stdout** ("standard output," channel 1) — where the program writes its normal results *to*. By default, your terminal screen.
- **stderr** ("standard error," channel 2) — where the program writes *complaints* — errors and diagnostics. Also the screen by default, but a **separate** channel from stdout, on purpose.

Why two output channels? So results and complaints can go to different places. A program can hand you clean data on stdout while a problem report goes down stderr — and you can capture one without the other. This separation is not pedantry; it is exactly what lets an evidence pipeline save the *answer* while routing the *errors* somewhere a human reviews. Hold onto that.

Now the two operations that make these streams the most important idea in the module:

**Redirection** points a stream somewhere other than its default. `>` sends a program's stdout into a file instead of the screen (the file is created/overwritten). `>>` appends instead of overwriting. `2>` sends *stderr* to a file. The instant you can do this, command output stops being something you glance at and becomes an **artifact you keep** — the seed of "evidence."

**The pipe**, written `|`, connects one program's stdout directly to the next program's stdin, with no file and no human in between. `programA | programB` means: run A, and feed everything A would have printed straight into B as B's input. Chain them: `A | B | C`. This is the philosophy the whole command line is built on — many small programs that each do one narrow thing well, snapped together like pipe segments so the output of one becomes the raw material of the next. You don't need a giant tool that "does the report." You need three small honest tools and two pipes. *That* is the power, and it is why this skill sits under everything else in GRC engineering: a control check is almost always "get the raw state → keep only the relevant part → shape it into evidence," which is three small programs and two pipes.

### 4.4 Exit codes — how a machine knows if a check passed

A human reads output and judges it. A machine can't read; it needs a verdict. So every program, when it finishes, hands back one small number: its **exit code**. By an old and universal convention, **0 means success** and any non-zero number means "something was wrong." This is the hinge that turns commands into automation: a script can ask "did that check succeed?" by looking at the exit code, with no human in the loop. "The command produced no output" and "the command failed" are different facts — output is for people, the exit code is for machines, and a GRC engineer learns to care about the second one as much as the first.

### 4.5 Getting unstuck is a skill, not a personality trait

Every well-behaved program can explain itself: `name --help` for a quick summary, `man name` ("manual") for the full reference. The competent operator is not the one who has memorised flags; it's the one whose reflex, on hitting an unknown, is to ask the program itself before asking a person. You will practise that reflex deliberately.

### 4.6 From commands to a script — automation is just memory

A script is not a new technology. It is a plain text file containing the exact same lines you would have typed, saved so they can be run again without retyping. The instant a sequence of commands is worth doing twice, it is worth saving — because a saved sequence is *reproducible*, and a reproducible check is the difference between "we verified this once last audit" and "we verify this continuously and can prove it." This is the bridge from "using a terminal" to "engineering with it," and it is where Module 01 hands off to the rest of the curriculum.

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Commands are shown with representative output; your exact output will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 Orienting yourself, narrated as the REPL

```
analyst@workstation:~$ pwd
/home/analyst
analyst@workstation:~$ ls
evidence  reports  scratch
analyst@workstation:~$ cd evidence
analyst@workstation:~/evidence$ pwd
/home/analyst/evidence
```

Read it as the loop: the prompt (`...$ `) is step 1 — the shell is ready. You typed `pwd`; the shell found the program named `pwd`, the kernel ran it, its stdout ("/home/analyst") came back, the loop returned to a fresh prompt. Notice the prompt *changed* after `cd` — it now shows `~/evidence`. The prompt was telling you the truth about where you stand the entire time. Nothing here is memorisation; it is the model from §3 playing out.

### 5.2 The three streams made visible

Imagine a program `collect-encryption-status` that prints one line per laptop on stdout, and prints `WARN: host db-07 unreachable` on stderr because it couldn't contact one machine.

```
analyst@workstation:~/evidence$ collect-encryption-status > encryption.txt
WARN: host db-07 unreachable
```

The per-laptop results did **not** appear on screen — `>` redirected stdout into `encryption.txt`, which now exists as a kept artifact. The warning *did* appear on screen, because stderr is a separate channel and `>` only redirected stdout. That separation is the feature: your evidence file is clean data; the operational complaint went elsewhere where a human can see it. Send the complaint to its own log too:

```
analyst@workstation:~/evidence$ collect-encryption-status > encryption.txt 2> collection-errors.log
```

Now you have two artifacts: the evidence and an auditable record of what went wrong while collecting it. That is a defensible evidence-collection step, expressed in one line.

### 5.3 Composition: a control check as small-programs-plus-pipes

Claim to verify: *"no entry in the access list still grants the `legacy-admin` role."* Suppose `access.csv` is the raw export.

```
analyst@workstation:~/evidence$ cat access.csv | grep "legacy-admin" | wc -l
0
```

Three tiny programs, two pipes: `cat` emits the file on its stdout → the pipe feeds that into `grep`'s stdin, which keeps only lines containing `legacy-admin` → that feeds `wc -l`, which counts lines. The answer `0` *is* the control result. No monolithic tool was needed — just composition. And because it's text in and text out, this exact line is re-runnable next quarter against a fresh export, which is the whole point.

### 5.4 The verdict a machine can act on

```
analyst@workstation:~/evidence$ grep -q "legacy-admin" access.csv
analyst@workstation:~/evidence$ echo $?
1
```

`grep -q` prints nothing — it only sets an exit code. `echo $?` shows the previous program's exit code: `1`, meaning grep found *no* match. For this control, "no match" is a *pass*. A machine just evaluated a control with zero human reading, purely from an exit code. That is the seed of automated continuous monitoring — and you reached it in module one.

---

## 6. Guided Lab

> Original lab. ~45–60 minutes. Tier-B content (environment-dependent). You need a Unix-like shell (the curriculum lab container, any Linux, or macOS Terminal). No prior experience assumed.

**Scenario.** You are handed a raw access export and asked to produce a one-file piece of evidence answering a control question, plus a record of any collection problems — and to make it re-runnable.

> **Interactive lab.** This lab runs in your browser on the bootcamp site (Module 01 → Interactive lab) in a simulated terminal whose command outputs are CI-verified against a real Linux machine — the same commands on a real box give the same answers.

**Setup.** In the interactive lab (or any Unix-like shell), run `lab-setup 01`. It provides `~/lab01/access-export.csv` — deliberately messy rows and one malformed line — and puts the lab's parsing tool `parse-access-export` on your PATH (on your own machine, `labs/setup.sh` writes both and prints the PATH line to use).

**Tasks.**

1. Open a terminal. Before doing anything, write down — in words — what you expect the prompt to tell you. Run `pwd` and `ls`; reconcile reality with your expectation. *(Objective 3)*
2. Navigate into `~/lab01` using a relative path, then back to your home directory using `cd` with no argument, then back into `~/lab01` using an absolute path. State out loud which is which and why both reached the same place. *(Objective 3)*
3. Using `cat`, `grep`, and `wc` connected only by pipes, produce the count of access rows that grant a role containing the word `admin`. You may not use any single tool that "does it all." *(Objectives 4)*
4. Re-run task 3 but **redirect the count into** `~/lab01/evidence-admin-count.txt`, and confirm the file exists and contains exactly that number — without re-running the pipeline. *(Objective 4)*
5. One row in the export is malformed, and the lab's parsing tool complains about it — `parse-access-export` emits clean data rows on stdout and a `WARN:` complaint on stderr, exactly the §5.2 shape. Rebuild your evidence with `parse-access-export` as the first stage of your pipeline, capturing the complaint into `collection-errors.log` via stderr redirection while keeping your evidence file clean of it. Show that the two files contain different things and explain *why the channel separation made that possible*. *(Objectives 4, 5)*
6. Run a `grep -q` form of your check and inspect `$?`. State, in one sentence, what exit code corresponds to a control *pass* for this specific question and why. *(Objective 5)*
7. Put the working sequence from tasks 3–6 into a file `check-admin-access.sh`, make it run as one action, and run it twice. Confirm both runs produce identical evidence. Write one sentence connecting "it produced identical evidence twice" to continuous assurance. *(Objectives 6, 2)*

**Deliverables:** `evidence-admin-count.txt`, `collection-errors.log`, `check-admin-access.sh`, and a 4–6 sentence written explanation covering: where you were standing and how you knew; why the pipe composition worked; why stdout/stderr separation mattered; and what the exit code meant.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* access export provided at assessment time, the learner must, unaided and within 30 minutes, deliver:

- A re-runnable script that produces a single evidence file answering a stated control question via composed small programs (no all-in-one tool), with collection errors separated into their own log via stderr redirection, and that exits `0` exactly when the control passes.
- A spoken or written walkthrough that correctly: identifies their working directory and how they knew it; traces one command through the REPL steps; explains the pipe composition; explains the stdout/stderr separation; and states the pass/fail meaning of the exit code.

**Rubric** (each row Pass / Not-yet; all must be Pass):

| Criterion | Pass means |
|---|---|
| Orientation (Obj 3) | Correctly states location and surroundings from the prompt/`pwd`/`ls`, unprompted |
| REPL fluency (Obj 2) | Traces a command through read→evaluate→run→output without notes |
| Composition (Obj 4) | Solves it with piped small programs; no monolithic shortcut tool |
| Stream control (Obj 4,5) | Evidence file is clean; errors are in a separate log via `2>`; explains *why* |
| Verdict (Obj 5) | Uses the exit code as the machine-readable result; states pass-code correctly |
| Reproducibility (Obj 6) | Script runs twice with identical evidence; articulates the GRC link |
| Explanation quality (Obj 1) | Could explain "terminal vs shell" to a non-engineer using the origin story |

A "Not-yet" on any row routes the learner back to the specific concept section, not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3).

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are for learners who want a different voice or more breadth. None of this is load-bearing.*

- **The Linux Command Line** — William Shotts. Free book; broad reinforcement of navigation, redirection, and scripting. https://linuxcommand.org/tlcl.php — *use if you want a second, longer treatment of §4.*
- **MIT "The Missing Semester of Your CS Education"** — short university lectures on shell and tooling. https://missing.csail.mit.edu/ — *use for the data-wrangling angle on §4.3.*
- **OverTheWire: Bandit** — gamified SSH puzzles that drill exactly the §4 skills under pressure. https://overthewire.org/wargames/bandit/ — *use as extra practice after §6; pairs naturally with the security intuition this module seeds.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---

