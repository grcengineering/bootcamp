# Lab 12 worksheet — the OSCAL set, traced before it is trusted

Fill each answer on its own line, keeping the line's leading label exactly as
shown. Your sources are the staged JSON documents and the validator's own
records — this worksheet is reconciliation, not memory.

## 1. The three pieces a valid catalog requires
Open acme-catalog.json and copy each value exactly as the file holds it
(for control-ids, list every control id the catalog defines, in order):

document-uuid:
metadata-title:
control-ids:

## 2. The profile is a selection over the catalog
Open acme-profile.json. Which catalog does it import, which control ids does
it put in scope — and which control does the catalog define that this
profile does NOT select?

imports-href:
in-scope-ids:
defined-but-not-selected:

## 3. The C2P chain, traced by identifier
Open acme-component.json and walk the join: the implemented requirement's
control id, the policy link's href, and the back-matter policy id that
href resolves to.

chain-control-id:
chain-link-href:
chain-policy-id:

## 4. The broken catalog, diagnosed
From the FAIL record you captured (oscal-broken-record.txt): the missing
required field, and the downstream consumer the validator says the defect
would break.

missing-required-field:
downstream-consumer-broken:
