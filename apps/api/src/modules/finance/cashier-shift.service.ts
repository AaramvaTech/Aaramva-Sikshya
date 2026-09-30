import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { todayBs } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { toMoney } from './entities/finance.entity';
import {
  CashierShiftRow,
  CashierShiftResponseDto,
  toCashierShiftResponse,
} from './entities/cashier-shift.entity';
import { OpenShiftDto, CloseShiftDto } from './dto/cashier-shift.dto';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * SHIFT-PAYMENTS-WINDOW: the ONE definition of "this payment belongs to this
 * shift". closeShift's expected-cash and by-method queries and the shift's
 * receipt list (listShiftPayments) all splice this same fragment, so the list
 * a cashier reads and the total they are held to cannot drift apart. Params:
 * $1 cashier user id, $2 opened_at, $3 window end (closeTimestamp, or
 * COALESCE(closed_at, now()) for the list). Callers alias bill_payments as `bp`.
 * There is no shift_id on payments; membership is cashier + status + time window.
 */
export const SHIFT_PAYMENTS_WHERE = `bp.received_by = $1::uuid AND bp.status = 'CLEARED'
             AND bp.created_at BETWEEN $2::timestamptz AND $3::timestamptz`;

interface MethodTotalRow {
  method: string;
  total: string;
  count: string;
}

interface CloseAggregateRow {
  expected_cash: string;
  variance: string;
  cash_collected: string;
  cheque_total: string;
  gateway_total: string;
  cash_refund_total: string;
}

interface ShiftPaymentRow {
  id: string;
  receipt_number: string;
  method: string;
  amount: string | number;
  received_date: Date | string;
  created_at: Date | string;
  student_name: string | null;
  admission_number: string | null;
  class_name: string | null;
  section_name: string | null;
}

export interface ShiftPaymentsResult {
  shiftId: string;
  windowStart: string;
  windowEnd: string;
  cashCollected: number;
  payments: {
    id: string; receiptNumber: string; method: string; amount: number; receivedDate: string; createdAt: string;
    studentName: string | null; admissionNumber: string | null; className: string | null; sectionName: string | null;
  }[];
}

const toIso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

export interface CashierCloseResult {
  shift: CashierShiftResponseDto;
  openingFloat: number;
  countedCash: number;
  expectedCash: number;
  variance: number;
  cashCollected: number;
  chequeTotal: number;
  gatewayTotal: number;
  // D26-CASH-REFUND-DRAWER: a separate line, not folded silently into
  // cashCollected — the cashier sees what left the drawer, not just a
  // smaller number they can't account for. Already subtracted into
  // expectedCash/variance above; this is the same figure shown, not a
  // second deduction.
  cashRefundTotal: number;
  byMethod: { method: string; total: number; count: number }[];
}

/**
 * BILL-9 Checkpoint B (§4) — the one write path in the whole BILL-9 phase.
 * `expected_cash`/`variance`/the method breakdown are computed SQL-side from
 * `bill_payments` at close time (B9-6) and persisted as a snapshot only —
 * `cashier_shifts` is never re-derived from itself, `bill_payments` stays
 * the one source of truth (spec §2).
 *
 * "Collected" means CLEARED throughout this phase (B9-1/B5-5) — a PENDING
 * cheque handed to the cashier mid-shift doesn't appear in the close
 * summary's cheque total until it clears, same rule the collection-summary
 * report (Checkpoint A) already enforces. Variance is reported, never
 * auto-adjusted (B9-3) — this service has no code path that touches
 * `bill_payments` or the ledger on close, only the shift's own snapshot
 * columns.
 *
 * D26-CASH-REFUND-DRAWER: `expected_cash` now also subtracts APPROVED CASH
 * refunds (BILLING-CALC-AUDIT-1 D26) — money that physically left the same
 * drawer, previously invisible to this formula entirely. Attributed by
 * TIME WINDOW (`decided_at` inside the shift), not by actor: refund
 * approval is OWNER_ONLY (`bill-correction.controller.ts`), so there is no
 * `received_by`-equivalent column recording which cashier's till the cash
 * actually came from — `decided_by` names who authorised it, not who
 * disbursed it. This is the same soft-scope tolerance this file's own
 * `closeShift` doc comment above already accepts for `closed_by`, extended
 * here because no per-cashier field exists to be stricter with.
 * Known limitation, not fixed here (out of D26's scope, logged in
 * BILL-BUGS.md): two cashiers with concurrent OPEN shifts (the schema
 * allows this — `uq_cashier_shifts_one_open` is scoped per cashier, not
 * global) could both have a cash refund's window overlap their shift,
 * attributing the same refund to both drawers.
 */
