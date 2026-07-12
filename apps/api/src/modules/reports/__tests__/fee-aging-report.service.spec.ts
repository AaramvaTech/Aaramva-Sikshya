import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeeAgingReportService } from '../fee-aging-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

function invoiceRow(over: Record<string, unknown>) {
  return {
    invoice_id: 'inv-x',
    invoice_number: 'INV-X',
    due_date: new Date('2026-06-01T00:00:00Z'),
    balance: '100.00',
    days_past_due: 10,
    student_id: 'stu-1',
    first_name: 'Ram',
    last_name: 'Thapa',
    class_name: 'G9',
    section_name: 'A',
    ...over,
  };
}

describe('FeeAgingReportService', () => {
  let service: FeeAgingReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FeeAgingReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(FeeAgingReportService);
  });

  it('rejects a malformed asOf', async () => {
    await expect(service.getAging({ asOf: 'today' })).rejects.toThrow(BadRequestException);
  });

  it('buckets the 30/31 boundary into different buckets (hand-computed)', async () => {
    queryMock.mockResolvedValueOnce([
      invoiceRow({ invoice_id: 'a', invoice_number: 'INV-A', days_past_due: 30, balance: '500.00' }),
      invoiceRow({ invoice_id: 'b', invoice_number: 'INV-B', days_past_due: 31, balance: '300.00' }),
    ]);

    const result = await service.getAging({ asOf: '2026-07-12' });

    expect(result.buckets).toEqual([
      { bucket: '0-30', amount: 500, invoices: 1 },
      { bucket: '31-60', amount: 300, invoices: 1 },
      { bucket: '61-90', amount: 0, invoices: 0 },
      { bucket: '90+', amount: 0, invoices: 0 },
    ]);
    expect(result.totalOutstanding).toBe(800);
    expect(result.invoices.map((i) => [i.invoiceNumber, i.bucket])).toEqual([
      ['INV-A', '0-30'],
      ['INV-B', '31-60'],
    ]);
  });

  it('rolls per-class totals across buckets (hand-computed, PARTIAL at remaining balance)', async () => {
    queryMock.mockResolvedValueOnce([
      invoiceRow({ invoice_id: 'a', days_past_due: 5, balance: '250.50', class_name: 'G9' }),
      invoiceRow({ invoice_id: 'b', days_past_due: 95, balance: '100.00', class_name: 'G9' }),
      invoiceRow({ invoice_id: 'c', days_past_due: 45, balance: '75.25', class_name: 'G10' }),
    ]);

    const result = await service.getAging({ asOf: '2026-07-12' });

    expect(result.byClass).toEqual([
      { className: 'G10', '0-30': 0, '31-60': 75.25, '61-90': 0, '90+': 0, total: 75.25 },
      { className: 'G9', '0-30': 250.5, '31-60': 0, '61-90': 0, '90+': 100, total: 350.5 },
    ]);
    expect(result.totalOutstanding).toBe(425.75);
  });

  it('queries with balance > 0 and due_date < asOf (current invoices never age)', async () => {
    queryMock.mockResolvedValueOnce([]);
    await service.getAging({ asOf: '2026-07-12' });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('i.balance > 0');
    expect(sql).toContain('i.due_date < $1::date');
    expect(queryMock.mock.calls[0][1]).toBe('2026-07-12');
  });
});
