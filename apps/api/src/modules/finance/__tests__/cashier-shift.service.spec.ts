import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CashierShiftService, SHIFT_PAYMENTS_WHERE, shiftPaymentsWhere } from '../cashier-shift.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

function shiftRow(over: Record<string, unknown> = {}) {
  return {
    id: 'shift-1',
    cashier_user_id: 'cashier-1',
    academic_year_id: 'year-1',
    opened_at: new Date('2026-07-29T03:00:00Z'),
    opened_bs_year: 2083,
    opened_bs_month: 4,
    opened_bs_day: 13,
    opening_float: '2000.00',
    closed_at: null,
    closed_by: null,
    counted_cash: null,
    expected_cash: null,
    variance: null,
    status: 'OPEN',
    notes: null,
    cashier_first_name: 'Ram',
    cashier_last_name: 'Shrestha',
    closed_by_first_name: null,
    closed_by_last_name: null,
    ...over,
  };
}

describe('CashierShiftService', () => {
  let service: CashierShiftService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CashierShiftService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(CashierShiftService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('openShift', () => {
    it('rejects when the cashier already has an OPEN shift', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'existing-shift' }]);
      await expect(
        service.openShift({ academicYearId: 'year-1', openingFloat: '2000.00' }, 'cashier-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('inserts with today’s BS date and returns the shift', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([]) // no existing OPEN shift
        .mockResolvedValueOnce([shiftRow()]); // insert RETURNING

      const result = await service.openShift({ academicYearId: 'year-1', openingFloat: '2000.00' }, 'cashier-1');

      expect(result.status).toBe('OPEN');
      expect(result.openingFloat).toBe(2000);
      expect(result.openedBs).toEqual({ year: 2083, month: 4, day: 13 });
      const insertSql = (tenantPrisma.query as jest.Mock).mock.calls[1][0] as string;
      expect(insertSql).toContain('INSERT INTO cashier_shifts');
    });
  });

  describe('closeShift', () => {
    it('404s on a missing shift', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]); // FOR UPDATE select, empty
      await expect(service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1')).rejects.toThrow(NotFoundException);
    });

    it('409s when the shift is already CLOSED', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);
      await expect(service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1')).rejects.toThrow(ConflictException);
    });

    it('locks the row with FOR UPDATE before checking status', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);
      await expect(service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1')).rejects.toThrow();
      expect(mockTx.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR UPDATE');
    });

    it('threads the SQL-computed expected_cash/variance/byMethod into the result (short drawer, negative variance)', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()]) // FOR UPDATE select
        .mockResolvedValueOnce([{
          expected_cash: '7000.00', variance: '-500.00',
          cash_collected: '5000.00', cheque_total: '1500.00', gateway_total: '2000.00',
          cash_refund_total: '0',
        }]) // aggregate
        .mockResolvedValueOnce([
          { method: 'CASH', total: '5000.00', count: '2' },
          { method: 'CHEQUE', total: '1500.00', count: '1' },
          { method: 'ESEWA', total: '2000.00', count: '1' },
        ]) // byMethod
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED', counted_cash: '6500.00', expected_cash: '7000.00', variance: '-500.00' })]); // UPDATE RETURNING

      const result = await service.closeShift('shift-1', { countedCash: '6500.00' }, 'staff-1');

      expect(result.expectedCash).toBe(7000); // 2000 opening + 5000 cash
      expect(result.countedCash).toBe(6500);
      expect(result.variance).toBe(-500); // short by 500
      expect(result.cashCollected).toBe(5000);
      expect(result.chequeTotal).toBe(1500);
      expect(result.gatewayTotal).toBe(2000);
      expect(result.cashRefundTotal).toBe(0);
      expect(result.byMethod).toEqual([
        { method: 'CASH', total: 5000, count: 2 },
        { method: 'CHEQUE', total: 1500, count: 1 },
        { method: 'ESEWA', total: 2000, count: 1 },
      ]);
      expect(result.shift.status).toBe('CLOSED');
    });

    it('a positive (over) variance is reported as-is, not corrected', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '100.00', cash_collected: '0', cheque_total: '0', gateway_total: '0', cash_refund_total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);

      const result = await service.closeShift('shift-1', { countedCash: '2100.00' }, 'staff-1');
      expect(result.variance).toBe(100);
    });

    it('the aggregate query filters CLEARED-only, scoped to the cashier and the shift window', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '0', cash_collected: '0', cheque_total: '0', gateway_total: '0', cash_refund_total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);

      await service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1');

      const aggSql = mockTx.$queryRawUnsafe.mock.calls[1][0] as string;
      expect(aggSql).toContain("status = 'CLEARED'");
      expect(aggSql).toContain('received_by = $1::uuid');
      expect(aggSql).toContain('created_at BETWEEN $2::timestamptz AND $3::timestamptz');
      expect(aggSql).toContain("FILTER (WHERE method = 'CASH')");
      expect(aggSql).toContain("FILTER (WHERE method IN ('BANK_TRANSFER', 'ESEWA', 'KHALTI')");
      // D26-CASH-REFUND-DRAWER
      expect(aggSql).toContain('FROM bill_corrections');
      expect(aggSql).toContain("type = 'REFUND' AND status = 'APPROVED' AND refund_method = 'CASH'");
      expect(aggSql).toContain('decided_at BETWEEN $2::timestamptz AND $3::timestamptz');
    });

    // D26-CASH-REFUND-DRAWER (BILLING-CALC-AUDIT-1 D26). The SQL layer does
    // the subtraction (Postgres NUMERIC, exact — no Money/float concern), so
    // these fixtures set the AGGREGATE row directly rather than re-deriving
    // it; that arithmetic is what the "aggregate query filters..." test
    // above and the live probe (Phase 1 report) both already confirm.
    it('a CASH payment and a CASH refund in the same shift: drawer balance is payment minus refund, and the refund shows as its own line', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()]) // FOR UPDATE select, opening_float 2000.00
        .mockResolvedValueOnce([{
          // opening 2000 + cash_collected 5000 - cash_refund_total 100 = 6900
          expected_cash: '6900.00', variance: '0.00',
          cash_collected: '5000.00', cheque_total: '0', gateway_total: '0',
          cash_refund_total: '100.00',
        }])
        .mockResolvedValueOnce([{ method: 'CASH', total: '5000.00', count: '1' }])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED', expected_cash: '6900.00' })]);

      const result = await service.closeShift('shift-1', { countedCash: '6900.00' }, 'staff-1');

      expect(result.cashCollected).toBe(5000);
      expect(result.cashRefundTotal).toBe(100);
      expect(result.expectedCash).toBe(6900); // 2000 opening + 5000 in - 100 out
      expect(result.variance).toBe(0); // counted matches once the refund is accounted for
    });

    it('a non-CASH (BANK_TRANSFER) refund never reduces the drawer — only CASH refunds are subtracted', async () => {
      // The SQL's own WHERE clause (refund_method = 'CASH') is what
      // enforces this — confirmed directly above ("the aggregate query
      // filters..."). This pins the OBSERVABLE behaviour: a shift with a
      // BANK_TRANSFER refund reports cash_refund_total as if it didn't
      // exist, because the aggregate the SQL would actually return for
      // that case excludes it.
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{
          expected_cash: '7000.00', variance: '0.00',
          cash_collected: '5000.00', cheque_total: '0', gateway_total: '0',
          cash_refund_total: '0', // the BANK_TRANSFER refund never entered this sum
        }])
        .mockResolvedValueOnce([{ method: 'CASH', total: '5000.00', count: '1' }])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED', expected_cash: '7000.00' })]);

      const result = await service.closeShift('shift-1', { countedCash: '7000.00' }, 'staff-1');

      expect(result.cashRefundTotal).toBe(0);
      expect(result.expectedCash).toBe(7000); // opening 2000 + cash 5000, undiminished
    });

    it('a shift with zero refunds of any kind: cashRefundTotal is 0, expectedCash unaffected — the common case is unchanged', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{
          expected_cash: '5000.00', variance: '0.00',
          cash_collected: '3000.00', cheque_total: '0', gateway_total: '0',
          cash_refund_total: '0',
        }])
        .mockResolvedValueOnce([{ method: 'CASH', total: '3000.00', count: '1' }])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED', expected_cash: '5000.00' })]);

      const result = await service.closeShift('shift-1', { countedCash: '5000.00' }, 'staff-1');

      expect(result.cashRefundTotal).toBe(0);
      expect(result.expectedCash).toBe(5000);
      expect(result.variance).toBe(0);
    });
  });

  describe('listShifts', () => {
    it('rejects a malformed date', async () => {
      await expect(service.listShifts({ date: 'not-a-date' })).rejects.toThrow(BadRequestException);
    });

    it('passes cashierId/date through as bound params', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await service.listShifts({ cashierId: 'cashier-1', date: '2026-07-29' });
      expect((tenantPrisma.query as jest.Mock).mock.calls[0].slice(1)).toEqual(['cashier-1', '2026-07-29', null]);
    });

    it('JOINs users for the cashier and closed-by display names (UI-6 §2.1)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([shiftRow()]);
      const [result] = await service.listShifts({});
      expect(result.cashierName).toBe('Ram Shrestha');
      expect(result.closedByName).toBeNull();
      const sql = (tenantPrisma.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('JOIN users cu ON cu.id = cs.cashier_user_id');
      expect(sql).toContain('LEFT JOIN users cb ON cb.id = cs.closed_by');
    });
  });

  describe('cashier/closed-by name join (UI-6 §2.1)', () => {
    it('openShift returns cashierName from the joined users row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([]) // no existing OPEN shift
        .mockResolvedValueOnce([shiftRow()]);

      const result = await service.openShift({ academicYearId: 'year-1', openingFloat: '2000.00' }, 'cashier-1');

      expect(result.cashierName).toBe('Ram Shrestha');
      expect(result.closedByName).toBeNull();
      const insertSql = (tenantPrisma.query as jest.Mock).mock.calls[1][0] as string;
      expect(insertSql).toContain('JOIN users cu ON cu.id = inserted.cashier_user_id');
    });

    it('closeShift returns both cashierName and closedByName from the joined rows', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '0', cash_collected: '0', cheque_total: '0', gateway_total: '0', cash_refund_total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shiftRow({
          status: 'CLOSED',
          closed_by_first_name: 'Gita', closed_by_last_name: 'KC',
        })]);

      const result = await service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1');

      expect(result.shift.cashierName).toBe('Ram Shrestha');
      expect(result.shift.closedByName).toBe('Gita KC');
      const updateSql = mockTx.$queryRawUnsafe.mock.calls[3][0] as string;
      expect(updateSql).toContain('LEFT JOIN users cb ON cb.id = updated.closed_by');
    });
  });

  describe('listShiftPayments — same window as closeShift (SHIFT-PAYMENTS-WINDOW)', () => {
    const CLOSED_AT = new Date('2026-07-29T03:04:00Z');
    const payRow = (over: Record<string, unknown> = {}) => ({
      id: 'p1', receipt_number: 'RCPT-1', method: 'CASH', amount: '130.00', received_date: '2026-07-29',
      created_at: new Date('2026-07-29T03:01:00Z'), student_name: 'Sandip Lama', admission_number: '2083-0021',
      class_name: 'Grade 6', section_name: 'A', ...over,
    });

    it('404s an unknown shift, never queries payments', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.listShiftPayments('nope')).rejects.toThrow(NotFoundException);
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
    });

    it('a closed shift is bounded by [opened_at, closed_at] for THAT shift cashier, CLEARED only', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED', closed_at: CLOSED_AT })])
        .mockResolvedValueOnce([payRow()]);

      const result = await service.listShiftPayments('shift-1');

      const [sql, cashier, from, to] = (tenantPrisma.query as jest.Mock).mock.calls[1];
      expect(sql).toContain(SHIFT_PAYMENTS_WHERE);
      expect(sql).toContain("bp.status = 'CLEARED'");
      expect(sql).toContain('bp.received_by = $1::uuid');
      expect(cashier).toBe('cashier-1');            // another cashier's payments are excluded by this bind
      expect(from).toEqual(new Date('2026-07-29T03:00:00Z'));
      expect(to).toEqual(CLOSED_AT);                // not a date, not the end of the day
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0]).toMatchObject({
        receiptNumber: 'RCPT-1', method: 'CASH', amount: 130, receivedDate: '2026-07-29',
        studentName: 'Sandip Lama', className: 'Grade 6', sectionName: 'A',
      });
    });

    it('an OPEN shift runs to now()', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([shiftRow()])          // closed_at null
        .mockResolvedValueOnce([]);
      const before = Date.now();
      const result = await service.listShiftPayments('shift-1');
      const to = (tenantPrisma.query as jest.Mock).mock.calls[1][3] as Date;
      expect(to.getTime()).toBeGreaterThanOrEqual(before);
      expect(to.getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(result.windowEnd).getTime()).toBe(to.getTime());
    });

    it('cashCollected sums CASH rows only (cheque/gateway are listed but not drawer cash)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED', closed_at: CLOSED_AT })])
        .mockResolvedValueOnce([
          payRow({ id: 'a', amount: '130.00' }),
          payRow({ id: 'b', amount: '20.10' }),
          payRow({ id: 'c', method: 'ESEWA', amount: '500.00' }),
        ]);
      const result = await service.listShiftPayments('shift-1');
      expect(result.payments).toHaveLength(3);
      expect(result.cashCollected).toBe(150.1);
    });

    it('closeShift and the list splice the SAME predicate, so they cannot drift', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '0', cash_collected: '0', cheque_total: '0', gateway_total: '0', cash_refund_total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);
      await service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1');
      const aggSql = mockTx.$queryRawUnsafe.mock.calls[1][0] as string;
      const bySql = mockTx.$queryRawUnsafe.mock.calls[2][0] as string;
      expect(aggSql).toContain(SHIFT_PAYMENTS_WHERE);
      expect(bySql).toContain(SHIFT_PAYMENTS_WHERE);
    });
  });

  describe('outsideShiftCash — cash outside every shift window (CASHIER-CLOSE-CONFIRM)', () => {
    // Nepal day 2026-09-30 = [2026-09-29T18:15Z, 2026-09-30T18:15Z)
    it('binds the Nepal calendar day, the cashier, and reuses the shift membership rule per shift', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { id: 'p1', receipt_number: 'RCPT-11', amount: '1000.00', created_at: new Date('2026-09-30T05:37:00Z') },
        { id: 'p2', receipt_number: 'RCPT-12', amount: '390.50', created_at: new Date('2026-09-30T05:40:00Z') },
      ]);
      const r = await service.outsideShiftCash('cashier-1', '2026-09-30');
      const [sql, cashier, from, to] = (tenantPrisma.query as jest.Mock).mock.calls[0];
      expect(cashier).toBe('cashier-1');
      expect(from).toEqual(new Date('2026-09-29T18:15:00Z'));
      expect(to).toEqual(new Date('2026-09-30T18:15:00Z'));
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain("bp.method = 'CASH'");
      // the NOT EXISTS body is the SAME rule close-shift uses, just bound to each shift
      expect(sql).toContain(shiftPaymentsWhere('cs.cashier_user_id', 'cs.opened_at', 'COALESCE(cs.closed_at, now())'));
      expect(SHIFT_PAYMENTS_WHERE).toBe(shiftPaymentsWhere('$1::uuid', '$2::timestamptz', '$3::timestamptz'));
      expect(r).toMatchObject({ date: '2026-09-30', count: 2, total: 1390.5 });
    });

    it('returns zero for no rows and rejects an impossible date', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      expect(await service.outsideShiftCash('cashier-1', '2026-09-30')).toMatchObject({ count: 0, total: 0 });
      await expect(service.outsideShiftCash('cashier-1', '2026-02-30')).rejects.toThrow(BadRequestException);
    });
  });
});
