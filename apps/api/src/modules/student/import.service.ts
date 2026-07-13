import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { bsToAd, parseBsString } from 'bs-calendar';
import { formatLocalDate, todayAdInNepal } from '../common/utils/date.util';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { StudentService } from './student.service';
import { GuardianService } from './guardian.service';

// CSV column → normalized key. Headers are matched case/space/punctuation-insensitively.
const COLUMNS = [
  'First Name', 'Last Name', 'DOB (BS)', 'Gender', 'Class', 'Section', 'Roll No',
  'Guardian First Name', 'Guardian Last Name', 'Guardian Phone', 'Guardian Relation', 'Guardian Email',
];
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const K = {
  firstName: norm('First Name'), lastName: norm('Last Name'), dobBs: norm('DOB (BS)'),
  gender: norm('Gender'), className: norm('Class'), sectionName: norm('Section'), rollNo: norm('Roll No'),
  gFirst: norm('Guardian First Name'), gLast: norm('Guardian Last Name'), gPhone: norm('Guardian Phone'),
  gRelation: norm('Guardian Relation'), gEmail: norm('Guardian Email'),
};

export type RowStatus = 'valid' | 'invalid' | 'duplicate';
export interface PreviewRow {
  rowNumber: number; // 1-based data row (excludes header)
  data: Record<string, string>;
  status: RowStatus;
  errors: string[];
  resolved?: { classId: string; sectionId: string; dobAd: string };
}
export interface PreviewResult {
  header: string[];
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicate: number };
  context: { academicYearId: string | null; academicYearName: string | null };
}
export interface CommitResult {
  created: { rowNumber: number; admissionNumber: string; studentId: string; parentEmail: string; parentTempPassword: string | null }[];
  skipped: { rowNumber: number; reason: string }[];
  summary: { created: number; skipped: number };
}

