/* eslint-disable no-console */
/**
 * Demo school seed — provisions a complete school for teacher app E2E testing.
 *
 * Re-runnable: every step checks for the existing record before creating.
 * Uses real service methods (not raw inserts) so the data passes the same
 * constraints and triggers as the live app.
 *
 * Run:  npm run seed:demo
 */

import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { PrismaService } from './prisma.service';
import { TenantContextService } from '../modules/tenant/tenant-context.service';
import { TenantPrismaService } from '../modules/tenant/tenant-prisma.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { TenantProvisioningService } from '../modules/super-admin/tenant-provisioning.service';
import { AcademicYearService } from '../modules/academic/academic-year.service';
import { ClassService } from '../modules/academic/class.service';
import { SubjectService } from '../modules/academic/subject.service';
import { TimetableService } from '../modules/academic/timetable.service';
import { StaffService } from '../modules/hr/staff.service';
import { StudentService } from '../modules/student/student.service';
import { GuardianService } from '../modules/student/guardian.service';
import { GradingScaleService } from '../modules/examination/grading-scale.service';
import { ExamTypeService } from '../modules/examination/exam-type.service';
import { ExamScheduleService } from '../modules/examination/exam-schedule.service';
import { MarksService } from '../modules/examination/marks.service';
import { StudentAttendanceService } from '../modules/attendance/student-attendance.service';

// ─── Known demo credentials ───────────────────────────────────────────────────

const SLUG             = 'demo';
const SCHOOL_NAME      = 'Demo School Nepal';
const OWNER_EMAIL      = 'owner@demo.school';
const OWNER_PASSWORD   = 'Owner@12345';
const TEACHER_EMAIL    = 'teacher@demo.school';
const TEACHER_PASSWORD = 'Teacher@123';
const PARENT_EMAIL     = 'parent@demo.school';
const PARENT_PASSWORD  = 'Parent@123';
const PARENT_PHONE     = '9800000000';
const STUDENT_EMAIL    = 'student@demo.school';
const STUDENT_PASSWORD = 'Student@123';

// Current academic year (Nepali FY starts Shrawan 1 ≈ Jul 16). As of BS 2083
// Ashadh (mid-2026, before Shrawan) the running year is 2082-83.
const ACADEMIC_YEAR    = '2082-83';
const ACADEMIC_YEAR_BS = 2082;
const ACADEMIC_START   = '2025-07-16'; // Shrawan 1, 2082 BS
const ACADEMIC_END     = '2026-07-15'; // Ashadh end, 2083 BS

// ─── Static roster — deterministic for cross-run idempotency ─────────────────

const STUDENTS_A = [
  ['Aarav',   'Shrestha', 'MALE'],
  ['Binod',   'Gurung',   'MALE'],
  ['Chameli', 'Tamang',   'FEMALE'],
  ['Deepak',  'Karki',    'MALE'],
  ['Elina',   'Magar',    'FEMALE'],
  ['Firoj',   'Thapa',    'MALE'],
  ['Gita',    'Rai',      'FEMALE'],
  ['Hari',    'Adhikari', 'MALE'],
] as const;

