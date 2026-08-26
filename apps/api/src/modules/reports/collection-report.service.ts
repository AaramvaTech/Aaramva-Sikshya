import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { resolveRange } from './report.util';
import { toMoney } from '../finance/entities/finance.entity';

/**
 * BILL-9 §3 — collection summary: "where did the money come from" over a
 * date range, either by method or by fee head. `bill_payments.status =
 * 'CLEARED'` is the one gate for both breakdowns (B9-1: a PENDING cheque is
 * not collection). Reads bill_payments/bill_payment_allocations/
 * bill_invoice_items directly — new-system rail only (B9-7).
 *
 * Fee-head breakdown prorates each CLEARED allocation across the invoice's
 * line items by their share of `net_amount` (SQL-side, B9-6).
 *
 * D15-REPOINT: the denominator was `total_receivable`, justified above (in
 * text now removed) as deliberately leaving carry-over money unattributed.
 * That justification died with ALLOCATION-CAP-1: an allocation is now capped
 * at the invoice's own `net_amount`, so no allocation money reaches
 * `previous_balance` any more — there is no carry-over portion left to carve
 * out. Dividing by `total_receivable` therefore stopped being a carve-out
 * and became a straight under-count, shrinking every head's share by the
 * ratio net_amount/total_receivable on any invoice with arrears.
 *
 * The denominator is `bi.net_amount`, NOT `SUM(ii.net_amount)`. Those differ
 * by `tax_amount` (`net = (gross - concession) + tax`, and tax is a header
 * figure with no line of its own), so weights sum to
 * `(net_amount - tax_amount) / net_amount`, not to 1. That residual is
 * correct and deliberate: tax is not a fee head, and money that paid tax
 * must not be attributed to one. So the fee-head breakdown still sums to
 * less than `totalCollected` when tax is nonzero — a real carve-out, unlike
 * the one this replaces. The method breakdown always sums to the total
 * exactly (spec §6 test 4) since it has no such carve-out.
 */
const GROUP_BYS = ['method', 'feehead'] as const;
type GroupBy = (typeof GROUP_BYS)[number];

interface TotalRow {
  total: string;
}
interface MethodRow {
  method: string;
  total: string;
  count: string;
}
interface FeeHeadRow {
  head_id: string;
  item_name: string;
  total: string | null;
}

@Injectable()
export class CollectionReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getCollection(params: { from?: string; to?: string; groupBy?: string }) {
    const { from, to } = resolveRange(params.from, params.to);
    const groupBy: GroupBy = (GROUP_BYS as readonly string[]).includes(params.groupBy ?? '')
      ? (params.groupBy as GroupBy)
      : 'method';

    const [totalRow] = await this.tenantPrisma.query<TotalRow>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM bill_payments
       WHERE status = 'CLEARED' AND received_date BETWEEN $1::date AND $2::date`,
      from,
      to,
    );
    const totalCollected = toMoney(totalRow?.total ?? 0).toNumber();

    let breakdown: { key: string; label: string; total: number; count?: number }[];
    if (groupBy === 'method') {
      const rows = await this.tenantPrisma.query<MethodRow>(
        `SELECT method, SUM(amount) AS total, COUNT(*) AS count
         FROM bill_payments
         WHERE status = 'CLEARED' AND received_date BETWEEN $1::date AND $2::date
         GROUP BY method
         ORDER BY method`,
        from,
        to,
      );
      breakdown = rows.map((r) => ({
        key: r.method,
        label: r.method,
        total: toMoney(r.total).toNumber(),
        count: parseInt(r.count, 10),
      }));
    } else {
      // A line item is either a fee head (fee_head_id set) or a transport
      // route (transport_route_id set, TRANSPORT-ITEM/0023) — never both
      // (chk_bill_invoice_items_one_kind). COALESCE gives one grouping key
      // across both kinds; item_name already carries the right display
      // label either way (0023 renamed the column for exactly this reason).
      const rows = await this.tenantPrisma.query<FeeHeadRow>(
        `SELECT COALESCE(ii.fee_head_id, ii.transport_route_id) AS head_id, ii.item_name,
                -- D15-REPOINT: divide by the invoice's OWN charge, never
                -- total_receivable — see the docblock above for why, and for
                -- why this is net_amount rather than SUM(ii.net_amount).
                SUM(bpa.amount * ii.net_amount / NULLIF(bi.net_amount, 0)) AS total
         FROM bill_payment_allocations bpa
         JOIN bill_payments bp ON bp.id = bpa.bill_payment_id
           AND bp.status = 'CLEARED' AND bp.received_date BETWEEN $1::date AND $2::date
         JOIN bill_invoices bi ON bi.id = bpa.bill_invoice_id
         JOIN bill_invoice_items ii ON ii.bill_invoice_id = bi.id
         GROUP BY COALESCE(ii.fee_head_id, ii.transport_route_id), ii.item_name
         ORDER BY total DESC NULLS LAST`,
        from,
        to,
      );
      breakdown = rows.map((r) => ({
        key: r.head_id,
        label: r.item_name,
        total: toMoney(r.total ?? 0).toNumber(),
      }));
    }

    return { range: { from, to }, groupBy, totalCollected, breakdown };
  }
}
