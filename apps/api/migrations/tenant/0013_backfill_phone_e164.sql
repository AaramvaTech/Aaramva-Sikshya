-- 0013_backfill_phone_e164.sql — REG-1 Phase 4 (REG-OBS-4 ruling).
-- Forward-only backfill: normalize existing bare / 977… / 0977… phones to E.164
-- (+977XXXXXXXXXX) in the delivery + find-or-create phone columns. Rows that do
-- not cleanly match ^9[678]\d{8}$ (e.g. non-Nepali numbers) are LEFT UNTOUCHED and
-- are recorded as REG-DQ-1 in REG-1-BUGS.md (no guessing).
--
-- substring(phone from '(9[678][0-9]{8})$') extracts the trailing 10-digit mobile
-- from all three normalizable forms. The WHERE excludes already-+977 rows and any
-- non-normalizable value, so re-running is a no-op (idempotent). emergency_contact_phone
-- is deliberately NOT touched (not a login/delivery phone).
UPDATE guardians
   SET phone = '+977' || substring(phone from '(9[678][0-9]{8})$'), updated_at = NOW()
 WHERE phone ~ '^9[678][0-9]{8}$' OR phone ~ '^0?977(9[678][0-9]{8})$';

UPDATE staff_profiles
   SET phone = '+977' || substring(phone from '(9[678][0-9]{8})$'), updated_at = NOW()
 WHERE phone ~ '^9[678][0-9]{8}$' OR phone ~ '^0?977(9[678][0-9]{8})$';

UPDATE students
   SET phone = '+977' || substring(phone from '(9[678][0-9]{8})$'), updated_at = NOW()
 WHERE phone ~ '^9[678][0-9]{8}$' OR phone ~ '^0?977(9[678][0-9]{8})$';

UPDATE users
   SET phone = '+977' || substring(phone from '(9[678][0-9]{8})$'), updated_at = NOW()
 WHERE phone ~ '^9[678][0-9]{8}$' OR phone ~ '^0?977(9[678][0-9]{8})$';
