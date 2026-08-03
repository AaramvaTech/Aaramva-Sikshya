import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { LedgerService } from './ledger.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { todayAdInNepal } from '../common/utils/date.util';
import { pickApplicableRule, computeTotalFine, FineRule } from './bill-fine.util';
import {
  BillFineAccrualRow, BillFineRunRow, BillFineAccrualResponseDto, BillFineRunResponseDto,
  toBillFineAccrualResponse, toBillFineRunResponse,
} from './entities/bill-fine.entity';
import { BillFineRunQueryDto } from './dto/bill-fine.dto';

interface CandidateInvoice {
  invoice_id: string;
  student_id: string;
  academic_year_id: string;
  fee_head_ids: string[];
}

/**
 * BILL-7-SPEC.md §3/§4/§7 Checkpoint A. Mirrors BillRunPostRunnerService's
 * shape: an outer read-only query gathers candidates, each candidate is
 * processed in its OWN LedgerService.withStudentLock transaction, and a
 * per-invoice try/catch means one bad invoice never aborts the run. The
 * DB's own UNIQUE(bill_invoice_id, accrued_through) constraint (migration
 * 0030) is the B7-10 idempotency backstop — a concurrent double-run's
 * losing transaction is rolled back by Postgres itself the moment its
 * INSERT hits that constraint (a failed statement aborts the whole
 * transaction; a JS-level try/catch around just the INSERT would not save
 * it), not by any application-level guard in this file.
 */
