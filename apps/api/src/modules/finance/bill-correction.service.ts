import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { adToBs } from 'bs-calendar';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { LedgerService } from './ledger.service';
import { FinanceSettingsService } from './finance-settings.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { todayAdInNepal } from '../common/utils/date.util';
import { buildCorrectionSequenceKey, buildCorrectionNumber } from './bill-correction.util';
import { CreateCreditNoteDto, DecideCorrectionDto, BillCorrectionQueryDto } from './dto/bill-correction.dto';
import {
  BillCorrectionRow, BillCorrectionResponseDto, toBillCorrectionResponse,
} from './entities/bill-correction.entity';
import { LedgerEntryRow, LedgerEntryResponseDto, toLedgerEntryResponse } from './entities/ledger.entity';
import { Role } from '../common/enums/role.enum';

/**
 * BILL-6-SPEC.md §3/§7 Checkpoint A — credit notes + the request→approve
 * workflow. No new ledger table: student_ledger_entries already permits
 * CREDIT_NOTE (0021_bill_ledger.sql); this service is the workflow + audit
 * wrapper around LedgerService's existing posting/reversal machinery.
 *
 * B6-10 direction: a credit note is a CREDIT (reduces what the student
 * owes) — every postEntryInTx call below posts credit=amount, debit='0'.
 */
