# Module 05 — Programming & Git

*Loop stages: QUERY + EVIDENCE. Original content. Module 05 of the Common Core (Tier 1). Conforms to the standard module anatomy. Third-party material is confined to §8.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-programmer colleague, why a program is just data + decisions + repetition, and why that triad is enough to automate any evidence check a human does by eye.
2. **Compose** a small Python program from the four primitives — values held in variables, collections (lists and dicts), branching, and loops — and trace what each line does to the data as it runs.
3. **Produce** a function that reads a file, parses its contents, and returns a structured result, **and** wraps the risky parts in exception handling so one malformed input never aborts the whole run.
4. **Build** a `pytest` test suite whose assertions check observable behavior — the right verdict on a good file, graceful handling of a bad file — not lines merely touched for coverage's sake.
5. **Diagnose** a failing run from the test output and the program's own error report, distinguishing "my logic is wrong" from "the input was malformed and the program correctly said so."
6. **Map** the Git change-management loop — branch → commit → pull request → merge — onto the GRC control it *is*: who changed what, who reviewed it, and the immutable record proving both.
7. **Produce** a Git history in which a feature arrives on its own branch, is reviewed in a pull request, and merges into the main line — so the repository itself is audit evidence for change control.

Each objective is checked by the Assessment in §7. If you can already produce the §7 artifact unaided — a Git-versioned, tested evidence validator with a reviewed-and-merged feature branch — this module is your placement test. Pass it and move on.

---

## 2. Why this matters for GRC

A GRC engineer's day is a stack of repeated judgments: *does this evidence file show the control held?* Done by eye, that judgment is slow, inconsistent between reviewers, and leaves no trail you can re-run next quarter. Programming is how you move from QUERY done by hand to QUERY done by a machine that never gets bored and always judges the same way — you write the rule once, in code, and it evaluates every file the same way forever. Git is the other half: it turns the *act of changing that rule* into EVIDENCE. Every edit to your validator lands as a signed, timestamped, reviewed commit, so the history of your evidence-collection logic is itself a change-management control with a built-in audit trail. This module is the centerpiece of Tier 1 because nearly every later stage — APIs, policy-as-code, continuous monitoring — is *a program you wrote, versioned in Git, that pulls a control's truth and judges it*. Learn this and the rest is scale.

---

## 3. The Mental Model

Two ideas live in this module, and they are usually taught as if they were unrelated. They are not. So start with the one question that unites them: **what is the smallest set of things you need before a computer can do a piece of your job, and prove it did?**

### Programming is three primitives, then everything else is arrangement

Forget syntax for a moment. Watch yourself do a manual evidence review. Someone hands you a folder of files — say, one encryption-status report per laptop. You open each, you *hold a fact in your head* ("this laptop's disk is encrypted: yes"), you *decide* ("yes counts as a pass"), and you *repeat* that for every file in the folder, *keeping a tally* as you go. When you're done you write a summary.

That is the entire job, and it is built from exactly three things:

1. **Remembering a value.** You held "encrypted: yes" in your head. A program holds it in a **variable** — a named box you can put a value in and read back later. `status = "encrypted"`. Nothing more mystical than a labelled sticky note.
2. **Deciding based on a value.** "If encrypted, it's a pass; otherwise, a finding." A program decides with a **conditional** — `if` / `else`. The computer compares and branches, exactly as you did.
3. **Repeating over many things.** You did the same review for every file. A program repeats with a **loop** — "for each file in the folder, do this." The loop is what makes a program worth writing: you describe the work *once* and it runs *N* times without tiring.

That is the whole of programming's core. Everything else — the libraries, the frameworks, the clever syntax — is just *better ways to arrange those three moves and the data they act on*. A program is **data + decisions + repetition.** Hold that and Python stops being a foreign language; it becomes a precise way to write down what you already do by hand.

One more piece completes the picture: you don't want to glue all your decisions into one long ribbon of instructions, because then you can't reuse any of it or test any of it in isolation. So you give a named, self-contained chunk of work a handle: a **function**. A function takes some input, does its three-primitive work, and hands back a result. `is_encrypted(report)` takes one report and returns `True` or `False`. Once a judgment lives in a function, you can call it from anywhere, and — crucially for us — you can *test it in isolation*: feed it a known input, assert you get the known-correct output. A judgment you can test is a control you can trust.

