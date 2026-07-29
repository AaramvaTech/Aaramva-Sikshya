import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { adToBs } from 'bs-calendar';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { LedgerService } from './ledger.service';
import { FinanceSettingsService } from './finance-settings.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { bsOf } from './ledger.util';
import { todayAdInNepal } from '../common/utils/date.util';
import { fiscalYearBs } from './bill-post.util';
import { buildReceiptNumber, buildReceiptSequenceKey } from './bill-payment.util';
import { AllocationPlanItem, planAutoFifoAllocation, UnpaidInvoiceCandidate } from './bill-payment-allocation.util';
import { BillPaymentAllocationMode, BillPaymentMethod, BillPaymentQueryDto, CreateBillPaymentDto } from './dto/bill-payment.dto';
import {
  BillPaymentAllocationRow, BillPaymentResponseDto, BillPaymentRow, toBillPaymentResponse,
} from './entities/bill-payment.entity';
import { Role } from '../common/enums/role.enum';

/**
 * BILL-5-SPEC.md §3/§7 Checkpoint A — record a payment and run the
 * allocation engine, all inside ONE per-student locked transaction
 * (LedgerService.withStudentLock), so the bill_payments insert, its
 * allocations, the bill_invoices status recompute, and the single
 * PAYMENT/DEPOSIT ledger entry are one atomic unit. Mirrors
 * BillRunPostRunnerService.postLine's structure exactly.
 *
 * CASH-only this checkpoint (BANK_TRANSFER is architecturally identical —
 * also born CLEARED per spec §4 — but Checkpoint A's own wording says "CASH
 * payment", so it's deliberately deferred; trivial to add later). CHEQUE/
 * ESEWA/KHALTI need their own checkpoints (B and C).
 */
