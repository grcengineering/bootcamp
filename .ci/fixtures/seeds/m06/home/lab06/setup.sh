#!/usr/bin/env bash
# Module 06 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./fixtures, alongside this script)
#
# Writes a TWO-PAGE simulated SaaS "list users" API response. The pages model a
# real cursor-paginated endpoint: page 1 carries a non-null next_cursor, page 2
# carries next_cursor=null (the stop signal). Each page advertises the same grand
# total so a completeness check is possible. Eight users; four have mfa_enabled=false
# (one of those is suspended), so the control metric is unambiguous and verifiable.
set -euo pipefail
DEST="${1:-$(cd "$(dirname "$0")" && pwd)/fixtures}"
mkdir -p "$DEST"

cat > "$DEST/users-page-1.json" <<'JSON'
{
  "data": [
    { "id": "u_001", "email": "alice@acme.example", "mfa_enabled": true,  "status": "active" },
    { "id": "u_002", "email": "bob@acme.example",   "mfa_enabled": false, "status": "active" },
    { "id": "u_003", "email": "carol@acme.example", "mfa_enabled": true,  "status": "active" },
    { "id": "u_004", "email": "dave@acme.example",  "mfa_enabled": false, "status": "suspended" },
    { "id": "u_005", "email": "erin@acme.example",  "mfa_enabled": true,  "status": "active" }
  ],
  "pagination": {
    "page": 1,
    "per_page": 5,
    "total": 8,
    "next_cursor": "eyJwYWdlIjoyfQ=="
  }
}
JSON

cat > "$DEST/users-page-2.json" <<'JSON'
{
  "data": [
    { "id": "u_006", "email": "frank@acme.example", "mfa_enabled": false, "status": "active" },
    { "id": "u_007", "email": "grace@acme.example", "mfa_enabled": true,  "status": "active" },
    { "id": "u_008", "email": "heidi@acme.example", "mfa_enabled": false, "status": "active" }
  ],
  "pagination": {
    "page": 2,
    "per_page": 5,
    "total": 8,
    "next_cursor": null
  }
}
JSON

echo "Module 06 fixture written: $DEST/users-page-1.json, $DEST/users-page-2.json"
