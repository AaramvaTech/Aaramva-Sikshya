# Sheet → Dialog Modal Conversion

**Date:** 2026-06-12  
**Scope:** Replace all Sheet (right-side slide-out) components with centered Dialog modals across the web app.

---

## Problem

Four pages use a right-side `Sheet` panel that slides in from the edge of the screen. This pattern hurts UX because it partially covers the page, feels inconsistent with the rest of the app (which uses centered `Dialog`s everywhere else), and clips on smaller screens.

---

## Files Affected

| File | Component / export | Change |
|---|---|---|
| `apps/web/components/finance/invoice-detail-sheet.tsx` | `InvoiceDetailSheet` | Convert + rename to `InvoiceDetailModal` |
| `apps/web/app/(school)/finance/invoices/page.tsx` | Imports `InvoiceDetailSheet` | Update import |
| `apps/web/app/(school)/hr/payroll/page.tsx` | `SlipsSheet` (inline) | Convert in-place |
| `apps/web/app/(school)/finance/fee-structures/page.tsx` | `CategoryManagerSheet` (inline) | Convert in-place |
| `apps/web/app/(school)/library/books/page.tsx` | Book detail Sheet (inline) | Convert in-place |

`apps/web/components/ui/sheet.tsx` is **not touched** — kept for potential future use.

---

## Design Decisions Per Component

### 1. Invoice Detail Modal (`max-w-lg`, scrollable body)

- **File:** rename `invoice-detail-sheet.tsx` → `invoice-detail-modal.tsx`, export `InvoiceDetailModal`
- **Structure:**
  - `DialogHeader`: invoice number (mono) + `InvoiceStatusBadge`
  - Scrollable `div` (`max-h-[70vh] overflow-y-auto`): student info, fee breakdown table, payments list, balance due
  - `DialogFooter`: "Recalculate Fine" (outline, conditional) | "Record Payment" (brand, conditional) | "Void Invoice" (destructive outline, conditional)
- Moving actions to the footer makes them always visible without scrolling.

### 2. Payroll Slips Modal (`max-w-5xl`, scrollable body)

- **Component:** `SlipsSheet` → renamed to `SlipsModal` (inline in `payroll/page.tsx`)
- **Structure:**
  - `DialogHeader`: month label + `StatusBadge`
  - Scrollable `div` (`max-h-[70vh] overflow-y-auto`): 7-column salary table with totals row; empty/loading states
  - `DialogFooter` (only when `isDraft`): "Re-generate" (outline) | "Finalize" (brand, wrapped in `ConfirmDialog`)
- `max-w-5xl` gives the 7-column table room to breathe on standard desktops.

### 3. Fee Category Manager Modal (`max-w-md`)

- **Component:** `CategoryManagerSheet` → `CategoryManagerModal` (inline in `fee-structures/page.tsx`)
- **Structure:**
  - `DialogHeader`: "Fee Categories"
  - Body: "Add Category" form (name input + type select + Add button) at top; scrollable list of categories with inline edit/delete
  - No footer — all actions are inline in the list rows
- `max-w-md` is sufficient; content is narrow.

### 4. Book Detail Modal (`max-w-2xl`, scrollable body)

- **Component:** Book detail Sheet → inline Dialog (no rename needed, no exported component)
- **Structure:**
  - `DialogHeader`: book title
  - Scrollable `div` (`max-h-[75vh] overflow-y-auto`): metadata grid, copies list with badges
  - "Add Copy" inline toggle form stays at the bottom inside the scroll area
  - No footer needed
- `max-w-2xl` matches the current sheet width and fits the metadata grid + copies list.

---

## Implementation Notes

- All Dialog usage follows the existing project pattern: `Dialog > DialogContent > DialogHeader + DialogTitle + body div + DialogFooter`.
- `max-h-[70vh] overflow-y-auto` on the body div prevents the modal from running off-screen when content is long.
- The `Dialog` primitive is already used in the same files (fee-structures, payroll, library/books), so no new dependencies are introduced.
- `invoice-detail-sheet.tsx` → `invoice-detail-modal.tsx`: update the single import in `invoices/page.tsx`.
- No backend changes. No new API calls. No new hooks.

---

## Out of Scope

- `sheet.tsx` UI primitive — not deleted, left as-is.
- Any Sheet usage that may be added in future modules.
- Mobile-specific breakpoint tweaks beyond `max-w-*` sizing.
