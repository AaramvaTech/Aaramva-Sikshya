import { Test } from '@nestjs/testing';
import { FinesReportService } from '../fines-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'accrual-1', accrued_through: new Date('2026-08-03T00:00:00Z'), days_overdue: 10,
    delta_posted: '100.00', rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00',
    invoice_id: 'inv-1', invoice_number: 'INV-2083-000001',
    student_id: 's1', admission_number: 'STU-1', first_name: 'Ram', last_name: 'Thapa',
    class_id: 'c1', class_name: 'G9', section_name: 'A',
    reversed: false,
    ...over,
  };
}

describe('FinesReportService', () => {
  let service: FinesReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FinesReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(FinesReportService);
  });

  it('a fine within range appears with the exact posted amount', async () => {
    queryMock.mockResolvedValueOnce([row({})]);
    const result = await service.getFines({});
    expect(result.count).toBe(1);
    expect(result.totalFined).toBe(100);
    expect(result.accruals[0]).toMatchObject({
      id: 'accrual-1', amount: 100, daysOverdue: 10, ruleType: 'PER_DAY', ruleValue: 10,
      studentId: 's1', fullName: 'Ram Thapa', reversed: false,
    });
  });

  it('a reversed fine is still shown but excluded from totalFined', async () => {
    queryMock.mockResolvedValueOnce([
      row({ id: 'a1', delta_posted: '100.00', reversed: false }),
      row({ id: 'a2', delta_posted: '50.00', reversed: true }),
    ]);
    const result = await service.getFines({});
    expect(result.count).toBe(2);
    expect(result.totalFined).toBe(100);
    expect(result.accruals.find((a) => a.id === 'a2')?.reversed).toBe(true);
  });

  it('empty range returns zeroed totals, not undefined', async () => {
    queryMock.mockResolvedValueOnce([]);
    const result = await service.getFines({});
    expect(result.count).toBe(0);
    expect(result.totalFined).toBe(0);
    expect(result.accruals).toEqual([]);
  });

  it('passes classId through as a bound param, never interpolated', async () => {
    queryMock.mockResolvedValueOnce([]);
    await service.getFines({ classId: 'c1' });
    expect(queryMock.mock.calls[0].slice(3)).toEqual(['c1']);
  });

  it('joins bill_fine_accruals against bill_invoices and students', async () => {
    queryMock.mockResolvedValueOnce([]);
    await service.getFines({});
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('FROM bill_fine_accruals bfa');
    expect(sql).toContain('JOIN bill_invoices bi');
    expect(sql).toContain('JOIN students s');
  });
});
