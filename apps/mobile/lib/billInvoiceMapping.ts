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
  dueDate: string; // date-only AD string (e.g. "2026-08-15") — no {ad,bs} pair on this rail
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

export function mapBillInvoiceToLegacy(inv: BillInvoiceApi, today?: Date): Invoice {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber ?? '',
    studentId: inv.studentId,
    academicYearId: inv.academicYearId,
    dueDate: { ad: inv.dueDate, bs: formatBs(adToBs(new Date(inv.dueDate)), 'en') },
    status: mapBillInvoiceStatus(inv.status, inv.dueDate, today),
    // The new rail has no single invoice-level subtotal/discount figure the
    // way the old `invoices` table did (concession is per-item); totalAmount
    // is the only reliable analogue for both.
    subtotal: inv.totalReceivable,
    discountAmount: 0,
    // BILL-7 fines aren't exposed on this endpoint yet — 0, not fabricated.
    fineAmount: 0,
    totalAmount: inv.totalReceivable,
    paidAmount: inv.paidAmount,
    balance: inv.balance,
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
 * reads either field, only `.invoices` and `.summary`. */
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
      totalBalance: acc.totalBalance + inv.balance,
    }),
    { totalInvoiced: 0, totalPaid: 0, totalBalance: 0 },
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
