# Resend credentials UI — schools (super admin) + staff profile

**Date:** 2026-07-16
**Status:** Approved by Srijan (confirm-dialog variant chosen)

## Problem

The student profile has a "Resend" button that regenerates a temporary password and
emails new login credentials. The same server capability exists for school owners and
staff (built in MAIL-1) but has no UI — an admin who needs to re-deliver an owner's or
staff member's credentials has no way to trigger it.

## Scope

Web UI only. **No API changes.** Both endpoints already exist, are unit-tested, and
handle everything server-side:

- `POST /super-admin/tenants/:id/resend-owner-credentials` (PLATFORM_ADMIN) — finds the
  tenant's earliest SCHOOL_OWNER user, regenerates a temp password
  (`must_change_password = true`), revokes all refresh tokens, emails credentials,
  writes an `OWNER_CREDENTIALS_RESENT` audit row. Returns `{ userId, email, sent }`.
- `POST /hr/staff/:id/resend-credentials` (PRINCIPAL_AND_ABOVE, throttled 5/h) —
  resolves the staff profile's user, delegates to the credential-delivery ledger
  (regenerate + revoke sessions + email with the STAFF template). 400 if the staff
  login has no email. Returns `{ userId, deliveryIds }`.

## Design

Both buttons open the shared `ConfirmDialog` before sending (chosen over the student
profile's one-click resend): resending invalidates the person's current password and
logs them out everywhere, and owners/staff are daily users. Copy states exactly that.

### 1. Super-admin school detail (`apps/web/app/super-admin/schools/[id]/page.tsx`)

- "Resend owner credentials" button in the `PageHeader` action group next to
  Edit/Impersonate, wrapped in `ConfirmDialog` (same pattern as Impersonate).
- Wiring: `superAdminApi.resendOwnerCredentials(tenantId)` +
  `useResendOwnerCredentials()` mutation hook in `lib/hooks/use-super-admin.ts`.
- Success toast includes the owner email from the response ("New credentials emailed
  to owner@…"). Failures (e.g. "No school-owner account found for this tenant")
  surface via `extractApiErrors` in an error toast.

### 2. Staff profile (`apps/web/app/(school)/hr/staff/[id]/page.tsx`)

- "Resend credentials" button next to "Edit Profile" in the `PageHeader` action slot,
  wrapped in `ConfirmDialog`.
- Wiring: `hrApi.resendStaffCredentials(id)` + `useResendStaffCredentials(id)` hook in
  `lib/hooks/use-hr.ts`.
- Success toast; server errors pass through `extractApiErrors` — covers the 400
  "Staff login has no email" and the 429 throttle message.

### Shared decisions

- No query invalidation: nothing displayed changes after a resend (matches the student
  pattern in `use-students.ts`).
- Pending state disables the confirm button while the request is in flight.
- Response types added to `types/api.types.ts` per the frontend rules.

## Alternatives rejected

- Generalizing `LoginAccountsCard` for all three entities: overkill — school detail
  and staff profile each have exactly one account; the card exists for the student +
  N-guardian list shape.
- Putting resend inside the edit pages: poor discoverability for a support action.

## Verification

- `npx tsc --noEmit` clean in `apps/web`.
- Live check of both buttons against the dev API where the stack is available.
