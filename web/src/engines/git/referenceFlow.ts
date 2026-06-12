/**
 * Module-05 git reference flow — the single source of truth for the scripted
 * change-management flow taught in modules/05-programming-and-git/module.md §5-§6.
 *
 * BOTH sides of the fidelity contract import these constants:
 *   - `.ci/fixtures/capture-git.ts` replays the flow through REAL git (pinned identity +
 *     GIT_AUTHOR_DATE/GIT_COMMITTER_DATE) and stores porcelain captures as
 *     `.ci/fixtures/captured/m05-git-*.json` (match: synthesized-porcelain);
 *   - `web/tests/engines-git.test.ts` replays the same flow through the isomorphic-git
 *     engine and byte-diffs the synthesized porcelain against those captures.
 *
 * Because git's object model is content-addressed and every input here is pinned
 * (bytes, modes, identity, timestamps, timezone), the engine MUST reproduce the real
 * captures' commit SHAs exactly — that equality is the honesty proof for the
 * synthesized-porcelain class (web ISA ISC-66).
 */

export const GIT_IDENTITY = { name: "analyst", email: "analyst@workstation" } as const;

/** 2026-06-01T09:00:00Z — the fixture epoch (.ci/fixtures/manifest.yaml meta.epoch). */
export const COMMIT_1 = {
  message: "Start with an empty validator on main",
  timestamp: 1780304400,
  timezoneOffset: 0,
} as const;

/** epoch + 5 minutes. */
export const COMMIT_2 = {
  message: "Record malformed evidence files as errors instead of crashing",
  timestamp: 1780304700,
  timezoneOffset: 0,
} as const;

export const DEFAULT_BRANCH = "main";
export const FEATURE_BRANCH = "handle-malformed";
export const REPO_DIR = "lab05";

/** §6 step 1: an empty validator.py is the clean starting point on main. */
export const VALIDATOR_V1 = "";

/**
 * §6 step 6: the malformed-handling change (condensed from labs/validator.py — original
 * lab asset; byte-pinned here so capture and engine hash identical blobs).
 */
export const VALIDATOR_V2 = `import json
import os


def evaluate(record):
    return "PASS" if record.get("encrypted") is True else "FAIL"


def validate_dir(path):
    results, errors = [], []
    for name in sorted(os.listdir(path)):
        try:
            with open(os.path.join(path, name)) as f:
                record = json.loads(f.read())
        except (OSError, ValueError) as e:
            errors.append({"file": name, "error": str(e)})
            continue
        results.append({"file": name, "verdict": evaluate(record)})
    return {"results": results, "errors": errors}
`;

export const TEST_VALIDATOR = `from validator import evaluate


def test_pass_when_encrypted():
    assert evaluate({"encrypted": True}) == "PASS"


def test_missing_field_fails():
    assert evaluate({}) == "FAIL"
`;

/** The scripted flow, one entry per captured porcelain step (capture ids m05-git-<id>). */
export interface FlowStep {
  id: string;
  /** What the learner types (the engine's input line). */
  cmd: string;
  /** Files written to the worktree BEFORE this step runs (path → bytes). */
  writes?: Record<string, string>;
}

export const REFERENCE_FLOW: FlowStep[] = [
  { id: "init", cmd: "git init" },
  { id: "status-empty", cmd: "git status" },
  { id: "status-untracked", cmd: "git status", writes: { "validator.py": VALIDATOR_V1 } },
  { id: "add", cmd: "git add validator.py" },
  { id: "status-staged", cmd: "git status" },
  { id: "commit-initial", cmd: `git commit -m "${COMMIT_1.message}"` },
  { id: "log-oneline-initial", cmd: "git log --oneline" },
  { id: "switch-create", cmd: `git switch -c ${FEATURE_BRANCH}` },
  {
    id: "status-mixed",
    cmd: "git status",
    writes: { "validator.py": VALIDATOR_V2, "test_validator.py": TEST_VALIDATOR },
  },
  { id: "add-multi", cmd: "git add validator.py test_validator.py" },
  { id: "commit-feature", cmd: `git commit -m "${COMMIT_2.message}"` },
  { id: "log-oneline-feature", cmd: "git log --oneline" },
  { id: "log-graph", cmd: "git log --oneline --graph" },
  { id: "branch", cmd: "git branch" },
  { id: "switch-main", cmd: "git switch main" },
  { id: "merge-ff", cmd: `git merge ${FEATURE_BRANCH}` },
  { id: "status-clean", cmd: "git status" },
  { id: "log-graph-merged", cmd: "git log --oneline --graph" },
];
