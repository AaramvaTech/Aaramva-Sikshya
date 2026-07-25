import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DiscountReasonService } from '../discount-reason.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'dr-1',
  name: 'Sibling Discount',
  code: 'SIBLING',
  gl_account_code: null,
  is_active: true,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('DiscountReasonService', () => {
  let service: DiscountReasonService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DiscountReasonService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(DiscountReasonService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() inserts and maps the response', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.create({ name: 'Sibling Discount', code: 'SIBLING' });
    expect(result.code).toBe('SIBLING');
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO discount_reasons'),
      'Sibling Discount',
      'SIBLING',
      null,
    );
  });

  it('findAll() paginates and reports total from the window count', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, total_count: '3' }]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result.meta.total).toBe(3);
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
    await expect(service.softDelete('dr-1')).resolves.toBeUndefined();
  });
});