### Git is a control, not a developer convenience

Now the second idea, and the reframe that matters most for a GRC engineer. You have heard Git described as "version control for code" or "undo for programmers." Both are true and both bury the point. Look at what Git actually records and you'll recognise an old friend.

A **commit** is a snapshot of every file at a moment in time, stamped with *who* made it, *when*, and a message saying *why* — and bound by a cryptographic hash so it cannot be silently altered after the fact. Tampering with history changes the hash, which is detectable. Read that sentence again as a GRC engineer: *who changed what, when, why, immutably recorded, tamper-evident.* That is the literal definition of a **change-management control** — the thing auditors ask you to prove for every production system you own. Git is not *like* a change-management control. For your code, Git *is* the change-management control, and it comes for free the moment you use it honestly.

The workflow is where the control gets teeth. You don't edit the main line of history directly. You make a **branch** — a parallel line of development, a sandbox where your change lives until it's ready. You do your work there as a series of commits. When the change is ready, you open a **pull request** (PR): a formal proposal that says "here is my change; review it before it joins the main line." Someone *else* reads it, comments, approves — and only then does it **merge** into the main branch. Map that onto the control: branch = the change is isolated and can't touch production until approved; PR = the segregation-of-duties and review requirement, the second pair of eyes; merge = the approved change, recorded forever with the reviewer's name attached. A team that works this way is *generating* change-management evidence as an automatic by-product of how they work. They never have to "collect evidence for change control" — the evidence is the Git log.

### Why these two ideas are one module

Here is the join. You will write a Python program that judges evidence. That program is *itself a control's logic* — it decides pass/fail. The logic of a control must be trustworthy, which means it must be *tested* (so you know it judges correctly) and *change-managed* (so you know nobody altered the judgment without review). Python gives you the tested logic. Git gives you the change-managed history of that logic. Put them together and you have built a small, honest, self-evidencing control engine: a program that QUERIES evidence and emits a verdict, living in a repository that is its own change-management EVIDENCE. That object — tested code under reviewed version control — is the unit you will build at every higher tier. This module is where you make your first one.

---

## 4. Concepts

### 4.1 Variables and types — values you name and the kind of thing they are

A **variable** is a name bound to a value. `count = 0` puts the number `0` in a box called `count`. The value has a **type** — the *kind* of thing it is, which determines what you can do with it. The four you'll use constantly: a **string** (text, in quotes: `"encrypted"`), an **integer** (a whole number: `42`), a **boolean** (a truth value: `True` or `False`), and `None` (the explicit "no value here"). Types matter because operations are type-specific — you can add two integers, but adding an integer to a string is a category error the language will refuse. Knowing the type of a value is half of knowing what your program can do with it.

```python
control_id = "CC6.1"     # string
findings = 0             # integer
passed = True            # boolean
reviewer = None          # explicitly "not set yet"
```

### 4.2 Collections — lists and dicts, where evidence actually lives

A single value is rarely the whole story. Evidence comes in *collections*. Two carry almost everything in GRC work.

A **list** is an ordered sequence of values — a folder of filenames, a column of results, the rows of a report. You can loop over it, count it, filter it. `hosts = ["db-07", "web-01", "web-02"]`. A **dict** (dictionary) is a set of *key → value* pairs — a lookup table, and the natural shape of a single evidence record. A laptop's encryption report is a dict: `{"host": "laptop-19", "encrypted": True, "checked_at": "2026-05-28"}`. You reach a value by its key: `record["encrypted"]` gives `True`. Almost every real evidence file — a JSON API response, a parsed CSV row — arrives as a list of dicts: many records, each a labelled bag of fields. Learn to think in "list of dicts" and most evidence data stops being mysterious.

```python
records = [
    {"host": "laptop-19", "encrypted": True},
    {"host": "laptop-20", "encrypted": False},
]
for r in records:           # loop over the list
    print(r["host"], r["encrypted"])   # reach into each dict by key
```

### 4.3 Control flow — conditionals and loops, the decision and the repetition

A **conditional** runs different code depending on a truth value. `if record["encrypted"]: ...` runs the indented block only when the value is true; an `else:` block runs otherwise. This is the *decision* primitive — it is where your control's pass/fail logic lives. A **loop** repeats a block over a collection: `for record in records:` runs the body once per record. This is the *repetition* primitive — it is what lets one written rule judge a thousand files. Indentation, not braces, defines the block in Python: the indented lines under an `if` or `for` are what runs inside it. Get the indentation wrong and you've changed the program's meaning, which is a common early bug worth naming now.

