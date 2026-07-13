import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getBsYear } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { todayAdInNepal } from '../common/utils/date.util';
import {
  FeeStructureItemRow,
  StudentFeeAssignmentRow,
  InvoiceRow,
  InvoiceItemRow,
  InvoiceItemToCreate,
  InvoiceResponseDto,
  toInvoiceResponse,
  toNum,
} from './entities/finance.entity';
import {
  GenerateInvoiceDto,
  GenerateBulkInvoiceDto,
  SetStudentFeeAssignmentDto,
  InvoiceQueryDto,
} from './dto/invoice.dto';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Amount calculation (pure logic) ───────────────────────────────────────

  private calculateItemAmounts(
    items: FeeStructureItemRow[],
    assignmentMap: Map<string, StudentFeeAssignmentRow>,
  ): { invoiceItems: InvoiceItemToCreate[]; subtotal: number; discountAmount: number } {
    let subtotal = 0;
    let discountAmount = 0;
    const invoiceItems: InvoiceItemToCreate[] = [];

    for (const item of items) {
      const assignment = assignmentMap.get(item.id);
      const baseAmount = toNum(item.amount);

      if (assignment?.is_waived) {
        invoiceItems.push({
          feeCategoryId: item.fee_category_id,
          feeCategoryName: item.fee_category_name,
          originalAmount: baseAmount,
          discountPercent: 100,
          discountedAmount: 0,
          finePerDay: toNum(item.fine_per_day),
          gracePeriodDays: item.grace_period_days,
        });
        subtotal += baseAmount;
        discountAmount += baseAmount;
        continue;
      }

      let originalAmount = baseAmount;
      if (assignment?.custom_amount != null) {
        originalAmount = toNum(assignment.custom_amount);
      }

      const discountPercent = assignment ? toNum(assignment.discount_percent) : 0;
      const discounted = Math.round(originalAmount * (1 - discountPercent / 100) * 100) / 100;
      const discount = Math.round((originalAmount - discounted) * 100) / 100;

      invoiceItems.push({
        feeCategoryId: item.fee_category_id,
        feeCategoryName: item.fee_category_name,
        originalAmount,
        discountPercent,
        discountedAmount: discounted,
        finePerDay: toNum(item.fine_per_day),
        gracePeriodDays: item.grace_period_days,
      });

      subtotal += originalAmount;
      discountAmount += discount;
    }

    return {
      invoiceItems,
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
    };
  }

  // ─── Generate single invoice ────────────────────────────────────────────────

  async generateInvoice(
    dto: GenerateInvoiceDto,
    createdById: string,
  ): Promise<InvoiceResponseDto> {
    const students = await this.tenantPrisma.query<{ id: string; class_id: string }>(
      `SELECT id, class_id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.studentId,
    );
    if (!students[0]) throw new NotFoundException(`Student ${dto.studentId} not found`);
    const { class_id } = students[0];

    // Get fee structure items for this class + academic year
    // Avoid passing JS arrays as $queryRawUnsafe params — Prisma serializes them as JSONB
    // which cannot be cast to uuid[]. Filter in JS instead (fee items per class are always small).
    const allFsiRows = await this.tenantPrisma.query<FeeStructureItemRow>(
      `SELECT fsi.id, fsi.fee_category_id, fc.name AS fee_category_name,
              fsi.amount, fsi.due_day_of_month, fsi.due_date,
              fsi.fine_per_day, fsi.grace_period_days
       FROM fee_structure_items fsi
       JOIN fee_categories fc ON fc.id = fsi.fee_category_id AND fc.deleted_at IS NULL
       JOIN fee_structures fs ON fs.id = fsi.fee_structure_id AND fs.deleted_at IS NULL
       WHERE fs.class_id = $1::uuid AND fs.academic_year_id = $2::uuid`,
      class_id,
      dto.academicYearId,
    );

    const allowedIds = dto.feeStructureItemIds?.length
      ? new Set(dto.feeStructureItemIds)
      : null;
    const fsiRows = allowedIds
      ? allFsiRows.filter((r) => allowedIds.has(r.id))
      : allFsiRows;

    if (!fsiRows.length) throw new BadRequestException('No fee structure items found for this student');

    const itemIdSet = new Set(fsiRows.map((i) => i.id));

    // Query all assignments for this student + year, then filter to the relevant items in JS
    const allAssignments = await this.tenantPrisma.query<StudentFeeAssignmentRow>(
      `SELECT fee_structure_item_id, custom_amount, discount_percent, is_waived
       FROM student_fee_assignments
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid`,
      dto.studentId,
      dto.academicYearId,
    );
    const assignments = allAssignments.filter((a) => itemIdSet.has(a.fee_structure_item_id));

    const assignmentMap = new Map(assignments.map((a) => [a.fee_structure_item_id, a]));
    const { invoiceItems, subtotal, discountAmount } = this.calculateItemAmounts(fsiRows, assignmentMap);
    const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;
    // QA-1 OBS-E-2: default due date is Nepal-today, not UTC-today.
    const dueDate = dto.dueDate ?? todayAdInNepal();

    return this.tenantPrisma.run(async (tx) => {
      const bsYear = getBsYear(new Date());

      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ('invoice_seq', 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
      );
      const seq = Number(seqRow.value);
      const invoiceNumber = `INV-${bsYear}-${String(seq).padStart(6, '0')}`;

      const [invoice] = await tx.$queryRawUnsafe<InvoiceRow[]>(
        `INSERT INTO invoices
           (invoice_number, student_id, academic_year_id, due_date, status,
            subtotal, discount_amount, fine_amount, total_amount, paid_amount, created_by)
         VALUES ($1, $2::uuid, $3::uuid, $4::date, 'UNPAID',
                 $5, $6, 0, $7, 0, $8::uuid)
         RETURNING *`,
        invoiceNumber,
        dto.studentId,
        dto.academicYearId,
        dueDate,
        subtotal,
        discountAmount,
        totalAmount,
        createdById,
      );

      for (const item of invoiceItems) {
        await tx.$executeRawUnsafe(
          `INSERT INTO invoice_items
             (invoice_id, fee_category_id, fee_category_name, original_amount,
              discount_percent, discounted_amount, fine_per_day, grace_period_days)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)`,
          invoice.id,
          item.feeCategoryId,
          item.feeCategoryName,
          item.originalAmount,
          item.discountPercent,
          item.discountedAmount,
          item.finePerDay,
          item.gracePeriodDays,
        );
      }

      return toInvoiceResponse(invoice);
    });
  }

  // ─── Generate bulk invoices ─────────────────────────────────────────────────

  async generateBulkInvoice(
    dto: GenerateBulkInvoiceDto,
    createdById: string,
  ): Promise<{ generated: number; skipped: number; errors: { studentId: string; error: string }[] }> {
    const students = await this.tenantPrisma.query<{ id: string }>(
      `SELECT DISTINCT s.id
       FROM students s
       WHERE s.class_id = $1::uuid AND s.deleted_at IS NULL AND s.status = 'ACTIVE'`,
      dto.classId,
    );

    let generated = 0;
    let skipped = 0;
    const errors: { studentId: string; error: string }[] = [];

    for (const student of students) {
      // Skip if student already has an invoice for the same due date in this academic year
      const existing = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM invoices
         WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
           AND due_date = $3::date AND deleted_at IS NULL`,
        student.id,
        dto.academicYearId,
        dto.dueDate,
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      try {
        await this.generateInvoice(
          {
            studentId: student.id,
            academicYearId: dto.academicYearId,
            feeStructureItemIds: dto.feeStructureItemIds,
            dueDate: dto.dueDate,
          },
          createdById,
        );
        generated++;
      } catch (e: unknown) {
        errors.push({ studentId: student.id, error: (e as Error).message });
      }
    }

    return { generated, skipped, errors };
  }

  // ─── Recalculate fine for one invoice ──────────────────────────────────────

  async recalculateFine(id: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{
      id: string;
      due_date: Date | string;
      status: string;
      subtotal: string | number;
      discount_amount: string | number;
      total_fine_per_day: string | number;
      max_grace_period_days: number;
    }>(
      `SELECT i.id, i.due_date, i.status, i.subtotal, i.discount_amount,
              COALESCE(SUM(ii.fine_per_day), 0) AS total_fine_per_day,
              COALESCE(MAX(ii.grace_period_days), 0) AS max_grace_period_days
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.id = $1::uuid AND i.deleted_at IS NULL
       GROUP BY i.id, i.due_date, i.status, i.subtotal, i.discount_amount`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Invoice ${id} not found`);
    const inv = rows[0];

    // QA-1 OBS-E-2 / decision 2: overdue days from Nepal's calendar "today",
    // TZ-independent (both dates parsed as UTC-midnight — the server timezone
    // no longer changes the fine). Replaces the server-local new Date()+setHours.
    const todayAd = todayAdInNepal();
    const dueAd =
      typeof inv.due_date === 'string'
        ? inv.due_date.slice(0, 10)
        : inv.due_date.toISOString().slice(0, 10);
    const daysSinceDue = Math.floor(
      (Date.parse(`${todayAd}T00:00:00Z`) - Date.parse(`${dueAd}T00:00:00Z`)) / 86400000,
    );
    const daysOverdue = Math.max(0, daysSinceDue - Number(inv.max_grace_period_days));
    const finePerDay = toNum(inv.total_fine_per_day);
    const fine = Math.round(daysOverdue * finePerDay * 100) / 100;

    const subtotal = toNum(inv.subtotal);
    const discount = toNum(inv.discount_amount);
    const totalAmount = Math.round((subtotal - discount + fine) * 100) / 100;

    // Determine new status
    let newStatus = inv.status;
    if (daysOverdue > 0 && (inv.status === 'UNPAID' || inv.status === 'OVERDUE')) {
      newStatus = 'OVERDUE';
    }

    await this.tenantPrisma.execute(
      `UPDATE invoices
       SET fine_amount = $1, total_amount = $2, status = $3, updated_at = NOW()
       WHERE id = $4::uuid`,
      fine,
      totalAmount,
      newStatus,
      id,
    );

    // Emit event if invoice just became overdue
    if (newStatus === 'OVERDUE' && inv.status !== 'OVERDUE') {
      const { slug } = this.tenantContext.getOrThrow();
      this.eventEmitter.emit('invoice.overdue', {
        invoiceId: id,
        balance: totalAmount,
        tenantSlug: slug,
      });
    }
  }

  // ─── List / get invoices ────────────────────────────────────────────────────

  async findAll(query: InvoiceQueryDto): Promise<{
    data: InvoiceResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.studentId) { conditions.push(`i.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.academicYearId) { conditions.push(`i.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.classId) { conditions.push(`s.class_id = $${idx++}::uuid`); params.push(query.classId); }
    if (query.status) { conditions.push(`i.status = $${idx++}`); params.push(query.status); }
    if (query.fromDate) { conditions.push(`i.due_date >= $${idx++}::date`); params.push(query.fromDate); }
    if (query.toDate) { conditions.push(`i.due_date <= $${idx++}::date`); params.push(query.toDate); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<
      InvoiceRow & {
        total_count: string;
        student_name: string;
        admission_number: string;
        class_name: string;
      }
    >(
      `SELECT i.*,
              s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number,
              c.name AS class_name,
              COUNT(*) OVER() AS total_count
       FROM invoices i
       JOIN students s ON s.id = i.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map((r) => ({
        ...toInvoiceResponse(r),
        studentName: r.student_name,
        admissionNumber: r.admission_number,
        className: r.class_name,
      })),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<InvoiceResponseDto & { studentName: string; admissionNumber: string; className: string }> {
    const rows = await this.tenantPrisma.query<
      InvoiceRow & { student_name: string; admission_number: string; class_name: string }
    >(
      `SELECT i.*,
              s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number,
              c.name AS class_name
       FROM invoices i
       JOIN students s ON s.id = i.student_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN classes c ON c.id = sec.class_id
       WHERE i.id = $1::uuid AND i.deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Invoice ${id} not found`);

    const items = await this.tenantPrisma.query<InvoiceItemRow>(
      `SELECT * FROM invoice_items WHERE invoice_id = $1::uuid ORDER BY created_at`,
      id,
    );

    const payments = await this.tenantPrisma.query<import('./entities/finance.entity').PaymentRow>(
      `SELECT * FROM payments WHERE invoice_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at`,
      id,
    );

    return {
      ...toInvoiceResponse(rows[0], items, payments),
      studentName: rows[0].student_name,
      admissionNumber: rows[0].admission_number,
      className: rows[0].class_name,
    };
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE invoices SET deleted_at = NOW(), status = 'WAIVED', updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Invoice ${id} not found`);
  }

  // ─── Student fee assignments ────────────────────────────────────────────────

  async setStudentFeeAssignment(
    studentId: string,
    dto: SetStudentFeeAssignmentDto,
  ): Promise<void> {
    await this.tenantPrisma.execute(
      `INSERT INTO student_fee_assignments
         (student_id, fee_structure_item_id, academic_year_id,
          custom_amount, discount_percent, discount_reason, is_waived)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)
       ON CONFLICT (student_id, fee_structure_item_id, academic_year_id)
       DO UPDATE SET
         custom_amount    = EXCLUDED.custom_amount,
         discount_percent = EXCLUDED.discount_percent,
         discount_reason  = EXCLUDED.discount_reason,
         is_waived        = EXCLUDED.is_waived,
         updated_at       = NOW()`,
      studentId,
      dto.feeStructureItemId,
      dto.academicYearId,
      dto.customAmount ?? null,
      dto.discountPercent ?? 0,
      dto.discountReason ?? null,
      dto.isWaived ?? false,
    );
  }

  async getStudentFeeAssignments(
    studentId: string,
    academicYearId?: string,
    callerId?: string,
    callerRole?: Role,
  ): Promise<object[]> {
    if (callerRole === Role.PARENT && callerId) {
      const children = await this.tenantPrisma.query<{ student_id: string }>(
        `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
        callerId,
      );
      if (!children.some((c) => c.student_id === studentId)) {
        throw new ForbiddenException('Access denied');
      }
    }
    // When academicYearId is provided: return ALL fee structure items for the student's
    // enrolled class + year, with any per-student overrides merged in.
    // This lets the Fees tab show every applicable fee item even before any override is set.
    if (academicYearId) {
      // 1. Get student's class
      const studentRows = await this.tenantPrisma.query<{ class_id: string | null }>(
        `SELECT class_id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
        studentId,
      );
      const classId = studentRows[0]?.class_id;

      if (!classId) return [];

      // 2. Get all fee structure items for this class + year
      const fsiRows = await this.tenantPrisma.query<{
        id: string;
        fee_category_name: string;
        amount: string | number;
      }>(
        `SELECT fsi.id, fc.name AS fee_category_name, fsi.amount
         FROM fee_structure_items fsi
         JOIN fee_categories fc ON fc.id = fsi.fee_category_id AND fc.deleted_at IS NULL
         JOIN fee_structures fs ON fs.id = fsi.fee_structure_id AND fs.deleted_at IS NULL
         WHERE fs.class_id = $1::uuid AND fs.academic_year_id = $2::uuid
         ORDER BY fsi.created_at`,
        classId,
        academicYearId,
      );

      if (!fsiRows.length) return [];

      // 3. Get any existing per-student overrides (no array param — filter in JS)
      const allAssignments = await this.tenantPrisma.query<{
        fee_structure_item_id: string;
        custom_amount: string | number | null;
        discount_percent: string | number;
        discount_reason: string | null;
        is_waived: boolean;
      }>(
        `SELECT fee_structure_item_id, custom_amount, discount_percent, discount_reason, is_waived
         FROM student_fee_assignments
         WHERE student_id = $1::uuid AND academic_year_id = $2::uuid`,
        studentId,
        academicYearId,
      );
      const assignmentMap = new Map(allAssignments.map((a) => [a.fee_structure_item_id, a]));

      // 4. Merge: every fee item gets its override values (or defaults)
      return fsiRows.map((fsi) => {
        const assignment = assignmentMap.get(fsi.id);
        const originalAmount = toNum(fsi.amount);
        const customAmount = assignment?.custom_amount != null ? toNum(assignment.custom_amount) : null;
        const effectiveBase = customAmount ?? originalAmount;
        const discountPercent = assignment ? toNum(assignment.discount_percent) : 0;
        const isWaived = assignment?.is_waived ?? false;
        const effectiveAmount = isWaived
          ? 0
          : Math.round(effectiveBase * (1 - discountPercent / 100) * 100) / 100;
        return {
          feeStructureItemId: fsi.id,
          feeCategoryName: fsi.fee_category_name,
          originalAmount,
          customAmount,
          discountPercent,
          discountReason: assignment?.discount_reason ?? null,
          isWaived,
          effectiveAmount,
        };
      });
    }

    // Fallback (no academicYearId): return only explicit override rows
    const rows = await this.tenantPrisma.query<{
      fee_structure_item_id: string;
      fee_category_name: string;
      original_amount: string | number;
      custom_amount: string | number | null;
      discount_percent: string | number;
      discount_reason: string | null;
      is_waived: boolean;
    }>(
      `SELECT sfa.fee_structure_item_id, fc.name AS fee_category_name,
              fsi.amount AS original_amount, sfa.custom_amount, sfa.discount_percent,
              sfa.discount_reason, sfa.is_waived
       FROM student_fee_assignments sfa
       JOIN fee_structure_items fsi ON fsi.id = sfa.fee_structure_item_id
       JOIN fee_categories fc ON fc.id = fsi.fee_category_id
       WHERE sfa.student_id = $1::uuid
       ORDER BY sfa.created_at`,
      studentId,
    );

    return rows.map((r) => {
      const originalAmount = toNum(r.original_amount);
      const customAmount = r.custom_amount != null ? toNum(r.custom_amount) : null;
      const effectiveBase = customAmount ?? originalAmount;
      const discountPercent = toNum(r.discount_percent);
      const effectiveAmount = r.is_waived ? 0 : Math.round(effectiveBase * (1 - discountPercent / 100) * 100) / 100;
      return {
        feeStructureItemId: r.fee_structure_item_id,
        feeCategoryName: r.fee_category_name,
        originalAmount,
        customAmount,
        discountPercent,
        discountReason: r.discount_reason,
        isWaived: r.is_waived,
        effectiveAmount,
      };
    });
  }
}
