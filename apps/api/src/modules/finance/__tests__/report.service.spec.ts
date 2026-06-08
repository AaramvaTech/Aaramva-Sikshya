import { Test } from '@nestjs/testing';
import { ReportService } from '../report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

describe('ReportService', () => {
  let service: ReportService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: TenantPrismaService,
          useValue: { query: jest.fn() },
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

    service = module.get(ReportService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
  });

  describe('getDefaulters()', () => {
    it('returns only students with OVERDUE invoices', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          student_id: 'student-1',
          admission_number: 'ADM-001',
          full_name: 'Ram Sharma',
          class_name: 'Grade 10',
          section_name: 'A',
          overdue_invoices: '2',
          total_due: '3000.00',
          oldest_due_date: new Date('2025-03-01'),
          guardian_phone: '9841000001',
        },
        {
          student_id: 'student-2',
          admission_number: 'ADM-002',
          full_name: 'Sita Gurung',
          class_name: 'Grade 9',
          section_name: 'B',
          overdue_invoices: '1',
          total_due: '1500.00',
          oldest_due_date: new Date('2025-04-01'),
          guardian_phone: '9841000002',
        },
      ]);

      const result = await service.getDefaulters('year-1');
      const students = result.students;

      expect(result.totalDefaulters).toBe(2);
      expect(students).toHaveLength(2);
      expect(students[0].studentId).toBe('student-1');
      expect(students[0].overdueInvoices).toBe(2);
      expect(students[0].totalDue).toBe(3000);
      expect(students[0].guardianPhone).toBe('9841000001');
    });
  });

  describe('getStudentLedger()', () => {
    it('returns invoices with nested items and payments', async () => {
      // student lookup
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'student-1',
          admission_number: 'ADM-001',
          full_name: 'Ram Sharma',
          class_name: 'Grade 10',
        }])
        // academic year lookup
        .mockResolvedValueOnce([{ id: 'year-1', name: '2081/82' }])
        // invoices
        .mockResolvedValueOnce([{
          id: 'inv-1',
          invoice_number: 'INV-2081-000001',
          due_date: new Date('2025-07-15'),
          status: 'PAID',
          subtotal: '2000.00',
          discount_amount: '0.00',
          fine_amount: '0.00',
          total_amount: '2000.00',
          paid_amount: '2000.00',
          balance: '0.00',
        }])
        // invoice items for inv-1
        .mockResolvedValueOnce([{
          id: 'ii-1',
          invoice_id: 'inv-1',
          fee_category_id: 'cat-1',
          fee_category_name: 'Tuition Fee',
          original_amount: '2000.00',
          discount_percent: '0.00',
          discounted_amount: '2000.00',
          fine_per_day: '0.00',
          grace_period_days: 0,
          created_at: new Date(),
        }])
        // payments for inv-1
        .mockResolvedValueOnce([{
          id: 'pay-1',
          payment_number: 'PAY-2081-000001',
          invoice_id: 'inv-1',
          student_id: 'student-1',
          amount: '2000.00',
          method: 'CASH',
          reference: null,
          notes: null,
          received_by: 'user-1',
          created_at: new Date(),
          deleted_at: null,
        }]);

      const result = await service.getStudentLedger('student-1', 'year-1');
      const inv = result.invoices[0];

      expect(result.student.id).toBe('student-1');
      expect(result.invoices).toHaveLength(1);
      expect(inv.invoiceNumber).toBe('INV-2081-000001');
      expect(inv.items).toHaveLength(1);
      expect(inv.payments).toHaveLength(1);
      expect(result.summary.totalPaid).toBe(2000);
    });
  });
});
