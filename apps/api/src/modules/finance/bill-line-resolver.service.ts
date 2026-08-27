import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { bsToAd, daysInBsMonth } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { StudentFeeStructureAssignmentService } from './student-fee-structure-assignment.service';
import { FeePreviewService } from './fee-preview.service';
import { Money } from '../../common/money/money';
import { toMoney, toAdString } from './entities/finance.entity';
import { bsOf } from './ledger.util';
import { formatLocalDate } from '../common/utils/date.util';
import { errorBody } from '../common/errors/error-codes';
import { reconcileItemsToFootTarget, FOOTING_TOLERANCE } from './bill-footing.util';

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
 * D5-PRORATION-PRECISION. `daysBilled / daysInMonth` computed as a plain JS
 * division is a binary double — the one inexact input this file's whole
 * money chain used to have (BILLING-CALC-AUDIT-1 D5). `daysBilled` and
 * `daysInMonth` are themselves always small exact integers (never more than
 * 32), so `amount.mul(daysBilled).div(daysInMonth)` has no such
 * intermediate: Money never rounds between chained operations — its one
 * rounding step lives only in `toDb()`/`toNumber()` — so this is exact to
 * decimal.js's own internal precision, which is far beyond the 2dp this
 * ultimately rounds to. Same shape this file's own `percentOf` (on `Money`
 * itself) already uses for exact fractional scaling — `mul(x).div(y)`, not
 * a precomputed ratio.
 *
 * `daysBilled === daysInMonth` (the whole month, not actually prorated)
 * short-circuits to the identity rather than computing `.mul(n).div(n)` —
 * not required for exactness (division of a value by itself is exact in
 * decimal.js too), just cheaper and makes the "untouched" case textually
 * obvious.
 */
