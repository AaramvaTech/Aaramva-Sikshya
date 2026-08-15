import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { errorBody } from '../common/errors/error-codes';
import { Role } from '../common/enums/role.enum';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  TimetableSlotRow,
  TimetableSlotResponseDto,
  SectionTimetableDto,
  TeacherTimetableDto,
  SlotItemDto,
  TeacherSlotItemDto,
  toTimetableSlotResponse,
  toTimeString,
} from './entities/academic.entity';
import { CreateTimetableSlotDto, BulkTimetableDto } from './dto/timetable.dto';
import { GuardianScopeService } from '../student/guardian-scope.service';

@Injectable()
export class TimetableService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianScope: GuardianScopeService,
  ) {}

  async createSlot(dto: CreateTimetableSlotDto): Promise<TimetableSlotResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const teacherConflict = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM timetable_slots
         WHERE teacher_id = $1::uuid AND academic_year_id = $2::uuid
           AND day_of_week = $3 AND period_number = $4 AND deleted_at IS NULL`,
        dto.teacherId, dto.academicYearId, dto.dayOfWeek, dto.periodNumber,
      );
      if (teacherConflict[0]) {
        throw new ConflictException('Teacher already has a slot at this time');
      }

      const sectionConflict = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM timetable_slots
         WHERE section_id = $1::uuid AND academic_year_id = $2::uuid
           AND day_of_week = $3 AND period_number = $4 AND deleted_at IS NULL`,
        dto.sectionId, dto.academicYearId, dto.dayOfWeek, dto.periodNumber,
      );
      if (sectionConflict[0]) {
        throw new ConflictException('Section already has a slot at this time');
      }

      const rows = await tx.$queryRawUnsafe<TimetableSlotRow[]>(
        `INSERT INTO timetable_slots
           (section_id, subject_id, teacher_id, academic_year_id,
            day_of_week, period_number, start_time, end_time, room)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::time, $8::time, $9)
         RETURNING *`,
        dto.sectionId, dto.subjectId, dto.teacherId, dto.academicYearId,
        dto.dayOfWeek, dto.periodNumber, dto.startTime, dto.endTime, dto.room ?? null,
      );
      return toTimetableSlotResponse(rows[0]);
    });
  }

  async getSectionTimetable(sectionId: string, callerId?: string, callerRole?: Role): Promise<SectionTimetableDto> {
    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudentInSection(callerId, sectionId);
    }
    // WEB-P Phase 4 — STUDENT was in this route's @Roles() allowlist but had
    // no ownership check at all (only PARENT was scoped above), so any
    // authenticated student could read any OTHER section's timetable by
    // passing an arbitrary sectionId. Mirrors the PARENT check: a student
    // may only ever view their own section's timetable.
    if (callerRole === Role.STUDENT && callerId) {
      const enrollment = await this.tenantPrisma.query<{ id: string }>(
        `SELECT s.id FROM students s
         WHERE s.user_id = $1::uuid AND s.section_id = $2::uuid AND s.deleted_at IS NULL`,
        callerId,
        sectionId,
      );
      if (!enrollment[0]) throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
    }
    const rows = await this.tenantPrisma.query<
      TimetableSlotRow & {
        subject_name: string;
        subject_code: string | null;
        teacher_full_name: string;
        section_name: string;
        class_name: string;
      }
    >(
      `SELECT
         ts.*,
         sub.name AS subject_name, sub.code AS subject_code,
         u.first_name || ' ' || u.last_name AS teacher_full_name,
         sec.name AS section_name,
         c.name AS class_name
       FROM timetable_slots ts
       JOIN subjects  sub ON ts.subject_id = sub.id
       JOIN users     u   ON ts.teacher_id = u.id
       JOIN sections  sec ON ts.section_id = sec.id
       JOIN classes   c   ON sec.class_id  = c.id
       WHERE ts.section_id = $1::uuid AND ts.deleted_at IS NULL
       ORDER BY ts.day_of_week, ts.period_number`,
      sectionId,
    );

    const schedule: Record<number, SlotItemDto[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const row of rows) {
      schedule[Number(row.day_of_week)].push({
        slotId: row.id,
        periodNumber: Number(row.period_number),
        startTime: toTimeString(row.start_time),
        endTime: toTimeString(row.end_time),
        subject: { id: row.subject_id, name: row.subject_name, code: row.subject_code },
        teacher: { id: row.teacher_id, fullName: row.teacher_full_name },
        room: row.room,
      });
    }

    const first = rows[0];
    return {
      sectionId,
      sectionName: first?.section_name ?? '',
      className: first?.class_name ?? '',
      schedule,
    };
  }

  async getTeacherTimetable(teacherId: string): Promise<TeacherTimetableDto> {
    const rows = await this.tenantPrisma.query<
      TimetableSlotRow & {
        subject_name: string;
        subject_code: string | null;
        teacher_full_name: string;
        section_name: string;
        class_id: string;
        class_name: string;
      }
    >(
      `SELECT
         ts.*,
         sub.name AS subject_name, sub.code AS subject_code,
         u.first_name || ' ' || u.last_name AS teacher_full_name,
         sec.name AS section_name,
         c.id AS class_id, c.name AS class_name
       FROM timetable_slots ts
       JOIN subjects  sub ON ts.subject_id = sub.id
       JOIN users     u   ON ts.teacher_id = u.id
       JOIN sections  sec ON ts.section_id = sec.id
       JOIN classes   c   ON sec.class_id  = c.id
       WHERE ts.teacher_id = $1::uuid AND ts.deleted_at IS NULL
       ORDER BY ts.day_of_week, ts.period_number`,
      teacherId,
    );

    const schedule: Record<number, TeacherSlotItemDto[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const row of rows) {
      schedule[Number(row.day_of_week)].push({
        slotId: row.id,
        periodNumber: Number(row.period_number),
        startTime: toTimeString(row.start_time),
        endTime: toTimeString(row.end_time),
        subject: { id: row.subject_id, name: row.subject_name, code: row.subject_code },
        section: row.section_name,
        className: row.class_name,
        room: row.room,
      });
    }

    const first = rows[0];
    return {
      teacherId,
      teacherName: first?.teacher_full_name ?? '',
      schedule,
    };
  }

  async bulkReplaceTimetable(
    sectionId: string,
    dto: BulkTimetableDto,
  ): Promise<TimetableSlotResponseDto[]> {
    return this.tenantPrisma.run(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE timetable_slots SET deleted_at = NOW()
         WHERE section_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL`,
        sectionId, dto.academicYearId,
      );

      const inserted: TimetableSlotRow[] = [];

      for (const slot of dto.slots) {
        const teacherConflict = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM timetable_slots
           WHERE teacher_id = $1::uuid AND academic_year_id = $2::uuid
             AND day_of_week = $3 AND period_number = $4 AND deleted_at IS NULL`,
          slot.teacherId, dto.academicYearId, slot.dayOfWeek, slot.periodNumber,
        );
        if (teacherConflict[0]) {
          throw new ConflictException('Teacher already has a slot at this time');
        }

        const sectionConflict = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM timetable_slots
           WHERE section_id = $1::uuid AND academic_year_id = $2::uuid
             AND day_of_week = $3 AND period_number = $4 AND deleted_at IS NULL`,
          sectionId, dto.academicYearId, slot.dayOfWeek, slot.periodNumber,
        );
        if (sectionConflict[0]) {
          throw new ConflictException('Section already has a slot at this time');
        }

        const rows = await tx.$queryRawUnsafe<TimetableSlotRow[]>(
          `INSERT INTO timetable_slots
             (section_id, subject_id, teacher_id, academic_year_id,
              day_of_week, period_number, start_time, end_time, room)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::time, $8::time, $9)
           RETURNING *`,
          sectionId, slot.subjectId, slot.teacherId, dto.academicYearId,
          slot.dayOfWeek, slot.periodNumber, slot.startTime, slot.endTime, slot.room ?? null,
        );
        inserted.push(rows[0]);
      }

      return inserted.map(toTimetableSlotResponse);
    });
  }

  async deleteSlot(slotId: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE timetable_slots SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      slotId,
    );
    if (affected === 0) throw new NotFoundException(`Timetable slot ${slotId} not found`);
  }

  async getMyTimetable(userId: string): Promise<TeacherTimetableDto> {
    return this.getTeacherTimetable(userId);
  }

  async getMySections(userId: string): Promise<Array<{ sectionId: string; sectionName: string; className: string; classId: string }>> {
    const rows = await this.tenantPrisma.query<{
      section_id: string;
      section_name: string;
      class_name: string;
      class_id: string;
    }>(
      `SELECT DISTINCT sec.id   AS section_id,
                       sec.name AS section_name,
                       c.name   AS class_name,
                       c.id     AS class_id
       FROM sections sec
       JOIN classes c ON sec.class_id = c.id
       WHERE sec.deleted_at IS NULL
         AND (
               sec.class_teacher_id = $1::uuid
               OR sec.id IN (
                 SELECT section_id FROM timetable_slots
                 WHERE teacher_id = $1::uuid AND deleted_at IS NULL
               )
             )`,
      userId,
    );
    return rows.map((r) => ({
      sectionId: r.section_id,
      sectionName: r.section_name,
      className: r.class_name,
      classId: r.class_id,
    }));
  }
}
