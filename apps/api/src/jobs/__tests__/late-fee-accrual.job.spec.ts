import { Test } from '@nestjs/testing';
import { LateFeeAccrualService } from '../late-fee-accrual.job';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../modules/tenant/tenant-context.service';
import { TenantPrismaService } from '../../modules/tenant/tenant-prisma.service';
import { BillFineService } from '../../modules/finance/bill-fine.service';

function runResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1', triggeredBy: 'SCHEDULED', triggeredByUserId: 'owner-1', runDate: '2026-08-04',
    startedAt: '2026-08-04T00:10:00.000Z', finishedAt: '2026-08-04T00:10:01.000Z',
    invoicesScanned: 0, invoicesFined: 0, totalFinePosted: 0, status: 'COMPLETED',
    createdAt: '2026-08-04T00:10:00.000Z',
    ...overrides,
  };
}

describe('LateFeeAccrualService', () => {
  let service: LateFeeAccrualService;
  let prisma: { tenant: { findMany: jest.Mock } };
  let tenantPrisma: { query: jest.Mock };
  let billFineService: { runLateFees: jest.Mock };
  let contexts: string[];

  beforeEach(async () => {
    prisma = { tenant: { findMany: jest.fn() } };
    tenantPrisma = { query: jest.fn() };
    billFineService = { runLateFees: jest.fn() };
    contexts = [];
    const tenantContext = {
      run: jest.fn((ctx: { schemaName: string }, cb: () => unknown) => {
        contexts.push(ctx.schemaName);
        return cb();
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LateFeeAccrualService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: BillFineService, useValue: billFineService },
      ],
    }).compile();
    service = moduleRef.get(LateFeeAccrualService);
  });

  it('resolves the SCHOOL_OWNER and runs the engine as SCHEDULED', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 't1', slug: 'demo' }]);
    tenantPrisma.query.mockResolvedValueOnce([{ id: 'owner-1' }]);
    billFineService.runLateFees.mockResolvedValueOnce(
      runResponse({ invoicesScanned: 1, invoicesFined: 1, totalFinePosted: 100 }),
    );

    const summary = await service.run('manual');

    expect(billFineService.runLateFees).toHaveBeenCalledWith('SCHEDULED', 'owner-1');
    expect(summary).toMatchObject({
      trigger: 'manual', tenants: 1, failedTenants: [],
      invoicesScanned: 1, invoicesFined: 1, totalFinePosted: 100,
    });
  });

  it('uses the canonical schema mapping for dash-containing slugs', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 't1', slug: 'motherland-school' }]);
    tenantPrisma.query.mockResolvedValueOnce([{ id: 'owner-1' }]);
    billFineService.runLateFees.mockResolvedValueOnce(runResponse());

    await service.run('cron');

    expect(contexts).toEqual(['tenant_motherland_school']);
  });

  it('sums scanned/fined/totalFinePosted across multiple tenants', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', slug: 'demo' },
      { id: 't2', slug: 'motherland-school' },
    ]);
    tenantPrisma.query.mockResolvedValueOnce([{ id: 'owner-1' }]).mockResolvedValueOnce([{ id: 'owner-2' }]);
    billFineService.runLateFees
      .mockResolvedValueOnce(runResponse({ invoicesScanned: 2, invoicesFined: 1, totalFinePosted: 50 }))
      .mockResolvedValueOnce(runResponse({ invoicesScanned: 3, invoicesFined: 2, totalFinePosted: 75 }));

    const summary = await service.run('cron');

    expect(summary.invoicesScanned).toBe(5);
    expect(summary.invoicesFined).toBe(3);
    expect(summary.totalFinePosted).toBe(125);
  });

  it('continues past a failing tenant (no resolvable owner) and reports it', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', slug: 'broken' },
      { id: 't2', slug: 'healthy' },
    ]);
    tenantPrisma.query
      .mockResolvedValueOnce([]) // broken: no SCHOOL_OWNER row
      .mockResolvedValueOnce([{ id: 'owner-1' }]); // healthy
    billFineService.runLateFees.mockResolvedValueOnce(
      runResponse({ invoicesScanned: 1, invoicesFined: 0, totalFinePosted: 0 }),
    );

    const summary = await service.run('cron');

    expect(summary.failedTenants).toEqual(['broken']);
    expect(summary.tenants).toBe(2);
    expect(billFineService.runLateFees).toHaveBeenCalledTimes(1);
  });

  it('continues past a tenant where the engine itself throws', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', slug: 'broken' },
      { id: 't2', slug: 'healthy' },
    ]);
    tenantPrisma.query.mockResolvedValueOnce([{ id: 'owner-1' }]).mockResolvedValueOnce([{ id: 'owner-2' }]);
    billFineService.runLateFees
      .mockRejectedValueOnce(new Error('db exploded'))
      .mockResolvedValueOnce(runResponse({ invoicesScanned: 1, invoicesFined: 1, totalFinePosted: 10 }));

    const summary = await service.run('cron');

    expect(summary.failedTenants).toEqual(['broken']);
    expect(summary.invoicesFined).toBe(1);
    expect(summary.totalFinePosted).toBe(10);
  });
});