export function prorate(amount: Money, daysBilled: number, daysInMonth: number): Money {
  return daysBilled === daysInMonth ? amount : amount.mul(daysBilled).div(daysInMonth);
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
 * The whole-bill concession IS prorated by the same day count as per-head
 * MONTHLY amounts (BILL-4-ZERONET-CRASH root cause #1, BILL-BUGS.md) — this
 * docstring previously said otherwise; that was stale the moment that fix
 * landed, not a second, still-open gap.
 *
 * D5-PRORATION-PRECISION: proration is applied via `prorate()` above
 * (`amount.mul(daysBilled).div(daysInMonth)`), never via a precomputed
 * `daysBilled / daysInMonth` JS number — that ratio was the one binary-double
 * intermediate in this file's entire money chain.
 *
 * D13-CLUSTER-FOOTING (was TRANSPORT-ITEM's "simple version" ruling, logged
 * must-resolve-before-BILL-8 and left open when BILL-8 shipped its own
 * render-time-only plug, `bill-pdf.util.ts::apportionWholeBillConcession`,
 * instead): items are reconciled to the header's own pre-tax net via
 * `reconcileItemsToFootTarget` (`bill-footing.util.ts`) right below, so a
 * NEW invoice's STORED items already foot — BILL-8's plug now has nothing
 * left to do for a new invoice and stays only for the already-posted rows
 * from before this fix, which are immutable and are not rewritten.
 *
 * TRANSPORT-ITEM: transport gets its own item (transportRouteId set,
 * feeHeadId null — mirrors the CHECK constraint on bill_invoice_items),
 * unprorated (it has no fee_heads.proration_policy to key on) and its own
 * concessionAmount starts at 0 before whole-bill reconciliation, same as
 * every other item — reconciliation is what gives it a real share.
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
    // D5-PRORATION-PRECISION: tracked as the integer day count, never as a
    // precomputed daysBilled/daysInMonth ratio — see prorate() above.
    // Defaults to the whole month (prorate()'s identity case) when the
    // assignment covers the full period.
    let daysBilled = daysInMonth;
    const effectiveFromAd = toAdString(assignment.effective_from);
    if (effectiveFromAd > periodStart) {
      const dayOfMonth = bsOf(effectiveFromAd).day;
      daysBilled = daysInMonth - dayOfMonth + 1;
      prorationNote = `${daysBilled}/${daysInMonth} days`;
    }

    const preview = await this.feePreviewService.preview(studentId, { academicYearId, asOfDate: periodEnd });

    // BILL-SOFTDEL-1 D4. Every id here came out of preview(), which now halts
    // on a retired head — so the filter below can only bite in the narrow race
    // where a head is retired BETWEEN those two queries. It is kept anyway
    // because of what the old code did with a missing row: `meta?.is_taxable`
    // silently resolved to false and `meta?.recurrence` to null, so a head that
    // vanished mid-resolve was billed as untaxed rather than noticed. Filter
    // plus completeness check is what makes this fail instead of drift.
    const feeHeadIds = preview.heads.map((h) => h.feeHeadId);
    const feeHeadMeta = feeHeadIds.length
      ? await this.tenantPrisma.query<FeeHeadMeta>(
          `SELECT id, is_taxable, recurrence, proration_policy FROM fee_heads
            WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
          feeHeadIds,
        )
      : [];
    const metaMap = new Map(feeHeadMeta.map((m) => [m.id, m]));
    const missingMeta = feeHeadIds.filter((id) => !metaMap.has(id));
    if (missingMeta.length > 0) {
      throw new UnprocessableEntityException(
        errorBody(
          'FEE_HEAD_UNAVAILABLE',
          'A fee head in this fee structure was retired while the bill was being resolved. ' +
            'Nothing was billed — run it again.',
          { studentId, feeHeadIds: missingMeta },
        ),
      );
    }

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
      const billedDays = isMonthly ? daysBilled : daysInMonth;

      const gross = prorate(toMoney(head.grossAmount), billedDays, daysInMonth);
      const net = prorate(toMoney(head.netAmount), billedDays, daysInMonth);
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

    // Prorated by the same day count as per-head MONTHLY amounts (BILL-BUGS.md
    // BILL-4-WHOLEBILL-CONCESSION-PRORATION). FeePreviewService computes this
    // amount against the UNPRORATED head totals — it has no concept of this
    // resolver's own day-fraction. Left unscaled, an assignment starting near
    // the end of the period (gross prorated down close to zero) could still
    // have a whole-bill concession applied at FULL strength, clamping net to
    // (wrongly) zero — the same `daysBilled` already used for MONTHLY heads
    // above keeps the concession consistent with the gross it discounts.
    const wholeBillConcessionTotal = preview.wholeBillConcessions.reduce(
      (acc, c) => acc.add(prorate(toMoney(c.amount), daysBilled, daysInMonth)), Money.zero(),
    );

    const grossFinal = grossHeadTotal.add(transportAmount);
    const concessionFinal = concessionHeadTotal.add(wholeBillConcessionTotal);
    const netPreTax = clampNonNegative(grossFinal.sub(concessionFinal));

    const taxRateValue = activeTaxRate ? toMoney(activeTaxRate.rate).toNumber() : null;
    const taxAmount = activeTaxRate ? taxableBaseTotal.percentOf(taxRateValue as number) : Money.zero();
    const net = netPreTax.add(taxAmount);

    // D13-CLUSTER-FOOTING (D13/D34). `items` were built above with only
    // their HEAD-level concession subtracted — the whole-bill concession
    // above is a header-only figure that no item has felt yet, and each
    // item's own individual rounding can drift a paisa from the aggregate
    // total rounded separately. Reconcile items to the header's own
    // pre-tax net (never to `net` itself — tax is a header-only figure
    // with no line of its own, matching the print layer's `subtotal =
    // net - tax` convention and collection-report.service.ts's own
    // documented rule) so a NEW invoice's stored items already foot,
    // instead of relying on BILL-8's render-time plug to paper over it.
    const netPreTaxRounded = Money.fromDb(netPreTax.toDb());
    const { items: footedItems, residual } = reconcileItemsToFootTarget(items, netPreTaxRounded);

    // Cannot fire through this call site: `netPreTaxRounded` is already
    // clamped non-negative above, and reconcileItemsToFootTarget's own spec
    // proves `residual` is exactly zero for every target >= 0 (its docstring
    // has the full argument). Even D8's overshoot condition — a
    // misconfigured concession that already exceeds the bill — is absorbed
    // gracefully: the header floors at net=0, and reconciliation drives every
    // item to net=0 too, footing exactly. Kept as a real assertion, not a
    // comment, because it is the backstop for an invariant this file does
    // not fully control (FeePreviewService's own per-head clamp) — if a
    // future change ever lets `netPreTax` go negative, this is what turns
    // that into a named FAILED line instead of a silently non-footing
    // invoice, the same "fail the run, don't skip the line" doctrine
    // BILL-SOFTDEL-1 and D14 (below) already use for this module.
    if (residual.compare(FOOTING_TOLERANCE) > 0 || residual.compare(FOOTING_TOLERANCE.negate()) < 0) {
      throw new UnprocessableEntityException(
        errorBody(
          'FOOTING_MISMATCH',
          `This student's fee items could not be reconciled to the invoice total ` +
            `(${residual.toDb()} unattributed after concessions). This usually means a ` +
            `concession or override exceeds what this bill can absorb — check the student's ` +
            `concessions and overrides for this period.`,
          { studentId, residual: residual.toDb() },
        ),
      );
    }

    return {
      outcome: 'DRAFT',
      skipReason: null,
      gross: grossFinal.toNumber(),
      concession: concessionFinal.toNumber(),
      taxableBase: taxableBaseTotal.toNumber(),
      taxRate: taxRateValue,
      taxAmount: taxAmount.toNumber(),
      net: net.toNumber(),
      items: footedItems,
    };
  }
}
