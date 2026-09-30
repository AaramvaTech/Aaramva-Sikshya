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

  const boundParams = () => [0, 1, 2].map((i) => queryMock.mock.calls[i].slice(1));

  it('takes an AD date and filters on the stored BS columns: 2026-09-29 = 2083-06-13', async () => {
    queryMock.mockResolvedValue([]);
    const result = await service.getDaybook({ date: '2026-09-29' });
    expect(result.bsDate).toEqual({ year: 2083, month: 6, day: 13 });
    expect(result.adDate).toBe('2026-09-29');
    expect(boundParams()).toEqual([[2083, 6, 13], [2083, 6, 13], [2083, 6, 13]]);
    const entriesSql = queryMock.mock.calls[0][0] as string;
    expect(entriesSql).toContain('sle.entry_bs_year = $1');
    expect(entriesSql).toContain('sle.entry_bs_month = $2');
    expect(entriesSql).toContain('sle.entry_bs_day = $3');
  });

  it('2026-09-30 = 2083-06-14 (the date that used to 500 as "BS 2026-9-30")', async () => {
    queryMock.mockResolvedValue([]);
    const result = await service.getDaybook({ date: '2026-09-30' });
    expect(result.bsDate).toEqual({ year: 2083, month: 6, day: 14 });
    expect(boundParams()[0]).toEqual([2083, 6, 14]);
  });

  it('returns a day’s 44 entries and Rs 2,130 collected (2083-06-13)', async () => {
    const rows = Array.from({ length: 44 }, (_, i) => ({
      id: `e${i}`, entry_type: i < 42 ? 'INVOICE' : 'PAYMENT',
      debit: i < 42 ? '2130.00' : '0.00', credit: i < 42 ? '0.00' : '1065.00',
      created_at: new Date('2026-09-29T16:40:00Z'), student_id: `s${i}`, first_name: 'A', last_name: 'B',
      admission_number: `A-${i}`, narration: null, invoice_number: null,
      payment_method: i < 42 ? null : 'CASH', receipt_number: null,
    }));
    queryMock
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([{ method: 'CASH', total: '2130.00' }])
      .mockResolvedValueOnce([{ total_invoiced: '89460.00', total_collected: '2130.00', total_refunded: '0.00', net_movement: '-87330.00' }]);
    const result = await service.getDaybook({ date: '2026-09-29' });
    expect(result.entries).toHaveLength(44);
    expect(result.totals.totalCollected).toBe(2130);
    expect(boundParams()[0]).toEqual([2083, 6, 13]);
  });

  it('returns 57 entries and Rs 5,390 collected for 2083-06-14 (AD 2026-09-30)', async () => {
    const rows = Array.from({ length: 57 }, (_, i) => ({
      id: `e${i}`, entry_type: i < 54 ? 'FINE' : 'PAYMENT',
      debit: i < 54 ? '2800.00' : '0.00', credit: i < 54 ? '0.00' : '1796.66',
      created_at: new Date('2026-09-30T05:34:00Z'), student_id: `s${i}`, first_name: 'A', last_name: 'B',
      admission_number: `A-${i}`, narration: null, invoice_number: null, payment_method: null, receipt_number: null,
    }));
    queryMock
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total_invoiced: '0.00', total_collected: '5390.00', total_refunded: '0.00', net_movement: '-148910.00' }]);
    const result = await service.getDaybook({ date: '2026-09-30' });
    expect(result.entries).toHaveLength(57);
    expect(result.totals.totalCollected).toBe(5390);
    expect(boundParams()[0]).toEqual([2083, 6, 14]);
  });

  it.each([
    ['2026-02-30', 'not a real day'],
    ['2026-13-45', 'month 13'],
    ['2026-9-30', 'not zero-padded'],
    ['today', 'not a date'],
    ['1900-01-01', 'before the BS table'],
    ['2200-01-01', 'after the BS table'],
  ])('rejects %s (%s) with 400 INVALID_DATE and never queries', async (bad) => {
    const err = await service.getDaybook({ date: bad }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().code).toBe('INVALID_DATE');
    expect(err.getResponse().details.field).toBe('date');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('defaults to todayBs() when no date is given', async () => {
    queryMock.mockResolvedValue([]);
    const result = await service.getDaybook({});
    expect(result.bsDate).toEqual({ year: expect.any(Number), month: expect.any(Number), day: expect.any(Number) });
    expect(result.adDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

    const result = await service.getDaybook({ date: '2026-07-21' });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ entryType: 'INVOICE', debit: 1000, credit: 0, invoiceNumber: 'INV-1' });
    expect(result.entries[1]).toMatchObject({ entryType: 'PAYMENT', debit: 0, credit: 600, paymentMethod: 'CASH', receiptNumber: 'RCPT-1' });
    expect(result.byMethod).toEqual([{ method: 'CASH', total: 600 }]);
    expect(result.totals).toEqual({ totalInvoiced: 1000, totalCollected: 600, totalRefunded: 0, netMovement: -400 });
  });

  it('a different day returns none of a known day’s movements', async () => {
    queryMock.mockResolvedValue([]);
    const result = await service.getDaybook({ date: '2026-07-22' });
    expect(result.entries).toEqual([]);
    expect(result.byMethod).toEqual([]);
  });
});
