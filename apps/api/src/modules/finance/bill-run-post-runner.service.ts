import { Injectable, Logger } from '@nestjs/common';
import { adToBs } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { LedgerService } from './ledger.service';
import { BillLineResolverService } from './bill-line-resolver.service';
import { FinanceSettingsService } from './finance-settings.service';
import { toMoney } from './entities/finance.entity';
import { amountInWords } from '../../common/money/amount-in-words';
import { todayAdInNepal } from '../common/utils/date.util';
import { buildInvoiceSequenceKey, buildInvoiceNumber, fiscalYearBs } from './bill-post.util';
import { planAdvanceConsumption } from './bill-advance-consumption.util';
import { BillRunRow } from './entities/bill-run.entity';

/**
 * BILL-4-SPEC.md §3 "Post" + §4 (the ledger-posting invariant). For each
 * DRAFT line, in one per-student transaction under the per-student advisory
 * lock (LedgerService.withStudentLock): assign an invoice number (R13
 * sequence, reset-policy-aware as of Checkpoint C), snapshot the previous
 * balance, insert bill_invoice + bill_invoice_items, insert exactly one
 * INVOICE ledger entry (via postEntryInTx, composed into THIS transaction
 * rather than opening a second one), then mark the line POSTED.
 *
 * The invoice's HEADER amounts (gross/concession/tax/net) are read from
 * `bill_run_lines` — frozen at DRAFT time by BillLineResolverService via
 * BillRunService, so posting reflects exactly what the accountant reviewed
 * even if catalog/tax data changed since (B4-6). Only the ITEM breakdown
 * (`bill_invoice_items`, plus the `taxable_base`/`tax_rate` display columns)
 * is re-derived via a fresh BillLineResolverService.resolve() call — mirrors
 * Checkpoint B's own split (there: a fresh FeePreviewService call for items
 * only), since bill_run_lines has no column to freeze per-head detail into.
 *
 * A student who fails does not abort the rest of the run (mirrors
 * BulkAssignRunnerService's per-item tolerance). Re-posting a run re-selects
 * `WHERE outcome = 'DRAFT'` fresh each time, so already-POSTED lines are
 * never re-attempted — the resumability the spec asks for, with no separate
 * progress-counter bookkeeping needed.
 *
 * Deliberately NOT retried automatically: a line already marked FAILED.
 * "Re-posting the run picks up only non-posted lines" is satisfied for the
 * DRAFT case (this checkpoint's proof); building an explicit FAILED-retry
 * path is out of this checkpoint's scope too — see BILL-BUGS.md.
 */
@Injectable()
export class BillRunPostRunnerService {
  private readonly logger = new Logger(BillRunPostRunnerService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly ledgerService: LedgerService,
    private readonly billLineResolverService: BillLineResolverService,
    private readonly financeSettingsService: FinanceSettingsService,
  ) {}

  /** Drains every POSTING run in the CURRENT tenant. Call inside tenantContext.run(). */
  async drainCurrentTenant(): Promise<{ runsProcessed: number; linesPosted: number; linesFailed: number }> {
    const runs = await this.tenantPrisma.query<BillRunRow>(
      `SELECT * FROM bill_runs WHERE status = 'POSTING' ORDER BY created_at`,
    );

    let runsProcessed = 0;
    let linesPosted = 0;
    let linesFailed = 0;
    for (const run of runs) {
      try {
        const result = await this.postRun(run);
        linesPosted += result.posted;
        linesFailed += result.failed;
        runsProcessed++;
      } catch (err) {
        // Left in POSTING — the next poller tick retries the whole run.
        this.logger.error(`Bill run ${run.id} drain failed`, err as Error);
      }
    }
    return { runsProcessed, linesPosted, linesFailed };
  }

