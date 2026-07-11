/**
 * Comprehensive dev seed for the `motherland-school` tenant.
 * Populates every major module in dependency order. Idempotent: re-running
 * tops up / skips existing rows instead of duplicating (uses name/email guards,
 * ON CONFLICT, and per-section student top-up).
 *
 * Run:  npx ts-node src/prisma/seed-motherland.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { formatLocalDate } from '../modules/common/utils/date.util';

const SCHEMA = 'tenant_motherland_school';
const TENANT_ID = '4ba39f83-c58c-46b1-9662-8ed33611576e';
const STAFF_PASSWORD = 'Motherland@123';
const BCRYPT_ROUNDS = 12;
const BS_YEAR = 2083;
const STUDENTS_PER_SECTION = 5;

const prisma = new PrismaClient();

// FIX-2: local components, not toISOString() — several call sites pass
// local-frame Dates (new Date(y, m, d)), which UTC formatting shifted a day
// back on Nepal-TZ dev machines. A seed means "the calendar day on this machine".
const iso = (d: Date) => formatLocalDate(d);
const rnd = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const MALE_NAMES = ['Aarav', 'Bibek', 'Nischal', 'Prabin', 'Sujan', 'Aayush', 'Diwas', 'Roshan', 'Sandip', 'Utsav', 'Bishal', 'Kiran'];
const FEMALE_NAMES = ['Aastha', 'Bipana', 'Nisha', 'Pooja', 'Sarita', 'Anushka', 'Diya', 'Rejina', 'Samjhana', 'Usha', 'Anjali', 'Sneha'];
const SURNAMES = ['Sharma', 'Karki', 'Thapa', 'Gurung', 'Shrestha', 'Tamang', 'Magar', 'Adhikari', 'Rai', 'Bhattarai', 'Lama', 'Poudel', 'Khadka', 'Basnet'];

async function main(): Promise<void> {
  const today = new Date();

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
      const [ay] = await q<{ id: string; name: string }>(
        `SELECT id, name FROM academic_years WHERE is_current = true LIMIT 1`,
      );
      const log: string[] = [];

      // ── 1. SUBJECTS ───────────────────────────────────────────────────────
      const SUBJECTS = [
        { name: 'English', code: 'ENG', type: 'THEORY' },
        { name: 'Nepali', code: 'NEP', type: 'THEORY' },
        { name: 'Mathematics', code: 'MATH', type: 'THEORY' },
        { name: 'Science', code: 'SCI', type: 'BOTH' },
        { name: 'Social Studies', code: 'SOC', type: 'THEORY' },
        { name: 'Computer Science', code: 'COMP', type: 'BOTH' },
        { name: 'Health & Physical Edu.', code: 'HPE', type: 'THEORY' },
        { name: 'Optional Mathematics', code: 'OMATH', type: 'THEORY' },
      ];
      const subjectIds: Record<string, string> = {};
      for (const s of SUBJECTS) {
        const [existing] = await q<{ id: string }>(`SELECT id FROM subjects WHERE name = $1 AND deleted_at IS NULL`, s.name);
        if (existing) { subjectIds[s.name] = existing.id; continue; }
        const [row] = await q<{ id: string }>(
          `INSERT INTO subjects (name, code, type) VALUES ($1, $2, $3) RETURNING id`,
          s.name, s.code, s.type,
        );
        subjectIds[s.name] = row.id;
      }
      log.push(`subjects: ${Object.keys(subjectIds).length}`);

      // ── 2. DEPARTMENTS + DESIGNATIONS ─────────────────────────────────────
      const DEPTS = ['Department of Science', 'Department of Mathematics', 'Department of Languages', 'Department of Social Studies', 'Administration'];
      const deptIds: Record<string, string> = {};
      for (const name of DEPTS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM departments WHERE name = $1 AND deleted_at IS NULL`, name);
        if (ex) { deptIds[name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO departments (name) VALUES ($1) RETURNING id`, name);
        deptIds[name] = row.id;
      }
      const DESIGS = ['HOD', 'Senior Teacher', 'Teacher', 'Vice Principal', 'Principal', 'Accountant', 'Librarian'];
      const desigIds: Record<string, string> = {};
      for (const title of DESIGS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM designations WHERE title = $1 AND deleted_at IS NULL`, title);
        if (ex) { desigIds[title] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO designations (title) VALUES ($1) RETURNING id`, title);
        desigIds[title] = row.id;
      }
      log.push(`departments: ${Object.keys(deptIds).length}, designations: ${Object.keys(desigIds).length}`);

      // ── 3. CLASSES + SECTIONS ─────────────────────────────────────────────
      const CLASS_NAMES = ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
      const [maxOrder] = await q<{ m: number | null }>(`SELECT MAX(order_index) AS m FROM classes`);
      let order = (maxOrder?.m ?? 0) + 1;
      const classIds: Record<string, string> = {};
      for (const name of CLASS_NAMES) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM classes WHERE name = $1 AND deleted_at IS NULL`, name);
        if (ex) { classIds[name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO classes (name, order_index) VALUES ($1, $2) RETURNING id`, name, order++);
        classIds[name] = row.id;
      }
      for (const name of CLASS_NAMES) {
        for (const secName of ['A', 'B']) {
          const [ex] = await q<{ id: string }>(`SELECT id FROM sections WHERE class_id = $1::uuid AND name = $2 AND deleted_at IS NULL`, classIds[name], secName);
          if (ex) continue;
          await e(`INSERT INTO sections (class_id, name, capacity) VALUES ($1::uuid, $2, 40)`, classIds[name], secName);
        }
      }
      const sections = await q<{ id: string; name: string; class_id: string; class_name: string }>(
        `SELECT s.id, s.name, s.class_id, c.name AS class_name
         FROM sections s JOIN classes c ON c.id = s.class_id
         WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL
         ORDER BY c.order_index, s.name`,
      );
      log.push(`classes: ${Object.keys(classIds).length}, sections: ${sections.length}`);

      // ── 4. CLASS_SUBJECTS ─────────────────────────────────────────────────
      for (const cName of CLASS_NAMES) {
        for (const subName of Object.keys(subjectIds)) {
          if (subName === 'Optional Mathematics' && !['Grade 9', 'Grade 10'].includes(cName)) continue;
          await e(
            `INSERT INTO class_subjects (class_id, subject_id, academic_year_id, full_marks, pass_marks)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 100, 35)
             ON CONFLICT (class_id, subject_id, academic_year_id) DO NOTHING`,
            classIds[cName], subjectIds[subName], ay.id,
          );
        }
      }
      log.push('class_subjects: linked');

      // ── 5. STAFF (teacher pool) ───────────────────────────────────────────
      const passwordHash = await bcrypt.hash(STAFF_PASSWORD, BCRYPT_ROUNDS);
      const NEW_TEACHERS = Array.from({ length: 10 }, (_, i) => ({
        firstName: ['Anil', 'Bina', 'Chandra', 'Deepa', 'Eshan', 'Gita', 'Hari', 'Indira', 'Jeevan', 'Kabita'][i],
        lastName: SURNAMES[i % SURNAMES.length],
        email: `teacher${i + 1}@motherland.edu.np`,
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        dept: DEPTS[i % 4],
        desig: i < 2 ? 'Senior Teacher' : 'Teacher',
        salary: 38000 + i * 1000,
      }));
      const teacherPool: string[] = [];
      for (const t of NEW_TEACHERS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM users WHERE email = $1`, t.email);
        if (ex) { teacherPool.push(ex.id); continue; }
        const [u] = await q<{ id: string }>(
          `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, 'TEACHER') RETURNING id`,
          t.email, passwordHash, t.firstName, t.lastName,
        );
        const [seqRow] = await q<{ value: bigint }>(
          `INSERT INTO sequences (key, value) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`,
          `emp_seq_${BS_YEAR}`,
        );
        const empId = `EMP-${BS_YEAR}-${String(Number(seqRow.value)).padStart(4, '0')}`;
        await e(
          `INSERT INTO staff_profiles (user_id, employee_id, department_id, designation_id, gender, join_date, employment_type, base_salary)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::date, 'PERMANENT', $7)`,
          u.id, empId, deptIds[t.dept], desigIds[t.desig], t.gender, iso(today), t.salary,
        );
        teacherPool.push(u.id);
      }
      log.push(`new teachers: ${teacherPool.length}`);

      // ── 6. STUDENTS (top-up each section) ─────────────────────────────────
      const [maxRow] = await q<{ max_id: string | null }>(
        `SELECT MAX(student_id) AS max_id FROM students WHERE student_id LIKE $1`, `${BS_YEAR}-%`,
      );
      let seq = maxRow?.max_id ? parseInt(maxRow.max_id.split('-')[1], 10) + 1 : 1;
      let nameCounter = 0;
      let newStudents = 0;
      for (const sec of sections) {
        const [cnt] = await q<{ c: bigint }>(`SELECT COUNT(*) AS c FROM students WHERE section_id = $1::uuid AND deleted_at IS NULL`, sec.id);
        const have = Number(cnt.c);
        for (let i = have; i < STUDENTS_PER_SECTION; i++) {
          const isMale = nameCounter % 2 === 0;
          const first = (isMale ? MALE_NAMES : FEMALE_NAMES)[nameCounter % 12];
          const last = SURNAMES[(nameCounter * 3) % SURNAMES.length];
          const gradeNum = parseInt(sec.class_name.replace(/\D/g, ''), 10) || 8;
          const birthYear = 2026 - (gradeNum + 5);
          const studentId = `${BS_YEAR}-${String(seq++).padStart(4, '0')}`;
          const guardian = [{ firstName: SURNAMES[(nameCounter + 1) % SURNAMES.length], lastName: last, relation: 'Father', phone: `984${String(1000000 + nameCounter).slice(-7)}`, isPrimary: true }];
          await e(
            `INSERT INTO students (tenant_id, student_id, first_name, last_name, date_of_birth, gender, nationality, guardians, class_id, section_id, class_name, section_name, roll_number, admission_date, academic_year, status)
             VALUES ($1::uuid, $2, $3, $4, $5::date, $6, 'Nepali', $7::jsonb, $8::uuid, $9::uuid, $10, $11, $12, $13::date, $14, 'ACTIVE')`,
            TENANT_ID, studentId, first, last, `${birthYear}-0${(nameCounter % 9) + 1}-15`, isMale ? 'MALE' : 'FEMALE',
            JSON.stringify(guardian), sec.class_id, sec.id, sec.class_name, sec.name, i + 1, iso(today), ay.name,
          );
          nameCounter++; newStudents++;
        }
      }
      log.push(`new students: ${newStudents}`);

      const allStudents = await q<{ id: string; section_id: string; class_id: string }>(
        `SELECT s.id, s.section_id, sec.class_id FROM students s JOIN sections sec ON sec.id = s.section_id WHERE s.status = 'ACTIVE' AND s.deleted_at IS NULL`,
      );

      // ── 7. TIMETABLE (conflict-free: distinct teacher per day/period) ─────
      const PERIODS = [
        { p: 1, start: '10:00', end: '10:45' }, { p: 2, start: '10:45', end: '11:30' },
        { p: 3, start: '11:30', end: '12:15' }, { p: 4, start: '13:00', end: '13:45' },
        { p: 5, start: '13:45', end: '14:30' },
      ];
      const subjList = Object.values(subjectIds);
      let ttCount = 0;
      for (let si = 0; si < sections.length; si++) {
        for (let day = 0; day <= 4; day++) {
          for (const period of PERIODS) {
            const teacher = teacherPool[(si + period.p) % teacherPool.length];
            const subject = subjList[(day + period.p) % subjList.length];
            const r = await e(
              `INSERT INTO timetable_slots (section_id, subject_id, teacher_id, academic_year_id, day_of_week, period_number, start_time, end_time, room)
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::time, $8::time, $9)
               ON CONFLICT DO NOTHING`,
              sections[si].id, subject, teacher, ay.id, day, period.p, period.start, period.end, `Room ${si + 1}0${period.p}`,
            );
            ttCount += r;
          }
        }
      }
      log.push(`timetable slots: ${ttCount}`);

      // ── 8/9. ATTENDANCE (last 7 weekdays; Sat = off) ──────────────────────
      const days: string[] = [];
      for (let d = 1; days.length < 7; d++) {
        const dt = new Date(today); dt.setDate(dt.getDate() - d);
        if (dt.getDay() !== 6) days.push(iso(dt));
      }
      let stAtt = 0;
      for (const st of allStudents) {
        for (const d of days) {
          const r = rnd(parseInt(st.id.slice(0, 8), 16) + d.charCodeAt(8));
          const status = r < 0.85 ? 'PRESENT' : r < 0.92 ? 'ABSENT' : r < 0.97 ? 'LATE' : 'LEAVE';
          stAtt += await e(
            `INSERT INTO student_attendance (student_id, section_id, academic_year_id, date, status, marked_by)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6::uuid)
             ON CONFLICT (student_id, date, academic_year_id) DO NOTHING`,
            st.id, st.section_id, ay.id, d, status, ownerId,
          );
        }
      }
      const staffUsers = await q<{ user_id: string }>(`SELECT user_id FROM staff_profiles WHERE deleted_at IS NULL`);
      let stfAtt = 0;
      for (const su of staffUsers) {
        for (const d of days) {
          const r = rnd(parseInt(su.user_id.slice(0, 8), 16) + d.charCodeAt(9));
          const status = r < 0.9 ? 'PRESENT' : r < 0.95 ? 'LATE' : 'ABSENT';
          stfAtt += await e(
            `INSERT INTO staff_attendance (user_id, date, status, check_in, check_out, marked_by)
             VALUES ($1::uuid, $2::date, $3, '09:15'::time, '16:30'::time, $4::uuid)
             ON CONFLICT (user_id, date) DO NOTHING`,
            su.user_id, d, status, ownerId,
          );
        }
      }
      log.push(`student attendance: ${stAtt}, staff attendance: ${stfAtt}`);

      // ── 10. FEES ──────────────────────────────────────────────────────────
      const FEE_CATS = [
        { name: 'Admission Fee', type: 'ONE_TIME' }, { name: 'Monthly Tuition', type: 'MONTHLY' },
        { name: 'Exam Fee', type: 'EXAM' }, { name: 'Library Fee', type: 'ANNUALLY' },
        { name: 'Computer Fee', type: 'MONTHLY' },
      ];
      const catIds: Record<string, string> = {};
      for (const c of FEE_CATS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM fee_categories WHERE name = $1 AND deleted_at IS NULL`, c.name);
        if (ex) { catIds[c.name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO fee_categories (name, type, is_active) VALUES ($1, $2, true) RETURNING id`, c.name, c.type);
        catIds[c.name] = row.id;
      }
      const structureItems: Record<string, { itemId: string; cat: string; amount: number }[]> = {};
      for (const cName of CLASS_NAMES) {
        let [structure] = await q<{ id: string }>(`SELECT id FROM fee_structures WHERE class_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL`, classIds[cName], ay.id);
        if (!structure) {
          [structure] = await q<{ id: string }>(`INSERT INTO fee_structures (class_id, academic_year_id, created_by) VALUES ($1::uuid, $2::uuid, $3::uuid) RETURNING id`, classIds[cName], ay.id, ownerId);
        }
        const gradeNum = parseInt(cName.replace(/\D/g, ''), 10);
        const items = [
          { cat: 'Monthly Tuition', amount: 1500 + gradeNum * 100, due_day: 10, fine: 10 },
          { cat: 'Exam Fee', amount: 800, due_day: 15, fine: 0 },
          { cat: 'Library Fee', amount: 1200, due_day: 20, fine: 0 },
          { cat: 'Computer Fee', amount: 500, due_day: 10, fine: 5 },
        ];
        structureItems[cName] = [];
        for (const it of items) {
          const [ex] = await q<{ id: string }>(`SELECT id FROM fee_structure_items WHERE fee_structure_id = $1::uuid AND fee_category_id = $2::uuid`, structure.id, catIds[it.cat]);
          let itemId = ex?.id;
          if (!itemId) {
            const [row] = await q<{ id: string }>(
              `INSERT INTO fee_structure_items (fee_structure_id, fee_category_id, amount, due_day_of_month, fine_per_day, grace_period_days) VALUES ($1::uuid, $2::uuid, $3, $4, $5, 5) RETURNING id`,
              structure.id, catIds[it.cat], it.amount, it.due_day, it.fine,
            );
            itemId = row.id;
          }
          structureItems[cName].push({ itemId, cat: it.cat, amount: it.amount });
        }
      }
      log.push(`fee categories: ${Object.keys(catIds).length}, structures: ${CLASS_NAMES.length}`);

      // ── 11. INVOICES + ITEMS + PAYMENTS (subset of students) ──────────────
      const classNameById: Record<string, string> = {};
      for (const cn of CLASS_NAMES) classNameById[classIds[cn]] = cn;
      const dueDate = iso(new Date(today.getFullYear(), today.getMonth() + 1, 10));
      let invCount = 0, payCount = 0;
      const invoiceSubset = allStudents.slice(0, 30);
      for (let idx = 0; idx < invoiceSubset.length; idx++) {
        const st = invoiceSubset[idx];
        const cName = classNameById[st.class_id];
        if (!cName) continue;
        const [hasInv] = await q<{ id: string }>(`SELECT id FROM invoices WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL LIMIT 1`, st.id, ay.id);
        if (hasInv) continue;
        const items = structureItems[cName].filter((it) => ['Monthly Tuition', 'Exam Fee'].includes(it.cat));
        const subtotal = items.reduce((s, it) => s + it.amount, 0);
        const [seqRow] = await q<{ value: bigint }>(`INSERT INTO sequences (key, value) VALUES ('invoice_seq', 1) ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`);
        const invNo = `INV-${BS_YEAR}-${String(Number(seqRow.value)).padStart(6, '0')}`;
        const mode = idx % 3; // 0 paid, 1 partial, 2 unpaid
        const paid = mode === 0 ? subtotal : mode === 1 ? Math.round(subtotal / 2) : 0;
        const status = mode === 0 ? 'PAID' : mode === 1 ? 'PARTIAL' : 'UNPAID';
        const [inv] = await q<{ id: string }>(
          `INSERT INTO invoices (invoice_number, student_id, academic_year_id, due_date, status, subtotal, discount_amount, fine_amount, total_amount, paid_amount, created_by)
           VALUES ($1, $2::uuid, $3::uuid, $4::date, $5, $6, 0, 0, $6, $7, $8::uuid) RETURNING id`,
          invNo, st.id, ay.id, dueDate, status, subtotal, paid, ownerId,
        );
        for (const it of items) {
          await e(
            `INSERT INTO invoice_items (invoice_id, fee_category_id, fee_category_name, original_amount, discount_percent, discounted_amount, fine_per_day, grace_period_days)
             VALUES ($1::uuid, $2::uuid, $3, $4, 0, $4, 0, 5)`,
            inv.id, catIds[it.cat], it.cat, it.amount,
          );
        }
        invCount++;
        if (paid > 0) {
          const [pSeq] = await q<{ value: bigint }>(`INSERT INTO sequences (key, value) VALUES ('payment_seq', 1) ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`);
          const payNo = `PAY-${BS_YEAR}-${String(Number(pSeq.value)).padStart(6, '0')}`;
          const method = ['CASH', 'ESEWA', 'KHALTI', 'BANK_TRANSFER'][idx % 4];
          await e(
            `INSERT INTO payments (payment_number, invoice_id, student_id, amount, method, received_by) VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::uuid)`,
            payNo, inv.id, st.id, paid, method, ownerId,
          );
          payCount++;
        }
      }
      log.push(`invoices: ${invCount}, payments: ${payCount}`);

      // ── 12. EXAMS (grading scale, types, schedules, marks) ────────────────
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
          await e(`INSERT INTO grade_thresholds (grading_scale_id, grade, gpa_point, min_percent, max_percent, remarks) VALUES ($1::uuid, $2, $3, $4, $5, $6)`, scale.id, grade, gpa, min, max, remarks);
        }
      }
      const EXAM_TYPES = [
        { name: 'First Terminal', weight: 25, order: 1 },
        { name: 'Second Terminal', weight: 25, order: 2 },
        { name: 'Final Examination', weight: 50, order: 3 },
      ];
      const examTypeIds: Record<string, string> = {};
      for (const et of EXAM_TYPES) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM exam_types WHERE name = $1 AND academic_year_id = $2::uuid AND deleted_at IS NULL`, et.name, ay.id);
        if (ex) { examTypeIds[et.name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(
          `INSERT INTO exam_types (name, weight_percent, academic_year_id, grading_scale_id, order_index) VALUES ($1, $2, $3::uuid, $4::uuid, $5) RETURNING id`,
          et.name, et.weight, ay.id, scale.id, et.order,
        );
        examTypeIds[et.name] = row.id;
      }
      const examSubjects = ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer Science'];
      const firstTerm = examTypeIds['First Terminal'];
      let schedCount = 0, markCount = 0;
      let examDay = 5;
      for (const cName of CLASS_NAMES) {
        for (const subName of examSubjects) {
          const examDate = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - examDay));
          let [sched] = await q<{ id: string }>(`SELECT id FROM exam_schedules WHERE exam_type_id = $1::uuid AND class_id = $2::uuid AND subject_id = $3::uuid`, firstTerm, classIds[cName], subjectIds[subName]);
          if (!sched) {
            [sched] = await q<{ id: string }>(
              `INSERT INTO exam_schedules (exam_type_id, class_id, subject_id, exam_date, start_time, end_time, full_marks, pass_marks)
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, '10:00'::time, '13:00'::time, 100, 35) RETURNING id`,
              firstTerm, classIds[cName], subjectIds[subName], examDate,
            );
            schedCount++;
          }
          const classStudents = allStudents.filter((s) => s.class_id === classIds[cName]);
          for (const st of classStudents) {
            const score = 35 + Math.floor(rnd(parseInt(st.id.slice(0, 6), 16) + subName.length) * 60);
            markCount += await e(
              `INSERT INTO marks (exam_schedule_id, student_id, marks_obtained, is_absent, entered_by) VALUES ($1::uuid, $2::uuid, $3, false, $4::uuid) ON CONFLICT (exam_schedule_id, student_id) DO NOTHING`,
              sched.id, st.id, score, ownerId,
            );
          }
        }
        examDay++;
      }
      log.push(`exam schedules: ${schedCount}, marks: ${markCount}`);

      // ── 13. LIBRARY ───────────────────────────────────────────────────────
      const BOOK_CATS = ['Fiction', 'Science', 'Reference', 'Nepali Literature', "Children's Books"];
      const bookCatIds: Record<string, string> = {};
      for (const name of BOOK_CATS) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM book_categories WHERE name = $1 AND deleted_at IS NULL`, name);
        if (ex) { bookCatIds[name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO book_categories (name) VALUES ($1) RETURNING id`, name);
        bookCatIds[name] = row.id;
      }
      const BOOKS = [
        ['Muna Madan', 'Laxmi Prasad Devkota', 'Nepali Literature'], ['Palpasa Cafe', 'Narayan Wagle', 'Fiction'],
        ['Seto Dharti', 'Amar Neupane', 'Fiction'], ['A Brief History of Time', 'Stephen Hawking', 'Science'],
        ['Cosmos', 'Carl Sagan', 'Science'], ['Oxford Dictionary', 'Oxford Press', 'Reference'],
        ['Encyclopaedia Britannica', 'Britannica', 'Reference'], ['The Jungle Book', 'Rudyard Kipling', "Children's Books"],
        ['Harry Potter', 'J.K. Rowling', 'Fiction'], ['Karnali Blues', 'Buddhisagar', 'Nepali Literature'],
      ];
      let accSeq = 1; let copyCount = 0;
      const [accMax] = await q<{ m: string | null }>(`SELECT MAX(accession_number) AS m FROM book_copies WHERE accession_number LIKE 'ACC-%'`);
      if (accMax?.m) accSeq = parseInt(accMax.m.split('-')[1], 10) + 1;
      for (const [title, author, cat] of BOOKS) {
        let [book] = await q<{ id: string }>(`SELECT id FROM books WHERE title = $1 AND deleted_at IS NULL`, title);
        if (!book) {
          [book] = await q<{ id: string }>(
            `INSERT INTO books (title, author, category_id, language, isbn) VALUES ($1, $2, $3::uuid, 'English', $4) RETURNING id`,
            title, author, bookCatIds[cat], `978-${String(1000000000 + accSeq).slice(0, 10)}`,
          );
          for (let c = 1; c <= 2; c++) {
            copyCount += await e(
              `INSERT INTO book_copies (book_id, copy_number, accession_number, condition, is_available) VALUES ($1::uuid, $2, $3, 'GOOD', true) ON CONFLICT DO NOTHING`,
              book.id, `C${c}`, `ACC-${String(accSeq++).padStart(4, '0')}`,
            );
          }
        }
      }
      let memberCount = 0;
      const memberStudents = allStudents.slice(0, 10);
      for (const st of memberStudents) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM library_members WHERE student_id = $1::uuid AND deleted_at IS NULL`, st.id);
        if (ex) continue;
        const [seqRow] = await q<{ value: bigint }>(`INSERT INTO sequences (key, value) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`, `lib_seq_${BS_YEAR}`);
        const memNo = `LIB-${BS_YEAR}-${String(Number(seqRow.value)).padStart(4, '0')}`;
        await e(`INSERT INTO library_members (member_number, student_id, max_books, is_active, joined_at) VALUES ($1, $2::uuid, 3, true, $3::date)`, memNo, st.id, iso(today));
        memberCount++;
      }
      // a few issues
      const members = await q<{ id: string }>(`SELECT id FROM library_members WHERE is_active = true AND deleted_at IS NULL LIMIT 5`);
      const availCopies = await q<{ id: string }>(`SELECT id FROM book_copies WHERE is_available = true AND deleted_at IS NULL LIMIT 5`);
      let issueCount = 0;
      for (let i = 0; i < Math.min(members.length, availCopies.length); i++) {
        const [hasIssue] = await q<{ id: string }>(`SELECT id FROM book_issues WHERE book_copy_id = $1::uuid AND status = 'ISSUED'`, availCopies[i].id);
        if (hasIssue) continue;
        const issuedAt = new Date(today); issuedAt.setDate(issuedAt.getDate() - (i + 3));
        const due = new Date(issuedAt); due.setDate(due.getDate() + 14);
        const returned = i % 2 === 0;
        await e(
          `INSERT INTO book_issues (book_copy_id, member_id, issued_by, issued_at, due_date, returned_at, returned_to, fine_per_day, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::date, $6::date, $7::uuid, 5, $8)`,
          availCopies[i].id, members[i].id, ownerId, iso(issuedAt), iso(due),
          returned ? iso(today) : null, returned ? ownerId : null, returned ? 'RETURNED' : 'ISSUED',
        );
        if (!returned) await e(`UPDATE book_copies SET is_available = false WHERE id = $1::uuid`, availCopies[i].id);
        issueCount++;
      }
      log.push(`book categories: ${BOOK_CATS.length}, books: ${BOOKS.length}, copies: +${copyCount}, members: +${memberCount}, issues: +${issueCount}`);

      // ── 14. LEAVE ─────────────────────────────────────────────────────────
      const LEAVE_TYPES = [
        { name: 'Sick Leave', days: 12, paid: true }, { name: 'Casual Leave', days: 6, paid: true },
        { name: 'Unpaid Leave', days: 0, paid: false }, { name: 'Maternity Leave', days: 60, paid: true },
      ];
      const leaveTypeIds: Record<string, string> = {};
      for (const lt of LEAVE_TYPES) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM leave_types WHERE name = $1 AND deleted_at IS NULL`, lt.name);
        if (ex) { leaveTypeIds[lt.name] = ex.id; continue; }
        const [row] = await q<{ id: string }>(`INSERT INTO leave_types (name, days_per_year, is_paid) VALUES ($1, $2, $3) RETURNING id`, lt.name, lt.days, lt.paid);
        leaveTypeIds[lt.name] = row.id;
      }
      let staffLeaveCount = 0;
      const [existingStaffLeave] = await q<{ c: bigint }>(`SELECT COUNT(*) AS c FROM staff_leave_requests`);
      if (Number(existingStaffLeave.c) === 0) {
        for (let i = 0; i < Math.min(3, teacherPool.length); i++) {
          const from = new Date(today); from.setDate(from.getDate() + i * 3 + 2);
          const to = new Date(from); to.setDate(to.getDate() + 1);
          const status = i === 0 ? 'APPROVED' : 'PENDING';
          await e(
            `INSERT INTO staff_leave_requests (user_id, leave_type_id, from_date, to_date, total_days, reason, status, reviewed_by, reviewed_at)
             VALUES ($1::uuid, $2::uuid, $3::date, $4::date, 2, $5, $6, $7::uuid, $8::timestamptz)`,
            teacherPool[i], leaveTypeIds['Sick Leave'], iso(from), iso(to), 'Personal / medical reason', status,
            status === 'APPROVED' ? ownerId : null, status === 'APPROVED' ? new Date() : null,
          );
          staffLeaveCount++;
        }
      }
      let studentLeaveCount = 0;
      const [existingStudentLeave] = await q<{ c: bigint }>(`SELECT COUNT(*) AS c FROM leave_applications`);
      if (Number(existingStudentLeave.c) === 0) {
        for (let i = 0; i < 3; i++) {
          const st = allStudents[i];
          const from = new Date(today); from.setDate(from.getDate() - i - 1);
          const to = new Date(from); to.setDate(to.getDate() + 1);
          await e(
            `INSERT INTO leave_applications (student_id, academic_year_id, from_date, to_date, reason, status, applied_by, reviewed_by)
             VALUES ($1::uuid, $2::uuid, $3::date, $4::date, 'Family function', $5, $6::uuid, $7::uuid)`,
            st.id, ay.id, iso(from), iso(to), i === 0 ? 'APPROVED' : 'PENDING', ownerId, i === 0 ? ownerId : null,
          );
          studentLeaveCount++;
        }
      }
      log.push(`leave types: ${LEAVE_TYPES.length}, staff requests: +${staffLeaveCount}, student applications: +${studentLeaveCount}`);

      // ── 15. PAYROLL MONTH ─────────────────────────────────────────────────
      const [existingPayroll] = await q<{ id: string }>(`SELECT id FROM payroll_months WHERE month_bs = 2 AND year_bs = $1 AND academic_year_id = $2::uuid`, BS_YEAR, ay.id);
      if (!existingPayroll) {
        await e(`INSERT INTO payroll_months (month_bs, year_bs, academic_year_id, status, created_by) VALUES (2, $1, $2::uuid, 'DRAFT', $3::uuid)`, BS_YEAR, ay.id, ownerId);
      }
      log.push('payroll month: Jestha 2083 (DRAFT)');

      // ── 16. NOTICES / NOTIFICATIONS / SMS ─────────────────────────────────
      const NOTICES = [
        { title: 'First Terminal Examination Schedule', type: 'EXAM', audience: 'ALL', body: 'The First Terminal examinations begin next week. Please check the routine on the notice board.' },
        { title: 'Parents Day Celebration', type: 'EVENT', audience: 'PARENTS', body: 'We cordially invite all parents to the annual Parents Day on Jestha 30.' },
        { title: 'School Closed — Public Holiday', type: 'HOLIDAY', audience: 'ALL', body: 'The school will remain closed on account of a public holiday.' },
        { title: 'Monthly Fee Reminder', type: 'FEE', audience: 'PARENTS', body: 'This is a gentle reminder to clear the monthly tuition fees before the 10th.' },
        { title: 'Staff Meeting — All Teachers', type: 'GENERAL', audience: 'TEACHERS', body: 'A staff meeting is scheduled for Friday after the final period.' },
      ];
      let noticeCount = 0;
      for (const n of NOTICES) {
        const [ex] = await q<{ id: string }>(`SELECT id FROM notices WHERE title = $1 AND deleted_at IS NULL`, n.title);
        if (ex) continue;
        await e(
          `INSERT INTO notices (title, body, type, audience, is_published, published_at, created_by) VALUES ($1, $2, $3, $4, true, now(), $5::uuid)`,
          n.title, n.body, n.type, n.audience, ownerId,
        );
        noticeCount++;
      }
      let notifCount = 0;
      const [existingNotif] = await q<{ c: bigint }>(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1::uuid`, ownerId);
      if (Number(existingNotif.c) === 0) {
        const NOTIFS = [
          ['Fee payment received', 'A payment of Rs. 2300 has been recorded.', 'PAYMENT'],
          ['New admission', 'A new student was admitted to Grade 6.', 'GENERAL'],
          ['Exam marks pending', 'First Terminal marks entry is due for some sections.', 'EXAM'],
        ];
        for (const [title, body, type] of NOTIFS) {
          await e(`INSERT INTO notifications (user_id, title, body, type, is_read) VALUES ($1::uuid, $2, $3, $4, false)`, ownerId, title, body, type);
          notifCount++;
        }
      }
      let smsCount = 0;
      const [existingSms] = await q<{ c: bigint }>(`SELECT COUNT(*) AS c FROM sms_logs`);
      if (Number(existingSms.c) === 0) {
        const SMS = [
          ['9841000001', 'Your ward was marked absent today.', 'ATTENDANCE', 'SENT'],
          ['9841000002', 'Fee reminder: please clear dues by the 10th.', 'FEE', 'SENT'],
          ['9841000003', 'First Terminal exams start next week.', 'NOTICE', 'MOCK'],
        ];
        for (const [to, msg, trig, status] of SMS) {
          await e(`INSERT INTO sms_logs (to_number, message, trigger, status, sent_at) VALUES ($1, $2, $3, $4, now())`, to, msg, trig, status);
          smsCount++;
        }
      }
      log.push(`notices: +${noticeCount}, notifications: +${notifCount}, sms logs: +${smsCount}`);

      // eslint-disable-next-line no-console
      console.log('Seed complete for ' + SCHEMA + ':\n  - ' + log.join('\n  - '));
    },
    { maxWait: 20000, timeout: 300000 },
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
