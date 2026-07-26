import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { toMoney } from './entities/finance.entity';
import { ConcessionRegisterQueryDto } from './dto/concession-register.dto';

export interface ConcessionRegisterRowDto {
  concessionId: string;
  studentId: string;
  studentAdmissionNumber: string;
  studentName: string;
  className: string | null;
  feeHeadId: string | null;
  feeHeadName: string | null; // null = whole bill
  type: string;
  value: number;
  capAmount: number | null;
  discountReasonId: string;
  discountReasonName: string;
  appliedBy: string;
  appliedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Spec §6: "student, head, type, value, reason, who applied it, when.
 * Answers the scholarship-obligation question." Read-only — every concession
 * ever granted (live, non-soft-deleted rows), independent of whether it's
 * currently within its effective range, since the register is an obligation
 * record, not a today-only preview (that's FeePreviewService's job).
 */
@Injectable()
export class ConcessionRegisterReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async findAll(query: ConcessionRegisterQueryDto): Promise<{
    data: ConcessionRegisterRowDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['sc.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.academicYearId) { conditions.push(`sc.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.classId) { conditions.push(`s.class_id = $${idx++}::uuid`); params.push(query.classId); }
    if (query.discountReasonId) { conditions.push(`sc.discount_reason_id = $${idx++}::uuid`); params.push(query.discountReasonId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<{
      id: string;
      student_id: string;
      student_admission_number: string;
      first_name: string;
      last_name: string;
      class_name: string | null;
      fee_head_id: string | null;
      fee_head_name: string | null;
      type: string;
      value: string | number;
      cap_amount: string | number | null;
      discount_reason_id: string;
      discount_reason_name: string;
      applied_by_first_name: string;
      applied_by_last_name: string;
      created_at: Date | string;
      effective_from: Date | string;
      effective_to: Date | string | null;
      total_count: string;
    }>(
      `SELECT sc.id, sc.student_id, s.student_id AS student_admission_number,
              s.first_name, s.last_name, cl.name AS class_name,
              sc.fee_head_id, fh.name AS fee_head_name,
              sc.type, sc.value, sc.cap_amount,
              sc.discount_reason_id, dr.name AS discount_reason_name,
              u.first_name AS applied_by_first_name, u.last_name AS applied_by_last_name,
              sc.created_at, sc.effective_from, sc.effective_to,
              COUNT(*) OVER() AS total_count
       FROM student_concessions sc
       JOIN students s ON s.id = sc.student_id
       LEFT JOIN classes cl ON cl.id = s.class_id
       LEFT JOIN fee_heads fh ON fh.id = sc.fee_head_id
       JOIN discount_reasons dr ON dr.id = sc.discount_reason_id
       JOIN users u ON u.id = sc.created_by
       ${where}
       ORDER BY sc.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    const toIso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d));
    const toDateOnly = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];

    return {
      data: rows.map((r) => ({
        concessionId: r.id,
        studentId: r.student_id,
        studentAdmissionNumber: r.student_admission_number,
        studentName: `${r.first_name} ${r.last_name}`,
        className: r.class_name,
        feeHeadId: r.fee_head_id,
        feeHeadName: r.fee_head_name,
        type: r.type,
        value: toMoney(r.value).toNumber(),
        capAmount: r.cap_amount != null ? toMoney(r.cap_amount).toNumber() : null,
        discountReasonId: r.discount_reason_id,
        discountReasonName: r.discount_reason_name,
        appliedBy: `${r.applied_by_first_name} ${r.applied_by_last_name}`,
        appliedAt: toIso(r.created_at),
        effectiveFrom: toDateOnly(r.effective_from),
        effectiveTo: r.effective_to ? toDateOnly(r.effective_to) : null,
      })),
      meta: { page, limit, total },
    };
  }
}
