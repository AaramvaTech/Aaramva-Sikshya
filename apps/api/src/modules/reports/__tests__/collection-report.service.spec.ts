import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CollectionReportService } from '../collection-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('CollectionReportService', () => {
  let service: CollectionReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CollectionReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(CollectionReportService);
  });

  it('rejects a malformed from/to (delegates to resolveRange)', async () => {
    await expect(service.getCollection({ from: 'not-a-date' })).rejects.toThrow(BadRequestException);
  });

  it('collected total equals the SQL SUM; method breakdown sums to the total', async () => {
    queryMock
      .mockResolvedValueOnce([{ total: '900.00' }])
      .mockResolvedValueOnce([
        { method: 'CASH', total: '600.00', count: '2' },
        { method: 'ESEWA', total: '300.00', count: '1' },
      ]);

    const result = await service.getCollection({ from: '2026-07-01', to: '2026-07-31' });

    expect(result.totalCollected).toBe(900);
    expect(result.groupBy).toBe('method');
    expect(result.breakdown).toEqual([
      { key: 'CASH', label: 'CASH', total: 600, count: 2 },
      { key: 'ESEWA', label: 'ESEWA', total: 300, count: 1 },
    ]);
    const sumOfBreakdown = result.breakdown.reduce((s, r) => s + r.total, 0);
    expect(sumOfBreakdown).toBe(result.totalCollected);
  });

  it('only CLEARED payments in range are summed (PENDING cheque excluded by the WHERE)', async () => {
    queryMock.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
    await service.getCollection({ from: '2026-07-01', to: '2026-07-31' });
    const totalSql = queryMock.mock.calls[0][0] as string;
    expect(totalSql).toContain("status = 'CLEARED'");
    expect(totalSql).toContain('received_date BETWEEN $1::date AND $2::date');
  });

  it('groupBy=feehead prorates allocations across bill_invoice_items via net_amount/total_receivable', async () => {
    queryMock.mockResolvedValueOnce([{ total: '500.00' }]).mockResolvedValueOnce([
      { head_id: 'fh1', item_name: 'Tuition', total: '400.00' },
      { head_id: 'fh2', item_name: 'Exam Fee', total: '100.00' },
    ]);

    const result = await service.getCollection({ from: '2026-07-01', to: '2026-07-31', groupBy: 'feehead' });

    expect(result.groupBy).toBe('feehead');
    expect(result.breakdown).toEqual([
      { key: 'fh1', label: 'Tuition', total: 400 },
      { key: 'fh2', label: 'Exam Fee', total: 100 },
    ]);
    const feeHeadSql = queryMock.mock.calls[1][0] as string;
    expect(feeHeadSql).toContain('bill_payment_allocations');
    expect(feeHeadSql).toContain('bill_invoice_items');
    expect(feeHeadSql).toContain('ii.net_amount / NULLIF(bi.total_receivable, 0)');
    // TRANSPORT-ITEM (0023): fee_head_id is nullable, transport lines use
    // transport_route_id instead — the grouping key must cover both kinds.
    expect(feeHeadSql).toContain('COALESCE(ii.fee_head_id, ii.transport_route_id)');
    expect(feeHeadSql).toContain('ii.item_name');
  });

  it('an unknown groupBy falls back to method', async () => {
    queryMock.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
    const result = await service.getCollection({ from: '2026-07-01', to: '2026-07-31', groupBy: 'bogus' });
    expect(result.groupBy).toBe('method');
  });
});
