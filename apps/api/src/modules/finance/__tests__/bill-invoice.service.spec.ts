import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillInvoiceService } from '../bill-invoice.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { Role } from '../../common/enums/role.enum';
import { GuardianScopeService } from '../../student/guardian-scope.service';

const mockInvoiceRow = {
  id: 'invoice-1',
  invoice_number: 'BINV-2083-000001',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  bill_run_id: 'run-1',
  bs_year: 2082,
  bs_month: 4,
  issue_date: new Date('2026-07-26'),
  due_date: new Date('2026-08-10'),
  gross_amount: '3000.00',
  concession_amount: '0.00',
  taxable_base: '0.00',
  tax_rate: null,
  tax_amount: '0.00',
  net_amount: '3000.00',
  previous_balance: '5500.00',
  total_receivable: '8500.00',
  amount_in_words_en: 'Three Thousand Rupees',
  amount_in_words_ne: null,
  status: 'POSTED',
  ledger_entry_id: 'ledger-entry-1',
  created_by: 'user-1',
  created_at: new Date('2026-07-26'),
  updated_at: new Date('2026-07-26'),
  deleted_at: null,
  paid_amount: '0.00',
  balance: '8500.00',
};

describe('BillInvoiceService', () => {
  let service: BillInvoiceService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let guardianScope: jest.Mocked<GuardianScopeService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillInvoiceService,
        { provide: TenantPrismaService, useValue: { query: jest.fn() } },
        { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillInvoiceService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('applies default pagination with no filters', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.findAll({});
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
    });

    it('filters by studentId/status when provided', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockInvoiceRow, total_count: '1' }]);
      const result = await service.findAll({ studentId: 'student-1', status: 'POSTED' });
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('bi.student_id ='),
        'student-1', 'POSTED', 20, 0,
      );
      expect(result.data).toHaveLength(1);
    });

    it('UI-4 §2: query joins bill_payment_allocations, CLEARED payments only', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await service.findAll({});
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringMatching(/bill_payment_allocations[\s\S]*'CLEARED'/),
        20, 0,
      );
    });

    it("UI-4 §2: maps paidAmount/balance from the row's own aliases", async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockInvoiceRow, paid_amount: '3000.00', balance: '5500.00', total_count: '1' },
      ]);
      const result = await service.findAll({});
      expect(result.data[0].paidAmount).toBe(3000);
      expect(result.data[0].balance).toBe(5500);
    });
  });

  describe('findOne', () => {
    it('404s when the invoice does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the invoice with items for ACCOUNTANT_AND_ABOVE (no ownership check)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockInvoiceRow])
        .mockResolvedValueOnce([{ id: 'item-1', bill_invoice_id: 'invoice-1', fee_head_id: 'fh-1', transport_route_id: null, item_name: 'Tuition', recurrence: 'MONTHLY', gross_amount: '3000', concession_amount: '0', is_taxable: false, net_amount: '3000', proration_note: null, created_at: new Date() }]);

      const result = await service.findOne('invoice-1');
      expect(result.items).toHaveLength(1);
      expect(result.totalReceivable).toBe(8500);
      expect(result.paidAmount).toBe(0);
      expect(result.balance).toBe(8500);
    });

    it('403s a PARENT who does not own the invoice student', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockInvoiceRow]); // invoice lookup
      guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());

      await expect(service.findOne('invoice-1', 'parent-1', Role.PARENT)).rejects.toThrow(ForbiddenException);
    });

    it('200s a PARENT who owns the invoice student', async () => {
      guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockInvoiceRow])
        .mockResolvedValueOnce([]); // items

      const result = await service.findOne('invoice-1', 'parent-1', Role.PARENT);
      expect(result.id).toBe('invoice-1');
    });
  });

  describe('findByStudent', () => {
    it('403s a PARENT who does not own the student', async () => {
      guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());
      await expect(
        service.findByStudent('student-1', {}, 'parent-1', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('delegates to the same list query, scoped to the student', async () => {
      guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // invoice list

      const result = await service.findByStudent('student-1', {}, 'parent-1', Role.PARENT);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
      expect(tenantPrisma.query).toHaveBeenLastCalledWith(
        expect.stringContaining('bi.student_id ='),
        'student-1', 20, 0,
      );
    });
  });
});
