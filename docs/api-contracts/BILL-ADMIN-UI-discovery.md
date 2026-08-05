# BILL-ADMIN-UI — Discovery Report

**Status:** Discovery + planning only. No code touched, no branch created. Answers the six questions Srijan asked before any spec gets written. Subsumes `PAY-UI-REPOINT` (`docs/api-contracts/PAY-UI-REPOINT-discovery.md`) — same root cause (no real `bill_invoices` data, no UI to create it), same backend gap (the invoice-list balance field), one arc.

**Method:** Read the actual current code — `apps/web`'s route structure, `package.json`, `components/shared/`, `components/ui/`, a representative full module (`students`), the sidebar + `route-access.ts`, every BILL rail controller in `apps/api/src/modules/finance/`, the existing old-rail finance pages, and the web app's actual test tooling (`package.json`, no assumptions).

---

## 1. What `apps/web` already has — the patterns to reuse

**Correction to the premise, checked not assumed:** `package.json` has no `TailAdmin` dependency. The real stack is **shadcn/ui** (Radix primitives, `components/ui/` — 21 primitives: dialog, form, select, table, tabs, dropdown-menu, sheet, popover, alert-dialog, etc.) + Tailwind, **TanStack Query** (`@tanstack/react-query`) for server state, **React Hook Form + Zod** (`@hookform/resolvers/zod`) for forms, **axios** for HTTP, **recharts** for charts, **lucide-react** for icons, **i18next** for the bilingual scaffolding BRAND-1/I18N work already wired up.

**The layering, confirmed from `students` (the most mature module) and consistent everywhere else checked:**

```
app/(school)/<module>/page.tsx              ← list page (Next.js route)
app/(school)/<module>/new/page.tsx           ← create form
app/(school)/<module>/[id]/page.tsx          ← detail
app/(school)/<module>/[id]/edit/page.tsx     ← edit form
lib/api/<module>.api.ts                      ← axios wrapper functions, one per endpoint
lib/hooks/use-<module>.ts                    ← TanStack Query hooks wrapping the api file
lib/schemas/<module>.schema.ts               ← Zod schemas, one per form
types/api.types.ts                           ← shared response/request TS types
components/<module>/*.tsx                    ← module-specific components (menus, badges, dialogs)
```

**List-page pattern** (`students/page.tsx`, read in full): filters/sort/page live in the URL (`useSearchParams` + `router.push`), a 400ms-debounced search input, a `<Select>` per filter, `<DataTable columns data isLoading filterBar activeFilterCount onClearFilters exportConfig pagination />` from `components/shared/data-table.tsx` (TanStack Table under the hood — sortable headers, built-in CSV export via `exportConfig`, built-in pagination), `<QueryErrorState onRetry={refetch} />` on `isError`, `<PageHeader title description action={<Button>...</Button>} />` at the top.

**Form pattern** (`students/new/page.tsx`): `useForm` + `zodResolver(schema)`, shadcn's `<Form>`/`<FormField>`/`<FormItem>`/`<FormLabel>`/`<FormMessage>` wrapper, `sonner` for toast feedback, `<BsDateInput>` for any BS date field, multi-step forms use a plain `STEPS`/`STEP_FIELDS` array + local `step` state (no form library plugin).

**Shared components already built and reusable as-is:** `PageHeader`, `DataTable`, `QueryErrorState`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `StatCard`, `BsDate`/`BsDateInput`, `FileDownloadLink`, `StorageAvatarImage`, `ChangePasswordCard`. None of these need to be built for the billing UI — they're the toolkit.

**Nav + access-gating, one place each:** `components/layout/sidebar.tsx`'s flat `navItems` array (`{ name, icon, path, subItems }`) filtered through `allowedNavItems` from `lib/route-access.ts`'s `ROUTE_ACCESS: { prefix, roles, endpoint }[]` — a prefix-matched allowlist where the `endpoint` field is a citation comment pointing at the exact backend `@Roles()` gate it mirrors ("SEC-2 parity" — never grant a web role the backend would 403). Adding new billing routes means one or two new `ROUTE_ACCESS` rows plus new `navItems` entries, not a new access-control system.

**Directly relevant precedent for the catalog's many small sub-resources:** the HR module's "Setup" tab (`hr/setup/page.tsx`, employment-types + role-labels under one tabbed page) is exactly the shape the fee catalog's seven sub-resources (§2) should copy — one page, tabs, not seven separate nav entries and seven separate list pages.

---

## 2. The full surface, mapped to the built backend

Every one of these endpoints was read directly from its controller file, not assumed from a spec.

