# Teacher Session C — Backend: "my exam schedules" resolver
# Aaramva Shikshya
# (Renumber the filename to fit your docs/api-contracts/ sequence, e.g. 28-teacher-exam-schedules.md)

## Prerequisites
- Teacher Sessions A + B complete; suite green (251 + Session B tests).
- Confirmed from Session A: `timetable_slots.teacher_id` references `users.id`.
- Confirmed from the marks pre-flight audit:
  - `GET /exams/schedules` is TEACHER-accessible but filters only by
    `examTypeId` / `classId` — NO section or subject-teacher filter.
  - `exam_schedules` carry `class_id`, `subject_id`, `full_marks`, `pass_marks`,
    `theory_marks`, `practical_marks` (via ExamScheduleResponseDto).
  - `timetable_slots` carry `teacher_id`, `subject_id`, `section_id`.
  - `POST /exams/marks/bulk` (bulkEnterMarks) already records `entered_by` from
    the token and validates against `full_marks` server-side.
  - `GET /exams/marks?examScheduleId=` exists, TEACHER-accessible, for prefill.

## Goal
Add ONE teacher-scoped read endpoint that resolves "the exam schedules for the
subjects/classes I actually teach," so the Session D marks-entry screen can open
to the right list in a single call instead of fanning out per class and filtering
client-side.

This session is backend + tests only. No screens, no changes to bulkEnterMarks.

---

## CRITICAL — this is DISCOVERY, not authorization

This endpoint only decides what the UI shows by default. It does NOT restrict who
can enter marks. `POST /exams/marks/bulk` stays exactly as it is — role-only
(`TEACHER_AND_ABOVE`), recording `entered_by`. A teacher CAN still enter marks for
a schedule that isn't in their `/my` list (e.g. covering for a colleague), and
that write succeeds and is recorded — identical to the soft-scope decision made
for attendance. Do NOT add any 403 to bulkEnterMarks.

---

## The endpoint

### `GET /api/v1/exams/schedules/my`
- Roles: `TEACHER_AND_ABOVE`.
- Derives the teacher from the JWT (`user.userId`); takes NO teacher id param.
- Optional query passthrough: `examTypeId?` (UUID) to narrow to one exam.

### What "my schedules" means
The set of `exam_schedules` whose `(class_id, subject_id)` matches a subject this
teacher actually TEACHES — i.e. derived from `timetable_slots`, NOT from
`sections.class_teacher_id`. (Marks entry is per subject taught; a homeroom/class
teacher who doesn't teach a given subject shouldn't get that subject's schedule by
default.)

Resolve the teacher's taught (class, subject) pairs, then match schedules:

```
SELECT DISTINCT es.*            -- plus denormalized names below
FROM exam_schedules es
WHERE es.deleted_at IS NULL
  AND (es.class_id, es.subject_id) IN (
    SELECT DISTINCT sec.class_id, ts.subject_id
    FROM timetable_slots ts
    JOIN sections sec ON ts.section_id = sec.id
    WHERE ts.teacher_id = $userId::uuid
  )
  [AND es.exam_type_id = $examTypeId]
ORDER BY es.exam_date ASC, es.start_time ASC
```

FIRST confirm the real column names and that `exam_schedules` actually carries
`class_id` and `subject_id` (the pre-flight implies it; verify before writing the
query). If the join keys differ, adapt — do not assume.

### Response shape
Reuse `ExamScheduleResponseDto` and ensure each row carries what the entry screen
needs without further lookups:
`examScheduleId, examTypeId, examTypeName, subjectId, subjectName, classId,
className, examDate, startTime, fullMarks, passMarks, theoryMarks, practicalMarks`.
Standard envelope `{ success, data, meta }`.

---

## Tests (all must pass; full suite green before done)
- Returns only schedules matching the teacher's taught (class, subject) pairs.
- Discrimination: a teacher who teaches Math in Class 10 gets the Class-10 Math
  schedule but NOT the Class-10 Science schedule taught by someone else.
- DISTINCT: a teacher teaching the same subject in two sections of one class sees
  that class's schedule for that subject ONCE, not twice.
- `examTypeId` passthrough narrows correctly.
- Empty case: a teacher with no timetable slots gets an empty list (not an error).
- Resolves from token only — no teacher/user id param is accepted.

---

## Conventions
- Dates AD in storage and in the response; mobile renders BS.
- `{ success, data, meta }` envelope.
- Run the FULL suite at the end. Not done until green; report the number.

## Next (Session D — screens, after this is green)
Marks-entry screen: open to `/exams/schedules/my`, pick a schedule, load that
section's students + existing marks (`GET /exams/marks?examScheduleId=`), enter
marks with a `/{fullMarks}` cap and the absent toggle, submit via
`POST /exams/marks/bulk`.
