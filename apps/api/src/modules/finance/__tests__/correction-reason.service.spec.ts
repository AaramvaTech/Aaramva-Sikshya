import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CorrectionReasonService } from '../correction-reason.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'cr-1',
  name: 'Billing Error',
  code: 'BILLING_ERROR',
  gl_account_code: null,
  is_active: true,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('CorrectionReasonService', () => {
  let service: CorrectionReasonService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CorrectionReasonService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(CorrectionReasonService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() inserts and maps the response', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.create({ name: 'Billing Error', code: 'BILLING_ERROR' });
    expect(result.code).toBe('BILLING_ERROR');
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO correction_reasons'),
      'Billing Error',
      'BILLING_ERROR',
      null,
    );
  });

  it('findAll() paginates and reports total from the window count', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, total_count: '2' }]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(1);
  });

  it('update() 404s on a missing row', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('softDelete() 404s on a missing row', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
    await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
  });

  it('softDelete() succeeds on an existing row', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);
    await expect(service.softDelete('cr-1')).resolves.toBeUndefined();
  });
});
