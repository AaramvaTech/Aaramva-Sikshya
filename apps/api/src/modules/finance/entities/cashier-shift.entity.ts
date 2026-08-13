import { toMoney } from './finance.entity';

export interface CashierShiftRow {
  id: string;
  cashier_user_id: string;
  academic_year_id: string;
  opened_at: Date | string;
  opened_bs_year: number | null;
  opened_bs_month: number | null;
  opened_bs_day: number | null;
  opening_float: string | number;
  closed_at: Date | string | null;
  closed_by: string | null;
  counted_cash: string | number | null;
  expected_cash: string | number | null;
  variance: string | number | null;
  status: string;
  notes: string | null;
  // UI-6 §2.1 — joined in openShift/closeShift/listShifts, never selected bare.
  cashier_first_name: string;
  cashier_last_name: string;
  closed_by_first_name: string | null;
  closed_by_last_name: string | null;
}

export interface CashierShiftResponseDto {
  id: string;
  cashierUserId: string;
  cashierName: string;
  academicYearId: string;
  openedAt: string;
  openedBs: { year: number; month: number; day: number } | null;
  openingFloat: number;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  countedCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  status: string;
  notes: string | null;
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export function toCashierShiftResponse(row: CashierShiftRow): CashierShiftResponseDto {
  return {
    id: row.id,
    cashierUserId: row.cashier_user_id,
    cashierName: `${row.cashier_first_name} ${row.cashier_last_name}`,
    academicYearId: row.academic_year_id,
    openedAt: toIso(row.opened_at),
    openedBs:
      row.opened_bs_year != null && row.opened_bs_month != null && row.opened_bs_day != null
        ? { year: row.opened_bs_year, month: row.opened_bs_month, day: row.opened_bs_day }
        : null,
    openingFloat: toMoney(row.opening_float).toNumber(),
    closedAt: row.closed_at ? toIso(row.closed_at) : null,
    closedBy: row.closed_by,
    closedByName: row.closed_by_first_name != null ? `${row.closed_by_first_name} ${row.closed_by_last_name}` : null,
    countedCash: row.counted_cash != null ? toMoney(row.counted_cash).toNumber() : null,
    expectedCash: row.expected_cash != null ? toMoney(row.expected_cash).toNumber() : null,
    variance: row.variance != null ? toMoney(row.variance).toNumber() : null,
    status: row.status,
    notes: row.notes,
  };
}
