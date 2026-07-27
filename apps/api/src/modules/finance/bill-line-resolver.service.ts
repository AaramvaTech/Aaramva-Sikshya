import { Injectable } from '@nestjs/common';
import { bsToAd, daysInBsMonth } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { StudentFeeStructureAssignmentService } from './student-fee-structure-assignment.service';
import { FeePreviewService } from './fee-preview.service';
import { Money } from '../../common/money/money';
import { toMoney, toAdString } from './entities/finance.entity';
import { bsOf } from './ledger.util';
import { formatLocalDate } from '../common/utils/date.util';

interface FeeHeadMeta {
  id: string;
  is_taxable: boolean;
  recurrence: string;
  proration_policy: string;
}

interface ActiveTaxRate {
  rate: string | number;
  applies_to: string;
}

export interface ResolvedInvoiceItem {
  feeHeadId: string | null;
  transportRouteId: string | null;
  itemName: string;
  recurrence: string | null;
  isTaxable: boolean;
  grossAmount: number;
  concessionAmount: number;
  netAmount: number;
  prorationNote: string | null;
}

export interface ResolvedBillLine {
  outcome: 'DRAFT' | 'SKIPPED_NO_ASSIGNMENT';
  skipReason: string | null;
  gross: number;
  concession: number;
  taxableBase: number;
  taxRate: number | null;
  taxAmount: number;
  net: number;
  items: ResolvedInvoiceItem[];
}

function clampNonNegative(amount: Money): Money {
  return amount.compare(Money.zero()) < 0 ? Money.zero() : amount;
}

/**
 * BILL-4 Checkpoint C: the ONE place proration (B4-5) and tax (R4/B4-9) are
 * computed — shared by BillRunService (draft) and BillRunPostRunnerService
 * (post) so what the accountant previews is exactly what gets posted.
 * Checkpoints A/B called FeePreviewService directly with asOfDate = day 1
 * of the target month; that missed a student whose assignment starts
 * mid-month (findActiveAssignment(day 1) wouldn't find it). This resolver
 * instead finds any assignment overlapping ANY part of the period, uses
 * periodEnd as FeePreviewService's asOfDate (so a mid-period-starting
 * assignment is found by preview()'s OWN internal check too), and prorates
 * only the per-head amounts flagged fee_heads.proration_policy='MONTHLY'.
 *
 * NOT prorated (documented, narrow simplification — see BILL-BUGS.md):
 * whole-bill concessions (FeePreviewService's own computed dollar amount is
 * used as-is, not re-derived against prorated head totals) — this also means
 * a whole-bill concession is never attributed to any single item, including
 * the transport item below, so item nets can sum to less than the header net
 * when both are present (TRANSPORT-ITEM's "simple version" ruling: the
 * header stays correct; per-item apportionment is deferred, logged
 * must-resolve-before-BILL-8, not accepted permanently).
 *
 * TRANSPORT-ITEM: transport gets its own item (transportRouteId set,
 * feeHeadId null — mirrors the CHECK constraint on bill_invoice_items),
 * unprorated (it has no fee_heads.proration_policy to key on) and with
 * concessionAmount always 0 (the "simple version" above).
 */
