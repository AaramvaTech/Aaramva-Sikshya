# SESSION-M5.1 — Teacher Write Live Re-Verification

**Type:** Backend live-smoke verification. Closes the one gap in M5: the teacher **writes** and scope checks were proven via **mocked unit tests**, which by project rule are **not accepted as proof of endpoint health** — the mocked suite is structurally blind to SQL-level errors (the `$4::uuid` cast bug passed all unit tests and only surfaced against live Postgres). Re-prove the writes with **live HTTP against real PostgreSQL**, the same method PA / R1 / M4 used.

**No code changes.** This is verification only. If a live call fails (a cast/SQL error the mocks missed), **STOP and report it** — catching exactly that is the point of this session.

---

## Setup

Boot the API on a live PostgreSQL with the demo seed. Log in as the demo teacher (`teacher@demo.school` / `Teacher@123`) via the **mobile path** (`X-Client-Type: mobile`, response-body tokens). Capture the teacher's `userId` from the token for the assertions below.

---

## Prove live (POST, then read the rows back from Postgres)

For each write, paste the raw POST status **and** a direct `SELECT` from Postgres showing the persisted row(s) and the actor stamp — not a mock assertion.

1. **Attendance bulk persists + `marked_by` stamped.** `POST /attendance/students/bulk` for a section the teacher **is** assigned to, marking real students. Then `SELECT student_id, status, marked_by_user_id FROM ... WHERE date = ...` → confirm rows exist with `marked_by_user_id` = the demo teacher's `userId`. Paste status + the SELECT result.

2. **Marks bulk persists + `entered_by` stamped.** `POST /exams/marks/bulk` for an exam schedule, valid theory+practical. `SELECT ..., entered_by_user_id FROM marks WHERE exam_schedule_id = ...` → confirm rows with `entered_by_user_id` = teacher. Paste status + result.

3. **Marks XOR at the backend (the gap M5 surfaced).** `POST /exams/marks/bulk` with a **one-sided split** (theory filled, practical empty, not absent). Record what the **server** actually does — reject (400) or accept (201)? This confirms whether the backend lets a partial split through when the client guard is bypassed. Paste the raw status + response body.

4. **Soft-scope live.** `POST /attendance/students/bulk` for a section the teacher is **not** assigned to (use a third section if one exists). Confirm it succeeds with no 403 and the row records `marked_by_user_id` = this teacher. If the demo only has sections this teacher teaches, note that and skip the live unassigned probe (the absence of any assignment guard is already shown in code). Paste status + SELECT.

5. **HR self-scope live (R1 BUG-2).** `GET /hr/leave/balance/{ownUserId}` → expect **200**; `GET /hr/leave/balance/{aPeerUserId}` → expect **403**; `GET /hr/payroll/staff/{aPeerUserId}/history` → expect **403**. Paste the three raw statuses.

6. **Idempotency.** Re-POST the identical attendance bulk (the `ON CONFLICT … DO UPDATE` path). Confirm row count is unchanged and values updated in place — no duplicates. Paste row count before/after.

---

## Output

- Raw POST statuses + the Postgres `SELECT` results proving persistence and the actor stamp, per write.
- One-line verdict per item: **proven-live** / **failed** (with the live error).
- If any live call fails, STOP and report — do not fix it here; it gets its own backend session.

## Report-only (decide separately, do NOT change here)

- If step 3 shows the backend **accepts** a one-sided split, that's a data-integrity hole (client validation is bypassable). Recommend a backend XOR guard. Do not add it in this session — it joins the R2 backend cleanup.
