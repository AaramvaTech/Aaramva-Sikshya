# BILLING-CUTOVER Phase 3 — Nav retirement

**Status:** Done. Admin sidebar's old-rail "Finance" dropdown removed (Billing is now the sole
finance nav path); two stale internal links pointing at old Finance routes fixed. Parent portal
needed no change (confirmed, not assumed — see below). Teacher portal out of scope per Phase 2's
already-confirmed finding.

## Admin: "Finance" dropdown removed

`components/layout/sidebar.tsx` had two parallel top-level sections: "Finance" (old rail —
Overview `/finance`, Invoices `/finance/invoices`, Fee Structures `/finance/fee-structures`,
Reports `/finance/reports`) and "Billing" (the Billing rail, already the primary UI since UI-1
through UI-7 shipped). The "Finance" entry is now deleted; "Billing" is the only finance-related
top-level nav item. The now-unused `CreditCard` icon import was removed with it.

## Internal links fixed (found by grepping the whole app for non-`/finance/bill` `/finance*` hrefs)

Two real links outside the old Finance page tree itself still pointed at old-rail routes:

1. **Dashboard "Record Payment" quick action** (`app/(school)/dashboard/page.tsx`) — was
   `/finance/invoices`, now `/finance/bill/payments/new`. Clean 1:1 fix: that Billing page's whole
   purpose is recording a payment, matching the button's own label exactly.
2. **Fee Aging report's "defaulters report" link** (`app/(school)/reports/page.tsx`, REP-1's aging
   tab) — was `/finance/reports`, now `/finance/bill/reports`. This is more than a nav-path fix:
   old Finance's `/finance/reports` page's Defaulters tab uses `useDefaulters`, reading the old,
   near-empty `invoices` table (the same stale-data class of bug Phase 1 found on the parent Fees
   page) — `/finance/bill/reports` already has its own, correctly Billing-backed Defaulters tab
   (`useFinanceDefaulters`) built in UI-6, so this fix corrects both the destination *and* the data
   source in one move.

Every other `/finance*`-non-bill link found in the app is old Finance's own root page linking to
its own sibling old-Finance pages (its internal quick-action buttons) — self-contained, and moot
once Phase 4 deletes that whole subtree, so left untouched.

## Parent: confirmed no change needed

`components/layout/portal-sidebar.tsx`'s `PARENT_NAV_ITEMS` has exactly one finance-related entry:
`{ href: '/parent/fees', label: 'Fees' }`. There was never a parallel old-rail parent nav entry to
remove — Phase 1 already rewired what that single link's page actually calls onto Billing. Grepped
to confirm before concluding this, not assumed from Phase 1's work alone.

## The flagged decision: what happens to old Finance URLs now

Old Finance's four pages (`/finance`, `/finance/invoices`, `/finance/fee-structures`,
`/finance/reports`) still exist as real, working Next.js routes — their own backend routes are
untouched until Phase 4, so they still render correctly with real (if now-secondary) data. Removing
them from nav doesn't make them 404; that's only achievable by deleting the page files, which is
explicitly Phase 4's job, not this one's. Two of the four have a clean 1:1 Billing landing page
(Fee Structures → Billing's Fee Catalog, Reports → Billing's Reports); the other two don't (Billing
has no standalone "browse all invoices" admin page, and no single "Overview" equivalent) — so a
blanket redirect-everything approach wouldn't land cleanly for half of them.

**Flagged to Srijan rather than picked silently.** Decision: **leave all four reachable,
unredirected** — no nav link, no redirect. They still work via direct URL/bookmark until Phase 4
removes them outright; any redirect logic added now would be throwaway work given how close Phase 4
is.

## Live verification

No browser-automation tool was available this session (same disclosed limitation as WEB-P Phase
5) — verified via a live route-check against the running dev server instead, per the alternative
explicitly offered for this phase. `npx tsc --noEmit` clean and 531/531 web vitest passing first
(confirms no broken imports/JSX across the whole module graph the removed nav item and both fixed
links touch). Then, with the Next.js dev server running, requests through the real proxy first
confirmed all 10 relevant routes 307-redirect to `/login` when unauthenticated (no raw 500s) —
then, since the proxy's own `_auth` marker cookie is explicitly documented as "spoofable by design
and grants nothing" beyond letting a request past the edge redirect to the real page shell
(`lib/auth-marker.ts`), setting `_auth=1` and re-requesting let every route past that gate and
exercise real page compilation: all 8 pages checked (`/finance`, `/finance/invoices`,
`/finance/fee-structures`, `/finance/reports`, `/finance/bill/payments/new`,
`/finance/bill/reports`, `/dashboard`, `/reports`) returned live `200`s with real rendered byte
content and no error markers, and the dev server's own compile log shows each one built and served
without a server-side crash. A full authenticated click-through confirming the exact rendered nav
HTML and href attributes wasn't performed — the spoofed marker has no real backend session behind
it, so client components that need real data (including the sidebar's own role-filtered nav and the
dashboard/reports quick-action buttons) don't render past their loading/redirect state in this mode.
Given the change itself is a static nav-array edit and two literal `href` string swaps (both
independently confirmed against real, existing route directories via `find`), this is judged
proportionate rather than a real coverage gap — flagging the limitation rather than glossing over
it.

## Recommendation

1. Done — no further Phase 3 work outstanding for admin, parent, or teacher.
2. Phase 4 (hard retirement) can proceed once explicitly approved. When it deletes old Finance's
   frontend pages, this phase's "leave reachable, unredirected" choice naturally resolves itself —
   the URLs genuinely 404 at that point, which was always the real endpoint of this decision.