```python
findings = []
for r in records:
    if not r["encrypted"]:           # the control's decision
        findings.append(r["host"])   # remember the failing host
# findings now holds every host that failed the encryption control
```

### 4.4 Functions — naming a judgment so you can reuse and test it

A **function** packages a piece of work behind a name, takes **arguments** (its inputs), and **returns** a result (its output). `def evaluate(record): ...` defines one; `evaluate(some_record)` calls it. The discipline that matters here: a function should do *one* thing and return a *clear* result. A function that takes one evidence record and returns the string `"PASS"` or `"FAIL"` is a control's atom — small, named, and testable. The moment your judgment lives in a function, you can hand it a known input and check the output without running the whole program. That testability is not a nicety; it is what makes the judgment trustworthy enough to put in front of an auditor.

```python
def evaluate(record):
    """Return PASS if the host's disk is encrypted, else FAIL."""
    return "PASS" if record.get("encrypted") else "FAIL"
```

### 4.5 Files and exceptions — reading reality without crashing on the one bad file

Evidence lives in files, so a program must **open**, **read**, and **parse** them. Python opens a file with `open(path)` and parses structured text with a library — `json.loads(text)` turns JSON text into a dict or list. But reality is messy: a file may be truncated, a JSON record may be malformed, a field you expected may be missing. If you don't plan for that, the *first* bad file aborts the *entire* run — and an evidence collector that dies on row 3 of 500 is worse than useless, because it silently leaves out 497 records and you may not notice.

The tool for this is the **exception**: when something goes wrong, Python "raises" an exception that, if uncaught, stops the program. You catch it with `try` / `except`: attempt the risky operation in the `try` block; if it raises, the `except` block runs instead of crashing. This is the difference between a brittle script and a *defensible* evidence tool. A good validator does not pretend bad input can't happen — it catches the malformed file, records *that this file could not be evaluated and why*, and moves on to the rest. The "we couldn't read this one" is itself a finding, and an honest report includes it.

```python
def load_record(path):
    try:
        with open(path) as f:
            return json.loads(f.read())     # the risky parse
    except (OSError, json.JSONDecodeError) as e:
        return {"error": f"could not read {path}: {e}"}   # a finding, not a crash
```

### 4.6 Testing with meaningful assertions — proving the judgment is correct

A test is a tiny program that runs your code against a *known* input and **asserts** the result equals the *known-correct* answer. With `pytest`, any function named `test_*` containing an `assert` is a test; if the asserted condition is false, the test fails and tells you exactly where. The non-negotiable rule — and it is a rule you will be held to at every tier — is that an assertion must check an **observable outcome that maps to real behavior**. `assert evaluate({"encrypted": True}) == "PASS"` is meaningful: it checks the control reaches the right verdict on a known-good record. By contrast, calling a function and asserting nothing — running the line only to make a coverage number go up — is *coverage padding*, and it is forbidden, because it gives the false comfort of a "tested" control that was never actually checked. The honest test of your validator includes at least: the right verdict on a good record, the right verdict on a bad record, and graceful, recorded handling of a malformed file. If a line of your code can't be reached by any meaningful test, that line is probably wrong or dead — fix or delete it, don't pad around it.

```python
def test_passes_encrypted_host():
    assert evaluate({"encrypted": True}) == "PASS"

def test_fails_unencrypted_host():
    assert evaluate({"encrypted": False}) == "FAIL"
```

### 4.7 The Git change-management loop — branch, commit, PR, merge

Git records work as **commits** — immutable, hashed, authored, timestamped snapshots with a message saying why. You don't commit straight to the main line; you cut a **branch** (`git switch -c add-encryption-check`), do your work there as commits, then open a **pull request** so a *different* person reviews it before it **merges** into `main`. Each step is a control surface: the branch isolates unapproved change, the PR enforces review (segregation of duties — author ≠ approver), and the merge records the approved change with the reviewer attached. A commit message is not bureaucratic noise; it is the "why" field of your change-management record, and a vague one (`fix stuff`) weakens the evidence exactly as a blank change-ticket reason would. The reflex to build here: *no change to a control's logic reaches the main line without a branch, a commit that explains itself, and a second pair of eyes on a PR.* Work that way and you never "produce change-management evidence" — you simply have it.