| Area | Controller | Key routes | Roles | UI shape needed |
|---|---|---|---|---|
| **Fee catalog** | `bill-catalog.controller.ts` | `fee-heads`, `discount-reasons`, `correction-reasons`, `transport-routes`, `tax-rates`, `late-fee-rules`, `bill/fee-structures(+items)` — full CRUD on each, 7 sub-resources | ACCOUNTANT_AND_ABOVE read/write, OWNER_ONLY delete | One tabbed "Fee Catalog" page (HR Setup precedent), 7 tabs, each a small list+inline-form |
| **Assignment & concessions** | `bill-assignment.controller.ts` | `POST students/:id/fee-structure` (assign), `POST bill/fee-structures/:id/bulk-assign` (async job) + `GET jobs/:id` (poll status), `fee-overrides` CRUD, `concessions` CRUD, `transport-assignments` CRUD, `GET reports/concession-register`, `GET students/:id/fee-preview` (staff + PARENT) | ACCOUNTANT_AND_ABOVE, OWNER_ONLY delete | Per-student assignment panel (likely on the student detail page) + a bulk-assign flow with async job-status polling + a concessions/overrides list |
| **Bill runs** | `bill-run.controller.ts` (`finance/bill/runs`) | `POST` (draft), `GET` (list), `GET :id` (detail + lines), `POST :id/post` (**async** — posting happens via `BillRunPostPoller`, not synchronously), `PATCH :id/exclude`, `DELETE :id` (void) | ACCOUNTANT_AND_ABOVE | Draft → review-lines-table (with per-student exclude) → post → **must poll `GET :id` until status flips POSTED**, not assume the POST response means done |
| **Invoices** | `bill-invoice.controller.ts` | `GET bill/invoices` (list, filterable by student/class/year/bsYear/bsMonth/status), `GET bill/invoices/:id` (detail, PARENT-scoped) | ACCOUNTANT_AND_ABOVE, `:id` also PARENT | Read-only — invoices are only ever created via a posted bill run. Natural to fold into the Bill Runs phase (a run's detail view already needs to show its resulting invoices) |
| **Payment counter** | `bill-payment.controller.ts` | `POST bill/payments` (AUTO_FIFO / MANUAL / ADVANCE_ONLY — MANUAL requires PRINCIPAL_AND_ABOVE, enforced in the service body, not the route guard), `GET bill/payments`, `GET bill/payments/:id`, `PATCH .../cheque-status`, `POST .../void` (OWNER_ONLY) | ACCOUNTANT_AND_ABOVE | The cashier-facing "record a payment" screen — needs a student search, their unpaid-invoice list **with balance** (§3 gap), an allocation-mode choice, cheque fields when `method=CHEQUE` |
| **Corrections** | `bill-correction.controller.ts` (BILL-6) | `POST corrections/credit-notes\|refunds\|write-offs` (ACCOUNTANT_AND_ABOVE, auto-posts below threshold), `POST :id/approve\|reject\|reverse` (OWNER_ONLY), `GET` list/detail (+ PARENT-scoped) | as above | Request form (per type) + an approval queue for owners + a reversal action |
| **Late fees** | `bill-fine.controller.ts` (BILL-7, just merged) | `POST late-fees/run` (manual trigger, ACCOUNTANT_AND_ABOVE), `GET late-fees/runs`, `POST late-fees/accruals/:id/reverse` (OWNER_ONLY) | as above | Rule CRUD is already covered by the catalog tab (`late-fee-rules`); this is just a "run now" button + run history + reversal |
| **Printing** | `bill-pdf.controller.ts`, `bill-receipt.controller.ts` | Per-invoice PDF, bulk print by run/class (async job, same `GET jobs/:id` pattern), thermal receipt, `?lang=` override | ACCOUNTANT_AND_ABOVE (+ PARENT for their own PDF) | A "Print" button wherever an invoice/receipt is shown; bulk print reuses the same job-polling UI as bulk-assign |
| **Cashier** | `cashier.controller.ts` (BILL-9) | `POST shifts/open`, `POST shifts/:id/close`, `GET shifts` | ACCOUNTANT_AND_ABOVE | Small — open/close shift with expected-vs-counted cash reconciliation, a shift list |
| **Reports** | `reports.controller.ts` (`finance/*`) + `ledger.controller.ts` | `daybook`, `defaulters`, `aging`, `collection`, `fines` (BILL-7), `students/:id/statement` / `.../ledger` (+PARENT) | FINANCE_REPORT_ROLES / ACCOUNTANT_AND_ABOVE+PARENT | Read-only, tabbed or separate pages — closest existing precedent is the already-built REP-1 `/reports` page's tab structure |
| **Settings** | `finance-settings.controller.ts` + general `settings` module | `GET/PATCH finance/settings` (invoice numbering reset, credit-note threshold, OWNER_ONLY write); `printLanguage` lives on the **general** settings module, not finance-specific | OWNER_ONLY write | Small addition to the *existing* Settings page, not a new screen (see §3) |

---

## 3. Backend gaps the UI will need closed

1. **Invoice-list balance/outstanding field — the one real blocker, already identified in the PAY-UI-REPOINT report.** `BillInvoiceResponseDto` has `totalReceivable` but no `paidAmount`/`balance`/`outstanding`. Both the mobile Pay screen's list *and* the web Payment Counter's "pick which invoice to pay" list need this. The CLEARED-allocation-sum computation already exists, written independently three times (`esewa.service.ts`, `khalti.service.ts`, `bill-payment.service.ts`'s `fetchUnpaidInvoicesOldestFirst`/`fetchInvoicesByIds`) — this is the natural point to factor it into one shared helper and add it to `findAll`/`findByStudent`'s response, closing the mobile gap and unblocking the web Payment Counter phase in the same piece of work.
2. **Status-vocabulary difference**, same finding as PAY-UI-REPOINT: `POSTED/SETTLED/PARTIALLY_PAID/VOIDED` vs the old rail's `UNPAID/PARTIAL/PAID/OVERDUE/WAIVED`. "Overdue" isn't a stored value on the new rail — it's derived (`due_date` passed + balance > 0). Any status badge or filter UI needs to be built against the real enum, not a copy-paste of the old one.
3. **`printLanguage` has a backend column and a general-settings write path, but zero web UI field anywhere** (confirmed by grep — zero hits in `apps/web`). Small: one field on the existing Settings > Profile page, not new infrastructure.
4. **Nothing else missing that a direct read turned up.** Bulk-assign and bulk-print both already share one job-status endpoint (`GET finance/jobs/:id`, confirmed deliberately reused per the controller's own comment) — the UI needs exactly one polling component, reusable for both. The async bill-run post similarly just needs the existing `GET finance/bill/runs/:id` polled, no new endpoint.

---

## 4. The old-rail finance page — what happens to it

**Small, confirmed in full:** `app/(school)/finance/{page,fee-structures,invoices,reports}.tsx` + 6 components in `components/finance/`. Overview dashboard (collection report + defaulters + recent invoices), old fee-structures CRUD, old invoice list + generate-invoice-dialog + invoice-detail-modal + payment-form, old reports page.

**It does not go away, and this is not a decision this UI arc should make — the backend has already answered it, repeatedly.** Every prior checkpoint's own documentation is explicit and consistent: the old `invoices`/`payments`/`fee_structures` tables and every service reading/writing them "stays fully live, in parallel, indefinitely — this is not a cutover of the finance module" (`BILL-5-checkpoint-c-preflight.md` §3); the actual cutover is a distinct, deferred, not-yet-scheduled event ("after the ledger is proven," per `BILL-SPEC.md` §2/R15). `motherland-school`/`test` tenants hold real historical old-rail data (42+ invoices, real payment history) that has to stay viewable regardless of what ships here.

**Proposed stance (for Srijan's ruling, not decided here): the new BILL-rail UI ships alongside the old pages, not in place of them.** A new nav section (separate `navItems` entry — old "Finance" keeps pointing at `/finance/*`, new section needs its own path prefix, e.g. `/finance/bill/*` mirroring the backend exactly, or a distinct top-level "Billing" nav item) — this is the same `/finance/bill/...` vs `/finance/...` split the backend itself already established for exactly this reason (`BUGS-3`'s documented collision-avoidance), one layer up, at the URL level instead of the API level. No page gets deleted or hidden by this arc; a real replace-in-place is the deferred cutover's job, not this one's.

---

## 5. Proposed phasing

Confirming Srijan's instinct, with the dependency reasoning made explicit and one placement decision:

1. **Catalog** — nothing else works without fee heads/structures/discount reasons/etc. existing first. Also the smallest-risk phase to ship first (pure CRUD, no money movement yet). Ship the nav/route split decision (§4) here too, since every later phase depends on it.
2. **Assignment** (structure assignment, bulk-assign, overrides, concessions, transport assignments) — needs catalog to exist; nothing to assign otherwise.
3. **Bill runs (folding in Invoices list/detail)** — needs assignments to exist to generate real lines. **This is the phase where `bill_invoices` gets its first real, UI-driven data for an actual school** — the headline gap this whole arc exists to close. Invoice list/detail folds in here rather than being its own phase, since a run's own detail view already needs to render the invoices it produced.
4. **Payment counter — and this is where the mobile PAY-UI-REPOINT fix folds in, confirming Srijan's instinct with the specific reason:** the payment counter's own "which of this student's invoices are still owed, and how much" list needs exactly the balance-field backend addition from §3, item 1. Building that addition once, here, and pointing both the web payment counter *and* the mobile Pay screen at the augmented endpoint closes both gaps in one piece of backend work instead of two.
5. **Corrections** — needs real invoices and payments to exist to correct against.
6. **Reports** — read-only, and genuinely order-flexible: it doesn't depend on any other phase's UI existing, only on there being real data flowing through by then to validate against meaningfully. Could move earlier if Srijan wants visibility sooner; kept late here because "does the number match a hand-computed expectation" is a much more convincing proof once phases 1-5 have put real data through the pipeline.
7. **Settings** — the smallest phase (a threshold field, a numbering toggle, one `printLanguage` field on an existing page). Genuinely independent and safe to ship anytime; ordered last here as a cleanup pass rather than because it's blocked on anything.

**What "independently shippable" means here, concretely:** no feature flag is needed. The new Billing nav section is opt-in by navigation — a real school's accountant keeps using the old "Finance" section exactly as today until *they* choose to click into the new one, the same parallel-coexistence the backend itself has already run for months without incident. Each phase is a real, usable increment the moment it merges; nothing is gated behind the others except by genuine data dependency (you can't post a bill run against fee structures that don't exist yet).

---

## 6. Proof approach — this is not a SELECT-only proof

**Confirmed via `package.json`, not assumed: `apps/web`'s standing test tooling is `vitest` + `@testing-library/react` + `jsdom` (`npm test` → `vitest run`). There is no Playwright dependency and no Playwright config file anywhere in the repo.** The "real Playwright browser session" proofs described in earlier WEB-P phases were an ad hoc tool available to *those* sessions, not a project fixture — WEB-P Phase 5's own record is explicit that when it wasn't available, verification fell back to raw HTTP + Postgres + manual description instead. This phasing plan should assume the same: browser automation is a bonus when available, never a dependency.

**Three real tiers, matching what this codebase already does elsewhere:**

1. **Component/hook-level (vitest + testing-library, jsdom environment)** — pins behavior that doesn't need a real screen: query-gating (the async-gate bug class WEB-P hit repeatedly — `enabled` flags on dependent queries), form validation rules, table column rendering, status-badge mapping for the new enum. Cheap, fast, regression-proof.
2. **Real API calls against the running dev backend** — the same discipline every BILL-x checkpoint has used all along, just reached through the browser instead of `curl`: `npm run start:dev` (real Postgres, real `demo` tenant), the web app pointed at it, real form submissions producing real rows, verified with the same raw `SELECT` read-backs this project already trusts. This is the workhorse tier for anything that writes data (catalog CRUD, a real bill run, a real payment, a real correction).
3. **Manual eyeball** — needed specifically for: visual correctness (layout, BS-date rendering, brand-color inheritance, the bilingual print output); multi-screen workflows that don't reduce to one API call (draft → review → post, a cheque's PENDING → CLEARED lifecycle); and the async points (bulk-assign job, bill-run post poller, bulk-print job) where "did the background job actually finish and does the UI now reflect it" needs a human watching a real page, not just asserting on an API response.

**One thing carrying over directly from the last incident, worth stating plainly since this arc will need it constantly:** role-probing a screen (does an ACCOUNTANT see what they should, does a TEACHER get correctly blocked, does OWNER_ONLY approve-a-correction actually gate) means logging in as different roles, which means the same password-shim-and-restore ritual as every backend proof — and per `INC-4`, that restore now gets verified byte-for-byte via a direct `SELECT`, never by a login-side-effect check alone.

---

## Summary

| Question | Answer |
|---|---|
| UI stack | shadcn/ui + Tailwind, TanStack Query, RHF + Zod, axios — **not** TailAdmin (checked, not in `package.json`) |
| Reusable patterns | List/form/nav/access patterns are all already established and consistent across every existing module — nothing new needs inventing |
| Full backend surface | 10 controllers, ~13 feature areas, all already read directly and mapped above |
| Real blocking backend gap | Invoice-list balance/outstanding field (shared by web payment counter *and* mobile) |
| Old-rail finance page | Stays, indefinitely, by the backend's own already-established stance — new UI ships alongside, not in place of |
| Phasing | Catalog → Assignment → Bill Runs (+Invoices) → Payment Counter (+mobile repoint) → Corrections → Reports → Settings |
| Proof method | vitest/testing-library (logic) + real dev-backend API calls (data-writing screens) + manual eyeball (visual/async/multi-screen) — no standing Playwright dependency to rely on |
