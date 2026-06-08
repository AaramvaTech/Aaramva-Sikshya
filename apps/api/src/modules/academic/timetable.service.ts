import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  TimetableSlotRow,
  TimetableSlotResponseDto,
  SectionTimetableDto,
  TeacherTimetableDto,
  SlotItemDto,
  TeacherSlotItemDto,
  toTimetableSlotResponse,
} from './entities/academic.entity';
import { CreateTimetableSlotDto, BulkTimetableDto } from './dto/timetable.dto';

@Injectable()
export class TimetableService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9)
         RETURNING *`,
        dto.sectionId, dto.subjectId, dto.teacherId, dto.academicYearId,
        dto.dayOfWeek, dto.periodNumber, dto.startTime, dto.endTime, dto.room ?? null,
      );
      return toTimetableSlotResponse(rows[0]);
    });
  }

  async getSectionTimetable(sectionId: string): Promise<SectionTimetableDto> {
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
        startTime: typeof row.start_time === 'string' ? row.start_time.substring(0, 5) : String(row.start_time),
        endTime: typeof row.end_time === 'string' ? row.end_time.substring(0, 5) : String(row.end_time),
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
        startTime: typeof row.start_time === 'string' ? row.start_time.substring(0, 5) : String(row.start_time),
        endTime: typeof row.end_time === 'string' ? row.end_time.substring(0, 5) : String(row.end_time),
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
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9)
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
}
