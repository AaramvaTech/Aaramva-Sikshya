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
}

export interface CashierCloseResult {
  shift: CashierShiftResponseDto;
  openingFloat: number;
  countedCash: number;
  expectedCash: number;
  variance: number;
  cashCollected: number;
  chequeTotal: number;
  gatewayTotal: number;
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
      `INSERT INTO cashier_shifts
         (cashier_user_id, academic_year_id, opened_bs_year, opened_bs_month, opened_bs_day, opening_float, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::numeric, $7)
       RETURNING *`,
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

      const [agg] = await tx.$queryRawUnsafe<CloseAggregateRow[]>(
        `SELECT
           $4::numeric + COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0) AS expected_cash,
           $5::numeric - ($4::numeric + COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0)) AS variance,
           COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0) AS cash_collected,
           COALESCE(SUM(amount) FILTER (WHERE method = 'CHEQUE'), 0) AS cheque_total,
           COALESCE(SUM(amount) FILTER (WHERE method IN ('BANK_TRANSFER', 'ESEWA', 'KHALTI')), 0) AS gateway_total
         FROM bill_payments
         WHERE received_by = $1::uuid AND status = 'CLEARED'
           AND created_at BETWEEN $2::timestamptz AND $3::timestamptz`,
        shift.cashier_user_id,
        shift.opened_at,
        closeTimestamp,
        shift.opening_float,
        dto.countedCash,
      );

      const byMethodRows = await tx.$queryRawUnsafe<MethodTotalRow[]>(
        `SELECT method, SUM(amount) AS total, COUNT(*) AS count
         FROM bill_payments
         WHERE received_by = $1::uuid AND status = 'CLEARED'
           AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
         GROUP BY method
         ORDER BY method`,
        shift.cashier_user_id,
        shift.opened_at,
        closeTimestamp,
      );

      const [updated] = await tx.$queryRawUnsafe<CashierShiftRow[]>(
        `UPDATE cashier_shifts SET
           status = 'CLOSED', closed_at = $1::timestamptz, closed_by = $2::uuid,
           counted_cash = $3::numeric, expected_cash = $4::numeric, variance = $5::numeric,
           notes = COALESCE($6, notes), updated_at = NOW()
         WHERE id = $7::uuid
         RETURNING *`,
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
        byMethod: byMethodRows.map((r) => ({
          method: r.method,
          total: toMoney(r.total).toNumber(),
          count: parseInt(r.count, 10),
        })),
      };
    });
  }

  async listShifts(params: { cashierId?: string; date?: string }): Promise<CashierShiftResponseDto[]> {
    if (params.date && !ISO_DATE_RE.test(params.date)) {
      throw new BadRequestException('date must be an AD date in YYYY-MM-DD form.');
    }
    const rows = await this.tenantPrisma.query<CashierShiftRow>(
      `SELECT * FROM cashier_shifts
       WHERE ($1::uuid IS NULL OR cashier_user_id = $1::uuid)
         AND ($2::date IS NULL OR opened_at::date = $2::date)
       ORDER BY opened_at DESC`,
      params.cashierId ?? null,
      params.date ?? null,
    );
    return rows.map(toCashierShiftResponse);
  }
}