  private async postRun(run: BillRunRow): Promise<{ posted: number; failed: number }> {
    const lines = await this.tenantPrisma.query<{ id: string; student_id: string }>(
      `SELECT id, student_id FROM bill_run_lines WHERE bill_run_id = $1::uuid AND outcome = 'DRAFT'`,
      run.id,
    );

    // Fetched once per run, not per line — a whole-school run could be
    // thousands of lines and this setting can't change mid-run anyway.
    const { invoiceNumberingReset } = await this.financeSettingsService.getInvoiceNumberingReset();

    let posted = 0;
    let failed = 0;
    for (const line of lines) {
      try {
        await this.postLine(run, line.id, line.student_id, invoiceNumberingReset);
        posted++;
      } catch (err) {
        failed++;
        this.logger.error(`Bill run ${run.id} line ${line.id} failed to post`, err as Error);
        await this.tenantPrisma.execute(
          `UPDATE bill_run_lines SET outcome = 'FAILED', skip_reason = $2 WHERE id = $1::uuid`,
          line.id, (err as Error).message,
        );
      }
    }

    // Every line found above has now been attempted (POSTED or FAILED) —
    // the run is done, regardless of any FAILED lines (per-line outcome is
    // independent of run-level status; the enum has no run-level FAILED).
    await this.tenantPrisma.execute(
      `UPDATE bill_runs SET status = 'POSTED', posted_at = NOW() WHERE id = $1::uuid AND status = 'POSTING'`,
      run.id,
    );

    return { posted, failed };
  }

  private async postLine(
    run: BillRunRow,
    lineId: string,
    studentId: string,
    invoiceNumberingReset: boolean,
  ): Promise<void> {
    const { slug } = this.tenantContext.getOrThrow();
    // Guaranteed by BillRunService.requestPost (posted_by is set in the same
    // write that transitions a run to POSTING) — narrowed defensively so a
    // violated invariant becomes a FAILED line, not a runtime crash.
    const postedBy = run.posted_by;
    if (!postedBy) throw new Error(`Bill run ${run.id} has no posted_by — cannot attribute this invoice`);

    // Read-only work happens BEFORE the per-student lock — it doesn't write
    // anything, so it doesn't need to participate in the locked transaction.
    // Re-derives the ITEM breakdown only; header amounts come from
    // bill_run_lines below (frozen at draft time).
    const resolved = await this.billLineResolverService.resolve(
      studentId, run.academic_year_id, run.bs_year, run.bs_month,
    );
    // Defensive: B4-6 assumes nothing changes between draft and post, but if
    // it does (e.g. the assignment was deleted/corrected in between), the
    // fresh resolve() no longer returning DRAFT must become a FAILED line —
    // never a silently-posted zero-value invoice.
    if (resolved.outcome !== 'DRAFT') {
      throw new Error(resolved.skipReason ?? 'Fee resolution no longer returns DRAFT at post time');
    }

    const todayBs = adToBs(new Date(todayAdInNepal()));
    const fiscalYear = fiscalYearBs(todayBs.year, todayBs.month);

    await this.ledgerService.withStudentLock(studentId, async (tx) => {
      const [line] = await tx.$queryRawUnsafe<{ outcome: string; gross: string; concession: string; tax: string; net: string }[]>(
        `SELECT outcome, gross, concession, tax, net FROM bill_run_lines WHERE id = $1::uuid`,
        lineId,
      );
      if (!line || line.outcome !== 'DRAFT') return; // already handled — idempotency safety net

      const [{ sum }] = await tx.$queryRawUnsafe<{ sum: string }[]>(
        `SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS sum FROM student_ledger_entries WHERE student_id = $1::uuid`,
        studentId,
      );
      const previousBalance = toMoney(sum);

      const seqKey = buildInvoiceSequenceKey(slug, invoiceNumberingReset, fiscalYear);
      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ($1, 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        seqKey,
      );
      const invoiceNumber = buildInvoiceNumber(invoiceNumberingReset, todayBs.year, fiscalYear, seqRow.value);

      // Frozen at draft time (bill_run_lines) — includes tax already, since
      // BillLineResolverService computes net = (gross - concession) + tax.
      const gross = toMoney(line.gross);
      const concession = toMoney(line.concession);
      const taxAmount = toMoney(line.tax);
      const netAmount = toMoney(line.net);
      const totalReceivable = netAmount.add(previousBalance);
      const amountEn = amountInWords(netAmount, 'en');
      const amountNe = amountInWords(netAmount, 'ne');

      const [invoice] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO bill_invoices
           (invoice_number, student_id, academic_year_id, bill_run_id, bs_year, bs_month,
            issue_date, due_date, gross_amount, concession_amount, taxable_base,
            tax_rate, tax_amount, net_amount, previous_balance, total_receivable,
            amount_in_words_en, amount_in_words_ne, status, created_by)
         VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6,
                 $7::date, $8::date, $9, $10, $11,
                 $12, $13, $14, $15, $16,
                 $17, $18, 'POSTED', $19::uuid)
         RETURNING id`,
        invoiceNumber, studentId, run.academic_year_id, run.id, run.bs_year, run.bs_month,
        run.issue_date, run.due_date, gross.toNumber(), concession.toNumber(), resolved.taxableBase,
        resolved.taxRate, taxAmount.toNumber(), netAmount.toNumber(), previousBalance.toNumber(), totalReceivable.toNumber(),
        amountEn, amountNe, postedBy,
      );

      // TRANSPORT-ITEM: resolved.items now includes a transport row (if the
      // student has an active transport assignment) alongside fee-head rows
      // — exactly one of fee_head_id/transport_route_id is set per row, per
      // bill_invoice_items' chk_bill_invoice_items_one_kind CHECK.
      for (const item of resolved.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO bill_invoice_items
             (bill_invoice_id, fee_head_id, transport_route_id, item_name, recurrence,
              gross_amount, concession_amount, is_taxable, net_amount, proration_note)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10)`,
          invoice.id, item.feeHeadId, item.transportRouteId, item.itemName, item.recurrence,
          item.grossAmount, item.concessionAmount, item.isTaxable, item.netAmount, item.prorationNote,
        );
      }

