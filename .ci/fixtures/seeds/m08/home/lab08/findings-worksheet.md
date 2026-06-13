# Lab 08 worksheet — storage controls, checked before anything exists

Fill each answer on its own line, keeping the line's leading label exactly as
shown. Your sources are the committed fixtures and the gate's own output —
this worksheet is reconciliation, not memory.

## 1. Prediction -> reconciliation
Read main-noncompliant.tf FIRST and write your prediction; then open
checkov-noncompliant.json and reconcile. One line per control question:
<question>: <PASS|FAIL> <check_id> <severity>

encryption:
public-access:
versioning:

## 2. Blocking finding -> named control
From the gate's block record (gate-block-record.txt): <check_id> -> <control_id>

CKV_AWS_19 ->
CKV_AWS_20 ->

## 3. Remediation lines
From main-compliant.tf: <check_id> fixed by: <the block or setting that remediates it>

CKV_AWS_19 fixed by:
CKV_AWS_20 fixed by:
