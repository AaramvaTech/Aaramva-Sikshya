import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { UpdateChequeStatusDto, VoidPaymentDto } from './dto/cheque-status.dto';
import {
  BillPaymentAllocationRow, BillPaymentResponseDto, BillPaymentRow, toBillPaymentResponse,
} from './entities/bill-payment.entity';
import { LedgerEntryRow } from './entities/ledger.entity';
import { Role } from '../common/enums/role.enum';

export interface RecordPaymentInTxParams {
  studentId: string;
  academicYearId: string;
  amount: Money;
  method: BillPaymentMethod;
  allocationMode: BillPaymentAllocationMode;
  targets?: { billInvoiceId: string; amount: string }[];
  receivedDate?: string;
  reference?: string;
  chequeBank?: string;
  chequeDate?: string;
  notes?: string;
}

/**
 * BILL-5-SPEC.md §3/§7 Checkpoint A — record a payment and run the
 * allocation engine, all inside ONE per-student locked transaction
 * (LedgerService.withStudentLock), so the bill_payments insert, its
 * allocations, the bill_invoices status recompute, and the single
 * PAYMENT/DEPOSIT ledger entry are one atomic unit. Mirrors
 * BillRunPostRunnerService.postLine's structure exactly.
 *
 * CASH and CHEQUE only (Checkpoint B). BANK_TRANSFER (architecturally
 * identical to CASH — also born CLEARED per spec §4) remains deliberately
 * deferred; ESEWA/KHALTI need Checkpoint C's gateway re-pointing.
 *
 * B5-5 cheque lifecycle: a CHEQUE payment is born PENDING — its allocations
 * are inserted immediately (the intended settlement is decided at record
 * time) but they do NOT count toward an invoice's settlement status or
 * toward a later payment's "outstanding" queries until this payment's own
 * status becomes CLEARED. That single rule (`bp.status = 'CLEARED'` gating
 * every join to bill_payment_allocations) is what makes PENDING/BOUNCED/
 * VOIDED all correctly stop counting without a separate code path each.
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

    if (dto.method !== BillPaymentMethod.CASH && dto.method !== BillPaymentMethod.CHEQUE) {
      throw new BadRequestException(
        `Method ${dto.method} is not yet supported — BILL-5 Checkpoint B records CASH and CHEQUE payments only`,
      );
    }
    if (dto.method === BillPaymentMethod.CHEQUE && (!dto.chequeBank || !dto.chequeDate || !dto.reference)) {
      throw new BadRequestException('CHEQUE payments require reference (cheque number), chequeBank, and chequeDate');
    }

    const amount = toMoney(dto.amount);
    if (amount.compare(Money.zero()) <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (dto.allocationMode === BillPaymentAllocationMode.MANUAL && (!dto.targets || dto.targets.length === 0)) {
      throw new BadRequestException('MANUAL allocation requires at least one target invoice');
    }

    return this.ledgerService.withStudentLock(dto.studentId, (tx) => this.recordPaymentInTx(tx, {
      studentId: dto.studentId,
      academicYearId: dto.academicYearId,
      amount,
      method: dto.method,
      allocationMode: dto.allocationMode,
      targets: dto.targets,
      receivedDate: dto.receivedDate,
      reference: dto.reference,
      chequeBank: dto.chequeBank,
      chequeDate: dto.chequeDate,
      notes: dto.notes,
    }, receivedById));
  }

  /**
   * Participates in an ALREADY-OPEN, ALREADY-LOCKED transaction — mirrors
   * LedgerService's postEntry/postEntryInTx and reverse/reverseInTx split
   * (this is the third instance of that exact pattern in this codebase).
   * Deliberately does NOT re-validate the CASH/CHEQUE-only restriction or
   * cheque-field requirements — those are recordPayment()'s own HTTP-facing
   * business rules; a caller composing this directly (EsewaService/
   * KhaltiService, Checkpoint C) passes method ESEWA/KHALTI, which
   * recordPayment() itself would reject. The caller is trusted, exactly
   * like postEntryInTx/reverseInTx trust theirs.
   */
  async recordPaymentInTx(
    tx: TenantTx, params: RecordPaymentInTxParams, receivedById: string,
  ): Promise<BillPaymentResponseDto> {
    const receivedDate = params.receivedDate ?? todayAdInNepal();
    const bs = bsOf(receivedDate);
    const { invoiceNumberingReset } = await this.financeSettingsService.getInvoiceNumberingReset();
    const todayBs = adToBs(new Date(todayAdInNepal()));
    const fiscalYear = fiscalYearBs(todayBs.year, todayBs.month);
    const { slug } = this.tenantContext.getOrThrow();
    const amount = params.amount;

    let allocations: AllocationPlanItem[];

    if (params.allocationMode === BillPaymentAllocationMode.ADVANCE_ONLY) {
      allocations = [];
    } else if (params.allocationMode === BillPaymentAllocationMode.AUTO_FIFO) {
      const candidates = await this.fetchUnpaidInvoicesOldestFirst(tx, params.studentId);
      const plan = planAutoFifoAllocation(amount, candidates);
      allocations = plan.allocations;
    } else {
      const ids = params.targets!.map((t) => t.billInvoiceId);
      const invoiceMap = await this.fetchInvoicesByIds(tx, params.studentId, ids);
      let sum = Money.zero();
      allocations = [];
      for (const target of params.targets!) {
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
    }

    const seqKey = buildReceiptSequenceKey(slug, invoiceNumberingReset, fiscalYear);
    const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
      `INSERT INTO sequences (key, value) VALUES ($1, 1)
       ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
       RETURNING value`,
      seqKey,
    );
    const receiptNumber = buildReceiptNumber(invoiceNumberingReset, todayBs.year, fiscalYear, seqRow.value);
    const status = params.method === BillPaymentMethod.CHEQUE ? 'PENDING' : 'CLEARED';

    const [payment] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO bill_payments
         (receipt_number, student_id, academic_year_id, amount, method, status,
          received_date, received_bs_year, received_bs_month, received_bs_day,
          reference, cheque_bank, cheque_date, allocation_mode, notes, received_by)
       VALUES ($1, $2::uuid, $3::uuid, $4::numeric, $5, $6,
               $7::date, $8, $9, $10,
               $11, $12, $13::date, $14, $15, $16::uuid)
       RETURNING id`,
      receiptNumber, params.studentId, params.academicYearId, amount.toDb(), params.method, status,
      receivedDate, bs.year, bs.month, bs.day,
      params.reference ?? null, params.chequeBank ?? null, params.chequeDate ?? null,
      params.allocationMode, params.notes ?? null, receivedById,
    );

    // Allocations are ALWAYS inserted, regardless of status — B5-5: even a
    // PENDING cheque's intended settlement is decided at record time. They
    // simply don't count (see recomputeInvoiceStatus / fetchUnpaidInvoices
    // OldestFirst / fetchInvoicesByIds's CLEARED-only join) until this
    // payment's own status becomes CLEARED.
    for (const alloc of allocations) {
      await tx.$executeRawUnsafe(
        `INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)
         VALUES ($1::uuid, $2::uuid, $3::numeric)`,
        payment.id, alloc.billInvoiceId, alloc.amount.toDb(),
      );
    }

    if (status === 'CLEARED') {
      for (const alloc of allocations) {
        await this.recomputeInvoiceStatus(tx, alloc.billInvoiceId);
      }

      const entryType = allocations.length > 0 ? 'PAYMENT' : 'DEPOSIT';
      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        entryType,
        debit: '0',
        credit: amount.toDb(),
        narration: `${entryType === 'PAYMENT' ? 'Payment' : 'Deposit'} ${receiptNumber}`,
        refDocType: 'bill_payment',
        refDocId: payment.id,
        createdById: receivedById,
      });

      await tx.$executeRawUnsafe(
        `UPDATE bill_payments SET ledger_entry_id = $1::uuid, cleared_at = NOW(), cleared_by = $3::uuid WHERE id = $2::uuid`,
        ledgerEntry.id, payment.id, receivedById,
      );
    }

    const allocRows = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
      `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`,
      payment.id,
    );
    const [paymentRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid`,
      payment.id,
    );

    return toBillPaymentResponse(paymentRow, allocRows);
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
    if (query.receivedBy) { conditions.push(`bp.received_by = $${idx++}::uuid`); params.push(query.receivedBy); }

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

  /**
   * B5-5: a PENDING/BOUNCED/VOIDED payment's allocations must NOT make an
   * invoice look "spoken for" — only a CLEARED payment's allocations count
   * as real outstanding-reducing money. The EXISTS join (not a plain LEFT
   * JOIN bill_payments) is what makes a non-CLEARED allocation's amount
   * simply not appear in the SUM at all, rather than appearing and needing
   * to be zeroed out with a CASE.
   */
  private async fetchUnpaidInvoicesOldestFirst(tx: TenantTx, studentId: string): Promise<UnpaidInvoiceCandidate[]> {
    const rows = await tx.$queryRawUnsafe<{ id: string; outstanding: string }[]>(
      `SELECT bi.id,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
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
       LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
       WHERE bi.student_id = $1::uuid AND bi.deleted_at IS NULL
         AND bi.status != 'VOIDED' AND bi.id = ANY($2::uuid[])
       GROUP BY bi.id`,
      studentId, ids,
    );
    return new Map(rows.map((r) => [r.id, { billInvoiceId: r.id, outstanding: toMoney(r.outstanding) }]));
  }

  /**
   * B5-2/B5-5: an invoice's settlement status is derived from the SUM of
   * its allocations, but ONLY allocations whose parent bill_payments row is
   * currently CLEARED count (PENDING never counted; BOUNCED/VOIDED stop
   * counting the moment they transition away from CLEARED). 3-branch, not
   * Checkpoint A's original 2-branch — Checkpoint A never needed a POSTED-
   * reversion case since allocations there only ever got added; Checkpoint B
   * introduces BOUNCED-after-CLEARED and VOID, both of which can drop a
   * previously-counted allocation back to zero.
   */
  private async recomputeInvoiceStatus(tx: TenantTx, billInvoiceId: string): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE bill_invoices SET
         status = CASE
           WHEN total_receivable <= (
             SELECT COALESCE(SUM(bpa.amount), 0)
             FROM bill_payment_allocations bpa
             JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
             WHERE bpa.bill_invoice_id = $1::uuid
           ) THEN 'SETTLED'
           WHEN (
             SELECT COALESCE(SUM(bpa.amount), 0)
             FROM bill_payment_allocations bpa
             JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
             WHERE bpa.bill_invoice_id = $1::uuid
           ) > 0 THEN 'PARTIALLY_PAID'
           ELSE 'POSTED'
         END,
         updated_at = NOW()
       WHERE id = $1::uuid`,
      billInvoiceId,
    );
  }

  async updateChequeStatus(
    paymentId: string, dto: UpdateChequeStatusDto, staffId: string,
  ): Promise<BillPaymentResponseDto> {
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid AND deleted_at IS NULL`, paymentId,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${paymentId} not found`);
    const payment = rows[0];

    if (payment.method !== 'CHEQUE') {
      throw new BadRequestException('Only CHEQUE payments have a cheque-status transition');
    }
    if (payment.status !== 'PENDING' && payment.status !== 'CLEARED') {
      throw new BadRequestException(`Cannot transition a payment from status ${payment.status}`);
    }
    if (payment.status === 'CLEARED' && dto.status !== 'BOUNCED') {
      throw new BadRequestException(`Invalid transition CLEARED -> ${dto.status}`);
    }

    return this.ledgerService.withStudentLock(payment.student_id, async (tx) => {
      const [current] = await tx.$queryRawUnsafe<{ status: string }[]>(
        `SELECT status FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      if (current.status !== payment.status) {
        throw new ConflictException(`Payment status changed concurrently (now ${current.status})`);
      }

      if (payment.status === 'PENDING' && dto.status === 'CLEARED') {
        const allocRows = await tx.$queryRawUnsafe<{ bill_invoice_id: string }[]>(
          `SELECT bill_invoice_id FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid`, paymentId,
        );
        const entryType = allocRows.length > 0 ? 'PAYMENT' : 'DEPOSIT';
        const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
          studentId: payment.student_id,
          academicYearId: payment.academic_year_id,
          entryType,
          debit: '0',
          credit: toMoney(payment.amount).toDb(),
          narration: `${entryType === 'PAYMENT' ? 'Payment' : 'Deposit'} ${payment.receipt_number} (cheque cleared)`,
          refDocType: 'bill_payment',
          refDocId: paymentId,
          createdById: staffId,
        });
        await tx.$executeRawUnsafe(
          `UPDATE bill_payments SET status = 'CLEARED', ledger_entry_id = $2::uuid,
             cleared_at = NOW(), cleared_by = $3::uuid, updated_at = NOW()
           WHERE id = $1::uuid`,
          paymentId, ledgerEntry.id, staffId,
        );
        for (const a of allocRows) {
          await this.recomputeInvoiceStatus(tx, a.bill_invoice_id);
        }
      } else if (payment.status === 'PENDING' && dto.status === 'BOUNCED') {
        await tx.$executeRawUnsafe(
          `UPDATE bill_payments SET status = 'BOUNCED', bounced_at = NOW(), bounced_by = $2::uuid,
             bounce_reason = $3, updated_at = NOW()
           WHERE id = $1::uuid`,
          paymentId, staffId, dto.reason ?? null,
        );
      } else {
        // CLEARED -> BOUNCED: rare, bank reversal after clearing.
        if (payment.ledger_entry_id) {
          const [originalEntry] = await tx.$queryRawUnsafe<LedgerEntryRow[]>(
            `SELECT * FROM student_ledger_entries WHERE id = $1::uuid`, payment.ledger_entry_id,
          );
          await this.ledgerService.reverseInTx(tx, originalEntry, staffId);
        }
        await tx.$executeRawUnsafe(
          `UPDATE bill_payments SET status = 'BOUNCED', bounced_at = NOW(), bounced_by = $2::uuid,
             bounce_reason = $3, updated_at = NOW()
           WHERE id = $1::uuid`,
          paymentId, staffId, dto.reason ?? null,
        );
        const allocRows = await tx.$queryRawUnsafe<{ bill_invoice_id: string }[]>(
          `SELECT bill_invoice_id FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid`, paymentId,
        );
        for (const a of allocRows) {
          await this.recomputeInvoiceStatus(tx, a.bill_invoice_id);
        }
      }

      const [updatedRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
        `SELECT * FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      const updatedAllocations = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
        `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`, paymentId,
      );
      return toBillPaymentResponse(updatedRow, updatedAllocations);
    });
  }

  /**
   * B5-11: void reverses via an appended ledger entry if one existed
   * (CLEARED payment) or is a plain status flip if nothing was ever posted
   * (PENDING). Receipt number is retained (never reused, matches B5-8).
   * Voiding is disallowed once a payment is already VOIDED (idempotency
   * guard) or BOUNCED (already dead — no ledger effect left to reverse and
   * no meaningful "undo" of a bounce).
   */
  async voidPayment(paymentId: string, dto: VoidPaymentDto, staffId: string): Promise<BillPaymentResponseDto> {
    const rows = await this.tenantPrisma.query<BillPaymentRow>(
      `SELECT * FROM bill_payments WHERE id = $1::uuid AND deleted_at IS NULL`, paymentId,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${paymentId} not found`);
    const payment = rows[0];

    if (payment.status === 'VOIDED') throw new ConflictException('Payment already voided');
    if (payment.status === 'BOUNCED') throw new BadRequestException('Cannot void an already-bounced payment');

    return this.ledgerService.withStudentLock(payment.student_id, async (tx) => {
      const [current] = await tx.$queryRawUnsafe<{ status: string }[]>(
        `SELECT status FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      if (current.status === 'VOIDED' || current.status === 'BOUNCED') {
        throw new ConflictException(`Payment status changed concurrently (now ${current.status})`);
      }

      if (current.status === 'CLEARED' && payment.ledger_entry_id) {
        const [originalEntry] = await tx.$queryRawUnsafe<LedgerEntryRow[]>(
          `SELECT * FROM student_ledger_entries WHERE id = $1::uuid`, payment.ledger_entry_id,
        );
        await this.ledgerService.reverseInTx(tx, originalEntry, staffId);
      }

      await tx.$executeRawUnsafe(
        `UPDATE bill_payments SET status = 'VOIDED', voided_at = NOW(), voided_by = $2::uuid,
           void_reason = $3, updated_at = NOW()
         WHERE id = $1::uuid`,
        paymentId, staffId, dto.reason ?? null,
      );

      const allocRows = await tx.$queryRawUnsafe<{ bill_invoice_id: string }[]>(
        `SELECT bill_invoice_id FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid`, paymentId,
      );
      for (const a of allocRows) {
        await this.recomputeInvoiceStatus(tx, a.bill_invoice_id);
      }

      const [updatedRow] = await tx.$queryRawUnsafe<BillPaymentRow[]>(
        `SELECT * FROM bill_payments WHERE id = $1::uuid`, paymentId,
      );
      const updatedAllocations = await tx.$queryRawUnsafe<BillPaymentAllocationRow[]>(
        `SELECT * FROM bill_payment_allocations WHERE bill_payment_id = $1::uuid ORDER BY created_at`, paymentId,
      );
      return toBillPaymentResponse(updatedRow, updatedAllocations);
    });
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
