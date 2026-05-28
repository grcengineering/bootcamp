#!/usr/bin/env python3
"""Module 05 reference validator (original lab asset).

The control: "every laptop's disk is encrypted." Each evidence record is one JSON
file. This tool QUERIES a directory of such records, judges each against the control,
handles malformed files gracefully (records them as findings instead of crashing),
and writes a structured report (the EVIDENCE) of verdicts + unevaluable files.

Used by labs/happy-path.sh as the bundled-fixture smoke test of the EVALUATION LOGIC.
Run directly:  python3 validator.py <evidence-dir> [report.json]
"""
import json
import os
import sys


def evaluate(record):
    """Return 'PASS' when the record shows disk encryption is on, else 'FAIL'.

    A missing field is a FAIL: absence of evidence is not evidence of compliance.
    """
    return "PASS" if record.get("encrypted") is True else "FAIL"


def validate_dir(path):
    """Judge every evidence file in `path` against the control.

    Returns {"results": [{file, verdict}...], "errors": [{file, error}...]}.
    A malformed file becomes an error entry and does NOT abort the run.
    """
    results, errors = [], []
    for name in sorted(os.listdir(path)):
        full = os.path.join(path, name)
        try:
            with open(full) as f:
                record = json.loads(f.read())
        except (OSError, ValueError) as e:  # ValueError covers JSONDecodeError
            errors.append({"file": name, "error": str(e)})
            continue
        results.append({"file": name, "verdict": evaluate(record)})
    return {"results": results, "errors": errors}


def main(argv):
    if len(argv) < 2:
        print("usage: validator.py <evidence-dir> [report.json]", file=sys.stderr)
        return 2
    report = validate_dir(argv[1])
    out = argv[2] if len(argv) > 2 else None
    text = json.dumps(report, indent=2, sort_keys=True)
    if out:
        with open(out, "w") as f:
            f.write(text + "\n")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
