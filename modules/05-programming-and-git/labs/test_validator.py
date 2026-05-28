"""Module 05 reference test suite (original lab asset) — meaningful assertions only.

Each test asserts an OBSERVABLE outcome that maps to a real control behavior:
good record passes, bad record fails, missing field fails, malformed file is
recorded as an error while good files are still judged. No coverage padding.
Run:  pytest -q   (from this directory)
"""
import json
import os
import tempfile

from validator import evaluate, validate_dir


def test_encrypted_is_pass():
    assert evaluate({"host": "lt-01", "encrypted": True}) == "PASS"


def test_unencrypted_is_fail():
    assert evaluate({"host": "lt-02", "encrypted": False}) == "FAIL"


def test_missing_field_is_fail():
    # Absence of evidence is not evidence of compliance.
    assert evaluate({"host": "lt-03"}) == "FAIL"


def test_malformed_is_recorded_and_good_files_still_judged():
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "good.json"), "w") as f:
            f.write(json.dumps({"host": "g", "encrypted": True}))
        with open(os.path.join(d, "bad.json"), "w") as f:
            f.write('{"host": "b", "encrypted": tr')  # malformed JSON
        report = validate_dir(d)
    # The malformed file is a recorded error, not a crash...
    assert any(e["file"] == "bad.json" for e in report["errors"])
    # ...and the good file is still judged.
    assert {"file": "good.json", "verdict": "PASS"} in report["results"]
