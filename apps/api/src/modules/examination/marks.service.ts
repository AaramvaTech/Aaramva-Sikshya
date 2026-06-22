import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  ExamScheduleRow,
  MarksRow,
  MarksResponseDto,
  toMarksResponse,
  toNum,
} from './entities/examination.entity';
import { BulkEnterMarksDto, UpdateMarkDto, MarksQueryDto } from './dto/examination.dto';

@Injectable()
export class MarksService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async bulkEnterMarks(dto: BulkEnterMarksDto, enteredById: string): Promise<MarksResponseDto[]> {
    return this.tenantPrisma.run(async (tx) => {
      const schedules = await tx.$queryRawUnsafe<ExamScheduleRow[]>(
        `SELECT id, full_marks, pass_marks, theory_marks, practical_marks
         FROM exam_schedules WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.examScheduleId,
      );
      if (!schedules[0]) {
        throw new NotFoundException(`ExamSchedule ${dto.examScheduleId} not found`);
      }
      const schedule = schedules[0];
      const fullMarks = toNum(schedule.full_marks);
      // A "split" exam carries both theory and practical components.
      const isSplitExam = schedule.theory_marks !== null && schedule.practical_marks !== null;

      for (const entry of dto.marks) {
        if (entry.isAbsent && entry.marksObtained !== undefined && entry.marksObtained !== null) {
          throw new BadRequestException(
            `Student ${entry.studentId}: cannot have marksObtained when isAbsent=true`,
          );
        }
        // R2 Task 1: server-side XOR guard. For a split exam, a present student
        // must have BOTH theory and practical (or be marked absent). Rejecting a
        // one-sided split here closes the data-integrity hole M5.1 proved live
        // (the client guard was bypassable, persisting marks_obtained = NULL).
        if (isSplitExam && !entry.isAbsent) {
          const theoryProvided = entry.theoryMarks !== undefined && entry.theoryMarks !== null;
          const practicalProvided = entry.practicalMarks !== undefined && entry.practicalMarks !== null;
          if (theoryProvided !== practicalProvided) {
            throw new BadRequestException(
              `Student ${entry.studentId}: a split exam requires both theory and practical marks (or mark the student absent)`,
            );
          }
        }
        if (entry.marksObtained !== undefined && entry.marksObtained !== null) {
          if (entry.marksObtained > fullMarks) {
            throw new BadRequestException(
              `Student ${entry.studentId}: marksObtained (${entry.marksObtained}) exceeds fullMarks (${fullMarks})`,
            );
          }
          if (entry.theoryMarks !== undefined && entry.practicalMarks !== undefined) {
            const sum = (entry.theoryMarks ?? 0) + (entry.practicalMarks ?? 0);
            if (Math.abs(sum - entry.marksObtained) > 0.01) {
              throw new BadRequestException(
                `Student ${entry.studentId}: theoryMarks + practicalMarks must equal marksObtained`,
              );
            }
          }
        }
      }

      const results: MarksResponseDto[] = [];
      for (const entry of dto.marks) {
        const rows = await tx.$queryRawUnsafe<MarksRow[]>(
          `INSERT INTO marks
             (exam_schedule_id, student_id, marks_obtained, theory_marks, practical_marks,
              is_absent, remarks, entered_by)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid)
           ON CONFLICT (exam_schedule_id, student_id)
           DO UPDATE SET
             marks_obtained  = EXCLUDED.marks_obtained,
             theory_marks    = EXCLUDED.theory_marks,
             practical_marks = EXCLUDED.practical_marks,
             is_absent       = EXCLUDED.is_absent,
             remarks         = EXCLUDED.remarks,
             entered_by      = EXCLUDED.entered_by,
             updated_at      = NOW()
           RETURNING *`,
          dto.examScheduleId,
          entry.studentId,
          entry.isAbsent ? null : (entry.marksObtained ?? null),
          entry.theoryMarks ?? null,
          entry.practicalMarks ?? null,
          entry.isAbsent ?? false,
          entry.remarks ?? null,
          enteredById,
        );
        if (rows[0]) results.push(toMarksResponse(rows[0]));
      }

      return results;
    });
  }

  async getMarksForSchedule(
    query: MarksQueryDto,
  ): Promise<{ data: MarksResponseDto[]; meta: { total: number } }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.examScheduleId) {
      conditions.push(`m.exam_schedule_id = $${idx++}::uuid`);
      params.push(query.examScheduleId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.tenantPrisma.query<MarksRow>(
      `SELECT m.* FROM marks m ${where} ORDER BY m.entered_at DESC`,
      ...params,
    );

    return { data: rows.map(toMarksResponse), meta: { total: rows.length } };
  }

  async updateMark(id: string, dto: UpdateMarkDto, enteredById: string): Promise<MarksResponseDto> {
    const existing = await this.tenantPrisma.query<MarksRow>(
      `SELECT m.*, es.full_marks, es.pass_marks
       FROM marks m
       JOIN exam_schedules es ON m.exam_schedule_id = es.id
       WHERE m.id = $1::uuid`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Mark entry ${id} not found`);

    const fullMarks = toNum((existing[0] as any).full_marks);
    const isAbsent = dto.isAbsent ?? existing[0].is_absent;
    const marksObtained = dto.marksObtained ?? (existing[0].marks_obtained ? toNum(existing[0].marks_obtained) : null);

    if (isAbsent && marksObtained !== null && marksObtained !== undefined) {
      throw new BadRequestException('Cannot have marksObtained when isAbsent=true');
    }
    if (!isAbsent && marksObtained !== null && marksObtained !== undefined && marksObtained > fullMarks) {
      throw new BadRequestException(`marksObtained exceeds fullMarks (${fullMarks})`);
    }

    const rows = await this.tenantPrisma.query<MarksRow>(
      `UPDATE marks SET
         marks_obtained  = $1,
         theory_marks    = $2,
         practical_marks = $3,
         is_absent       = $4,
         remarks         = $5,
         entered_by      = $6::uuid,
         updated_at      = NOW()
       WHERE id = $7::uuid
       RETURNING *`,
      isAbsent ? null : (marksObtained ?? null),
      dto.theoryMarks ?? (existing[0].theory_marks ? toNum(existing[0].theory_marks) : null),
      dto.practicalMarks ?? (existing[0].practical_marks ? toNum(existing[0].practical_marks) : null),
      isAbsent,
      dto.remarks ?? existing[0].remarks ?? null,
      enteredById,
      id,
    );
    return toMarksResponse(rows[0]);
  }
}
