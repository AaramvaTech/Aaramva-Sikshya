import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { assertUsable } from './soft-delete-guard.util';
import {
  StudentConcessionRow,
  toStudentConcessionResponse,
  StudentConcessionResponseDto,
} from './entities/bill-assignment.entity';
import {
  CreateStudentConcessionDto,
  UpdateStudentConcessionDto,
  StudentConcessionQueryDto,
} from './dto/student-concession.dto';

@Injectable()
export class StudentConcessionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateStudentConcessionDto, createdById: string): Promise<StudentConcessionResponseDto> {
    // FEE-CLASS-GUARD-2 path 3, door 1 of 2.
    await assertUsable(this.tenantPrisma, 'discount_reasons', dto.discountReasonId);

    const rows = await this.tenantPrisma.query<StudentConcessionRow>(
      `INSERT INTO student_concessions
         (student_id, fee_head_id, academic_year_id, type, value, cap_amount,
          discount_reason_id, effective_from, effective_to, notes, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::numeric, $6::numeric,
               $7::uuid, $8::date, $9::date, $10, $11::uuid)
       RETURNING *`,
      dto.studentId,
      dto.feeHeadId ?? null,
      dto.academicYearId,
      dto.type,
      dto.value,
      dto.capAmount ?? null,
      dto.discountReasonId,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
      dto.notes ?? null,
      createdById,
    );
    return toStudentConcessionResponse(rows[0]);
  }

  async findAll(query: StudentConcessionQueryDto): Promise<{
    data: StudentConcessionResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['sc.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.studentId) { conditions.push(`sc.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.academicYearId) { conditions.push(`sc.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StudentConcessionRow & { total_count: string }>(
      `SELECT sc.*, fh.name AS fee_head_name, dr.name AS discount_reason_name,
              COUNT(*) OVER() AS total_count
       FROM student_concessions sc
       LEFT JOIN fee_heads fh ON fh.id = sc.fee_head_id
       JOIN discount_reasons dr ON dr.id = sc.discount_reason_id
       ${where}
       ORDER BY sc.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toStudentConcessionResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateStudentConcessionDto): Promise<StudentConcessionResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.type !== undefined) { sets.push(`type = $${idx++}`); params.push(dto.type); }
    if (dto.value !== undefined) { sets.push(`value = $${idx++}::numeric`); params.push(dto.value); }
    if (dto.capAmount !== undefined) { sets.push(`cap_amount = $${idx++}::numeric`); params.push(dto.capAmount); }
    // Door 2 of 2 (ruling 3). update() reaches the identical invalid state, so
    // guarding only create() would leave a bypass one PATCH away — a guard that
    // reads as protection in review while providing none.
    if (dto.discountReasonId !== undefined) {
      await assertUsable(this.tenantPrisma, 'discount_reasons', dto.discountReasonId);
      sets.push(`discount_reason_id = $${idx++}::uuid`); params.push(dto.discountReasonId);
    }
    if (dto.effectiveFrom !== undefined) { sets.push(`effective_from = $${idx++}::date`); params.push(dto.effectiveFrom); }
    if (dto.effectiveTo !== undefined) { sets.push(`effective_to = $${idx++}::date`); params.push(dto.effectiveTo); }
    if (dto.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(dto.notes); }

    params.push(id);
    const rows = await this.tenantPrisma.query<StudentConcessionRow>(
      `UPDATE student_concessions SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Concession ${id} not found`);
    return toStudentConcessionResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE student_concessions SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Concession ${id} not found`);
  }

  /** FeePreviewService's read path: active concessions for a student/year as of a date. */
  async findActiveForStudent(
    studentId: string,
    academicYearId: string,
    asOfDate: string,
  ): Promise<StudentConcessionRow[]> {
    return this.tenantPrisma.query<StudentConcessionRow>(
      `SELECT * FROM student_concessions
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL
         AND effective_from <= $3::date
         AND (effective_to IS NULL OR effective_to >= $3::date)`,
      studentId,
      academicYearId,
      asOfDate,
    );
  }
}
