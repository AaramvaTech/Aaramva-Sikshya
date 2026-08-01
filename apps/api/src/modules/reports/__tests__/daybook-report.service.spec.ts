import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DaybookReportService } from '../daybook-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('DaybookReportService', () => {
  let service: DaybookReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DaybookReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(DaybookReportService);
  });

  it('rejects a malformed bsDate', async () => {
    await expect(service.getDaybook({ bsDate: '2083-4-6' })).rejects.toThrow(BadRequestException);
    await expect(service.getDaybook({ bsDate: 'today' })).rejects.toThrow(BadRequestException);
  });

  it('filters directly on entry_bs_year/month/day columns — no AD conversion', async () => {
    queryMock.mockResolvedValue([]);
    await service.getDaybook({ bsDate: '2083-04-06' });
    expect(queryMock.mock.calls[0].slice(1)).toEqual([2083, 4, 6]);
    expect(queryMock.mock.calls[1].slice(1)).toEqual([2083, 4, 6]);
    expect(queryMock.mock.calls[2].slice(1)).toEqual([2083, 4, 6]);
    const entriesSql = queryMock.mock.calls[0][0] as string;
    expect(entriesSql).toContain('sle.entry_bs_year = $1');
    expect(entriesSql).toContain('sle.entry_bs_month = $2');
    expect(entriesSql).toContain('sle.entry_bs_day = $3');
  });

  it('defaults to todayBs() when bsDate is omitted', async () => {
    queryMock.mockResolvedValue([]);
    const result = await service.getDaybook({});
    expect(result.bsDate).toEqual({ year: expect.any(Number), month: expect.any(Number), day: expect.any(Number) });
  });

  it('threads entries, per-method totals, and SQL-computed totals into the response', async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: 'e1', entry_type: 'INVOICE', debit: '1000.00', credit: '0.00',
          created_at: new Date('2026-07-20T05:00:00Z'), student_id: 's1',
          first_name: 'Ram', last_name: 'Thapa', admission_number: 'STU-1',
          narration: 'Invoice INV-1', invoice_number: 'INV-1', payment_method: null, receipt_number: null,
        },
        {
          id: 'e2', entry_type: 'PAYMENT', debit: '0.00', credit: '600.00',
          created_at: new Date('2026-07-20T06:00:00Z'), student_id: 's1',
          first_name: 'Ram', last_name: 'Thapa', admission_number: 'STU-1',
          narration: 'Payment RCPT-1', invoice_number: null, payment_method: 'CASH', receipt_number: 'RCPT-1',
        },
      ])
      .mockResolvedValueOnce([{ method: 'CASH', total: '600.00' }])
      .mockResolvedValueOnce([{
        total_invoiced: '1000.00', total_collected: '600.00', total_refunded: '0.00', net_movement: '-400.00',
      }]);

    const result = await service.getDaybook({ bsDate: '2083-04-06' });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ entryType: 'INVOICE', debit: 1000, credit: 0, invoiceNumber: 'INV-1' });
    expect(result.entries[1]).toMatchObject({ entryType: 'PAYMENT', debit: 0, credit: 600, paymentMethod: 'CASH', receiptNumber: 'RCPT-1' });
    expect(result.byMethod).toEqual([{ method: 'CASH', total: 600 }]);
    expect(result.totals).toEqual({ totalInvoiced: 1000, totalCollected: 600, totalRefunded: 0, netMovement: -400 });
  });

  it('a different day returns none of a known day’s movements', async () => {
    queryMock.mockResolvedValue([]);
    const result = await service.getDaybook({ bsDate: '2083-04-07' });
    expect(result.entries).toEqual([]);
    expect(result.byMethod).toEqual([]);
  });
});
