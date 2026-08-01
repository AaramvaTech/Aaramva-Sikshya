import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DefaultersReportService } from '../defaulters-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

function row(over: Record<string, unknown>) {
  return {
    student_id: 's1', admission_number: 'STU-1', first_name: 'Ram', last_name: 'Thapa',
    class_id: 'c1', class_name: 'G9', section_name: 'A',
    balance: '500.00', overdue_invoices: '2', oldest_due_date: new Date('2026-06-01T00:00:00Z'),
    total_outstanding: '500.00', total_count: '1',
    ...over,
  };
}

describe('DefaultersReportService', () => {
  let service: DefaultersReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DefaultersReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(DefaultersReportService);
  });

  it('rejects a negative or non-numeric minBalance', async () => {
    await expect(service.getDefaulters({ minBalance: '-5' })).rejects.toThrow(BadRequestException);
    await expect(service.getDefaulters({ minBalance: 'abc' })).rejects.toThrow(BadRequestException);
  });

  it('a student with a known balance appears with that exact figure', async () => {
    queryMock.mockResolvedValueOnce([row({})]);
    const result = await service.getDefaulters({});
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({ studentId: 's1', balance: 500, overdueInvoices: 2 });
    expect(result.totalDefaulters).toBe(1);
    expect(result.totalOutstanding).toBe(500);
  });

  it('a fully-settled student (balance <= 0) does not appear — enforced by the WHERE, empty result', async () => {
    queryMock.mockResolvedValueOnce([]);
    const result = await service.getDefaulters({});
    expect(result.students).toEqual([]);
    expect(result.totalDefaulters).toBe(0);
    expect(result.totalOutstanding).toBe(0);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('sab.balance > 0');
  });

  it('passes classId and minBalance through as bound params, never interpolated', async () => {
    queryMock.mockResolvedValueOnce([]);
    await service.getDefaulters({ classId: 'c1', minBalance: '200' });
    expect(queryMock.mock.calls[0].slice(1)).toEqual(['c1', 200]);
  });

  it('sort=class/oldest select a whitelisted ORDER BY, unknown sort falls back to balance', async () => {
    queryMock.mockResolvedValue([]);
    await service.getDefaulters({ sort: 'class' });
    expect(queryMock.mock.calls[0][0]).toContain('s.class_name ASC');

    await service.getDefaulters({ sort: 'oldest' });
    expect(queryMock.mock.calls[1][0]).toContain('o.oldest_due_date ASC');

    await service.getDefaulters({ sort: 'DROP TABLE students;--' });
    expect(queryMock.mock.calls[2][0]).toContain('sab.balance DESC');
    expect(queryMock.mock.calls[2][0]).not.toContain('DROP TABLE');
  });

  it('reads new-system tables only (bill_invoices, student_account_balances)', async () => {
    queryMock.mockResolvedValueOnce([]);
    await service.getDefaulters({});
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('FROM bill_invoices bi');
    expect(sql).toContain('FROM student_account_balances sab');
    expect(sql).not.toMatch(/FROM invoices\b/);
  });
});