```
git switch -c add-malformed-handling   # branch: isolate the change
# ... edit code, add a test ...
git add validator.py tests/test_validator.py
git commit -m "Handle malformed evidence files as findings, not crashes"
git push -u origin add-malformed-handling
# open a PR, get review + approval, then merge to main
```

---

## 5. Worked Examples

> These are illustrative and GRC-framed. Code is shown with representative output; your exact output will differ. (Worked examples are Tier-B content — reviewed when tooling shifts.)

### 5.1 The control's atom: one judgment, named and tested

Claim to verify: *"every laptop's disk is encrypted."* The truth of that claim, for a single laptop, lives in one evidence record. So the smallest honest unit is a function that judges *one* record, plus the tests that prove it judges correctly.

```python
def evaluate(record):
    """PASS when the record shows disk encryption on; FAIL otherwise."""
    return "PASS" if record.get("encrypted") is True else "FAIL"
```

```python
# tests/test_evaluate.py
def test_encrypted_is_pass():
    assert evaluate({"host": "lt-01", "encrypted": True}) == "PASS"

def test_unencrypted_is_fail():
    assert evaluate({"host": "lt-02", "encrypted": False}) == "FAIL"

def test_missing_field_is_fail():
    assert evaluate({"host": "lt-03"}) == "FAIL"   # absence is not a pass
```

```
$ pytest -q
...                                                                      [100%]
3 passed in 0.01s
```

Three assertions, three real behaviors: a good record passes, a bad one fails, and — the one beginners forget — a record *missing* the field fails rather than silently passing. That last test encodes a GRC judgment: missing evidence is not evidence of compliance. The control's atom is now trustworthy because it is proven, not assumed.

### 5.2 Scaling the judgment over a folder, surviving the bad file

Now apply the atom to a directory of records and produce a report — and refuse to let one malformed file sink the run.

```python
import json, os

def validate_dir(path):
    results, errors = [], []
    for name in sorted(os.listdir(path)):
        full = os.path.join(path, name)
        try:
            with open(full) as f:
                record = json.loads(f.read())
        except (OSError, json.JSONDecodeError) as e:
            errors.append({"file": name, "error": str(e)})   # a finding, not a crash
            continue
        results.append({"file": name, "verdict": evaluate(record)})
    return {"results": results, "errors": errors}
```

```
$ python -c "import json,validator; print(json.dumps(validator.validate_dir('evidence'), indent=2))"
{
  "results": [
    {"file": "lt-01.json", "verdict": "PASS"},
    {"file": "lt-02.json", "verdict": "FAIL"}
  ],
  "errors": [
    {"file": "lt-05.json", "error": "Expecting value: line 1 column 32 (char 31)"}
  ]
}
```

The malformed `lt-05.json` did **not** abort the run; it became a recorded error while the two good files were still judged. The report carries both the verdicts *and* an honest list of what couldn't be evaluated. That second list is the difference between a script and a defensible evidence tool — an auditor can see exactly which inputs were judged and which were skipped, and why.

### 5.3 The change as a reviewed branch — the control's audit trail

Suppose the first version of `validate_dir` crashed on malformed files, and you're adding the graceful handling from 5.2. Watch the change *become evidence*.

```
$ git switch -c handle-malformed-evidence
Switched to a new branch 'handle-malformed-evidence'
$ # ...edit validator.py to add the try/except, add test_malformed_is_recorded...
$ git add validator.py tests/test_validator.py
$ git commit -m "Record malformed evidence files as errors instead of crashing"
[handle-malformed-evidence 9f3c1aa] Record malformed evidence files as errors instead of crashing
 2 files changed, 14 insertions(+), 2 deletions(-)
$ git push -u origin handle-malformed-evidence
```

You open a PR titled the same as the commit. A teammate reviews the diff, sees the new `test_malformed_is_recorded` proving the behavior, approves, and merges. The resulting `git log` on `main` now reads, in part:

```
$ git log --oneline --graph
*   2b7d4e1 Merge pull request #4: Record malformed evidence files as errors
|\
| * 9f3c1aa Record malformed evidence files as errors instead of crashing
|/
* a01ee52 Add encryption-control validator with tests
```

