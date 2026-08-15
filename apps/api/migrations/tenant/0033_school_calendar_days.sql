-- 0033_school_calendar_days.sql — CAL-1 Phase 1: "is this date a holiday?"
--
-- Two-tier holiday model: GOVT (bulk-imported once per BS year, fixed and
-- not overridable per-school — see the locked decision in
-- docs/api-contracts/CAL-1-calendar-holidays-spec.md) and SCHOOL (added
-- ad-hoc via admin UI, Phase 2). Both write to this one table, distinguished
-- by `source`. Working day = Sunday-Friday (the existing platform
-- day-of-week convention, dayOfWeek 0-6 with 6=Saturday — see
-- student-me.service.ts's todayInNepal) AND no row here with
-- is_holiday = true for that date; that query needs only `date` +
-- `is_holiday`, so academic_year_id is a display/filter convenience, not a
-- functional dependency of the working-day check.
--
-- academic_year_id is DELIBERATELY NULLABLE (a documented deviation from the
-- spec's plain "FK" listing, flagged for review): academic_years rows in
-- this platform are fiscal-year-shaped (e.g. name "2082-83", Shrawan-Ashadh)
-- and their actual date coverage varies wildly per tenant in practice —
-- some tenants have gaps, some have none at all, some have inconsistent
-- date ranges. A GOVT holiday is a fact about Nepal, true independent of
-- any one school's academic-year bookkeeping; requiring every row to
-- resolve against a specific existing academic_years row would make the
-- Phase 1 bulk import fail or silently skip dates for exactly the tenants
-- whose academic-year data is incomplete. label_en/label_ne follows the
-- existing bilingual-column convention (bill_invoices.amount_in_words_en/ne,
-- 0022_bill_run.sql) rather than inventing a JSONB shape.
CREATE TABLE IF NOT EXISTS school_calendar_days (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  date              DATE          NOT NULL,
  academic_year_id  UUID          REFERENCES academic_years(id),
  is_holiday        BOOLEAN       NOT NULL DEFAULT true,
  source            VARCHAR(10)   NOT NULL,
  label_en          VARCHAR(200)  NOT NULL,
  label_ne          VARCHAR(200),
  created_by        UUID          REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT school_calendar_days_source_check CHECK (source IN ('GOVT', 'SCHOOL'))
);

-- Prevents duplicate govt-holiday rows on re-run of an import migration, and
-- guards a school against double-entering the same date twice (Phase 2).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_school_calendar_days_date_source
  ON school_calendar_days (date, source) WHERE deleted_at IS NULL;

-- The working-day lookup's actual access path: "is there a live holiday row
-- for this date". Partial on is_holiday=true since that's the only value
-- CalendarService.isWorkingDay (Phase 3) will ever filter on.
CREATE INDEX IF NOT EXISTS idx_school_calendar_days_date
  ON school_calendar_days (date) WHERE deleted_at IS NULL AND is_holiday = true;
