import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeeAgingReportService } from '../fee-aging-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

/**
 * BILL-9: aging now sources bill_invoices with SQL-side bucket/grand-total
 * window aggregation (B9-6) — the mock simulates what Postgres would hand
 * back (each detail row already carrying its own bucket_total/bucket_count/
 * grand_total; byClass rows via GROUPING SETS with bucket=null for the
 * per-class total row), and these tests assert the service threads that
 * SQL-computed shape into the response correctly. The arithmetic itself
 * (the SQL SUM/window functions) is proven live against real Postgres, not
 * re-derived here — that's the point of moving it server-side.
 */
function agedRow(over: Record<string, unknown>) {
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
    bucket: '0-30',
    bucket_total: '100.00',
    bucket_count: '1',
    grand_total: '100.00',
    ...over,
  };
}

function classRow(over: Record<string, unknown>) {
  return { class_name: 'G9', bucket: '0-30', amount: '100.00', ...over };
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

  it('threads SQL-computed bucket totals and grand total into the response', async () => {
    queryMock
      .mockResolvedValueOnce([
        agedRow({ invoice_id: 'a', invoice_number: 'INV-A', bucket: '0-30', balance: '500.00', bucket_total: '500.00', bucket_count: '1', grand_total: '800.00' }),
        agedRow({ invoice_id: 'b', invoice_number: 'INV-B', bucket: '31-60', balance: '300.00', bucket_total: '300.00', bucket_count: '1', grand_total: '800.00' }),
      ])
      .mockResolvedValueOnce([
        classRow({ bucket: '0-30', amount: '500.00' }),
        classRow({ bucket: '31-60', amount: '300.00' }),
        classRow({ bucket: null, amount: '800.00' }),
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

  it('takes the per-class total from the GROUPING SETS row, not a JS sum of buckets', async () => {
    queryMock
      .mockResolvedValueOnce([
        agedRow({ invoice_id: 'a', bucket: '0-30', balance: '250.50', class_name: 'G9', bucket_total: '250.50', bucket_count: '1', grand_total: '425.75' }),
        agedRow({ invoice_id: 'b', bucket: '90+', balance: '100.00', class_name: 'G9', bucket_total: '100.00', bucket_count: '1', grand_total: '425.75' }),
        agedRow({ invoice_id: 'c', bucket: '31-60', balance: '75.25', class_name: 'G10', bucket_total: '75.25', bucket_count: '1', grand_total: '425.75' }),
      ])
      .mockResolvedValueOnce([
        classRow({ class_name: 'G9', bucket: '0-30', amount: '250.50' }),
        classRow({ class_name: 'G9', bucket: '90+', amount: '100.00' }),
        classRow({ class_name: 'G9', bucket: null, amount: '350.50' }),
        classRow({ class_name: 'G10', bucket: '31-60', amount: '75.25' }),
        classRow({ class_name: 'G10', bucket: null, amount: '75.25' }),
      ]);

    const result = await service.getAging({ asOf: '2026-07-12' });

    expect(result.byClass).toEqual([
      { className: 'G10', '0-30': 0, '31-60': 75.25, '61-90': 0, '90+': 0, total: 75.25 },
      { className: 'G9', '0-30': 250.5, '31-60': 0, '61-90': 0, '90+': 100, total: 350.5 },
    ]);
    expect(result.totalOutstanding).toBe(425.75);
  });

  it('returns all-zero buckets when nothing is aged', async () => {
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await service.getAging({ asOf: '2026-07-12' });
    expect(result.buckets).toEqual([
      { bucket: '0-30', amount: 0, invoices: 0 },
      { bucket: '31-60', amount: 0, invoices: 0 },
      { bucket: '61-90', amount: 0, invoices: 0 },
      { bucket: '90+', amount: 0, invoices: 0 },
    ]);
    expect(result.totalOutstanding).toBe(0);
    expect(result.byClass).toEqual([]);
  });

  it('queries bill_invoices (new-system rail), balance > 0, due_date < asOf', async () => {
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await service.getAging({ asOf: '2026-07-12' });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('FROM bill_invoices bi');
    expect(sql).toContain("status IN ('POSTED', 'PARTIALLY_PAID')");
    expect(sql).toContain("bp.status = 'CLEARED'");
    expect(sql).toContain('WHERE balance > 0');
    expect(sql).toContain('bi.due_date < $1::date');
    expect(queryMock.mock.calls[0][1]).toBe('2026-07-12');
    expect(queryMock.mock.calls[1][0]).toContain('GROUPING SETS');
  });
});
