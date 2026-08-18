# CAL-1 — School Calendar / Holidays Module

**Status:** Spec, not yet built.
**Purpose:** Give the system a concept of "is this a working day?" — currently doesn't
exist anywhere. Needed to power late-fee calculation by working days, and to stop
marking students absent on holidays.

## Scope decisions (locked)

- **Holiday sources:** two tiers — Government of Nepal public holidays (shared,
  bulk-loaded) + each school's own additional holidays (exam breaks, local events,
  school-specific closures)
- **Management pattern:** govt holidays get bulk-imported once per BS year (published in
  advance, rarely change after import); school-specific holidays get added ad-hoc via
  admin UI as they come up. Both write to the same underlying table, distinguished by a
  `source` field.
- **Sunday-Friday week already exists as a platform constant** — this module doesn't
  reinvent that, it layers holiday exceptions on top of it.
- **First use cases:** late-fee working-day calculation and attendance, roughly together
  — build the data model and query surface to serve both from day one, rather than
  building for one and retrofitting the other.

## Data model

New table, tenant-scoped (per-tenant schema, same pattern as everything else):

```
school_calendar_days
  id
  date               (DATE, BS-aware per existing bs-calendar package conventions)
  academic_year_id   (FK, matches existing academic year scoping used elsewhere)
  is_holiday         (boolean)
  source             ('GOVT' | 'SCHOOL')
  label              (e.g. "Dashain", "Founder's Day" — bilingual EN/NE per platform norm)
  created_by         (nullable — govt bulk-import rows won't have an admin creator)
  deleted_at         (soft-delete, matching platform convention)
```

**Working day = Sunday-Friday (per existing week constant) AND no row here with
`is_holiday = true` for that date.** Saturday is already excluded by the week constant,
doesn't need a row.

## Phase 1 — Data model + govt holiday bulk import

- Migration for `school_calendar_days`
- A bulk-import mechanism for govt holidays — **needs a real source**: check whether
  there's an existing govt holiday dataset/API for Nepal, or whether this has to be
  manually compiled per BS year from an authoritative source (same hamropatro-anchored
  verification standard used for the BS calendar package itself). Flag this back before
  building the import — don't guess at a holiday list.
- Import for the current BS year at minimum, structured so future years can be added the
  same way

**Checkpoint:** govt holidays for the current year live in the table, verified against
an authoritative source (same rigor as BS calendar corrections), Postgres read-back.

## Phase 2 — School-specific holiday management

- Admin-facing CRUD: add/edit/remove school-specific holidays (role-gated, likely the
  same tier that manages fee structures/academic settings)
- UI: simple calendar or list view, admin can mark a date as a holiday with a label
- Soft-delete on removal, matching platform convention

**Checkpoint:** live add/edit/remove of a school-specific holiday via real HTTP calls,
Postgres read-back, confirm govt holidays aren't editable/deletable through this same
UI (or if they should be overridable per-school, that's a decision to make explicit
before building — flag it rather than assume).

## Phase 3 — Working-day query surface

A shared service method other modules will call — e.g.
`CalendarService.isWorkingDay(date, tenantId)` and
`CalendarService.countWorkingDays(startDate, endDate, tenantId)` — since both late-fee
and attendance need to ask "how many working days between X and Y" or "is today a
working day."

**Checkpoint:** unit-tested against known date ranges spanning at least one govt holiday
and one school-specific holiday, confirm counts are correct.

## Phase 4 — Wire into late-fee calculation

Find wherever the late-fee engine currently calculates day-based penalties (likely
calendar-day based today, since no working-day concept existed) and switch it to use
`CalendarService`. This changes real fee amounts, so:

**Checkpoint:** live proof — a test invoice with a due date, calculated late fee before
and after this change for the same overdue period spanning a holiday, showing the
corrected (lower, since holidays shouldn't count against the parent) working-day-based
amount. Postgres read-back.

## Phase 5 — Wire into attendance

Find wherever attendance marking/reporting currently runs and ensure holidays are
excluded — likely means: don't allow marking attendance on a holiday, and don't count
holidays as "absent" in any summary/percentage calculation.

**Checkpoint:** live proof — attendance summary for a date range spanning a holiday,
confirm the holiday doesn't appear as a marked day and doesn't count against the
student's attendance percentage.

## Out of scope

- Automatic yearly govt-holiday re-import (manual per-year import is fine for now,
  automate later if it becomes a real recurring task)
- Holiday notifications/announcements to parents (separate from the messaging system
  work already scoped elsewhere)
- Multi-day event types beyond simple holiday/non-holiday (e.g. half-days) — flag if this
  turns out to be needed, don't build speculatively

## Open questions to resolve before Phase 1 starts

1. What's the actual source for Nepal govt holiday dates for the current BS year? This
   needs a real answer, not an assumption — verify like the BS calendar package itself
   was verified (hamropatro-anchored).
2. Should govt holidays ever be overridable/removable per-school (e.g. a school stays
   open on a minor govt holiday)? Locked as "no" unless you say otherwise — flag if that
   assumption is wrong.
