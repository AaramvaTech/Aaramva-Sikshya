import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PayrollService } from '../payroll.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const baseDraftMonthRow = {
  id: 'month-1',
  month_bs: 3,
  year_bs: 2081,
  academic_year_id: 'year-1',
  status: 'DRAFT',
  finalized_at: null,
  created_by: 'user-1',
  created_at: new Date('2024-07-01'),
  updated_at: new Date('2024-07-01'),
};

const baseFinalizedMonthRow = {
  ...baseDraftMonthRow,
  status: 'FINALIZED',
  finalized_at: new Date('2024-07-15'),
};

const baseActiveStaffRow = {
  id: 'profile-1',
  user_id: 'user-staff-1',
  employee_id: 'EMP-2081-0001',
  base_salary: '30000.00',
  end_date: null,
  deleted_at: null,
};

const baseSlipRow = {
  id: 'slip-1',
  payroll_month_id: 'month-1',
  user_id: 'user-staff-1',
  staff_profile_id: 'profile-1',
  base_salary: '30000.00',
  allowance_total: '0.00',
  allowances: [],
  deduction_total: '0.00',
  deductions: [],
  unpaid_leave_days: 0,
  leave_deduction: '0.00',
  gross_salary: '30000.00',
  net_salary: '30000.00',
  payment_date: null,
  payment_method: null,
  notes: null,
  created_at: new Date('2024-07-01'),
  updated_at: new Date('2024-07-01'),
};

describe('PayrollService', () => {
  let service: PayrollService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue({
              tenantId: 'tenant-1',
              slug: 'test-school',
              schemaName: 'tenant_test',
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PayrollService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('generatePayroll()', () => {
    it('creates salary slips for all active staff', async () => {
      // Payroll month lookup
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseDraftMonthRow]);
      // Active staff list
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseActiveStaffRow]);
      // No existing slip for this staff member
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      // Slip insert RETURNING
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseSlipRow]);

      const result = await service.generatePayroll('month-1', {});

      // One slip created for one active staff member
      expect(result).toHaveLength(1);
      expect(result[0].payrollMonthId).toBe('month-1');
    });

    it('MON-1: computes allowance/deduction totals to the cent via Money, not float reduce', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseDraftMonthRow]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseActiveStaffRow]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseSlipRow]);

      await service.generatePayroll('month-1', {
        overrides: [{
          userId: 'user-staff-1',
          additionalAllowances: [
            { name: 'Transport', amount: 1250.75 },
            { name: 'Meal', amount: 899.25 },
          ],
          additionalDeductions: [{ name: 'Advance', amount: 500.5 }],
        }],
      });

      const insertCall = (tenantPrisma.query as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO salary_slips'),
      );
      // params: [sql, monthId, userId, staffId, baseSalary, allowanceTotal, allowancesJson, deductionTotal, ...]
      expect(insertCall[5]).toBe(2150); // 1250.75 + 899.25, exact to the cent
      expect(insertCall[7]).toBe(500.5);
    });

    it('is idempotent — skips staff who already have a slip', async () => {
      // Payroll month lookup
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseDraftMonthRow]);
      // Active staff list (1 member)
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseActiveStaffRow]);
      // Existing slip found → skip
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseSlipRow]);

      const result = await service.generatePayroll('month-1', {});

      // No new slips created — existing one returned
      expect(result).toHaveLength(1);
      // The existing slip is returned without inserting a new one
      const insertCalls = (tenantPrisma.query as jest.Mock).mock.calls.filter(
        ([sql]: [string]) => sql?.includes('INSERT INTO salary_slips'),
      );
      expect(insertCalls).toHaveLength(0);
    });
  });

  describe('adjustSlip()', () => {
    it('updates allowances and deductions correctly', async () => {
      // Payroll month (DRAFT)
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseDraftMonthRow]);
      // Slip lookup
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseSlipRow]);
      // Updated slip RETURNING
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...baseSlipRow,
        allowance_total: '1500.00',
        allowances: [{ name: 'Travel', amount: 1500 }],
        deduction_total: '500.00',
        deductions: [{ name: 'PF', amount: 500 }],
      }]);

      const result = await service.adjustSlip('month-1', 'slip-1', {
        allowances: [{ name: 'Travel', amount: 1500 }],
        deductions: [{ name: 'PF', amount: 500 }],
      });

      expect(result.allowanceTotal).toBe(1500);
      expect(result.deductionTotal).toBe(500);
    });

    it('throws BadRequestException when payroll month is FINALIZED', async () => {
      // Finalized month
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseFinalizedMonthRow]);

      await expect(
        service.adjustSlip('month-1', 'slip-1', { allowances: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('MON-1: leave deduction (base_salary/30*days) rounds to the cent via Money, not float division', async () => {
      // 29000/30 = 966.6666...repeating; *7 days = 6766.6666...repeating -> 6766.67
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseDraftMonthRow]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...baseSlipRow,
        base_salary: '29000.00',
      }]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseSlipRow]);

      await service.adjustSlip('month-1', 'slip-1', { unpaidLeaveDays: 7 });

      const updateCall = (tenantPrisma.query as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('UPDATE salary_slips'),
      );
      // params: [sql, allowancesJson, allowanceTotal, deductionsJson, deductionTotal, unpaidLeaveDays, leaveDeduction, ...]
      expect(updateCall[6]).toBe(6766.67);
    });
  });

  describe('finalizePayroll()', () => {
    it('sets status to FINALIZED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseDraftMonthRow]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseFinalizedMonthRow]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      const result = await service.finalizePayroll('month-1');

      expect(result.status).toBe('FINALIZED');
    });

    it('throws BadRequestException when payroll is already FINALIZED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseFinalizedMonthRow]);

      await expect(service.finalizePayroll('month-1')).rejects.toThrow(BadRequestException);
    });
  });
});
