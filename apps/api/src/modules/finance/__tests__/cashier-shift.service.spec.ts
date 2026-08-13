import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CashierShiftService } from '../cashier-shift.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

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
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '100.00', cash_collected: '0', cheque_total: '0', gateway_total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);

      const result = await service.closeShift('shift-1', { countedCash: '2100.00' }, 'staff-1');
      expect(result.variance).toBe(100);
    });

    it('the aggregate query filters CLEARED-only, scoped to the cashier and the shift window', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([shiftRow()])
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '0', cash_collected: '0', cheque_total: '0', gateway_total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shiftRow({ status: 'CLOSED' })]);

      await service.closeShift('shift-1', { countedCash: '2000.00' }, 'staff-1');

      const aggSql = mockTx.$queryRawUnsafe.mock.calls[1][0] as string;
      expect(aggSql).toContain("status = 'CLEARED'");
      expect(aggSql).toContain('received_by = $1::uuid');
      expect(aggSql).toContain('created_at BETWEEN $2::timestamptz AND $3::timestamptz');
      expect(aggSql).toContain("FILTER (WHERE method = 'CASH')");
      expect(aggSql).toContain("FILTER (WHERE method IN ('BANK_TRANSFER', 'ESEWA', 'KHALTI')");
    });
  });

  describe('listShifts', () => {
    it('rejects a malformed date', async () => {
      await expect(service.listShifts({ date: 'not-a-date' })).rejects.toThrow(BadRequestException);
    });

    it('passes cashierId/date through as bound params', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await service.listShifts({ cashierId: 'cashier-1', date: '2026-07-29' });
      expect((tenantPrisma.query as jest.Mock).mock.calls[0].slice(1)).toEqual(['cashier-1', '2026-07-29']);
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
        .mockResolvedValueOnce([{ expected_cash: '2000.00', variance: '0', cash_collected: '0', cheque_total: '0', gateway_total: '0' }])
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
});
