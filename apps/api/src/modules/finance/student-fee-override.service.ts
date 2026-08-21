import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { assertUsable } from './soft-delete-guard.util';
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

/** Composite key for the (student, fee head) reachability set. */
const reachKey = (studentId: string, feeHeadId: string): string => `${studentId}|${feeHeadId}`;

@Injectable()
export class StudentFeeOverrideService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateStudentFeeOverrideDto, createdById: string): Promise<StudentFeeOverrideResponseDto> {
    // FEE-CLASS-GUARD-2 path 4, the safe half (ruling 4): the head must exist
    // and not be retired. Deliberately NOT "the head must be in the student's
    // assigned structure" — that would invent a constraint nothing enforces
    // today and break setting overrides before assigning a structure, which is
    // how scholarship setup and new-year preparation actually work.
    //
    // The ordering case is handled by SURFACING, not blocking: see
    // appliesToAssignedStructure below.
    await assertUsable(this.tenantPrisma, 'fee_heads', dto.feeHeadId);

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
    return this.withReachability(rows[0]);
  }

  /**
   * Ruling 4 chose SURFACING over blocking, so this is the surface: is the
   * override actually reachable by billing — does the student have an
   * assignment whose structure contains this head?
   *
   * COMPUTED AT READ TIME, never stored. Inertness is derived state that
   * changes without the override changing: assign the structure tomorrow and
   * the same row becomes live. A stored flag would go stale in exactly the
   * silent-wrong direction this ticket exists to fix.
   *
   * Asks "does any assignment's structure contain this head", not "is one
   * effective today" — an override set ahead of a new academic year is early,
   * not inert, and flagging it would recreate the false alarm in the other
   * direction.
   *
   * Does NOT filter the structure's own `deleted_at`: reads of soft-deleted
   * parents on the billing path are BILL-SOFTDEL-1's scope, and this is a
   * display computation rather than a billing decision.
   */
  private async reachablePairs(
    pairs: { studentId: string; feeHeadId: string }[],
  ): Promise<Set<string>> {
    if (pairs.length === 0) return new Set();
    const rows = await this.tenantPrisma.query<{ student_id: string; fee_head_id: string }>(
      `SELECT DISTINCT a.student_id, i.fee_head_id
         FROM student_fee_structure_assignments a
         JOIN bill_fee_structure_items i ON i.fee_structure_id = a.fee_structure_id
        WHERE a.deleted_at IS NULL
          AND a.student_id = ANY($1::uuid[])
          AND i.fee_head_id = ANY($2::uuid[])`,
      [...new Set(pairs.map((x) => x.studentId))],
      [...new Set(pairs.map((x) => x.feeHeadId))],
    );
    return new Set(rows.map((r) => reachKey(r.student_id, r.fee_head_id)));
  }

  /** One row + its reachability, for the single-row write paths. */
  private async withReachability(row: StudentFeeOverrideRow): Promise<StudentFeeOverrideResponseDto> {
    const reachable = await this.reachablePairs([
      { studentId: row.student_id, feeHeadId: row.fee_head_id },
    ]);
    return toStudentFeeOverrideResponse(row, reachable.has(reachKey(row.student_id, row.fee_head_id)));
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
    // One batched query for the whole page, not one per row.
    const reachable = await this.reachablePairs(
      rows.map((r) => ({ studentId: r.student_id, feeHeadId: r.fee_head_id })),
    );
    return {
      data: rows.map((r) =>
        toStudentFeeOverrideResponse(r, reachable.has(reachKey(r.student_id, r.fee_head_id)))),
      meta: { page, limit, total },
    };
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
    return this.withReachability(rows[0]);
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
