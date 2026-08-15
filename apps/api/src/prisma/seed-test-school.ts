/**
 * Comprehensive dev seed for the `test` tenant (Test School College).
 *
 * Unlike seed-motherland.ts this tenant already went through the onboarding
 * wizard: 15 classes (Nursery..Grade 12) x 2 sections, 11 subjects, and the
 * current academic year already exist — this script only ADDS to that
 * structure (HR, students, exams, attendance, branding + photos), it
 * never creates classes/sections/subjects/academic years. BILLING-CUTOVER
 * Phase 4: no longer seeds fees/invoices/payments (old Finance's tables) —
 * use the real admin UI against this tenant for fee/billing dev data.
 *
 * Idempotent: departments/designations/grading scale/exam type are
 * name-keyed (skip if present); students top up each section to
 * STUDENTS_PER_SECTION; staff are keyed by email; attendance/marks use
 * ON CONFLICT DO NOTHING.
 *
 * Run:  npx ts-node src/prisma/seed-test-school.ts   (MinIO must be running)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { formatLocalDate } from '../modules/common/utils/date.util';
import { buildSeedStorage, publicUrlFor, uploadKind, runPool } from './seed-assets/upload.util';
import { makeLogoPng, makeSignaturePng, makeStampPng, makeAvatarPng } from './seed-assets/png.util';

const SLUG = 'test';
const SCHEMA = `tenant_${SLUG}`;
const STAFF_PASSWORD = 'TestSchool@123';
const BCRYPT_ROUNDS = 12;
const STUDENTS_PER_SECTION = 18;
const UPLOAD_CONCURRENCY = 25;

const AVATAR_COLORS = [
  '#1a8055', '#2563eb', '#b45309', '#7c3aed',
  '#0891b2', '#be123c', '#4d7c0f', '#c026d3',
];

const prisma = new PrismaClient();

// FIX-2: local components, not toISOString() — a seed means "the calendar
// day on this machine", not a UTC-shifted one.
const iso = (d: Date) => formatLocalDate(d);
const rnd = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const MALE_NAMES = [
  'Aarav', 'Bibek', 'Nischal', 'Prabin', 'Sujan', 'Aayush', 'Diwas', 'Roshan', 'Sandip', 'Utsav',
  'Bishal', 'Kiran', 'Anish', 'Dipesh', 'Rajan', 'Sagar', 'Yubaraj', 'Manoj', 'Suresh', 'Rabin',
];
const FEMALE_NAMES = [
  'Aastha', 'Bipana', 'Nisha', 'Pooja', 'Sarita', 'Anushka', 'Diya', 'Rejina', 'Samjhana', 'Usha',
  'Anjali', 'Sneha', 'Bandana', 'Kritika', 'Sabina', 'Reshma', 'Sunita', 'Puja', 'Manisha', 'Alisha',
];
const SURNAMES = [
  'Sharma', 'Karki', 'Thapa', 'Gurung', 'Shrestha', 'Tamang', 'Magar', 'Adhikari', 'Rai', 'Bhattarai',
  'Lama', 'Poudel', 'Khadka', 'Basnet', 'Bista', 'Joshi', 'KC', 'Chhetri', 'Neupane', 'Acharya',
];

// ─── Grade bands (over the school's EXISTING 11 subjects — none created here) ─
const PRE_PRIMARY = new Set(['Nursery', 'L.K.G.', 'U.K.G.']);
function gradeNumberOf(className: string): number | null {
  const m = /^Grade (\d+)$/.exec(className);
  return m ? parseInt(m[1], 10) : null;
}
function ageBaseFor(className: string): number {
  const map: Record<string, number> = { Nursery: 3, 'L.K.G.': 4, 'U.K.G.': 5 };
  if (map[className] !== undefined) return map[className];
  return (gradeNumberOf(className) ?? 8) + 5;
}
const BAND_SUBJECTS: Record<string, string[]> = {
  PRE: ['English', 'Nepali', 'Mathematics', 'H.P.E.E.'],
  PRIMARY: ['English', 'Nepali', 'Mathematics', 'Science', 'Computer Science', 'H.P.E.E.'],
  SECONDARY: ['English', 'Nepali', 'Mathematics', 'Science', 'Computer Science', 'Optional Maths', 'H.P.E.E.'],
  PLUS_TWO: [
    'English', 'Nepali', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
    'Computer Science', 'Accounting', 'Optional Maths', 'H.P.E.E.',
  ],
};
function bandOf(className: string): keyof typeof BAND_SUBJECTS {
  if (PRE_PRIMARY.has(className)) return 'PRE';
  const g = gradeNumberOf(className) ?? 0;
  if (g <= 8) return 'PRIMARY';
  if (g <= 10) return 'SECONDARY';
  return 'PLUS_TWO';
}

// ─── Staff roster ──────────────────────────────────────────────────────────
interface StaffPlan {
  firstName: string; lastName: string; gender: 'MALE' | 'FEMALE'; email: string;
  role: string; dept: string; designation: string; salary: number;
}

const TEACHER_CLUSTERS = [
  { subj: 'English', dept: 'Department of Languages', count: 3 },
  { subj: 'Nepali', dept: 'Department of Languages', count: 3 },
  { subj: 'Mathematics', dept: 'Department of Mathematics', count: 3 },
  { subj: 'Optional Maths', dept: 'Department of Mathematics', count: 1 },
  { subj: 'Science', dept: 'Department of Science', count: 3 },
  { subj: 'Physics', dept: 'Department of Science', count: 1 },
  { subj: 'Chemistry', dept: 'Department of Science', count: 1 },
  { subj: 'Biology', dept: 'Department of Science', count: 1 },
  { subj: 'Computer Science', dept: 'Department of Computer Science', count: 2 },
  { subj: 'Accounting', dept: 'Department of Commerce', count: 1 },
  { subj: 'H.P.E.E.', dept: 'Department of Health & Physical Education', count: 1 },
] as const;

function buildTeacherRoster(): StaffPlan[] {
  const roster: StaffPlan[] = [];
  let counter = 0;
  for (const cluster of TEACHER_CLUSTERS) {
    for (let i = 0; i < cluster.count; i++) {
      const isMale = counter % 2 === 0;
      const firstName = (isMale ? MALE_NAMES : FEMALE_NAMES)[counter % 20];
      const lastName = SURNAMES[(counter * 3 + 7) % 20];
      const designation = cluster.count >= 3 ? (i === 0 ? 'HOD' : i === 1 ? 'Senior Teacher' : 'Teacher') : 'Teacher';
      roster.push({
        firstName, lastName, gender: isMale ? 'MALE' : 'FEMALE',
        email: `teacher${counter + 1}@testschool.edu.np`,
        role: 'TEACHER', dept: cluster.dept, designation,
        salary: 32000 + (designation === 'HOD' ? 12000 : designation === 'Senior Teacher' ? 6000 : 0) + counter * 250,
      });
      counter++;
    }
  }
  return roster;
}

const ADMIN_STAFF: StaffPlan[] = [
  { firstName: 'Suresh', lastName: 'Bhattarai', gender: 'MALE', email: 'principal@testschool.edu.np', role: 'PRINCIPAL', dept: 'Administration', designation: 'Principal', salary: 85000 },
  { firstName: 'Kabita', lastName: 'Joshi', gender: 'FEMALE', email: 'coordinator@testschool.edu.np', role: 'ACADEMIC_COORDINATOR', dept: 'Administration', designation: 'Vice Principal', salary: 62000 },
  { firstName: 'Ramesh', lastName: 'KC', gender: 'MALE', email: 'accountant1@testschool.edu.np', role: 'ACCOUNTANT', dept: 'Finance', designation: 'Accountant', salary: 32000 },
  { firstName: 'Sabina', lastName: 'Rai', gender: 'FEMALE', email: 'accountant2@testschool.edu.np', role: 'ACCOUNTANT', dept: 'Finance', designation: 'Accountant', salary: 30000 },
  { firstName: 'Deepa', lastName: 'Lama', gender: 'FEMALE', email: 'librarian@testschool.edu.np', role: 'LIBRARIAN', dept: 'Library', designation: 'Librarian', salary: 28000 },
];

const DEPARTMENTS = [
  'Administration', 'Finance', 'Library',
  ...Array.from(new Set(TEACHER_CLUSTERS.map((c) => c.dept))),
];
const DESIGNATIONS = ['Principal', 'Vice Principal', 'HOD', 'Senior Teacher', 'Teacher', 'Accountant', 'Librarian'];

async function main(): Promise<void> {
  const today = new Date();
  const log: string[] = [];

  // ── 0. Tenant + branding images (network calls — kept outside the DB tx) ──
  const [tenant] = await prisma.$queryRawUnsafe<{
    id: string; logoUrl: string | null; primaryColor: string;
    principalSignatureUrl: string | null; schoolStampUrl: string | null;
  }[]>(
    `SELECT id, "logoUrl", "primaryColor", "principalSignatureUrl", "schoolStampUrl"
     FROM public.tenants WHERE slug = $1`,
    SLUG,
  );
  if (!tenant) throw new Error(`Tenant with slug "${SLUG}" not found — provision it first.`);

  const storage = buildSeedStorage();
  let logoUrl = tenant.logoUrl;
  let principalSignatureKey = tenant.principalSignatureUrl;
  let schoolStampKey = tenant.schoolStampUrl;
  if (!logoUrl) {
    const key = await uploadKind(storage, SLUG, 'school-logo', makeLogoPng(tenant.primaryColor || '#1a8055'), 'image/png', 'png');
    logoUrl = publicUrlFor(storage, key);
  }
  if (!principalSignatureKey) {
    principalSignatureKey = await uploadKind(storage, SLUG, 'principal-signature', makeSignaturePng(), 'image/png', 'png');
  }
  if (!schoolStampKey) {
    schoolStampKey = await uploadKind(storage, SLUG, 'school-stamp', makeStampPng('#b91c1c'), 'image/png', 'png');
  }
  await prisma.$executeRawUnsafe(
    `UPDATE public.tenants SET "logoUrl" = $1, "principalSignatureUrl" = $2, "schoolStampUrl" = $3 WHERE slug = $4`,
    logoUrl, principalSignatureKey, schoolStampKey, SLUG,
  );
  log.push('branding: logo + principal signature + school stamp ready');

  // ── 0.5. Onboarding left 3 classes (Nursery/L.K.G./U.K.G.) with ZERO
  // sections — fill the gap so every class can actually enrol students,
  // matching the A/B pattern already used for Grade 1-12.
  const classesNeedingSections = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT c.id, c.name FROM "${SCHEMA}".classes c
     LEFT JOIN "${SCHEMA}".sections s ON s.class_id = c.id AND s.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
     GROUP BY c.id, c.name HAVING COUNT(s.id) = 0`,
  );
  for (const cls of classesNeedingSections) {
    for (const secName of ['A', 'B']) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${SCHEMA}".sections (class_id, name, capacity) VALUES ($1::uuid, $2, 40)`,
        cls.id, secName,
      );
    }
  }
  if (classesNeedingSections.length > 0) {
    log.push(`sections created for previously-empty classes: ${classesNeedingSections.map((c) => c.name).join(', ')}`);
  }

  // ── existing state (read-only, schema-qualified so no search_path needed) ──
  const sections = await prisma.$queryRawUnsafe<{ id: string; name: string; class_id: string; class_name: string }[]>(
    `SELECT s.id, s.name, s.class_id, c.name AS class_name
     FROM "${SCHEMA}".sections s JOIN "${SCHEMA}".classes c ON c.id = s.class_id
     WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY c.order_index, s.name`,
  );
  const sectionCounts = await prisma.$queryRawUnsafe<{ section_id: string; c: bigint }[]>(
    `SELECT section_id, COUNT(*) AS c FROM "${SCHEMA}".students WHERE deleted_at IS NULL GROUP BY section_id`,
  );
  const haveMap = new Map(sectionCounts.map((r) => [r.section_id, Number(r.c)]));
  const newStudentsNeeded = sections.reduce(
    (sum, s) => sum + Math.max(0, STUDENTS_PER_SECTION - (haveMap.get(s.id) ?? 0)), 0,
  );

  const staffRoster = [...buildTeacherRoster(), ...ADMIN_STAFF];
  const [{ c: existingStaffCount }] = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*) AS c FROM "${SCHEMA}".staff_profiles WHERE deleted_at IS NULL`,
  );
  const newStaffNeeded = Math.max(0, staffRoster.length - Number(existingStaffCount));

  // ── avatar pool + per-person uploads (small template set, unique key each) ──
  const avatarBuffers = AVATAR_COLORS.map((c) => makeAvatarPng(c));
  console.log(`Uploading ${newStudentsNeeded} student photos + ${newStaffNeeded} staff photos to MinIO...`);
  const studentPhotoKeys = await runPool(
    Array.from({ length: newStudentsNeeded }),
    UPLOAD_CONCURRENCY,
    (_x, i) => uploadKind(storage, SLUG, 'student-photo', avatarBuffers[i % avatarBuffers.length], 'image/png', 'png'),
  );
  const staffPhotoKeys = await runPool(
    Array.from({ length: newStaffNeeded }),
    UPLOAD_CONCURRENCY,
    (_x, i) => uploadKind(storage, SLUG, 'staff-photo', avatarBuffers[(i + 3) % avatarBuffers.length], 'image/png', 'png'),
  );
  log.push(`photos uploaded: students +${studentPhotoKeys.length}, staff +${staffPhotoKeys.length}`);

  // ── 1. Everything else happens in one tenant-scoped transaction ──────────
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
      const q = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) =>
        tx.$queryRawUnsafe<T[]>(sql, ...args);
      const e = (sql: string, ...args: unknown[]) => tx.$executeRawUnsafe(sql, ...args);

      const [owner] = await q<{ id: string }>(
        `SELECT id FROM users WHERE role = 'SCHOOL_OWNER' AND deleted_at IS NULL LIMIT 1`,
      );
      const ownerId = owner.id;
      const [ay] = await q<{ id: string; name: string; year_bs: number }>(
        `SELECT id, name, year_bs FROM academic_years WHERE is_current = true LIMIT 1`,
      );
      const BS_YEAR = ay.year_bs;

      const classes = await q<{ id: string; name: string }>(`SELECT id, name FROM classes WHERE deleted_at IS NULL`);
      const classIds: Record<string, string> = {};
      for (const c of classes) classIds[c.name] = c.id;

      const subjects = await q<{ id: string; name: string }>(`SELECT id, name FROM subjects WHERE deleted_at IS NULL`);
      const subjectIds: Record<string, string> = {};
      for (const s of subjects) subjectIds[s.name] = s.id;

      // ── 2. DEPARTMENTS + DESIGNATIONS ─────────────────────────────────────
      const deptIds: Record<string, string> = {};
      for (const name of DEPARTMENTS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM departments WHERE name = $1 AND deleted_at IS NULL`, name);
        if (ex) { deptIds[name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO departments (name) VALUES ($1) RETURNING id`, name);
        deptIds[name] = row.id;
      }
      const desigIds: Record<string, string> = {};
      for (const title of DESIGNATIONS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM designations WHERE title = $1 AND deleted_at IS NULL`, title);
        if (ex) { desigIds[title] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO designations (title, department_id) VALUES ($1, NULL) RETURNING id`, title);
        desigIds[title] = row.id;
      }
      const [permanentType] = await q<{ id: string }>(
        `SELECT id FROM employment_types WHERE name = 'Permanent' AND deleted_at IS NULL`,
      );
      log.push(`departments: ${Object.keys(deptIds).length}, designations: ${Object.keys(desigIds).length}`);

      // ── 3. CLASS_SUBJECTS (over the EXISTING subjects, per grade band) ────
      let classSubjectCount = 0;
      for (const cls of classes) {
        for (const subName of BAND_SUBJECTS[bandOf(cls.name)]) {
          if (!subjectIds[subName]) continue; // defensive: skip if the tenant renamed/removed a subject
          classSubjectCount += await e(
            `INSERT INTO class_subjects (class_id, subject_id, academic_year_id, full_marks, pass_marks)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 100, 40)
             ON CONFLICT (class_id, subject_id, academic_year_id) DO NOTHING`,
            cls.id, subjectIds[subName], ay.id,
          );
        }
      }
      log.push(`class_subjects: +${classSubjectCount}`);

      // ── 4. STAFF ────────────────────────────────────────────────────────────
      const passwordHash = await bcrypt.hash(STAFF_PASSWORD, BCRYPT_ROUNDS);
      let photoCursor = 0;
      const teacherPool: string[] = [];
      let staffCreated = 0;
      for (const person of staffRoster) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM users WHERE email = $1`, person.email);
        if (ex) { if (person.role === 'TEACHER') teacherPool.push(ex.id); continue; }

        const photoKey = staffPhotoKeys[photoCursor] ?? null;
        photoCursor++;

        const [u] = await q<{ id: string }>(
          `INSERT INTO users (email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          person.email, passwordHash, person.firstName, person.lastName, person.role,
        );
        const [seqRow] = await q<{ value: bigint }>(
          `INSERT INTO sequences (key, value) VALUES ($1, 1)
           ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`,
          `emp_seq_${BS_YEAR}`,
        );
        const empId = `EMP-${BS_YEAR}-${String(Number(seqRow.value)).padStart(4, '0')}`;
        const dob = iso(new Date(1978 + (staffCreated % 20), staffCreated % 12, (staffCreated % 27) + 1));
        await e(
          `INSERT INTO staff_profiles
             (user_id, employee_id, department_id, designation_id, date_of_birth, gender,
              join_date, employment_type_id, base_salary, photo_url)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6, $7::date, $8::uuid, $9, $10)`,
          u.id, empId, deptIds[person.dept], desigIds[person.designation], dob, person.gender,
          iso(today), permanentType.id, person.salary, photoKey,
        );
        if (person.role === 'TEACHER') teacherPool.push(u.id);
        staffCreated++;
      }
      log.push(`staff: +${staffCreated} (teachers in pool: ${teacherPool.length})`);

      // ── 5. Class teacher per section (round robin over the teacher pool) ──
      let classTeacherAssigned = 0;
      for (let i = 0; i < sections.length; i++) {
        if (teacherPool.length === 0) break;
        classTeacherAssigned += await e(
          `UPDATE sections SET class_teacher_id = $1::uuid WHERE id = $2::uuid AND class_teacher_id IS NULL`,
          teacherPool[i % teacherPool.length], sections[i].id,
        );
      }
      log.push(`class teachers assigned: +${classTeacherAssigned}`);

      // ── 6. STUDENTS (top up each section to STUDENTS_PER_SECTION) ─────────
      const [maxRow] = await q<{ max_id: string | null }>(
        `SELECT MAX(student_id) AS max_id FROM students WHERE student_id LIKE $1`, `${BS_YEAR}-%`,
      );
      let seq = maxRow?.max_id ? parseInt(maxRow.max_id.split('-')[1], 10) + 1 : 1;
      let nameCounter = 0;
      let studentsCreated = 0;
      let studentPhotoCursor = 0;
      for (const sec of sections) {
        const have = haveMap.get(sec.id) ?? 0;
        for (let i = have; i < STUDENTS_PER_SECTION; i++) {
          const isMale = nameCounter % 2 === 0;
          const first = (isMale ? MALE_NAMES : FEMALE_NAMES)[nameCounter % 20];
          const last = SURNAMES[(nameCounter * 7 + 3) % 20];
          const birthYear = today.getFullYear() - ageBaseFor(sec.class_name);
          const dob = iso(new Date(birthYear, nameCounter % 12, (nameCounter % 27) + 1));
          const studentId = `${BS_YEAR}-${String(seq++).padStart(4, '0')}`;
          const photoKey = studentPhotoKeys[studentPhotoCursor] ?? null;
          studentPhotoCursor++;
          await e(
            `INSERT INTO students
               (tenant_id, student_id, first_name, last_name, date_of_birth, gender, nationality,
                class_id, section_id, class_name, section_name, roll_number, admission_date,
                academic_year, photo_url, status, created_by)
             VALUES
               ($1::uuid, $2, $3, $4, $5::date, $6, 'Nepali',
                $7::uuid, $8::uuid, $9, $10, $11, $12::date,
                $13, $14, 'ACTIVE', $15::uuid)`,
            tenant.id, studentId, first, last, dob, isMale ? 'MALE' : 'FEMALE',
            sec.class_id, sec.id, sec.class_name, sec.name, i + 1, iso(today),
            ay.name, photoKey, ownerId,
          );
          nameCounter++; studentsCreated++;
        }
      }
      log.push(`students: +${studentsCreated}`);

      const allStudents = await q<{ id: string; section_id: string; class_id: string; class_name: string }>(
        `SELECT id, section_id, class_id, class_name FROM students WHERE status = 'ACTIVE' AND deleted_at IS NULL`,
      );

      // ── 7/8. ATTENDANCE (last 5 weekdays; Saturday is Nepal's off day) ────
      const days: string[] = [];
      for (let d = 1; days.length < 5; d++) {
        const dt = new Date(today); dt.setDate(dt.getDate() - d);
        if (dt.getDay() !== 6) days.push(iso(dt));
      }
      let studentAttendance = 0;
      for (const st of allStudents) {
        for (const d of days) {
          const r = rnd(parseInt(st.id.replace(/-/g, '').slice(0, 8), 16) + d.charCodeAt(8));
          const status = r < 0.85 ? 'PRESENT' : r < 0.92 ? 'ABSENT' : r < 0.97 ? 'LATE' : 'LEAVE';
          studentAttendance += await e(
            `INSERT INTO student_attendance (student_id, section_id, academic_year_id, date, status, marked_by)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6::uuid)
             ON CONFLICT (student_id, date, academic_year_id) DO NOTHING`,
            st.id, st.section_id, ay.id, d, status, ownerId,
          );
        }
      }
      const staffUsers = await q<{ user_id: string }>(`SELECT user_id FROM staff_profiles WHERE deleted_at IS NULL`);
      let staffAttendance = 0;
      for (const su of staffUsers) {
        for (const d of days) {
          const r = rnd(parseInt(su.user_id.replace(/-/g, '').slice(0, 8), 16) + d.charCodeAt(9));
          const status = r < 0.9 ? 'PRESENT' : r < 0.95 ? 'LATE' : 'ABSENT';
          staffAttendance += await e(
            `INSERT INTO staff_attendance (user_id, date, status, check_in, check_out, marked_by)
             VALUES ($1::uuid, $2::date, $3, '09:45'::time, '16:00'::time, $4::uuid)
             ON CONFLICT (user_id, date) DO NOTHING`,
            su.user_id, d, status, ownerId,
          );
        }
      }
      log.push(`attendance — student: +${studentAttendance}, staff: +${staffAttendance}`);

      // BILLING-CUTOVER Phase 4: this script used to seed old Finance's
      // fee_categories/fee_structures/invoices/payments here (sections 9-10).
      // Those tables are dropped — Billing rail fee/invoice/payment seeding
      // isn't reproduced here; use the real admin UI (Fee Catalog, Bill Runs,
      // Payment Counter) against this tenant if fee/billing dev data is needed.

      // ── 11. EXAMS (grading scale, one exam type, sample schedules + marks) ─
      let [scale] = await q<{ id: string }>(`SELECT id FROM grading_scales WHERE name = 'NEB Grading System' AND deleted_at IS NULL`);
      if (!scale) {
        [scale] = await q<{ id: string }>(`INSERT INTO grading_scales (name, is_default) VALUES ('NEB Grading System', true) RETURNING id`);
        const THRESHOLDS = [
          ['A+', 4.0, 90, 100, 'Outstanding'], ['A', 3.6, 80, 89.99, 'Excellent'],
          ['B+', 3.2, 70, 79.99, 'Very Good'], ['B', 2.8, 60, 69.99, 'Good'],
          ['C+', 2.4, 50, 59.99, 'Satisfactory'], ['C', 2.0, 40, 49.99, 'Acceptable'],
          ['D', 1.6, 35, 39.99, 'Partially Acceptable'], ['E', 0.8, 0, 34.99, 'Insufficient'],
        ] as const;
        for (const [grade, gpa, min, max, remarks] of THRESHOLDS) {
          await e(
            `INSERT INTO grade_thresholds (grading_scale_id, grade, gpa_point, min_percent, max_percent, remarks)
             VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
            scale.id, grade, gpa, min, max, remarks,
          );
        }
      }
      let [examType] = await q<{ id: string }>(
        `SELECT id FROM exam_types WHERE name = 'First Terminal' AND academic_year_id = $1::uuid AND deleted_at IS NULL`,
        ay.id,
      );
      if (!examType) {
        [examType] = await q<{ id: string }>(
          `INSERT INTO exam_types (name, weight_percent, academic_year_id, grading_scale_id, order_index)
           VALUES ('First Terminal', 100, $1::uuid, $2::uuid, 1) RETURNING id`,
          ay.id, scale.id,
        );
      }

      let scheduleCount = 0, markCount = 0, examDay = 6;
      for (const cls of classes) {
        const coreSubjects = BAND_SUBJECTS[bandOf(cls.name)].slice(0, 3);
        for (const subName of coreSubjects) {
          if (!subjectIds[subName]) continue;
          const examDate = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - examDay));
          let [sched] = await q<{ id: string }>(
            `SELECT id FROM exam_schedules WHERE exam_type_id = $1::uuid AND class_id = $2::uuid AND subject_id = $3::uuid AND deleted_at IS NULL`,
            examType.id, cls.id, subjectIds[subName],
          );
          if (!sched) {
            [sched] = await q<{ id: string }>(
              `INSERT INTO exam_schedules (exam_type_id, class_id, subject_id, exam_date, start_time, end_time, full_marks, pass_marks)
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, '10:00'::time, '13:00'::time, 100, 40) RETURNING id`,
              examType.id, cls.id, subjectIds[subName], examDate,
            );
            scheduleCount++;
          }
          const classStudents = allStudents.filter((s) => s.class_id === cls.id);
          const bySection = new Map<string, typeof classStudents>();
          for (const s of classStudents) {
            const list = bySection.get(s.section_id) ?? [];
            list.push(s); bySection.set(s.section_id, list);
          }
          const sample = [...bySection.values()].flatMap((list) => list.slice(0, 5));
          for (const st of sample) {
            const score = 35 + Math.floor(rnd(parseInt(st.id.replace(/-/g, '').slice(0, 6), 16) + subName.length) * 60);
            markCount += await e(
              `INSERT INTO marks (exam_schedule_id, student_id, marks_obtained, is_absent, entered_by)
               VALUES ($1::uuid, $2::uuid, $3, false, $4::uuid)
               ON CONFLICT (exam_schedule_id, student_id) DO NOTHING`,
              sched.id, st.id, score, ownerId,
            );
          }
        }
        examDay++;
      }
      log.push(`exam schedules: +${scheduleCount}, marks: +${markCount}`);

      // eslint-disable-next-line no-console
      console.log(`Seed complete for ${SCHEMA}:\n  - ${log.join('\n  - ')}`);
    },
    { maxWait: 60000, timeout: 600000 },
  );

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Test School College seed complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Slug          : ${SLUG}`);
  console.log(` Staff password: ${STAFF_PASSWORD}  (all seeded staff logins)`);
  console.log(` Principal     : principal@testschool.edu.np`);
  console.log(` Coordinator   : coordinator@testschool.edu.np`);
  console.log(` Accountants   : accountant1@testschool.edu.np, accountant2@testschool.edu.np`);
  console.log(` Librarian     : librarian@testschool.edu.np`);
  console.log(` Teachers      : teacher1..teacher20@testschool.edu.np`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
