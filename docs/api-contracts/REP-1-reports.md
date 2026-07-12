# REP-1 — Reports Module: Cross-Module Analytics (API + Web)

**Save location:** `docs/api-contracts/REP-1-reports.md`
**Scope:** apps/api (read-only aggregation endpoints) + apps/web (reports section). Audit Phase B item: today only finance has reports; this adds attendance trends, exam analytics, and fee aging, with CSV export throughout. Mobile out of scope.
**Baseline:** 485 api tests, all-green on main.

---

## Design principles (fixed)
- **Read-only module.** No new tables, no migrations — pure aggregation over existing data. Raw SQL where aggregation demands it, through the tenant-scoped service discipline (and mindful of the CLAUDE.md raw-SQL gotchas: text ids, camelCase public columns, ::date casts on tenant DATE columns).
- **BS-aware grouping is the differentiator.** Schools think in BS months (Baishakh–Chaitra), not AD months. Monthly buckets group by BS month via the bs-calendar package (grouping key computed in the service from the AD date column — document the approach; no SQL-side BS math). Date-range inputs accept AD (client sends AD; the web UI shows BS pickers per existing patterns).
- **Roles:** attendance + exam reports → PRINCIPAL_AND_ABOVE + ACADEMIC_COORDINATOR; fee aging → those + ACCOUNTANT. Parity rows cited per SEC-2 convention.
- **Every report has CSV export** (reuse POL-1's client-side CSV pattern; BS dates formatted as displayed).
- Performance guard: every endpoint takes a bounded date range (default: current BS year), and the session reports each query's EXPLAIN-style sanity (no seq-scan disasters on the big tables; add an index ONLY if measurement demands it — that would be a migration and must be flagged first).

## Step 0 — Read and report
1. The attendance tables' shape (student + staff) and volume in the busiest tenant (row counts — informs the performance guard).
2. The exam results pipeline's final tables (computed results, grades, ranks) — what's aggregable without recomputation.
3. Invoice/payment tables for aging (due_date, balance semantics, PARTIAL handling).
4. The existing finance report service — conventions to match (it's the in-house prior art).
5. bs-calendar's API for AD→BS month bucketing.

## Reports to build
### T1 — Attendance trends
- `GET /reports/attendance/trends`: params classId?, sectionId?, from, to, groupBy=day|bs-month → present/absent/leave counts + rate per bucket. Class-comparison variant (all sections of a class side by side).
- Low-attendance list: students below a threshold % in the range (name, section, rate) — the actionable output principals actually want.
- Staff attendance summary (per staff, range).

### T2 — Exam analytics
- `GET /reports/exams/summary`: per exam → per-subject average, highest/lowest, pass rate (vs the grading scale's pass threshold), grade distribution (count per grade).
- Class/section comparison for one exam; student-progress endpoint (one student across published exams — feeds future parent views but web-only now).
- Only PUBLISHED results are visible (the publish edge is the privacy boundary).

### T3 — Fee aging
- `GET /reports/finance/aging`: outstanding balances bucketed 0–30 / 31–60 / 61–90 / 90+ days past due (as of a given date, default today Kathmandu), per class and total; drill-down list per bucket (student, invoice, balance, days) — reconcile semantics with the existing defaulters report (report overlap; don't duplicate meaning, link them).

### T4 — Web
`/reports` section: three tabs (Attendance / Exams / Fees), filter bars (class/section/range with BS pickers), charts where the repo's established chart approach exists (Step 0: check what the dashboard uses — recharts?) else clean tables; CSV export per view; QueryErrorState wired (POL-1 pattern); sidebar entry + ROUTE_ACCESS rows.

### T5 — Tests
Aggregation correctness on crafted fixtures (known counts in → exact buckets out), BS-month bucketing across a BS year boundary, aging boundary days (30/31), publish-boundary exclusion, role probes. Suite ≥485.

## Verification — raw
1. Crafted-fixture proofs per report: seed a small known dataset (e.g. 10 students, deterministic attendance pattern) → endpoint output matches hand-computed expectations exactly (paste both). Clean up with read-backs.
2. BS-month bucket proof: a range spanning two BS months shows correct bucket labels + splits (cross-check one date against the bs-calendar table).
3. Aging boundary: invoice 30 vs 31 days past due lands in different buckets (paste).
4. Publish boundary: unpublished exam absent from analytics (paste before/after publish).
5. Role probes: ACCOUNTANT gets aging 200 but exam analytics 403 (raw).
6. Busiest-tenant timing: each endpoint's response time on motherland's real data pasted; flag anything >1s.
7. Web: each tab renders + CSV export sample rows. Suite ≥485 (+new), push, all-green, PR per standing rule.

## Out of scope
Mobile report views, PDF report exports, scheduled/emailed reports, dashboard-widget integration, new indexes unless measured-and-flagged, inventory module.