      const ledgerEntry = await this.ledgerService.postEntryInTx(tx, {
        studentId,
        academicYearId: run.academic_year_id,
        entryType: 'INVOICE',
        debit: netAmount.toDb(),
        credit: '0',
        narration: `Invoice ${invoiceNumber}`,
        refDocType: 'bill_invoice',
        refDocId: invoice.id,
        createdById: postedBy,
      });

      await tx.$executeRawUnsafe(
        `UPDATE bill_invoices SET ledger_entry_id = $1::uuid WHERE id = $2::uuid`,
        ledgerEntry.id, invoice.id,
      );

      // B5-4: advance auto-apply. Consumes existing unconsumed CLEARED
      // payments (oldest-first) against this invoice's total_receivable.
      // Deliberately posts ZERO new ledger entries — the money was already
      // credited by its original DEPOSIT/PAYMENT entry; this is a pure
      // bill_payment_allocations insert. BILL-4's own invariant (exactly one
      // INVOICE entry per post) is untouched by construction: nothing above
      // this comment changed, and this step never calls postEntryInTx.
      const advanceCandidates = await tx.$queryRawUnsafe<{ id: string; remaining: string }[]>(
        `SELECT bp.id, bp.amount - COALESCE(SUM(bpa.amount), 0) AS remaining
         FROM bill_payments bp
         LEFT JOIN bill_payment_allocations bpa ON bpa.bill_payment_id = bp.id
         WHERE bp.student_id = $1::uuid AND bp.status = 'CLEARED' AND bp.deleted_at IS NULL
         GROUP BY bp.id, bp.amount, bp.created_at
         HAVING bp.amount - COALESCE(SUM(bpa.amount), 0) > 0
         ORDER BY bp.created_at ASC`,
        studentId,
      );

      if (advanceCandidates.length > 0) {
        const plan = planAdvanceConsumption(
          totalReceivable,
          advanceCandidates.map((r) => ({ billPaymentId: r.id, remaining: toMoney(r.remaining) })),
        );
        for (const consumption of plan.consumptions) {
          await tx.$executeRawUnsafe(
            `INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)
             VALUES ($1::uuid, $2::uuid, $3::numeric)`,
            consumption.billPaymentId, invoice.id, consumption.amount.toDb(),
          );
        }
        if (plan.consumptions.length > 0) {
          await tx.$executeRawUnsafe(
            `UPDATE bill_invoices SET
               status = CASE
                 WHEN total_receivable <= (
                   SELECT COALESCE(SUM(bpa.amount), 0) FROM bill_payment_allocations bpa
                   JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                   WHERE bpa.bill_invoice_id = $1::uuid
                 ) THEN 'SETTLED'
                 WHEN (
                   SELECT COALESCE(SUM(bpa.amount), 0) FROM bill_payment_allocations bpa
                   JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
                   WHERE bpa.bill_invoice_id = $1::uuid
                 ) > 0 THEN 'PARTIALLY_PAID'
                 ELSE 'POSTED'
               END,
               updated_at = NOW()
             WHERE id = $1::uuid`,
            invoice.id,
          );
        }
      }

      await tx.$executeRawUnsafe(
        `UPDATE bill_run_lines SET outcome = 'POSTED', bill_invoice_id = $2::uuid WHERE id = $1::uuid`,
        lineId, invoice.id,
      );
    });
  }
}