@Injectable()
export class ImportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly studentService: StudentService,
    private readonly guardianService: GuardianService,
  ) {}

  /** Downloadable template content (header only). */
  static templateCsv(): string {
    return COLUMNS.join(',') + '\n';
  }

  // ── CSV parsing (RFC-4180-ish: quoted fields, escaped quotes, commas, CRLF) ──
  private parseCsv(text: string): { header: string[]; records: Record<string, string>[] } {
    const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows: string[][] = [];
    let cur: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += ch;
    }
    if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
    // Drop fully-blank rows
    const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (nonEmpty.length === 0) throw new BadRequestException('CSV is empty');

    const header = nonEmpty[0].map((h) => h.trim());
    const hkeys = header.map(norm);
    const records = nonEmpty.slice(1).map((cells) => {
      const rec: Record<string, string> = {};
      hkeys.forEach((k, i) => { rec[k] = (cells[i] ?? '').trim(); });
      return rec;
    });
    return { header, records };
  }

  // Resolve the current academic year + class/section name→id maps for the tenant.
  private async loadContext() {
    const [years, classes, sections, students] = await Promise.all([
      this.tenantPrisma.query<{ id: string; name: string }>(
        `SELECT id, name FROM academic_years WHERE is_current = true AND deleted_at IS NULL LIMIT 1`,
      ),
      this.tenantPrisma.query<{ id: string; name: string }>(
        `SELECT id, name FROM classes WHERE deleted_at IS NULL`,
      ),
      this.tenantPrisma.query<{ id: string; name: string; class_id: string }>(
        `SELECT id, name, class_id FROM sections WHERE deleted_at IS NULL`,
      ),
      this.tenantPrisma.query<{ fn: string; ln: string; dob: string }>(
        `SELECT lower(first_name) AS fn, lower(last_name) AS ln,
                to_char(date_of_birth, 'YYYY-MM-DD') AS dob
         FROM students WHERE deleted_at IS NULL`,
      ),
    ]);
    const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));
    const sectionsByClass = new Map<string, Map<string, { id: string; name: string }>>();
    for (const s of sections) {
      if (!sectionsByClass.has(s.class_id)) sectionsByClass.set(s.class_id, new Map());
      sectionsByClass.get(s.class_id)!.set(s.name.trim().toLowerCase(), { id: s.id, name: s.name });
    }
    const existingKeys = new Set(students.map((s) => `${s.fn}|${s.ln}|${s.dob}`));
    return { year: years[0] ?? null, classByName, sectionsByClass, existingKeys };
  }

  private validateRows(records: Record<string, string>[], ctx: Awaited<ReturnType<ImportService['loadContext']>>): PreviewRow[] {
    const seenInFile = new Set<string>();
    return records.map((data, idx): PreviewRow => {
      const errors: string[] = [];
      const req = (k: string, label: string) => { if (!data[k]) errors.push(`${label} is required`); };
      req(K.firstName, 'First Name');
      req(K.lastName, 'Last Name');
      req(K.dobBs, 'DOB (BS)');
      req(K.gender, 'Gender');
      req(K.className, 'Class');
      req(K.sectionName, 'Section');
      req(K.gFirst, 'Guardian First Name');
      req(K.gPhone, 'Guardian Phone');
      req(K.gRelation, 'Guardian Relation');
      req(K.gEmail, 'Guardian Email');

      const gender = (data[K.gender] || '').toUpperCase();
      if (data[K.gender] && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
        errors.push(`Gender must be MALE, FEMALE or OTHER (got "${data[K.gender]}")`);
      }
      if (data[K.gEmail] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data[K.gEmail])) {
        errors.push('Guardian Email is not a valid email');
      }
      if (data[K.rollNo] && !/^\d+$/.test(data[K.rollNo])) {
        errors.push('Roll No must be a whole number');
      }

      // DOB BS → AD
      let dobAd: string | null = null;
      if (data[K.dobBs]) {
        try {
          // FIX-2: bsToAd returns a local-frame Date — format from its local
          // components. toISOString() (UTC frame) shifted the day back under
          // UTC+ timezones (Nepal: 2070-05-15 BS became 2013-08-29, not -30).
          dobAd = formatLocalDate(bsToAd(parseBsString(data[K.dobBs])));
        } catch {
          errors.push(`DOB (BS) "${data[K.dobBs]}" is not a valid BS date (use YYYY-MM-DD)`);
        }
      }

      // Class / section resolution against OB1-created structure
      let classId = '';
      let sectionId = '';
      if (data[K.className]) {
        const cls = ctx.classByName.get(data[K.className].trim().toLowerCase());
        if (!cls) errors.push(`Class "${data[K.className]}" does not exist`);
        else {
          classId = cls.id;
          if (data[K.sectionName]) {
            const sec = ctx.sectionsByClass.get(cls.id)?.get(data[K.sectionName].trim().toLowerCase());
            if (!sec) errors.push(`Section "${data[K.sectionName]}" does not exist in class "${cls.name}"`);
            else sectionId = sec.id;
          }
        }
      }

      if (errors.length > 0) {
        return { rowNumber: idx + 1, data, status: 'invalid', errors };
      }

      // Dedupe: within-file then against existing students
      const key = `${data[K.firstName].toLowerCase()}|${data[K.lastName].toLowerCase()}|${dobAd}`;
      if (seenInFile.has(key)) {
        return { rowNumber: idx + 1, data, status: 'duplicate', errors: ['Duplicate of an earlier row in this file'] };
      }
      seenInFile.add(key);
      if (ctx.existingKeys.has(key)) {
        return { rowNumber: idx + 1, data, status: 'duplicate', errors: ['A student with this name + DOB already exists'] };
      }

      return {
        rowNumber: idx + 1,
        data,
        status: 'valid',
        errors: [],
        resolved: { classId, sectionId, dobAd: dobAd! },
      };
    });
  }

  async preview(csv: string): Promise<PreviewResult> {
    const { header, records } = this.parseCsv(csv);
    const ctx = await this.loadContext();
    const rows = this.validateRows(records, ctx);
    return {
      header,
      rows,
      summary: {
        total: rows.length,
        valid: rows.filter((r) => r.status === 'valid').length,
        invalid: rows.filter((r) => r.status === 'invalid').length,
        duplicate: rows.filter((r) => r.status === 'duplicate').length,
      },
      context: { academicYearId: ctx.year?.id ?? null, academicYearName: ctx.year?.name ?? null },
    };
  }

  async commit(csv: string, userId: string): Promise<CommitResult> {
    const { records } = this.parseCsv(csv);
    const ctx = await this.loadContext();
    if (!ctx.year) throw new BadRequestException('No current academic year — complete academic setup first.');
    const rows = this.validateRows(records, ctx);

    const today = todayAdInNepal(); // QA-1 OBS-E-6: Nepal-today admission default
    const created: CommitResult['created'] = [];
    const skipped: CommitResult['skipped'] = [];

    for (const row of rows) {
      if (row.status !== 'valid' || !row.resolved) {
        skipped.push({ rowNumber: row.rowNumber, reason: row.errors[0] ?? 'invalid' });
        continue;
      }
      const d = row.data;
      try {
        // 1. Reuse the admission path.
        const student = await this.studentService.admitStudent(
          {
            firstName: d[K.firstName],
            lastName: d[K.lastName],
            dateOfBirth: row.resolved.dobAd,
            gender: d[K.gender].toUpperCase() as 'MALE' | 'FEMALE' | 'OTHER',
            classId: row.resolved.classId,
            sectionId: row.resolved.sectionId,
            academicYearId: ctx.year.id,
            rollNumber: d[K.rollNo] ? Number(d[K.rollNo]) : undefined,
            admissionDate: today,
          },
          userId,
        );

        // 2. Reuse the R1 guardian-provisioning path (account + linkage; no SMS).
        const tempPassword = this.genTempPassword();
        const g = await this.guardianService.provisionGuardian(student.id, {
          relation: d[K.gRelation],
          firstName: d[K.gFirst],
          lastName: d[K.gLast] || undefined,
          phone: d[K.gPhone],
          email: d[K.gEmail],
          password: tempPassword,
          isPrimary: true,
        });

        created.push({
          rowNumber: row.rowNumber,
          admissionNumber: student.studentId,
          studentId: student.id,
          parentEmail: d[K.gEmail],
          // Only meaningful when a NEW parent user was created; reused accounts keep their existing password.
          parentTempPassword: (g as { parentAccountCreated?: boolean }).parentAccountCreated === false ? null : tempPassword,
        });
      } catch (err) {
        skipped.push({ rowNumber: row.rowNumber, reason: (err as Error).message ?? 'failed' });
      }
    }

    return { created, skipped, summary: { created: created.length, skipped: skipped.length } };
  }

  private genTempPassword(): string {
    // ≥8 chars with letter+digit to satisfy ProvisionGuardianDto (MinLength 8).
    return 'Ab1' + randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 9);
  }
}