@Injectable()
export class BillPaymentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly ledgerService: LedgerService,
    private readonly financeSettingsService: FinanceSettingsService,
  ) {}

  async recordPayment(dto: CreateBillPaymentDto, receivedById: string): Promise<BillPaymentResponseDto> {
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`, dto.studentId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${dto.studentId} not found`);

    const yearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE id = $1::uuid`, dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);

    if (dto.method !== BillPaymentMethod.CASH) {
      throw new BadRequestException(
        `Method ${dto.method} is not yet supported — BILL-5 Checkpoint A records CASH payments only`,
      );
    }

    const amount = toMoney(dto.amount);
    if (amount.compare(Money.zero()) <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (dto.allocationMode === BillPaymentAllocationMode.MANUAL && (!dto.targets || dto.targets.length === 0)) {
      throw new BadRequestException('MANUAL allocation requires at least one target invoice');
    }

    const receivedDate = dto.receivedDate ?? todayAdInNepal();
    const bs = bsOf(receivedDate);
    const { invoiceNumberingReset } = await this.financeSettingsService.getInvoiceNumberingReset();
    const todayBs = adToBs(new Date(todayAdInNepal()));
    const fiscalYear = fiscalYearBs(todayBs.year, todayBs.month);
    const { slug } = this.tenantContext.getOrThrow();

    return this.ledgerService.withStudentLock(dto.studentId, async (tx) => {
      let allocations: AllocationPlanItem[];
      let remainder: Money;

      if (dto.allocationMode === BillPaymentAllocationMode.ADVANCE_ONLY) {
        allocations = [];
        remainder = amount;
      } else if (dto.allocationMode === BillPaymentAllocationMode.AUTO_FIFO) {
        const candidates = await this.fetchUnpaidInvoicesOldestFirst(tx, dto.studentId);
        const plan = planAutoFifoAllocation(amount, candidates);
        allocations = plan.allocations;
        remainder = plan.remainder;
      } else {
        const ids = dto.targets!.map((t) => t.billInvoiceId);
        const invoiceMap = await this.fetchInvoicesByIds(tx, dto.studentId, ids);
        let sum = Money.zero();
        allocations = [];
        for (const target of dto.targets!) {
          const invoice = invoiceMap.get(target.billInvoiceId);
          if (!invoice) {
            throw new NotFoundException(`Invoice ${target.billInvoiceId} not found for this student`);
          }
          const targetAmount = toMoney(target.amount);
          if (targetAmount.compare(invoice.outstanding) > 0) {
            throw new BadRequestException(
              `Allocation of ${targetAmount.toDb()} exceeds invoice ${target.billInvoiceId}'s outstanding balance of ${invoice.outstanding.toDb()}`,
            );
          }
          sum = sum.add(targetAmount);
          allocations.push({ billInvoiceId: target.billInvoiceId, amount: targetAmount });
        }
        if (sum.compare(amount) > 0) {
          throw new BadRequestException(`Total allocation ${sum.toDb()} exceeds payment amount ${amount.toDb()}`);
        }
        remainder = amount.sub(sum);
      }

      const seqKey = buildReceiptSequenceKey(slug, invoiceNumberingReset, fiscalYear);
      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ($1, 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        seqKey,
      );
      const receiptNumber = buildReceiptNumber(invoiceNumberingReset, todayBs.year, fiscalYear, seqRow.value);

      const [payment] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO bill_payments
           (receipt_number, student_id, academic_year_id, amount, method, status,
            received_date, received_bs_year, received_bs_month, received_bs_day,
            reference, allocation_mode, notes, received_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'CLEARED',
                 $6::date, $7, $8, $9,
                 $10, $11, $12, $13::uuid)
         RETURNING id`,
        receiptNumber, dto.studentId, dto.academicYearId, amount.toDb(), dto.method,
        receivedDate, bs.year, bs.month, bs.day,
        dto.reference ?? null, dto.allocationMode, dto.notes ?? null, receivedById,
      );

      for (const alloc of allocations) {
        await tx.$executeRawUnsafe(
          `INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)
           VALUES ($1::uuid, $2::uuid, $3)`,
          payment.id, alloc.billInvoiceId, alloc.amount.toDb(),
        );
        await tx.$executeRawUnsafe(
          `UPDATE bill_invoices SET
             status = CASE
               WHEN total_receivable <= (
                 SELECT COALESCE(SUM(amount), 0) FROM bill_payment_allocations WHERE bill_invoice_id = $1::uuid
               ) THEN 'SETTLED'
               ELSE 'PARTIALLY_PAID'
             END,
             updated_at = NOW()
           WHERE id = $1::uuid`,
          alloc.billInvoiceId,
        );
      }

      const entryType = allocations.length > 0 ? 'PAYMENT' : 'DEPOSIT';
      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        entryType,
        debit: '0',
        credit: amount.toDb(),
        narration: `${entryType === 'PAYMENT' ? 'Payment' : 'Deposit'} ${receiptNumber}`,
        refDocType: 'bill_payment',
        refDocId: payment.id,
        createdById: receivedById,
      });

      await tx.$executeRawUnsafe(
        `UPDATE bill_payments SET ledger_entry_id = $1::uuid WHERE id = $2::uuid`,
        ledgerEntry.id, payment.id,
      );

      const allocRows = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
        `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`,
        payment.id,
      );
      const [paymentRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
        `SELECT * FROM bill_payments WHERE id = $1::uuid`,
        payment.id,
      );

      return toBillPaymentResponse(paymentRow, allocRows);
    });
  }

  async findAll(query: BillPaymentQueryDto): Promise<{
    data: BillPaymentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['bp.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.studentId) { conditions.push(`bp.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.method) { conditions.push(`bp.method = $${idx++}`); params.push(query.method); }
    if (query.status) { conditions.push(`bp.status = $${idx++}`); params.push(query.status); }
    if (query.dateFrom) { conditions.push(`bp.received_date >= $${idx++}::date`); params.push(query.dateFrom); }
    if (query.dateTo) { conditions.push(`bp.received_date <= $${idx++}::date`); params.push(query.dateTo); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT bp.*, COUNT(*) OVER() AS total_count
       FROM bill_payments bp
       WHERE ${conditions.join(' AND ')}
       ORDER BY bp.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map((r) => toBillPaymentResponse(r)), meta: { page, limit, total } };
  }

  async findOne(id: string, callerId?: string, callerRole?: Role): Promise<BillPaymentResponseDto> {
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid AND deleted_at IS NULL`, id,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${id} not found`);

    if (callerRole === Role.PARENT && callerId) {
      await this.assertGuardianOwnsStudent(rows[0].student_id, callerId);
    }

    const allocations = await this.tenantPrisma.query<BillPaymentAllocationRow>(
      `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`, id,
    );
    return toBillPaymentResponse(rows[0], allocations);
  }

  private async fetchUnpaidInvoicesOldestFirst(tx: TenantTx, studentId: string): Promise<UnpaidInvoiceCandidate[]> {
    const rows = await tx.$queryRawUnsafe<{ id: string; outstanding: string }[]>(
      `SELECT bi.id,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa ON bpa.bill_invoice_id = bi.id
       WHERE bi.student_id = $1::uuid AND bi.deleted_at IS NULL
         AND bi.status IN ('POSTED', 'PARTIALLY_PAID')
       GROUP BY bi.id, bi.total_receivable, bi.issue_date, bi.created_at
       HAVING bi.total_receivable - COALESCE(SUM(bpa.amount), 0) > 0
       ORDER BY bi.issue_date ASC, bi.created_at ASC`,
      studentId,
    );
    return rows.map((r) => ({ billInvoiceId: r.id, outstanding: toMoney(r.outstanding) }));
  }

  private async fetchInvoicesByIds(
    tx: TenantTx, studentId: string, ids: string[],
  ): Promise<Map<string, UnpaidInvoiceCandidate>> {
    const rows = await tx.$queryRawUnsafe<{ id: string; outstanding: string }[]>(
      `SELECT bi.id,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa ON bpa.bill_invoice_id = bi.id
       WHERE bi.student_id = $1::uuid AND bi.deleted_at IS NULL
         AND bi.status != 'VOIDED' AND bi.id = ANY($2::uuid[])
       GROUP BY bi.id`,
      studentId, ids,
    );
    return new Map(rows.map((r) => [r.id, { billInvoiceId: r.id, outstanding: toMoney(r.outstanding) }]));
  }

  private async assertGuardianOwnsStudent(studentId: string, callerId: string): Promise<void> {
    const children = await this.tenantPrisma.query<{ student_id: string }>(
      `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
      callerId,
    );
    if (!children.some((c) => c.student_id === studentId)) {
      throw new ForbiddenException('Access denied');
    }
  }
}
