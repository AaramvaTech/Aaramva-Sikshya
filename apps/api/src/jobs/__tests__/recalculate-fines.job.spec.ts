import { Test } from '@nestjs/testing';
import { RecalculateFinesService } from '../recalculate-fines.job';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../modules/tenant/tenant-context.service';
import { InvoiceService } from '../../modules/finance/invoice.service';

const pastDate = { ad: '2020-01-01' };
const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return { ad: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
})();

describe('RecalculateFinesService', () => {
  let service: RecalculateFinesService;
  let prisma: { tenant: { findMany: jest.Mock } };
  let invoiceService: { findAll: jest.Mock; recalculateFine: jest.Mock };
  let contexts: string[];

  beforeEach(async () => {
    prisma = { tenant: { findMany: jest.fn() } };
    invoiceService = { findAll: jest.fn(), recalculateFine: jest.fn() };
    contexts = [];
    const tenantContext = {
      // Capture the schemaName each run binds, then execute the callback.
      run: jest.fn((ctx: { schemaName: string }, cb: () => unknown) => {
        contexts.push(ctx.schemaName);
        return cb();
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecalculateFinesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: InvoiceService, useValue: invoiceService },
      ],
    }).compile();
    service = moduleRef.get(RecalculateFinesService);
  });

  it('recalculates only past-due invoices and reports a summary', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 't1', slug: 'demo' }]);
    invoiceService.findAll
      .mockResolvedValueOnce({ data: [{ id: 'inv-past', dueDate: pastDate }] }) // UNPAID
      .mockResolvedValueOnce({ data: [{ id: 'inv-future', dueDate: futureDate }] }); // PARTIAL

    const summary = await service.run('manual');

    expect(invoiceService.recalculateFine).toHaveBeenCalledTimes(1);
    expect(invoiceService.recalculateFine).toHaveBeenCalledWith('inv-past');
    expect(summary).toMatchObject({
      trigger: 'manual',
      tenants: 1,
      failedTenants: [],
      recalculated: 1,
    });
  });

  it('uses the canonical schema mapping for dash-containing slugs', async () => {
    // The dead BullMQ version built `tenant_${slug}` by hand — wrong for
    // motherland-school. Regression-lock the fix.
    prisma.tenant.findMany.mockResolvedValue([{ id: 't1', slug: 'motherland-school' }]);
    invoiceService.findAll.mockResolvedValue({ data: [] });

    await service.run('cron');

    expect(contexts).toEqual(['tenant_motherland_school']);
  });

  it('continues past a failing tenant and reports it', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', slug: 'broken' },
      { id: 't2', slug: 'healthy' },
    ]);
    invoiceService.findAll
      .mockRejectedValueOnce(new Error('boom')) // broken tenant, first findAll
      .mockResolvedValueOnce({ data: [{ id: 'inv-1', dueDate: pastDate }] }) // healthy UNPAID
      .mockResolvedValueOnce({ data: [] }); // healthy PARTIAL

    const summary = await service.run('cron');

    expect(summary.failedTenants).toEqual(['broken']);
    expect(summary.tenants).toBe(2);
    expect(summary.recalculated).toBe(1);
  });
});