@Injectable()
export class BillFineService {
  private readonly logger = new Logger(BillFineService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  async runLateFees(
    triggeredBy: 'SCHEDULED' | 'MANUAL',
    triggeredByUserId: string | null,
  ): Promise<BillFineRunResponseDto> {
    const today = todayAdInNepal();

    const [run] = await this.tenantPrisma.query<BillFineRunRow>(
      `INSERT INTO bill_fine_runs (triggered_by, triggered_by_user_id, run_date, status)
       VALUES ($1, $2::uuid, $3::date, 'RUNNING')
       RETURNING *`,
      triggeredBy, triggeredByUserId, today,
    );

    try {
      const rules = await this.fetchEnabledRules(today);

      let invoicesScanned = 0;
      let invoicesFined = 0;
      let totalFinePosted = Money.zero();

      if (rules.length > 0) {
        const candidates = await this.fetchCandidateInvoices(today);
        invoicesScanned = candidates.length;

        for (const candidate of candidates) {
          const applicable = pickApplicableRule(rules, candidate.fee_head_ids ?? []);
          if (!applicable) continue;

          try {
            const posted = await this.processInvoice(candidate, applicable, today, run.id, triggeredByUserId);
            if (posted) {
              invoicesFined++;
              totalFinePosted = totalFinePosted.add(posted);
            }
          } catch (err) {
            this.logger.error(`Fine run ${run.id}: invoice ${candidate.invoice_id} failed`, err as Error);
          }
        }
      }

      const [updated] = await this.tenantPrisma.query<BillFineRunRow>(
        `UPDATE bill_fine_runs
         SET status = 'COMPLETED', finished_at = NOW(),
             invoices_scanned = $2, invoices_fined = $3, total_fine_posted = $4::numeric
         WHERE id = $1::uuid
         RETURNING *`,
        run.id, invoicesScanned, invoicesFined, totalFinePosted.toDb(),
      );
      return toBillFineRunResponse(updated);
    } catch (err) {
      await this.tenantPrisma.execute(
        `UPDATE bill_fine_runs SET status = 'FAILED', finished_at = NOW() WHERE id = $1::uuid`,
        run.id,
      );
      throw err;
    }
  }

  async findRuns(
    query: BillFineRunQueryDto,
  ): Promise<{ data: BillFineRunResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<BillFineRunRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM bill_fine_runs
       ORDER BY started_at DESC
       LIMIT $1 OFFSET $2`,
      limit, offset,
    );
    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toBillFineRunResponse), meta: { page, limit, total } };
  }

  /** B7-9. The accrual row itself is untouched (immutable history) — only
   * LedgerService.reverse is invoked, mirroring BillCorrectionService.reverse
   * exactly: "both entries visible" is the ledger's own reverses_entry_id
   * chain, not a status flag on this table. */
  async reverseAccrual(id: string, approverId: string): Promise<BillFineAccrualResponseDto> {
    const rows = await this.tenantPrisma.query<BillFineAccrualRow>(
      `SELECT * FROM bill_fine_accruals WHERE id = $1::uuid`, id,
    );
    const accrual = rows[0];
    if (!accrual) throw new NotFoundException(`Fine accrual ${id} not found`);

    await this.ledgerService.reverse(accrual.ledger_entry_id, approverId);
    return toBillFineAccrualResponse(accrual);
  }

  private async fetchEnabledRules(today: string): Promise<FineRule[]> {
    const rows = await this.tenantPrisma.query<{
      id: string; scope: string; fee_head_id: string | null; type: string;
      value: string; grace_days: number; cap_amount: string | null;
      effective_from: Date | string;
    }>(
      `SELECT id, scope, fee_head_id, type, value, grace_days, cap_amount, effective_from
       FROM late_fee_rules
       WHERE is_enabled = true AND deleted_at IS NULL
         AND effective_from <= $1::date
         AND (effective_to IS NULL OR effective_to >= $1::date)`,
      today,
    );
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope as 'GLOBAL' | 'FEE_HEAD',
      feeHeadId: r.fee_head_id,
      type: r.type as 'FLAT' | 'PER_DAY' | 'PERCENT',
      value: toMoney(r.value),
      graceDays: r.grace_days,
      capAmount: r.cap_amount != null ? toMoney(r.cap_amount) : null,
      effectiveFrom: r.effective_from instanceof Date ? r.effective_from.toISOString().split('T')[0] : r.effective_from,
    }));
  }

  /** B7-2's first half (past due + active status) — the outstanding>0 half
   * of B7-2 and the grace check are re-verified freshly per-invoice inside
   * the lock in processInvoice, which is the authoritative check. */
  private async fetchCandidateInvoices(today: string): Promise<CandidateInvoice[]> {
    return this.tenantPrisma.query<CandidateInvoice>(
      `SELECT bi.id AS invoice_id, bi.student_id, bi.academic_year_id,
              COALESCE(
                (SELECT ARRAY_AGG(DISTINCT bii.fee_head_id) FROM bill_invoice_items bii WHERE bii.bill_invoice_id = bi.id),
                ARRAY[]::uuid[]
              ) AS fee_head_ids
       FROM bill_invoices bi
       WHERE bi.deleted_at IS NULL
         AND bi.status NOT IN ('VOIDED','SETTLED')
         AND bi.due_date < $1::date`,
      today,
    );
  }

  /** Returns the Money delta posted, or null if nothing was posted (in
   * grace, settled, or already fully accrued — B7-1's compute-total-post-
   * delta). Every read here is fresh, taken INSIDE the per-student lock —
   * mirrors BillCorrectionService.creditableAmount's "never trust the
   * cache for a money decision" discipline. */
  private async processInvoice(
    candidate: CandidateInvoice,
    rule: FineRule,
    today: string,
    runId: string,
    postedById: string | null,
  ): Promise<Money | null> {
    return this.ledgerService.withStudentLock(candidate.student_id, async (tx: TenantTx) => {
      const [state] = await tx.$queryRawUnsafe<{ days_overdue: number; outstanding: string; already_posted: string }[]>(
        `SELECT
           ($2::date - bi.due_date) AS days_overdue,
           bi.total_receivable
             - COALESCE((SELECT SUM(bpa.amount) FROM bill_payment_allocations bpa
                         JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                         WHERE bpa.bill_invoice_id = bi.id), 0)
             - COALESCE((SELECT SUM(bc.amount) FROM bill_corrections bc
                         WHERE bc.target_invoice_id = bi.id AND bc.type IN ('CREDIT_NOTE','WRITE_OFF') AND bc.status = 'APPROVED'), 0)
             AS outstanding,
           COALESCE((SELECT SUM(bfa.delta_posted) FROM bill_fine_accruals bfa
                     WHERE bfa.bill_invoice_id = bi.id
                       AND NOT EXISTS (SELECT 1 FROM student_ledger_entries sle WHERE sle.reverses_entry_id = bfa.ledger_entry_id)
                    ), 0) AS already_posted
         FROM bill_invoices bi
         WHERE bi.id = $1::uuid`,
        candidate.invoice_id, today,
      );
      if (!state) return null;

      const daysOverdue = state.days_overdue;
      if (daysOverdue <= rule.graceDays) return null; // B7-2: still in grace

      const outstanding = toMoney(state.outstanding);
      if (outstanding.compare(Money.zero()) <= 0) return null; // B7-2: settled

      const alreadyPosted = toMoney(state.already_posted);
      const totalFine = computeTotalFine(rule, daysOverdue, outstanding);
      const delta = totalFine.sub(alreadyPosted);
      if (delta.compare(Money.zero()) <= 0) return null; // B7-1: fully accrued already, or capped

      // Checkpoint A only ever calls this with 'MANUAL' (always a real user
      // id from the controller) — a null actor can't happen yet. Guarded
      // rather than typed as non-null so the signature stays honest for
      // Checkpoint B's SCHEDULED path, which still needs its own
      // system-actor design (out of scope here).
      if (!postedById) {
        throw new Error('Cannot post a late fee without an acting user id');
      }

      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId: candidate.student_id,
        academicYearId: candidate.academic_year_id,
        entryType: 'FINE',
        debit: delta.toDb(),
        credit: '0',
        narration: `Late fee — ${daysOverdue} day(s) overdue`,
        refDocType: 'bill_invoice',
        refDocId: candidate.invoice_id,
        createdById: postedById,
      });

      await tx.$queryRawUnsafe(
        `INSERT INTO bill_fine_accruals
           (bill_invoice_id, student_id, late_fee_rule_id, accrued_through, days_overdue,
            total_fine, delta_posted, rule_type_snapshot, rule_value_snapshot, rule_cap_snapshot,
            ledger_entry_id, fine_run_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5,
                 $6::numeric, $7::numeric, $8, $9::numeric, $10::numeric,
                 $11::uuid, $12::uuid)
         RETURNING *`,
        candidate.invoice_id, candidate.student_id, rule.id, today, daysOverdue,
        totalFine.toDb(), delta.toDb(), rule.type, rule.value.toDb(), rule.capAmount ? rule.capAmount.toDb() : null,
        ledgerEntry.id, runId,
      );

      return delta;
    });
  }
}
