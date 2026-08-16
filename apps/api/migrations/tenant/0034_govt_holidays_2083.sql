-- 0034_govt_holidays_2083.sql — CAL-1 Phase 1: Nepal govt public holidays,
-- BS year 2083 (1 Baisakh 2083 – Chaitra-end 2083 ≈ 2026-04-14 – 2027-04-13).
--
-- SOURCE — no structured API/dataset exists (checked: MoHA's own page just
-- links a scanned, non-OCR'd gazette PDF; community "APIs" on GitHub either
-- scrape a single unverified site or are dead). Compiled manually and
-- cross-verified against multiple independent sources, same standard as the
-- FIX-3 BS-calendar corrections (hamropatro-anchored, 3-source agreement):
--   - Ratopati.com / CollegeNP.com — both explicitly cite Nepal Gazette Vol.
--     75, Ministry of Home Affairs (2 Mar 2026) for the govt holiday
--     determination and the exact Dashain/Tihar ranges below
--   - hamropatro.com — per-day festival calendar
--   - drikpanchang.com (panchang/tithi authority) + independent
--     travel/festival-guide convergence — used specifically to resolve
--     Dashain's exact day-by-day dates, where a first pass produced
--     internally-inconsistent results (see below)
--
-- GOTCHA caught mid-compilation: an initial fetch of hamropatro's calendar
-- pages via an automated HTML-to-text step twice produced impossible or
-- inconsistent results for the Dashain sequence (once implying Vijaya
-- Dashami preceded Ghatasthapana). Re-derived the full Dashain sequence
-- from three independent sources instead of trusting any single fetch —
-- exactly the "don't trust one source" lesson this codebase already
-- learned from the bs-calendar month-length bug. All Dashain/Tihar dates
-- below carry 2-3-source agreement.
--
-- SCOPE — deliberately excludes community/category-specific gazette
-- entries (Teej, Jitiya — women staff only; Tamu/Sonam/Gyalpo Lhosar,
-- Guru Nanak Jayanti, Mohammed Jayanti, Eid al-Fitr/al-Adha — specific
-- ethnic/religious communities' optional personal leave; Gaijatra/Indra
-- Jatra/Ghode Jatra — Kathmandu Valley only). These are real gazetted
-- entries but are OPTIONAL leave for staff who belong to that group, not a
-- whole-school closure — importing them as is_holiday=true GOVT rows would
-- incorrectly close every school nationwide on days that are actually just
-- one person's personal-leave option. school_calendar_days' is_holiday
-- model is binary (working day or not for the whole school), which doesn't
-- represent "optional for some staff" — flagging this distinction rather
-- than silently importing everything the gazette lists. Eid dates are
-- additionally moon-sighting-dependent (±1 day, unresolvable this far in
-- advance) which would be a separate reason to exclude even if they were
-- universal.
--
-- Fagu Purnima (Holi) is a genuine REGIONAL split this year — Hill region
-- observes it a day before Terai region. Both days are imported (safe
-- superset: an extra non-working day for a school in the "wrong" region is
-- a minor cost; missing a real regional holiday would wrongly charge a
-- late fee or mark a student absent on their actual day off). No per-tenant
-- region field exists to pick just one.
--
-- Idempotent: ON CONFLICT (date, source) DO NOTHING lets this migration
-- (or a manual re-run) never double-insert.

