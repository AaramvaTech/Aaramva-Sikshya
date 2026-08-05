import { describe, it, expect } from 'vitest';
import { canSeeBillingTab, BILLING_TAB_ROLES } from '../billing-tab-access';
import type { Role } from '@/types/api.types';

// UI-2 §3/§7 — pins the real claim the spec made about the Billing tab:
// ACCOUNTANT_AND_ABOVE sees it, everyone else (including roles that can
// otherwise view a student's profile, like TEACHER/LIBRARIAN) does not.
describe('canSeeBillingTab', () => {
  it.each(BILLING_TAB_ROLES)('allows %s', (role) => {
    expect(canSeeBillingTab(role)).toBe(true);
  });

  it.each(['TEACHER', 'LIBRARIAN', 'STUDENT', 'PARENT'] satisfies Role[])('denies %s', (role) => {
    expect(canSeeBillingTab(role)).toBe(false);
  });

  it('denies a null/undefined role (not-yet-hydrated session)', () => {
    expect(canSeeBillingTab(null)).toBe(false);
    expect(canSeeBillingTab(undefined)).toBe(false);
  });
});