@Injectable()
export class BillCorrectionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly ledgerService: LedgerService,
    private readonly financeSettingsService: FinanceSettingsService,
  ) {}

  async requestCreditNote(dto: CreateCreditNoteDto, requestedById: string): Promise<BillCorrectionResponseDto> {
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`, dto.studentId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${dto.studentId} not found`);

    const yearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE id = $1::uuid`, dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);

    const reasonRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM correction_reasons WHERE id = $1::uuid AND deleted_at IS NULL`, dto.reasonId,
    );
    if (!reasonRows[0]) throw new NotFoundException(`Correction reason ${dto.reasonId} not found`);

    const invoiceRows = await this.tenantPrisma.query<{ id: string; student_id: string; status: string }>(
      `SELECT id, student_id, status FROM bill_invoices WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.targetInvoiceId,
    );
    const invoice = invoiceRows[0];
    if (!invoice) throw new NotFoundException(`Invoice ${dto.targetInvoiceId} not found`);
    if (invoice.student_id !== dto.studentId) {
      throw new BadRequestException(`Invoice ${dto.targetInvoiceId} does not belong to student ${dto.studentId}`);
    }
    if (invoice.status === 'VOIDED') {
      throw new BadRequestException(`Cannot issue a credit note against a voided invoice`);
    }

    if (dto.targetInvoiceItemId) {
      const itemRows = await this.tenantPrisma.query<{ id: string; bill_invoice_id: string }>(
        `SELECT id, bill_invoice_id FROM bill_invoice_items WHERE id = $1::uuid`, dto.targetInvoiceItemId,
      );
      if (!itemRows[0] || itemRows[0].bill_invoice_id !== dto.targetInvoiceId) {
        throw new NotFoundException(`Invoice item ${dto.targetInvoiceItemId} not found on invoice ${dto.targetInvoiceId}`);
      }
    }

    const amount = toMoney(dto.amount);
    if (amount.compare(Money.zero()) <= 0) {
      throw new BadRequestException('Credit note amount must be greater than zero');
    }

    const { creditNoteApprovalThreshold } = await this.financeSettingsService.getCreditNoteApprovalThreshold();
    const threshold = Money.fromNumber(creditNoteApprovalThreshold);

    return this.ledgerService.withStudentLock(dto.studentId, async (tx) => {
      const outstanding = await this.creditableAmount(tx, dto.targetInvoiceId, dto.targetInvoiceItemId ?? null);
      if (amount.compare(outstanding) > 0) {
        throw new BadRequestException(
          `Credit note amount ${amount.toDb()} exceeds the outstanding-after-existing-credits amount of ${outstanding.toDb()} for this invoice`,
        );
      }

      const requiresApproval = amount.compare(threshold) >= 0;

      const { slug } = this.tenantContext.getOrThrow();
      const todayBs = adToBs(new Date(todayAdInNepal()));
      const seqKey = buildCorrectionSequenceKey(slug);
      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ($1, 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        seqKey,
      );
      const correctionNumber = buildCorrectionNumber(todayBs.year, seqRow.value);

      const status = requiresApproval ? 'REQUESTED' : 'APPROVED';
      const decidedBy = requiresApproval ? null : requestedById;
      const decidedAt = requiresApproval ? null : new Date();

      const [correction] = await tx.$queryRawUnsafe<BillCorrectionRow[]>(
        `INSERT INTO bill_corrections
           (correction_number, type, student_id, academic_year_id, target_invoice_id, target_invoice_item_id,
            amount, reason_id, status, requested_by, decided_by, decided_at, requires_approval)
         VALUES ($1, 'CREDIT_NOTE', $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                 $6::numeric, $7::uuid, $8, $9::uuid, $10::uuid, $11::timestamptz, $12)
         RETURNING *`,
        correctionNumber, dto.studentId, dto.academicYearId, dto.targetInvoiceId, dto.targetInvoiceItemId ?? null,
        amount.toDb(), dto.reasonId, status, requestedById, decidedBy, decidedAt, requiresApproval,
      );

      if (!requiresApproval) {
        const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
          studentId: dto.studentId,
          academicYearId: dto.academicYearId,
          entryType: 'CREDIT_NOTE',
          debit: '0',
          credit: amount.toDb(),
          narration: `Credit note ${correctionNumber}`,
          refDocType: 'bill_correction',
          refDocId: correction.id,
          createdById: requestedById,
        });
        await tx.$executeRawUnsafe(
          `UPDATE bill_corrections SET ledger_entry_id = $1::uuid WHERE id = $2::uuid`,
          ledgerEntry.id, correction.id,
        );
        correction.ledger_entry_id = ledgerEntry.id;
      }

      return toBillCorrectionResponse(correction);
    });
  }

  async approve(id: string, approverId: string, dto: DecideCorrectionDto): Promise<BillCorrectionResponseDto> {
    const rows = await this.tenantPrisma.query<BillCorrectionRow>(
      `SELECT * FROM bill_corrections WHERE id = $1::uuid AND deleted_at IS NULL`, id,
    );
    const correction = rows[0];
    if (!correction) throw new NotFoundException(`Correction ${id} not found`);
    if (correction.status !== 'REQUESTED') {
      throw new ConflictException(`Correction ${id} is not pending (status=${correction.status})`);
    }

    return this.ledgerService.withStudentLock(correction.student_id, async (tx) => {
      const [current] = await tx.$queryRawUnsafe<{ status: string }[]>(
        `SELECT status FROM bill_corrections WHERE id = $1::uuid`, id,
      );
      if (current.status !== 'REQUESTED') {
        throw new ConflictException(`Correction ${id} status changed concurrently (now ${current.status})`);
      }

      if (correction.type !== 'CREDIT_NOTE') {
        throw new BadRequestException(`Approval for type ${correction.type} is not yet supported`);
      }

      const amount = toMoney(correction.amount);
      // Re-validated here, not just at request time — REQUESTED reserves
      // nothing, so another write against the same invoice could have
      // landed between request and approve.
      const outstanding = await this.creditableAmount(tx, correction.target_invoice_id!, correction.target_invoice_item_id);
      if (amount.compare(outstanding) > 0) {
        throw new BadRequestException(
          `Cannot approve — credit note amount ${amount.toDb()} now exceeds the outstanding-after-existing-credits amount of ${outstanding.toDb()}`,
        );
      }

      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: correction.student_id,
        academicYearId: correction.academic_year_id,
        entryType: 'CREDIT_NOTE',
        debit: '0',
        credit: amount.toDb(),
        narration: `Credit note ${correction.correction_number}`,
        refDocType: 'bill_correction',
        refDocId: correction.id,
        createdById: approverId,
      });

      const [updated] = await tx.$queryRawUnsafe<BillCorrectionRow[]>(
        `UPDATE bill_corrections SET status = 'APPROVED', decided_by = $2::uuid, decided_at = NOW(),
           decision_note = $3, ledger_entry_id = $4::uuid, updated_at = NOW()
         WHERE id = $1::uuid RETURNING *`,
        id, approverId, dto.note ?? null, ledgerEntry.id,
      );
      return toBillCorrectionResponse(updated);
    });
  }

  async reject(id: string, approverId: string, dto: DecideCorrectionDto): Promise<BillCorrectionResponseDto> {
    const rows = await this.tenantPrisma.query<BillCorrectionRow>(
      `UPDATE bill_corrections SET status = 'REJECTED', decided_by = $2::uuid, decided_at = NOW(),
         decision_note = $3, updated_at = NOW()
       WHERE id = $1::uuid AND status = 'REQUESTED' AND deleted_at IS NULL
       RETURNING *`,
      id, approverId, dto.note ?? null,
    );
    if (rows[0]) return toBillCorrectionResponse(rows[0]);

    const existing = await this.tenantPrisma.query<{ status: string }>(
      `SELECT status FROM bill_corrections WHERE id = $1::uuid AND deleted_at IS NULL`, id,
    );
    if (!existing[0]) throw new NotFoundException(`Correction ${id} not found`);
    throw new ConflictException(`Correction ${id} is not pending (status=${existing[0].status})`);
  }

  /** Delegates entirely to LedgerService.reverse — the correction row itself
   * is untouched (stays APPROVED, ledger_entry_id still points at the
   * ORIGINAL entry); "both entries visible" is the ledger's own
   * reverses_entry_id chain, surfaced by findOne's audit trail. */
  async reverse(id: string, approverId: string): Promise<BillCorrectionResponseDto> {
    const rows = await this.tenantPrisma.query<BillCorrectionRow>(
      `SELECT * FROM bill_corrections WHERE id = $1::uuid AND deleted_at IS NULL`, id,
    );
    const correction = rows[0];
    if (!correction) throw new NotFoundException(`Correction ${id} not found`);
    if (correction.status !== 'APPROVED' || !correction.ledger_entry_id) {
      throw new BadRequestException(`Correction ${id} has no posted ledger entry to reverse`);
    }

    await this.ledgerService.reverse(correction.ledger_entry_id, approverId);
    return toBillCorrectionResponse(correction);
  }

  async findAll(
    query: BillCorrectionQueryDto, callerId?: string, callerRole?: Role,
  ): Promise<{ data: BillCorrectionResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (callerRole === Role.PARENT && callerId) {
      if (query.studentId) {
        await this.assertGuardianOwnsStudent(query.studentId, callerId);
        conditions.push(`student_id = $${idx++}::uuid`);
        params.push(query.studentId);
      } else {
        conditions.push(`student_id IN (SELECT student_id FROM guardians WHERE user_id = $${idx++}::uuid)`);
        params.push(callerId);
      }
    } else if (query.studentId) {
      conditions.push(`student_id = $${idx++}::uuid`);
      params.push(query.studentId);
    }

    if (query.type) { conditions.push(`type = $${idx++}`); params.push(query.type); }
    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillCorrectionRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM bill_corrections
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toBillCorrectionResponse), meta: { page, limit, total } };
  }

  async findOne(
    id: string, callerId?: string, callerRole?: Role,
  ): Promise<BillCorrectionResponseDto & { ledgerEntries: LedgerEntryResponseDto[] }> {
    const rows = await this.tenantPrisma.query<BillCorrectionRow>(
      `SELECT * FROM bill_corrections WHERE id = $1::uuid AND deleted_at IS NULL`, id,
    );
    const correction = rows[0];
    if (!correction) throw new NotFoundException(`Correction ${id} not found`);

    if (callerRole === Role.PARENT && callerId) {
      await this.assertGuardianOwnsStudent(correction.student_id, callerId);
    }

    let ledgerEntries: LedgerEntryResponseDto[] = [];
    if (correction.ledger_entry_id) {
      const entryRows = await this.tenantPrisma.query<LedgerEntryRow>(
        `SELECT * FROM student_ledger_entries WHERE id = $1::uuid OR reverses_entry_id = $1::uuid ORDER BY created_at`,
        correction.ledger_entry_id,
      );
      ledgerEntries = entryRows.map(toLedgerEntryResponse);
    }

    return { ...toBillCorrectionResponse(correction), ledgerEntries };
  }

  /** B6-2: amount ≤ the invoice's (or line's) outstanding-after-existing-credits.
   * Line-level caps against that item's net_amount minus its own prior
   * APPROVED credit notes; invoice-level nets out CLEARED payments too
   * (same "outstanding" definition BillPaymentService already uses). */
  private async creditableAmount(tx: TenantTx, invoiceId: string, itemId: string | null): Promise<Money> {
    if (itemId) {
      const [row] = await tx.$queryRawUnsafe<{ net_amount: string; credited: string }[]>(
        `SELECT bii.net_amount,
                COALESCE((SELECT SUM(bc.amount) FROM bill_corrections bc
                          WHERE bc.target_invoice_item_id = bii.id AND bc.type = 'CREDIT_NOTE' AND bc.status = 'APPROVED'), 0) AS credited
         FROM bill_invoice_items bii WHERE bii.id = $1::uuid`,
        itemId,
      );
      return toMoney(row.net_amount).sub(toMoney(row.credited));
    }

    const [row] = await tx.$queryRawUnsafe<{ total_receivable: string; paid: string; credited: string }[]>(
      `SELECT bi.total_receivable,
              COALESCE((SELECT SUM(bpa.amount) FROM bill_payment_allocations bpa
                        JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                        WHERE bpa.bill_invoice_id = bi.id), 0) AS paid,
              COALESCE((SELECT SUM(bc.amount) FROM bill_corrections bc
                        WHERE bc.target_invoice_id = bi.id AND bc.type = 'CREDIT_NOTE' AND bc.status = 'APPROVED'), 0) AS credited
       FROM bill_invoices bi WHERE bi.id = $1::uuid`,
      invoiceId,
    );
    return toMoney(row.total_receivable).sub(toMoney(row.paid)).sub(toMoney(row.credited));
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