const STUDENTS_B = [
  ['Ishwor', 'Basnet',   'MALE'],
  ['Jyoti',  'Sharma',   'FEMALE'],
  ['Kamal',  'Pandey',   'MALE'],
  ['Laxmi',  'Acharya',  'FEMALE'],
  ['Manish', 'Bhandari', 'MALE'],
  ['Nisha',  'Poudel',   'FEMALE'],
  ['Om',     'Subedi',   'MALE'],
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedDemo(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const prisma           = app.get(PrismaService);
  const tenantCtx        = app.get(TenantContextService);
  const tenantPrisma     = app.get(TenantPrismaService);
  const provisioning     = app.get(TenantProvisioningService);
  const academicYearSvc  = app.get(AcademicYearService);
  const classSvc         = app.get(ClassService);
  const subjectSvc       = app.get(SubjectService);
  const timetableSvc     = app.get(TimetableService);
  const staffSvc         = app.get(StaffService);
  const studentSvc       = app.get(StudentService);
  const guardianSvc      = app.get(GuardianService);
  const gradingScaleSvc  = app.get(GradingScaleService);
  const examTypeSvc      = app.get(ExamTypeService);
  const examScheduleSvc  = app.get(ExamScheduleService);
  const marksSvc         = app.get(MarksService);
  const attendanceSvc    = app.get(StudentAttendanceService);

  // ── 1. Tenant (skip if slug already exists) ───────────────────────────────
  let tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`  Provisioning school "${SLUG}"…`);
    await provisioning.provision({
      schoolName:     SCHOOL_NAME,
      slug:           SLUG,
      adminEmail:     OWNER_EMAIL,
      adminFirstName: 'Demo',
      adminLastName:  'Owner',
      adminPassword:  OWNER_PASSWORD,
    });
    tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  }

  const ctx = {
    tenantId:   tenant!.id,
    slug:       SLUG,
    schemaName: TenantService.schemaNameFor(SLUG),
  };

  // ── 2. All tenant-scoped work runs within the ALS context ─────────────────
  const report = await tenantCtx.run(ctx, async () => {

    // ── School-owner user ID (always present after provisioning) ─────────────
    const ownerRows = await tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'SCHOOL_OWNER' AND deleted_at IS NULL LIMIT 1`,
    );
    const ownerId = ownerRows[0].id;

    // ── Academic year (create + set current) ──────────────────────────────────
    // Idempotent + self-healing: always (re)assert the current year so a reseed
    // promotes the right one even if a stale year is currently flagged.
    const ayRows = await tenantPrisma.query<{ id: string; is_current: boolean }>(
      `SELECT id, is_current FROM academic_years WHERE name = $1 AND deleted_at IS NULL`,
      ACADEMIC_YEAR,
    );
    let academicYearId: string;
    if (ayRows[0]) {
      academicYearId = ayRows[0].id;
      if (!ayRows[0].is_current) {
        await academicYearSvc.setCurrentYear(academicYearId);
      }
    } else {
      const ay = await academicYearSvc.create({
        name:      ACADEMIC_YEAR,
        yearBs:    ACADEMIC_YEAR_BS,
        startDate: ACADEMIC_START,
        endDate:   ACADEMIC_END,
      });
      academicYearId = ay.id;
      await academicYearSvc.setCurrentYear(academicYearId);
    }

    // ── Class: Grade 9 ────────────────────────────────────────────────────────
    const classRows = await tenantPrisma.query<{ id: string }>(
      `SELECT id FROM classes WHERE name = 'Grade 9' AND deleted_at IS NULL`,
    );
    let classId: string;
    if (classRows[0]) {
      classId = classRows[0].id;
    } else {
      const cls = await classSvc.createClass({ name: 'Grade 9', alias: '9', orderIndex: 9 });
      classId = cls.id;
    }

    // ── Sections: A and B ─────────────────────────────────────────────────────
    const getOrCreateSection = async (name: string): Promise<string> => {
      const rows = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM sections WHERE class_id = $1::uuid AND name = $2 AND deleted_at IS NULL`,
        classId, name,
      );
      if (rows[0]) return rows[0].id;
      const sec = await classSvc.createSection(classId, { name, capacity: 40 });
      return sec.id;
    };
    const sectionAId = await getOrCreateSection('A');
    const sectionBId = await getOrCreateSection('B');

    // ── Subjects: Mathematics (split) and Science (single) ───────────────────
    const getOrCreateSubject = async (
      name: string, code: string, type: string,
    ): Promise<string> => {
      const rows = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM subjects WHERE name = $1 AND deleted_at IS NULL`,
        name,
      );
      if (rows[0]) return rows[0].id;
      const sub = await subjectSvc.createSubject({ name, code, type });
      return sub.id;
    };
    const mathId    = await getOrCreateSubject('Mathematics', 'MATH9', 'BOTH');
    const scienceId = await getOrCreateSubject('Science',     'SCI9',  'THEORY');

    // ── Assign subjects to class for this academic year ───────────────────────
    const ensureClassSubject = async (subjectId: string): Promise<void> => {
      const rows = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM class_subjects
         WHERE class_id = $1::uuid AND subject_id = $2::uuid AND academic_year_id = $3::uuid`,
        classId, subjectId, academicYearId,
      );
      if (!rows[0]) {
        await subjectSvc.assignSubjectToClass(classId, {
          subjectId,
          academicYearId,
          fullMarks: 100,
          passMarks: 40,
        });
      }
    };
    await ensureClassSubject(mathId);
    await ensureClassSubject(scienceId);

    // ── Teacher user + staff_profile ──────────────────────────────────────────
    const teacherRows = await tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      TEACHER_EMAIL,
    );
    let teacherUserId: string;
    if (teacherRows[0]) {
      teacherUserId = teacherRows[0].id;
    } else {
      // employment_type_id is a required FK (HR lookup CRUD) — createStaff has
      // no default, so resolve the seeded 'Permanent' employment_types row.
      const [permanentType] = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM employment_types WHERE name = 'Permanent' AND deleted_at IS NULL`,
      );
      const staff = await staffSvc.createStaff({
        firstName:  'Roshan',
        lastName:   'Sharma',
        email:      TEACHER_EMAIL,
        password:   TEACHER_PASSWORD,
        role:       'TEACHER',
        joinDate:   '2023-09-01',
        baseSalary: 35000,
        employmentTypeId: permanentType.id,
      });
      teacherUserId = staff.userId;
    }

    // ── Timetable slots ───────────────────────────────────────────────────────
    // Teacher covers Math+Science in both sections so /timetable/my/sections
    // returns two entries and /exams/schedules/my joins through both.
    // dayOfWeek: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    const slotDefs = [
      { sectionId: sectionAId, subjectId: mathId,    day: 1, period: 1, start: '10:00', end: '10:45' },
      { sectionId: sectionBId, subjectId: mathId,    day: 2, period: 1, start: '10:00', end: '10:45' },
      { sectionId: sectionAId, subjectId: scienceId, day: 3, period: 2, start: '11:00', end: '11:45' },
      { sectionId: sectionBId, subjectId: scienceId, day: 4, period: 2, start: '11:00', end: '11:45' },
    ];
    for (const s of slotDefs) {
      // Idempotent across academic-year changes: key on teacher/section/day/period
      // (not the year) so a reseed under a new current year does not duplicate slots.
      const existing = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM timetable_slots
         WHERE teacher_id = $1::uuid AND section_id = $2::uuid
           AND day_of_week = $3 AND period_number = $4
           AND deleted_at IS NULL`,
        teacherUserId, s.sectionId, s.day, s.period,
      );
      if (!existing[0]) {
        await timetableSvc.createSlot({
          sectionId:      s.sectionId,
          subjectId:      s.subjectId,
          teacherId:      teacherUserId,
          academicYearId,
          dayOfWeek:      s.day,
          periodNumber:   s.period,
          startTime:      s.start,
          endTime:        s.end,
        });
      }
    }

    // ── Students ──────────────────────────────────────────────────────────────
    // Count-based idempotency: add only the students that are missing.
    // Roll numbers are 1-based and sequential within each section.
    const admitMissing = async (
      roster: readonly (readonly [string, string, string])[],
      sectionId: string,
    ): Promise<Array<{ id: string }>> => {
      const existing = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students
         WHERE section_id = $1::uuid AND deleted_at IS NULL
         ORDER BY roll_number ASC, created_at ASC`,
        sectionId,
      );
      for (let i = existing.length; i < roster.length; i++) {
        const [firstName, lastName, gender] = roster[i];
        await studentSvc.admitStudent({
          firstName,
          lastName,
          dateOfBirth:   '2007-06-15',
          gender,
          admissionDate: '2024-07-16',
          classId,
          sectionId,
          academicYearId,
          rollNumber:    i + 1,
        }, ownerId);
      }
      return tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students
         WHERE section_id = $1::uuid AND deleted_at IS NULL
         ORDER BY roll_number ASC, created_at ASC`,
        sectionId,
      );
    };

    const studentsA = await admitMissing(STUDENTS_A, sectionAId);
    const studentsB = await admitMissing(STUDENTS_B, sectionBId);

    // ── Grading scale ─────────────────────────────────────────────────────────
    const gsRows = await tenantPrisma.query<{ id: string }>(
      `SELECT id FROM grading_scales WHERE name = 'Percentage' AND deleted_at IS NULL`,
    );
    let gradingScaleId: string;
    if (gsRows[0]) {
      gradingScaleId = gsRows[0].id;
    } else {
      const gs = await gradingScaleSvc.createScale({
        name: 'Percentage',
        thresholds: [
          { grade: 'A+', gpaPoint: 4.0, minPercent: 90,    maxPercent: 100,   remarks: 'Outstanding' },
          { grade: 'A',  gpaPoint: 3.6, minPercent: 80,    maxPercent: 89.99, remarks: 'Excellent'   },
          { grade: 'B+', gpaPoint: 3.2, minPercent: 70,    maxPercent: 79.99, remarks: 'Very Good'   },
          { grade: 'B',  gpaPoint: 2.8, minPercent: 60,    maxPercent: 69.99, remarks: 'Good'        },
          { grade: 'C+', gpaPoint: 2.4, minPercent: 50,    maxPercent: 59.99, remarks: 'Average'     },
          { grade: 'C',  gpaPoint: 2.0, minPercent: 40,    maxPercent: 49.99, remarks: 'Pass'        },
          { grade: 'D',  gpaPoint: 1.6, minPercent: 30,    maxPercent: 39.99, remarks: 'Partial'     },
          { grade: 'E',  gpaPoint: 0.0, minPercent: 0,     maxPercent: 29.99, remarks: 'Fail'        },
        ],
      });
      gradingScaleId = gs.id;
    }

    // ── Exam type ─────────────────────────────────────────────────────────────
    const etRows = await tenantPrisma.query<{ id: string }>(
      `SELECT id FROM exam_types
       WHERE name = 'First Terminal' AND academic_year_id = $1::uuid AND deleted_at IS NULL`,
      academicYearId,
    );
    let examTypeId: string;
    if (etRows[0]) {
      examTypeId = etRows[0].id;
    } else {
      const et = await examTypeSvc.create({
        name:          'First Terminal',
        weightPercent: 100,
        academicYearId,
        gradingScaleId,
        orderIndex:    1,
      });
      examTypeId = et.id;
    }

    // ── Exam schedules ────────────────────────────────────────────────────────
    // SPLIT exam (Math): theory_marks=60, practical_marks=40 → isSplit=true in the app.
    // SINGLE exam (Science): no theory/practical split → isSplit=false in the app.
    const getOrCreateSchedule = async (opts: {
      subjectId: string;
      examDate: string;
      fullMarks: number;
      passMarks: number;
      theoryMarks?: number;
      practicalMarks?: number;
    }): Promise<string> => {
      const rows = await tenantPrisma.query<{ id: string }>(
        `SELECT id FROM exam_schedules
         WHERE exam_type_id = $1::uuid AND class_id = $2::uuid AND subject_id = $3::uuid
           AND deleted_at IS NULL`,
        examTypeId, classId, opts.subjectId,
      );
      if (rows[0]) return rows[0].id;
      const sched = await examScheduleSvc.create({
        examTypeId,
        classId,
        subjectId:      opts.subjectId,
        examDate:       opts.examDate,
        startTime:      '10:00',
        endTime:        '13:00',
        fullMarks:      opts.fullMarks,
        passMarks:      opts.passMarks,
        theoryMarks:    opts.theoryMarks,
        practicalMarks: opts.practicalMarks,
      });
      return sched.id;
    };

    const mathScheduleId = await getOrCreateSchedule({
      subjectId:      mathId,
      examDate:       '2025-01-15',
      fullMarks:      100,
      passMarks:      40,
      theoryMarks:    60,   // triggers isSplit in marks.tsx
      practicalMarks: 40,
    });

    const sciScheduleId = await getOrCreateSchedule({
      subjectId: scienceId,
      examDate:  '2025-01-16',
      fullMarks: 100,
      passMarks: 40,
    });

    // ── Prefill marks (first 5 students of Section A, both schedules) ─────────
    // Uses ON CONFLICT DO UPDATE so safe to re-run.
    // Math (split): theory [45,47,49,51,53] + practical [30,31,32,33,34] = [75,78,81,84,87]
    // Science (single): [55,60,ABSENT,70,75]
    const firstFive = studentsA.slice(0, 5);

    await marksSvc.bulkEnterMarks({
      examScheduleId: mathScheduleId,
      marks: firstFive.map((s, i) => ({
        studentId:      s.id,
        isAbsent:       false,
        theoryMarks:    45 + i * 2,
        practicalMarks: 30 + i,
        marksObtained:  (45 + i * 2) + (30 + i),
      })),
    }, teacherUserId);

    await marksSvc.bulkEnterMarks({
      examScheduleId: sciScheduleId,
      marks: firstFive.map((s, i) => {
        if (i === 2) {
          return { studentId: s.id, isAbsent: true };
        }
        return { studentId: s.id, isAbsent: false, marksObtained: 55 + i * 5 };
      }),
    }, teacherUserId);

    // ── Attendance (2 past days, Section A) ───────────────────────────────────
    // student[3] (Deepak) is marked ABSENT; rest are PRESENT.
    // Uses ON CONFLICT DO UPDATE so safe to re-run.
    for (const daysAgo of [2, 1]) {
      await attendanceSvc.bulkMark({
        sectionId:      sectionAId,
        academicYearId,
        date:           pastDate(daysAgo),
        records:        studentsA.map((s, i) => ({
          studentId: s.id,
          status:    (i === 3 ? 'ABSENT' : 'PRESENT') as any,
        })),
      }, teacherUserId);
    }

    // ── Parent portal account (provisioned via the real service path) ─────────
    // Replaces the manual SQL guardian insert used during the 2026-06-21 audit.
    // Idempotent: re-running creates no duplicate guardian and no duplicate user.
    // Links parent → studentsA[0] (Section A) so the parent resolves to exactly
    // their own child and a Section-B fetch stays 403.
    const parentLink = await guardianSvc.provisionGuardian(studentsA[0].id, {
      relation:  'Father',
      firstName: 'Demo',
      lastName:  'Parent',
      phone:     PARENT_PHONE,
      email:     PARENT_EMAIL,
      password:  PARENT_PASSWORD,
      isPrimary: true,
    });

    // ── R2 Task 3: second child for the same parent (exercise the child-switcher).
    // Idempotent: provisionGuardian is keyed on (student_id, phone) and reuses the
    // existing PARENT user by email, so a reseed adds no duplicate.
    const parentLink2 = await guardianSvc.provisionGuardian(studentsA[1].id, {
      relation:  'Father',
      firstName: 'Demo',
      lastName:  'Parent',
      phone:     PARENT_PHONE,
      email:     PARENT_EMAIL,
      password:  PARENT_PASSWORD,
      isPrimary: false,
    });

    // ── R2 Task 2: student portal account (idempotent) ────────────────────────
    // Linked to the parent's first child so the demo has a working STUDENT login.
    const studentLoginRows = await tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      STUDENT_EMAIL,
    );
    let studentAccountCreated = false;
    if (!studentLoginRows[0]) {
      await studentSvc.createStudentAccount(studentsA[0].id, {
        email:    STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
      });
      studentAccountCreated = true;
    }

    // ── R2 Task 2: deterministic credentials on reseed ────────────────────────
    // Force the documented password for every demo role to take effect even when
    // the user already exists (the service paths only set a password on INSERT).
    const ensurePassword = async (email: string, password: string): Promise<void> => {
      const hash = await bcrypt.hash(password, 10);
      await tenantPrisma.execute(
        `UPDATE users SET password_hash = $1 WHERE email = $2 AND deleted_at IS NULL`,
        hash, email,
      );
    };
    await ensurePassword(OWNER_EMAIL, OWNER_PASSWORD);
    await ensurePassword(TEACHER_EMAIL, TEACHER_PASSWORD);
    await ensurePassword(PARENT_EMAIL, PARENT_PASSWORD);
    await ensurePassword(STUDENT_EMAIL, STUDENT_PASSWORD);

    return {
      students: { A: studentsA.length, B: studentsB.length },
      parent: { child1Id: studentsA[0].id, child2Id: studentsA[1].id, ...parentLink },
      parentChild2Linked: parentLink2.linked,
      studentAccountCreated,
    };
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Demo seed complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Slug       : ${SLUG}`);
  console.log(` Teacher    : ${TEACHER_EMAIL}  /  ${TEACHER_PASSWORD}`);
  console.log(` Owner      : ${OWNER_EMAIL}  /  ${OWNER_PASSWORD}`);
  console.log(` Parent     : ${PARENT_EMAIL}  /  ${PARENT_PASSWORD}  (2 children, Section A; 2nd linked=${report.parentChild2Linked})`);
  console.log(` Student    : ${STUDENT_EMAIL}  /  ${STUDENT_PASSWORD}  (Section A child; created=${report.studentAccountCreated})`);
  console.log(` Year       : ${ACADEMIC_YEAR} (current)`);
  console.log(` Class      : Grade 9 — Section A (${report.students.A} students) + Section B (${report.students.B} students)`);
  console.log(` Subjects   : Mathematics (split T60+P40) · Science (single 100)`);
  console.log(` Timetable  : 4 slots — Mon+Wed Sec-A, Tue+Thu Sec-B`);
  console.log(` Schedules  : 2 — First Terminal Math + Science`);
  console.log(` Prefill    : marks for 5 students × 2 schedules · attendance 2 days in Sec-A`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await app.close();
}

seedDemo().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