@Injectable()
export class BillLineResolverService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly assignmentService: StudentFeeStructureAssignmentService,
    private readonly feePreviewService: FeePreviewService,
  ) {}

  async resolve(
    studentId: string,
    academicYearId: string,
    bsYear: number,
    bsMonth: number,
  ): Promise<ResolvedBillLine> {
    const daysInMonth = daysInBsMonth(bsYear, bsMonth);
    const periodStart = formatLocalDate(bsToAd({ year: bsYear, month: bsMonth, day: 1 }));
    const periodEnd = formatLocalDate(bsToAd({ year: bsYear, month: bsMonth, day: daysInMonth }));

    const assignment = await this.assignmentService.findAssignmentOverlappingPeriod(
      studentId, academicYearId, periodStart, periodEnd,
    );
    if (!assignment) {
      return {
        outcome: 'SKIPPED_NO_ASSIGNMENT',
        skipReason: 'No active fee structure assignment for this student in the given academic year',
        gross: 0, concession: 0, taxableBase: 0, taxRate: null, taxAmount: 0, net: 0, items: [],
      };
    }

    let prorationNote: string | null = null;
    let fraction = 1;
    const effectiveFromAd = toAdString(assignment.effective_from);
    if (effectiveFromAd > periodStart) {
      const dayOfMonth = bsOf(effectiveFromAd).day;
      const daysBilled = daysInMonth - dayOfMonth + 1;
      fraction = daysBilled / daysInMonth;
      prorationNote = `${daysBilled}/${daysInMonth} days`;
    }

    const preview = await this.feePreviewService.preview(studentId, { academicYearId, asOfDate: periodEnd });

    const feeHeadIds = preview.heads.map((h) => h.feeHeadId);
    const feeHeadMeta = feeHeadIds.length
      ? await this.tenantPrisma.query<FeeHeadMeta>(
          `SELECT id, is_taxable, recurrence, proration_policy FROM fee_heads WHERE id = ANY($1::uuid[])`,
          feeHeadIds,
        )
      : [];
    const metaMap = new Map(feeHeadMeta.map((m) => [m.id, m]));

    const taxRateRows = await this.tenantPrisma.query<ActiveTaxRate>(
      `SELECT rate, applies_to FROM tax_rates
       WHERE deleted_at IS NULL AND effective_from <= $1::date
         AND (effective_to IS NULL OR effective_to >= $1::date)
       LIMIT 1`,
      periodEnd,
    );
    const activeTaxRate = taxRateRows[0] ?? null;

    let grossHeadTotal = Money.zero();
    let concessionHeadTotal = Money.zero();
    let taxableBaseTotal = Money.zero();

    const feeHeadItems: ResolvedInvoiceItem[] = preview.heads.map((head) => {
      const meta = metaMap.get(head.feeHeadId);
      const isMonthly = meta?.proration_policy === 'MONTHLY';
      const factor = isMonthly ? fraction : 1;

      const gross = toMoney(head.grossAmount).mul(factor);
      const net = toMoney(head.netAmount).mul(factor);
      const concession = gross.sub(net);

      grossHeadTotal = grossHeadTotal.add(gross);
      concessionHeadTotal = concessionHeadTotal.add(concession);

      const isTaxable = !!meta?.is_taxable;
      const taxEligible = activeTaxRate != null
        && (activeTaxRate.applies_to === 'ALL' || (activeTaxRate.applies_to === 'TAXABLE_HEADS' && isTaxable));
      if (taxEligible) taxableBaseTotal = taxableBaseTotal.add(net);

      return {
        feeHeadId: head.feeHeadId,
        transportRouteId: null,
        itemName: head.feeHeadName,
        recurrence: meta?.recurrence ?? null,
        isTaxable,
        grossAmount: gross.toNumber(),
        concessionAmount: concession.toNumber(),
        netAmount: net.toNumber(),
        prorationNote: isMonthly ? prorationNote : null,
      };
    });

    const transportAmount = preview.transport ? toMoney(preview.transport.amount) : Money.zero();
    const transportItem: ResolvedInvoiceItem | null = preview.transport
      ? {
          feeHeadId: null,
          transportRouteId: preview.transport.transportRouteId,
          itemName: preview.transport.transportRouteName,
          recurrence: null,
          isTaxable: false,
          grossAmount: transportAmount.toNumber(),
          concessionAmount: 0,
          netAmount: transportAmount.toNumber(),
          prorationNote: null,
        }
      : null;
    const items: ResolvedInvoiceItem[] = transportItem ? [...feeHeadItems, transportItem] : feeHeadItems;

    const wholeBillConcessionTotal = preview.wholeBillConcessions.reduce(
      (acc, c) => acc.add(toMoney(c.amount)), Money.zero(),
    );

    const grossFinal = grossHeadTotal.add(transportAmount);
    const concessionFinal = concessionHeadTotal.add(wholeBillConcessionTotal);
    const netPreTax = clampNonNegative(grossFinal.sub(concessionFinal));

    const taxRateValue = activeTaxRate ? toMoney(activeTaxRate.rate).toNumber() : null;
    const taxAmount = activeTaxRate ? taxableBaseTotal.percentOf(taxRateValue as number) : Money.zero();
    const net = netPreTax.add(taxAmount);

    return {
      outcome: 'DRAFT',
      skipReason: null,
      gross: grossFinal.toNumber(),
      concession: concessionFinal.toNumber(),
      taxableBase: taxableBaseTotal.toNumber(),
      taxRate: taxRateValue,
      taxAmount: taxAmount.toNumber(),
      net: net.toNumber(),
      items,
    };
  }
}