@Injectable()
export class CashierShiftService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async openShift(dto: OpenShiftDto, cashierId: string): Promise<CashierShiftResponseDto> {
    const existing = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM cashier_shifts WHERE cashier_user_id = $1::uuid AND status = 'OPEN'`,
      cashierId,
    );
    if (existing.length > 0) {
      throw new ConflictException('You already have an open cashier shift — close it before opening a new one');
    }

    const bs = todayBs();
    const [row] = await this.tenantPrisma.query<CashierShiftRow>(
      `WITH inserted AS (
         INSERT INTO cashier_shifts
           (cashier_user_id, academic_year_id, opened_bs_year, opened_bs_month, opened_bs_day, opening_float, notes)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::numeric, $7)
         RETURNING *
       )
       SELECT inserted.*, cu.first_name AS cashier_first_name, cu.last_name AS cashier_last_name
       FROM inserted
       JOIN users cu ON cu.id = inserted.cashier_user_id`,
      cashierId,
      dto.academicYearId,
      bs.year,
      bs.month,
      bs.day,
      dto.openingFloat,
      dto.notes ?? null,
    );
    return toCashierShiftResponse(row);
  }

  /**
   * Any ACCOUNTANT_AND_ABOVE caller may close any OPEN shift (soft-scope,
   * accountability via `closed_by` — same pattern as bulkMark/bulkEnterMarks
   * elsewhere in this codebase, not a hard per-cashier ownership gate).
   * `FOR UPDATE` inside a transaction serializes two concurrent close
   * attempts on the same shift; the second sees status != 'OPEN' and 409s.
   */
  async closeShift(shiftId: string, dto: CloseShiftDto, staffId: string): Promise<CashierCloseResult> {
    return this.tenantPrisma.run(async (tx) => {
      const [shift] = await tx.$queryRawUnsafe<CashierShiftRow[]>(
        `SELECT * FROM cashier_shifts WHERE id = $1::uuid FOR UPDATE`,
        shiftId,
      );
      if (!shift) throw new NotFoundException(`Cashier shift ${shiftId} not found`);
      if (shift.status !== 'OPEN') {
        throw new ConflictException(`Shift ${shiftId} is already ${shift.status}`);
      }

      // Captured once, reused for both the aggregation window's upper bound
      // AND the persisted closed_at — a second NOW() in a later statement
      // could disagree by microseconds and pull in payments that landed
      // between the two calls.
      const closeTimestamp = new Date();

      // D26-CASH-REFUND-DRAWER: `refunds` is a SEPARATE CTE, not a second
      // FILTER on the same bill_payments scan — the refund lives in
      // bill_corrections, a different table, keyed by decided_at (when the
      // OWNER approved it, which is also when its ledger entry — and the
      // cash — moved) rather than received_by/created_at. Both CTEs reduce
      // to exactly one row each (no GROUP BY), so `FROM payments, refunds`
      // is a safe 1×1 cross join, not a fan-out.
      const [agg] = await tx.$queryRawUnsafe<CloseAggregateRow[]>(
        `WITH payments AS (
           SELECT
             COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0) AS cash_collected,
             COALESCE(SUM(amount) FILTER (WHERE method = 'CHEQUE'), 0) AS cheque_total,
             COALESCE(SUM(amount) FILTER (WHERE method IN ('BANK_TRANSFER', 'ESEWA', 'KHALTI')), 0) AS gateway_total
           FROM bill_payments bp
           WHERE ${SHIFT_PAYMENTS_WHERE}
         ),
         refunds AS (
           SELECT COALESCE(SUM(amount), 0) AS total
           FROM bill_corrections
           WHERE type = 'REFUND' AND status = 'APPROVED' AND refund_method = 'CASH'
             AND decided_at BETWEEN $2::timestamptz AND $3::timestamptz
         )
         SELECT
           $4::numeric + payments.cash_collected - refunds.total AS expected_cash,
           $5::numeric - ($4::numeric + payments.cash_collected - refunds.total) AS variance,
           payments.cash_collected,
           payments.cheque_total,
           payments.gateway_total,
           refunds.total AS cash_refund_total
         FROM payments, refunds`,
        shift.cashier_user_id,
        shift.opened_at,
        closeTimestamp,
        shift.opening_float,
        dto.countedCash,
      );

      const byMethodRows = await tx.$queryRawUnsafe<MethodTotalRow[]>(
        `SELECT bp.method, SUM(bp.amount) AS total, COUNT(*) AS count
         FROM bill_payments bp
         WHERE ${SHIFT_PAYMENTS_WHERE}
         GROUP BY bp.method
         ORDER BY bp.method`,
        shift.cashier_user_id,
        shift.opened_at,
        closeTimestamp,
      );

      const [updated] = await tx.$queryRawUnsafe<CashierShiftRow[]>(
        `WITH updated AS (
           UPDATE cashier_shifts SET
             status = 'CLOSED', closed_at = $1::timestamptz, closed_by = $2::uuid,
             counted_cash = $3::numeric, expected_cash = $4::numeric, variance = $5::numeric,
             notes = COALESCE($6, notes), updated_at = NOW()
           WHERE id = $7::uuid
           RETURNING *
         )
         SELECT updated.*, cu.first_name AS cashier_first_name, cu.last_name AS cashier_last_name,
                cb.first_name AS closed_by_first_name, cb.last_name AS closed_by_last_name
         FROM updated
         JOIN users cu ON cu.id = updated.cashier_user_id
         LEFT JOIN users cb ON cb.id = updated.closed_by`,
        closeTimestamp,
        staffId,
        dto.countedCash,
        agg.expected_cash,
        agg.variance,
        dto.notes ?? null,
        shiftId,
      );

      return {
        shift: toCashierShiftResponse(updated),
        openingFloat: toMoney(shift.opening_float).toNumber(),
        countedCash: toMoney(dto.countedCash).toNumber(),
        expectedCash: toMoney(agg.expected_cash).toNumber(),
        variance: toMoney(agg.variance).toNumber(),
        cashCollected: toMoney(agg.cash_collected).toNumber(),
        chequeTotal: toMoney(agg.cheque_total).toNumber(),
        gatewayTotal: toMoney(agg.gateway_total).toNumber(),
        cashRefundTotal: toMoney(agg.cash_refund_total).toNumber(),
        byMethod: byMethodRows.map((r) => ({
          method: r.method,
          total: toMoney(r.total).toNumber(),
          count: parseInt(r.count, 10),
        })),
      };
    });
  }

  /**
   * The receipts under one shift — same predicate as closeShift (see
   * SHIFT_PAYMENTS_WHERE), window end = closed_at, or now() while still open.
   * 404 for an unknown shift id.
   */
  async listShiftPayments(shiftId: string): Promise<ShiftPaymentsResult> {
    const [shift] = await this.tenantPrisma.query<CashierShiftRow>(
      `SELECT * FROM cashier_shifts WHERE id = $1::uuid`,
      shiftId,
    );
    if (!shift) throw new NotFoundException(`Cashier shift ${shiftId} not found`);

    const windowEnd = shift.closed_at ?? new Date();
    const rows = await this.tenantPrisma.query<ShiftPaymentRow>(
      `SELECT bp.id, bp.receipt_number, bp.method, bp.amount, bp.received_date, bp.created_at,
              TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS student_name,
              s.student_id AS admission_number, c.name AS class_name, sec.name AS section_name
       FROM bill_payments bp
       LEFT JOIN students s ON s.id = bp.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       WHERE ${SHIFT_PAYMENTS_WHERE}
       ORDER BY bp.created_at`,
      shift.cashier_user_id,
      shift.opened_at,
      windowEnd,
    );

    const cash = rows.filter((r) => r.method === 'CASH').reduce((acc, r) => acc.add(toMoney(r.amount)), toMoney(0));
    return {
      shiftId,
      windowStart: toIso(shift.opened_at),
      windowEnd: toIso(windowEnd),
      cashCollected: cash.toNumber(),
      payments: rows.map((r) => ({
        id: r.id,
        receiptNumber: r.receipt_number,
        method: r.method,
        amount: toMoney(r.amount).toNumber(),
        receivedDate: r.received_date instanceof Date ? r.received_date.toISOString().split('T')[0] : String(r.received_date).slice(0, 10),
        createdAt: toIso(r.created_at),
        studentName: r.student_name || null,
        admissionNumber: r.admission_number ?? null,
        className: r.class_name ?? null,
        sectionName: r.section_name ?? null,
      })),
    };
  }

  async listShifts(params: { cashierId?: string; date?: string }): Promise<CashierShiftResponseDto[]> {
    if (params.date && !ISO_DATE_RE.test(params.date)) {
      throw new BadRequestException('date must be an AD date in YYYY-MM-DD form.');
    }
    const rows = await this.tenantPrisma.query<CashierShiftRow>(
      `SELECT cs.*, cu.first_name AS cashier_first_name, cu.last_name AS cashier_last_name,
              cb.first_name AS closed_by_first_name, cb.last_name AS closed_by_last_name
       FROM cashier_shifts cs
       JOIN users cu ON cu.id = cs.cashier_user_id
       LEFT JOIN users cb ON cb.id = cs.closed_by
       WHERE ($1::uuid IS NULL OR cs.cashier_user_id = $1::uuid)
         AND ($2::date IS NULL OR cs.opened_at::date = $2::date)
       ORDER BY cs.opened_at DESC`,
      params.cashierId ?? null,
      params.date ?? null,
    );
    return rows.map(toCashierShiftResponse);
  }
}
