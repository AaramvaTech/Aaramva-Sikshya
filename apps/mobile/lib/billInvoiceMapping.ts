import { adToBs, formatBs } from 'bs-calendar';
import type { Invoice, StudentLedger } from '../types';

/**
 * UI-4 Checkpoint B (PAY-UI-REPOINT-discovery.md §4) — bill_invoices field
 * shapes as returned by GET /finance/students/:studentId/bill/invoices
 * (BillInvoiceResponseDto, apps/api/.../entities/bill-invoice.entity.ts).
 * paidAmount/balance already exist on this response as of UI-4 Checkpoint A —
 * the earlier discovery's "blocking backend gap" closed as a side effect.
 */
export interface BillInvoiceItemApi {
  id: string;
  itemName: string;
  grossAmount: number;
  concessionAmount: number;
  netAmount: number;
}

export interface BillInvoiceApi {
  id: string;
  invoiceNumber: string | null;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string;
  academicYearId: string;
  /** The BS period this invoice bills. Already on BillInvoiceResponseDto —
   *  this interface simply never declared it (BILL-CHECKOUT-1). */
  bsYear: number;
  bsMonth: number;
  dueDate: string; // date-only AD string (e.g. "2026-08-15") — no {ad,bs} pair on this rail
  /** This invoice's OWN charge. The figure a parent may be asked to pay. */
  netAmount: number;
  /** Arrears carried in from earlier months. Displayed nowhere on a card —
   *  the account tile shows the student's position, sourced from the ledger. */
  previousBalance: number;
  totalReceivable: number;
  paidAmount: number;
  balance: number;
  status: string; // POSTED | SETTLED | PARTIALLY_PAID | VOIDED
  items?: BillInvoiceItemApi[];
}

/** bill_invoices status -> the mobile UI's legacy FEE_STATUS vocabulary.
 * There's no stored OVERDUE flag on the new rail (BILL-7 treats it as
 * derived: today > due_date, same convention as EDU-2's isPastDue) and no
 * WAIVED analogue at all (a waiver is now a BILL-6 credit-note/write-off
 * correction against the ledger, not an invoice flag) — this mapper never
 * produces WAIVED. Callers filter VOIDED out before this ever runs. */
export function mapBillInvoiceStatus(status: string, dueDate: string, today: Date = new Date()): string {
  if (status === 'SETTLED') return 'PAID';
  if (status === 'PARTIALLY_PAID') return 'PARTIAL';
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  return dueDate < todayStr ? 'OVERDUE' : 'UNPAID';
}

/**
 * BILL-CHECKOUT-1 — this invoice's OWN balance: its own charge less the
 * payments booked against it, floored at zero.
 *
 * The floor is not cosmetic. A negative result means cleared allocations
 * exceed this invoice's own charge — the invoice breaches the allocation cap
 * (BILLING-CALC-AUDIT-1 Ruling 3). The server logs a WARN naming the invoice
 * when it sees the same thing at checkout; here there is no logger to reach,
 * and a negative Pay button is worse than a hidden one, so the card simply
 * stops offering payment. The server is the authority either way — it
 * recomputes this independently and would refuse the charge.
 */
export function ownBalanceOf(inv: Pick<BillInvoiceApi, 'netAmount' | 'paidAmount'>): number {
  return Math.max(inv.netAmount - inv.paidAmount, 0);
}

export function mapBillInvoiceToLegacy(inv: BillInvoiceApi, today?: Date): Invoice {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber ?? '',
    studentId: inv.studentId,
    academicYearId: inv.academicYearId,
    period: { bsYear: inv.bsYear, bsMonth: inv.bsMonth },
    dueDate: { ad: inv.dueDate, bs: formatBs(adToBs(new Date(inv.dueDate)), 'en') },
    status: mapBillInvoiceStatus(inv.status, inv.dueDate, today),
    // The new rail has no single invoice-level subtotal/discount figure the
    // way the old `invoices` table did (concession is per-item); the own
    // charge is the only reliable analogue for both.
    subtotal: inv.netAmount,
    discountAmount: 0,
    // BILL-7 fines aren't exposed on this endpoint yet — 0, not fabricated.
    // Under own-charge they never will be: a late fee is a ledger entry with
    // no invoice row, so it reaches the parent through the account tile's
    // statement drill-down, not through any card. Whether a fine should
    // produce a document line of its own is BILL-7's call.
    fineAmount: 0,
    // netAmount, NOT totalReceivable. totalReceivable is netAmount plus every
    // earlier unpaid month; charging it gets the same arrears collected twice
    // (BILLING-CALC-AUDIT-1 D32, confirmed live). Arrears stay visible because
    // each unpaid month is already its own card — the list IS the arrears.
    totalAmount: inv.netAmount,
    paidAmount: inv.paidAmount,
    balance: ownBalanceOf(inv),
    items: inv.items?.map((it) => ({
      id: it.id,
      feeCategoryName: it.itemName,
      originalAmount: it.grossAmount,
      discountedAmount: it.netAmount,
    })),
  };
}

/** Builds the legacy StudentLedger shape fees.tsx renders. VOIDED invoices
 * are filtered out entirely (ruled: a voided invoice was never really
 * billed) before mapping or summing. `student`/`academicYear` are populated
 * best-effort from the row data that's actually present — fees.tsx never
 * reads either field, only `.invoices` and `.summary`.
 *
 * BILL-CHECKOUT-1: the summary carries NO balance figure, deliberately.
 * Mobile adopts the rule the web side already wrote down in
 * `apps/web/lib/invoice-totals.ts`:
 *
 *   "`netAmount` (this invoice's own charge), never `totalReceivable`
 *    (netAmount + carried-forward previousBalance) — summing totalReceivable
 *    across a student's invoices double-counts every carried balance.
 *    Balance Due is intentionally NOT derived here — it comes from the
 *    separate, authoritative GET /finance/students/:studentId/balance
 *    (same double-counting trap applies to `balance` even more directly)."
 *
 * This mapper previously summed `balance` across cards, which is exactly the
 * double-count that docblock warns about — shown to a parent as their
 * "Outstanding". The tile now reads the ledger via `useChildBalance`. The
 * field is removed rather than left correct-but-unused, so it cannot be
 * reintroduced by accident. */
export function mapBillInvoicesToLedger(
  studentId: string,
  academicYearId: string,
  apiInvoices: BillInvoiceApi[],
  today?: Date,
): StudentLedger {
  const live = apiInvoices.filter((inv) => inv.status !== 'VOIDED');
  const invoices = live.map((inv) => mapBillInvoiceToLegacy(inv, today));
  const summary = invoices.reduce(
    (acc, inv) => ({
      totalInvoiced: acc.totalInvoiced + inv.totalAmount,
      totalPaid: acc.totalPaid + inv.paidAmount,
    }),
    { totalInvoiced: 0, totalPaid: 0 },
  );
  const first = live[0];
  return {
    student: {
      id: studentId,
      admissionNumber: first?.admissionNumber ?? '',
      fullName: first?.studentName ?? '',
      className: first?.className ?? '',
    },
    academicYear: { id: academicYearId, name: '' },
    invoices,
    summary,
  };
}
