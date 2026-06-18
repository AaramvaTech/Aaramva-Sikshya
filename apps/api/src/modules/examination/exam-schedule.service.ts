import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  ExamScheduleRow,
  ExamScheduleResponseDto,
  toExamScheduleResponse,
  MyExamScheduleRow,
  MyExamScheduleDto,
  toMyExamScheduleResponse,
} from './entities/examination.entity';
import {
  CreateExamScheduleDto,
  BulkCreateScheduleDto,
  UpdateExamScheduleDto,
  ExamScheduleQueryDto,
} from './dto/examination.dto';

@Injectable()
export class ExamScheduleService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateExamScheduleDto): Promise<ExamScheduleResponseDto> {
    await this._checkDuplicate(dto.examTypeId, dto.classId, dto.subjectId);

    const rows = await this.tenantPrisma.query<ExamScheduleRow>(
      `INSERT INTO exam_schedules
         (exam_type_id, class_id, subject_id, exam_date, start_time, end_time,
          full_marks, pass_marks, theory_marks, practical_marks, room, invigilator_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::time, $6::time,
               $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      dto.examTypeId, dto.classId, dto.subjectId,
      dto.examDate, dto.startTime, dto.endTime,
      dto.fullMarks, dto.passMarks,
      dto.theoryMarks ?? null, dto.practicalMarks ?? null,
      dto.room ?? null, dto.invigilatorId ?? null,
    );
    return toExamScheduleResponse(rows[0]);
  }

  async bulkCreate(dto: BulkCreateScheduleDto): Promise<ExamScheduleResponseDto[]> {
    const results: ExamScheduleResponseDto[] = [];
    for (const s of dto.subjects) {
      await this._checkDuplicate(dto.examTypeId, dto.classId, s.subjectId);

      const rows = await this.tenantPrisma.query<ExamScheduleRow>(
        `INSERT INTO exam_schedules
           (exam_type_id, class_id, subject_id, exam_date, start_time, end_time,
            full_marks, pass_marks, theory_marks, practical_marks, room, invigilator_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::time, $6::time,
                 $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        dto.examTypeId, dto.classId, s.subjectId,
        s.examDate, s.startTime, s.endTime,
        s.fullMarks, s.passMarks,
        s.theoryMarks ?? null, s.practicalMarks ?? null,
        s.room ?? null, s.invigilatorId ?? null,
      );
      results.push(toExamScheduleResponse(rows[0]));
    }
    return results;
  }

  async findAll(query: ExamScheduleQueryDto): Promise<ExamScheduleResponseDto[]> {
    const conditions = ['es.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.examTypeId) { conditions.push(`es.exam_type_id = $${idx++}::uuid`); params.push(query.examTypeId); }
    if (query.classId)    { conditions.push(`es.class_id = $${idx++}::uuid`);     params.push(query.classId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await this.tenantPrisma.query<ExamScheduleRow>(
      `SELECT es.* FROM exam_schedules es ${where} ORDER BY es.exam_date ASC, es.start_time ASC`,
      ...params,
    );
    return rows.map(toExamScheduleResponse);
  }

  async update(id: string, dto: UpdateExamScheduleDto): Promise<ExamScheduleResponseDto> {
    const existing = await this.tenantPrisma.query<ExamScheduleRow>(
      `SELECT * FROM exam_schedules WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`ExamSchedule ${id} not found`);

    const e = existing[0];
    const rows = await this.tenantPrisma.query<ExamScheduleRow>(
      `UPDATE exam_schedules SET
         exam_date      = $1::date,
         start_time     = $2::time,
         end_time       = $3::time,
         full_marks     = $4,
         pass_marks     = $5,
         room           = $6,
         invigilator_id = $7,
         updated_at     = NOW()
       WHERE id = $8::uuid
       RETURNING *`,
      dto.examDate      ?? e.exam_date,
      dto.startTime     ?? e.start_time,
      dto.endTime       ?? e.end_time,
      dto.fullMarks     ?? e.full_marks,
      dto.passMarks     ?? e.pass_marks,
      dto.room          !== undefined ? dto.room : e.room,
      dto.invigilatorId !== undefined ? dto.invigilatorId : e.invigilator_id,
      id,
    );
    return toExamScheduleResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.tenantPrisma.query<ExamScheduleRow>(
      `SELECT id FROM exam_schedules WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`ExamSchedule ${id} not found`);
    await this.tenantPrisma.execute(
      `UPDATE exam_schedules SET deleted_at = NOW() WHERE id = $1::uuid`,
      id,
    );
  }

  async getMySchedules(
    userId: string,
    examTypeId?: string,
  ): Promise<MyExamScheduleDto[]> {
    const conditions: string[] = [
      'es.deleted_at IS NULL',
      `(es.class_id, es.subject_id) IN (
        SELECT DISTINCT sec.class_id, ts.subject_id
        FROM timetable_slots ts
        JOIN sections sec ON ts.section_id = sec.id
        WHERE ts.teacher_id = $1::uuid
          AND ts.deleted_at IS NULL
      )`,
    ];
    const params: unknown[] = [userId];
    let idx = 2;

    if (examTypeId) {
      conditions.push(`es.exam_type_id = $${idx++}::uuid`);
      params.push(examTypeId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await this.tenantPrisma.query<MyExamScheduleRow>(
      `SELECT DISTINCT
              es.*,
              et.name  AS exam_type_name,
              sub.name AS subject_name,
              c.name   AS class_name
       FROM exam_schedules es
       JOIN exam_types et  ON et.id  = es.exam_type_id
       JOIN subjects  sub  ON sub.id = es.subject_id
       JOIN classes   c    ON c.id   = es.class_id
       ${where}
       ORDER BY es.exam_date ASC, es.start_time ASC`,
      ...params,
    );

    return rows.map(toMyExamScheduleResponse);
  }

  private async _checkDuplicate(
    examTypeId: string,
    classId: string,
    subjectId: string,
  ): Promise<void> {
    const existing = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM exam_schedules
       WHERE exam_type_id = $1::uuid AND class_id = $2::uuid AND subject_id = $3::uuid
         AND deleted_at IS NULL`,
      examTypeId, classId, subjectId,
    );
    if (existing[0]) {
      throw new BadRequestException(
        `Schedule already exists for this subject in exam type ${examTypeId} / class ${classId}`,
      );
    }
  }
}
