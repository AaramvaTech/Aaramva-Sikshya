import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  StudentFeeOverrideRow,
  toStudentFeeOverrideResponse,
  StudentFeeOverrideResponseDto,
} from './entities/bill-assignment.entity';
import {
  CreateStudentFeeOverrideDto,
  UpdateStudentFeeOverrideDto,
  StudentFeeOverrideQueryDto,
} from './dto/student-fee-override.dto';

@Injectable()
export class StudentFeeOverrideService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateStudentFeeOverrideDto, createdById: string): Promise<StudentFeeOverrideResponseDto> {
    const rows = await this.tenantPrisma.query<StudentFeeOverrideRow>(
      `INSERT INTO student_fee_overrides
         (student_id, fee_head_id, academic_year_id, override_amount, reason,
          effective_from, effective_to, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, $5, $6::date, $7::date, $8::uuid)
       RETURNING *`,
      dto.studentId,
      dto.feeHeadId,
      dto.academicYearId,
      dto.overrideAmount,
      dto.reason ?? null,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
      createdById,
    );
    return toStudentFeeOverrideResponse(rows[0]);
  }

  async findAll(query: StudentFeeOverrideQueryDto): Promise<{
    data: StudentFeeOverrideResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['sfo.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.studentId) { conditions.push(`sfo.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.academicYearId) { conditions.push(`sfo.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StudentFeeOverrideRow & { total_count: string }>(
      `SELECT sfo.*, fh.name AS fee_head_name, COUNT(*) OVER() AS total_count
       FROM student_fee_overrides sfo
       JOIN fee_heads fh ON fh.id = sfo.fee_head_id
       ${where}
       ORDER BY sfo.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toStudentFeeOverrideResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateStudentFeeOverrideDto): Promise<StudentFeeOverrideResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.overrideAmount !== undefined) { sets.push(`override_amount = $${idx++}::numeric`); params.push(dto.overrideAmount); }
    if (dto.reason !== undefined) { sets.push(`reason = $${idx++}`); params.push(dto.reason); }
    if (dto.effectiveFrom !== undefined) { sets.push(`effective_from = $${idx++}::date`); params.push(dto.effectiveFrom); }
    if (dto.effectiveTo !== undefined) { sets.push(`effective_to = $${idx++}::date`); params.push(dto.effectiveTo); }

    params.push(id);
    const rows = await this.tenantPrisma.query<StudentFeeOverrideRow>(
      `UPDATE student_fee_overrides SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Fee override ${id} not found`);
    return toStudentFeeOverrideResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE student_fee_overrides SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Fee override ${id} not found`);
  }

  /** FeePreviewService's read path: active overrides for a student/year as of a date. */
  async findActiveForStudent(
    studentId: string,
    academicYearId: string,
    asOfDate: string,
  ): Promise<StudentFeeOverrideRow[]> {
    return this.tenantPrisma.query<StudentFeeOverrideRow>(
      `SELECT * FROM student_fee_overrides
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL
         AND effective_from <= $3::date
         AND (effective_to IS NULL OR effective_to >= $3::date)`,
      studentId,
      academicYearId,
      asOfDate,
    );
  }
}