Read that as the control it is: a change to evidence-collection logic, isolated on a branch, explained in its commit, reviewed by a second person on PR #4, and merged with the review recorded forever. Nobody "collected change-management evidence." The team simply worked correctly, and the log *is* the evidence — re-runnable, tamper-evident, attributable.

### 5.4 Reading the failure correctly — logic bug vs. honest finding

You run the suite and see red. The skill is telling *which* kind of red it is.

```
$ pytest -q
.F.                                                                      [100%]
=================================== FAILURES ===================================
________________________ test_missing_field_is_fail ____________________________
    def test_missing_field_is_fail():
>       assert evaluate({"host": "lt-03"}) == "FAIL"
E       AssertionError: assert 'PASS' == 'FAIL'
1 failed, 2 passed in 0.02s
```

This failure is *your logic*, not bad input: `evaluate` returned `PASS` for a record with no `encrypted` field, which means the function treats "missing" as "fine." The test caught a real defect in the control's judgment — exactly its job. Contrast that with the run in 5.2, where `lt-05.json` produced an *error entry* in the report and the program kept going: that was the program *correctly reporting malformed input*, not a bug. Same word, "error," two different worlds — a failing assertion means *fix the code*; a recorded error in the report means *the code worked and the input was bad*. A GRC engineer who confuses the two either ships a broken control or chases ghosts. Read the message: a `pytest` failure points at your assertion; a report error points at the input.

---

## 6. Guided Lab

> Original lab. ~90–120 minutes (this is the centerpiece module — budget the time). Tier-B content (environment-dependent). You need Python 3, `pytest` (`pip install pytest`), and `git` configured with your name and email. No prior programming experience assumed.

**Scenario.** You own the laptop-encryption control. You are handed a directory of raw evidence files — one JSON record per laptop, plus the inevitable malformed one — and asked to build a tool that QUERIES them, judges each against the control, handles the bad file without dying, writes a structured report, ships meaningful tests, and lives in a Git repository whose history is itself change-management evidence.

**Setup.** Create a working directory and generate fixtures: `bash labs/setup.sh evidence/` writes a folder of evidence JSON files including one deliberately malformed file. Initialise a repository: `git init`, then `git add` and an initial commit of an empty `validator.py` so you have a clean starting point on `main`.

**Tasks.**

1. Write `evaluate(record)`: a function returning `"PASS"` when `record["encrypted"]` is exactly `True`, else `"FAIL"`. Then write three tests — good record passes, unencrypted fails, *missing field* fails — and run `pytest` until green. State in one sentence why "missing field → FAIL" is the GRC-correct choice. *(Objectives 3, 4)*
2. Write `validate_dir(path)`: loop over every file in the directory, parse each as JSON, call `evaluate`, and collect a list of `{file, verdict}` results. Run it against `evidence/` and look at the output. *(Objectives 2, 3)*
3. Run task 2 against the directory containing the malformed file. Observe the crash. Now wrap the parse in `try`/`except` so a malformed file becomes a recorded error (`{file, error}`) and the loop continues. Re-run and confirm the good files are still judged. *(Objectives 3, 5)*
4. Add `test_malformed_is_recorded`: assert that running `validate_dir` over a folder with a malformed file returns at least one entry in `errors` and still returns verdicts for the good files. This is the assertion that proves graceful handling — not a coverage line. *(Objective 4)*
5. Have your tool write a structured report to `report.json` containing `results` and `errors`. Open it and confirm it honestly shows both what was judged and what couldn't be. *(Objectives 3, 5)*
6. Now do tasks 2–5 *as a change-managed feature*. The encryption check from task 1 is your first commit on `main`. For the malformed-handling work, cut a branch (`git switch -c handle-malformed`), commit it with a message that explains *why*, push, and open a pull request. Have a teammate (or, solo, your own second review on a different machine/account if available — otherwise self-review and note it) approve and merge. *(Objectives 6, 7)*
7. Run `git log --oneline --graph` and read your own history aloud as a change-management control: which commit is the isolated change, where is the review/merge, who approved. Write two sentences mapping each Git step to the change-management control element it satisfies. *(Objectives 6, 7)*

