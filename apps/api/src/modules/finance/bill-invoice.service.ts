import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { Role } from '../common/enums/role.enum';
import { BillInvoiceQueryDto } from './dto/bill-invoice.dto';
import {
  BillInvoiceRow, BillInvoiceItemRow, BillInvoiceResponseDto,
  toBillInvoiceResponse,
} from './entities/bill-invoice.entity';
import { GuardianScopeService } from '../student/guardian-scope.service';

/**
 * BILL-4-SPEC.md §5 read endpoints: list, single (parent object-scoped),
 * per-student (parent object-scoped). Read-only — never touches
 * bill_invoices/bill_invoice_items beyond SELECT; posting stays exclusively
 * BillRunPostRunnerService's job.
 */
@Injectable()
export class BillInvoiceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianScope: GuardianScopeService,
  ) {}

  async findAll(query: BillInvoiceQueryDto): Promise<{
    data: BillInvoiceResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['bi.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.studentId) { conditions.push(`bi.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.classId) { conditions.push(`s.class_id = $${idx++}::uuid`); params.push(query.classId); }
    if (query.academicYearId) { conditions.push(`bi.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.bsYear) { conditions.push(`bi.bs_year = $${idx++}`); params.push(query.bsYear); }
    if (query.bsMonth) { conditions.push(`bi.bs_month = $${idx++}`); params.push(query.bsMonth); }
    if (query.status) { conditions.push(`bi.status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillInvoiceRow>(
      `SELECT bi.*, s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number, c.name AS class_name,
              COALESCE(SUM(bpa.amount), 0) AS paid_amount,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS balance,
              COUNT(*) OVER() AS total_count
       FROM bill_invoices bi
       JOIN students s ON s.id = bi.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
       WHERE ${conditions.join(' AND ')}
       GROUP BY bi.id, s.first_name, s.last_name, s.student_id, c.name
       ORDER BY bi.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map((r) => toBillInvoiceResponse(r)), meta: { page, limit, total } };
  }

  async findOne(id: string, callerId?: string, callerRole?: Role): Promise<BillInvoiceResponseDto> {
    const rows = await this.tenantPrisma.query<BillInvoiceRow>(
      `SELECT bi.*, s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number, c.name AS class_name,
              COALESCE(SUM(bpa.amount), 0) AS paid_amount,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS balance
       FROM bill_invoices bi
       JOIN students s ON s.id = bi.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
       WHERE bi.id = $1::uuid AND bi.deleted_at IS NULL
       GROUP BY bi.id, s.first_name, s.last_name, s.student_id, c.name`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Invoice ${id} not found`);

    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudent(callerId, rows[0].student_id);
    }

    const items = await this.tenantPrisma.query<BillInvoiceItemRow>(
      `SELECT * FROM bill_invoice_items WHERE bill_invoice_id = $1::uuid ORDER BY created_at`,
      id,
    );
    return toBillInvoiceResponse(rows[0], items);
  }

  async findByStudent(
    studentId: string,
    query: BillInvoiceQueryDto,
    callerId?: string,
    callerRole?: Role,
  ): Promise<{ data: BillInvoiceResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudent(callerId, studentId);
    }
    return this.findAll({ ...query, studentId });
  }
}