INSERT INTO school_calendar_days (date, is_holiday, source, label_en, label_ne) VALUES
  ('2026-04-14', true, 'GOVT', 'Nepali New Year 2083',              'नयाँ वर्ष २०८३'),
  ('2026-05-01', true, 'GOVT', 'Buddha Jayanti / Labour Day',       'बुद्ध जयन्ती / श्रमिक दिवस'),
  ('2026-05-29', true, 'GOVT', 'Republic Day',                      'गणतन्त्र दिवस'),
  ('2026-08-28', true, 'GOVT', 'Janai Purnima / Raksha Bandhan',    'जनै पूर्णिमा / रक्षा बन्धन'),
  ('2026-09-04', true, 'GOVT', 'Krishna Janmashtami',               'श्रीकृष्ण जन्माष्टमी'),
  ('2026-09-19', true, 'GOVT', 'Constitution Day',                  'संविधान दिवस'),
  -- Ghatasthapana: a separately-gazetted 1-day holiday (Ashwin 25), ~2 weeks
  -- before the main Dashain closure block below — confirmed distinct, not a
  -- duplicate of Phulpati.
  ('2026-10-11', true, 'GOVT', 'Ghatasthapana (Dashain begins)',    'घटस्थापना'),
  -- Dashain continuous closure, Ashwin 31 - Kartik 6 2083 per the gazette
  -- ("फूलपातीदेखि द्वादशीसम्म बिदा" — Phulpati through Duwadashi), every day
  -- in the range, not just the named ritual days:
  ('2026-10-17', true, 'GOVT', 'Phulpati',                          'फूलपाती'),
  ('2026-10-18', true, 'GOVT', 'Maha Ashtami',                      'महाअष्टमी'),
  ('2026-10-19', true, 'GOVT', 'Dashain',                           'दशैं बिदा'),
  ('2026-10-20', true, 'GOVT', 'Maha Navami',                       'महानवमी'),
  ('2026-10-21', true, 'GOVT', 'Vijaya Dashami (Tika)',             'विजया दशमी'),
  ('2026-10-22', true, 'GOVT', 'Dashain',                           'दशैं बिदा'),
  ('2026-10-23', true, 'GOVT', 'Duwadashi (Dashain ends)',          'द्वादशी'),
  ('2026-10-25', true, 'GOVT', 'Kojagrat Purnima',                  'कोजाग्रत पूर्णिमा'),
  -- Tihar continuous closure, Kartik 22 - 26 2083 per the same gazette
  -- quote. Kaag Tihar (Kartik 21 / Nov 7) falls the day BEFORE this range
  -- and is deliberately excluded — it's a festival observance but not
  -- itself in the gazetted holiday range. Kukur Tihar and Laxmi Puja land
  -- on the same calendar day this year (Chaturdashi and Amavasya tithis
  -- both fall on Kartik 22), not consecutive days as a first pass assumed.
  ('2026-11-08', true, 'GOVT', 'Kukur Tihar / Laxmi Puja',          'कुकुर तिहार / लक्ष्मी पूजा'),
  ('2026-11-09', true, 'GOVT', 'Tihar',                             'तिहार बिदा'),
  ('2026-11-10', true, 'GOVT', 'Govardhan Puja / Mha Puja',         'गोवर्धन पूजा / म्ह पूजा'),
  ('2026-11-11', true, 'GOVT', 'Bhai Tika',                         'भाइ टीका'),
  ('2026-11-12', true, 'GOVT', 'Tihar',                             'तिहार बिदा'),
  ('2026-11-15', true, 'GOVT', 'Chhath',                            'छठ'),
  ('2026-12-25', true, 'GOVT', 'Christmas Day',                     'क्रिसमस'),
  ('2027-01-15', true, 'GOVT', 'Maghe Sankranti',                   'माघे संक्रान्ति'),
  ('2027-01-30', true, 'GOVT', 'Martyrs'' Day',                     'सहिद दिवस'),
  ('2027-02-11', true, 'GOVT', 'Basanta Panchami / Shree Panchami', 'बसन्त पञ्चमी / श्री पञ्चमी'),
  ('2027-02-19', true, 'GOVT', 'National Democracy Day',            'प्रजातन्त्र दिवस'),
  ('2027-03-06', true, 'GOVT', 'Maha Shivaratri',                   'महाशिवरात्री'),
  -- Fagu Purnima (Holi) — genuine one-day regional split, see header note.
  ('2027-03-21', true, 'GOVT', 'Fagu Purnima / Holi (Hill region)', 'फागु पूर्णिमा (पहाड)'),
  ('2027-03-22', true, 'GOVT', 'Fagu Purnima / Holi (Terai region)','फागु पूर्णिमा (तराई)')
ON CONFLICT (date, source) WHERE deleted_at IS NULL DO NOTHING;
