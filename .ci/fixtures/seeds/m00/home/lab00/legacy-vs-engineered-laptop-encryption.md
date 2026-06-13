# Legacy-vs-Engineered Analysis: Laptop Encryption

## Control as a claim
Claim: Every employee laptop has full-disk encryption enabled.
Truth lives today in: the MDM device API (per-device encryption status), reachable right now.

## Five-problem scorecard (legacy)
- Manual toil, trivial output: an analyst collects a handful of encryption screenshots each quarter.
- Transactional relationship: IT is chased for evidence near audit time, treated as an evidence source.
- Whack-a-mole: a single drifted laptop is fixed once it is noticed, not the enrollment gap that caused it.
- Closed-framework focus: effort optimizes the SOC 2 binder wording rather than actual fleet encryption.
- Commoditized compliance: prior "automation" just emailed one screenshot faster, adding no assurance.

## Legacy arrow
Verified today as framework -> controls -> implementation -> evidence -> audit: reality is consulted
LAST, by hand, once a quarter, on a small sample.

## Engineered arrow (seven-stage loop)
- UNDERSTAND: the claim is "every laptop is encrypted, right now."
- LOCATE: the truth lives in the MDM device API.
- QUERY: authenticated, fully paginated call listing every enrolled device.
- EVALUATE: encryption flag == on for every device, expressed as policy-as-code.
- EVIDENCE: the full API response plus the pass/fail verdict, written to a versioned store.
- MONITOR: re-run on a schedule; alert the owner when any device flips to non-compliant.
- OWN: a named owner, with time-to-remediate-drift as the product metric.

## Inversion statement
Reality -> policy: instead of asking the binder whether the fleet complied, we ask the fleet
continuously and let what it reports drive the policy and the proof.