**Deliverables:** a Git repository containing `validator.py` (with `evaluate` and `validate_dir`), `tests/` with at least four meaningful assertions (good, bad, missing-field, malformed-recorded), a generated `report.json`, **≥1 merged feature-branch pull request** visible in the log, and a 4–6 sentence written explanation covering: why missing evidence is a FAIL; how the malformed file is handled without crashing; why each test asserts real behavior rather than padding coverage; and how the branch→PR→merge history satisfies change management.

---

## 7. Assessment

**Competency artifact (not a quiz).** From a *fresh, unseen* directory of evidence files provided at assessment time, the learner must, unaided and within 60 minutes, deliver:

- A **Git-versioned Python tool** that reads a directory of raw evidence files, validates each against a stated control checklist, **handles malformed input gracefully** (records it as a finding rather than crashing), and **writes a structured report** showing both verdicts and unevaluable files.
- A **`pytest` suite with meaningful assertions** — at minimum: a correct PASS on a good record, a correct FAIL on a bad record, a correct FAIL on a record missing the checked field, and proof that a malformed file is recorded as an error while good files are still judged. No assertion-free coverage padding.
- A Git history containing **≥1 feature delivered on its own branch, reviewed in a pull request, and merged** into the main line — so the repository is its own change-management evidence.
- A short **written or spoken walkthrough** that correctly: traces one record through `evaluate`; explains why a malformed file is a recorded finding and a failing assertion is a logic bug; names one test and what real behavior it proves; and maps branch → PR → merge onto the change-management control.

**Scoring.** Score against `assessment/rubric.md`. Every row must be **Pass**. A single **Not-yet** routes the learner back to the specific concept section named in the rubric — not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3).

| Criterion | Objective | Pass means |
|---|---|---|
| Compose from primitives (O2) | Reads a directory and judges records using variables, a collection, a conditional, and a loop — and can trace the data flow |
| Function + file + exceptions (O3) | A parse-and-judge function reads files and survives a malformed one via `try`/`except`, recording it rather than crashing |
| Meaningful tests (O4) | Suite asserts good-pass, bad-fail, missing-field-fail, and malformed-recorded; no assertion-free coverage padding |
| Diagnose correctly (O5) | Distinguishes a failing assertion (logic bug) from a recorded report error (honest finding) and acts accordingly |
| Git-as-control mapping (O6) | Maps branch/commit/PR/merge to who-changed-what / review / immutable record, in their own words |
| Change-managed history (O7) | History shows ≥1 feature branch reviewed in a PR and merged; commit messages explain *why* |
| Explanation quality (O1) | Could explain "a program is data + decisions + repetition" to a non-programmer |

A "Not-yet" on any row routes the learner back to the specific concept section (see `rubric.md`), not the whole module. Per-criterion pass-rates are the telemetry that flags this module for revision (maintenance Loop 3).

---

## 8. Supplemental Learning Material

*Entirely optional. Everything required by §1 is taught above; these are for learners who want a different voice or more breadth. None of this is load-bearing — a learner who clicks zero links still meets every objective.*

- **Automate the Boring Stuff with Python (3rd Ed.)** — Al Sweigart. Free online; the non-engineer automation book. https://automatetheboringstuff.com/ — *use if you want a longer, gentler treatment of §4.1–4.5 (variables, collections, files) with everyday automation examples.*
- **Python Crash Course (3rd Ed.)** — Eric Matthes. https://nostarch.com/python-crash-course-3rd-edition — *use for a stronger structured spine on data structures, functions, classes, and especially testing (§4.4, §4.6).*
- **Exercism — Python track** — free, mentored deliberate practice. https://exercism.org/tracks/python — *use after §6 to drill the §4 primitives on small problems with human feedback.*
- **GitHub Skills** — interactive, in-the-real-workflow Git/GitHub courses. https://skills.github.com/ — *use to practise the §4.7 branch → PR → merge loop hands-on in a real repository.*
- **Pro Git** — Scott Chacon & Ben Straub. Free; chapters 1–3 are the conceptual backstop. https://git-scm.com/book/en/v2 — *use if you want the authoritative "why" behind commits, branches, and the object model in §4.7.*
- **Learn Git Branching** — visual, interactive branching/merge sandbox. https://learngitbranching.js.org/ — *use to make branching and merging from §4.7 click visually before you do it for real.*

*(Links are CI-link-checked. A dead link here is a build failure that opens a maintenance task — it does not silently rot.)*

---
