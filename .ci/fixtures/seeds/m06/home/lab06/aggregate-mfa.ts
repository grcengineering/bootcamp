#!/usr/bin/env bun
// Module 06 lab core-logic harness (original lab asset).
//
// Proves the GRC-relevant CORE LOGIC of the §6 lab WITHOUT any network:
// it reads one or more already-fetched paginated API response pages (JSON files
// in cursor order), aggregates the `data` arrays ACROSS ALL pages, and computes
// the control metric "users without MFA". This is exactly the evaluation step the
// real lab performs after it has paginated a live SaaS API — but here the pages
// are committed fixtures, so the logic is testable on a clean machine.
//
// Usage:  bun aggregate-mfa.ts page-1.json page-2.json [...]
// Output: a single JSON object (the audit-ready record) on stdout.
//
// Exit codes (machine-readable verdict, per the curriculum's exit-code discipline):
//   0  control PASS  (no users without MFA)
//   3  control FAIL  (one or more users without MFA) — distinct from a tooling error
//   1  tooling error (bad args, unreadable/!valid JSON, page-count mismatch)

interface UserRecord {
  id: string;
  email: string;
  mfa_enabled: boolean;
  status: string;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  next_cursor: string | null;
}

interface ApiPage {
  data: UserRecord[];
  pagination: Pagination;
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const pagePaths = process.argv.slice(2);
if (pagePaths.length === 0) {
  fail("usage: bun aggregate-mfa.ts <page-1.json> [page-2.json ...]");
}

// LOCATE+QUERY are done (pages already fetched). This harness is the EVALUATE step:
// read each page, validate its shape, and concatenate the records.
const allUsers: UserRecord[] = [];
let expectedTotal: number | null = null;

for (const path of pagePaths) {
  const file = Bun.file(path);
  let page: ApiPage;
  try {
    page = (await file.json()) as ApiPage;
  } catch {
    fail(`could not read or parse JSON page: ${path}`);
  }
  if (!Array.isArray(page.data)) fail(`page ${path} has no 'data' array`);
  if (page.pagination && typeof page.pagination.total === "number") {
    // Every honest page advertises the same grand total; capture it once.
    expectedTotal = page.pagination.total;
  }
  for (const u of page.data) allUsers.push(u);
}

// COMPLETENESS CHECK: an evidence pull is only valid if it is COMPLETE.
// If the aggregated record count does not match the total the API advertised,
// pagination was truncated — the control result would be a lie. Fail loud.
if (expectedTotal !== null && allUsers.length !== expectedTotal) {
  fail(
    `incomplete pull: aggregated ${allUsers.length} users but API reported total=${expectedTotal} ` +
      `(missing pages? truncated pagination?)`,
  );
}

const withoutMfa = allUsers.filter((u) => u.mfa_enabled === false);
const activeWithoutMfa = withoutMfa.filter((u) => u.status === "active");

const record = {
  control: "MFA enforced for all workforce users",
  framework_ref: "SOC 2 CC6.1 / CIS Control 6.5",
  collected_at: "2026-05-28T00:00:00Z", // fixed for reproducible fixtures; real lab uses now()
  pages_aggregated: pagePaths.length,
  total_users: allUsers.length,
  users_without_mfa: withoutMfa.length,
  active_users_without_mfa: activeWithoutMfa.length,
  offending_users: withoutMfa.map((u) => ({ id: u.id, email: u.email, status: u.status })),
  control_result: withoutMfa.length === 0 ? "PASS" : "FAIL",
};

console.log(JSON.stringify(record, null, 2));
process.exit(record.control_result === "PASS" ? 0 : 3);
