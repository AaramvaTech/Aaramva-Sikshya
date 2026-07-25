import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransportRouteService } from '../transport-route.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'tr-1',
  name: 'Route A',
  code: 'ROUTE-A',
  monthly_amount: '1500.00',
  is_active: true,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('TransportRouteService', () => {
  let service: TransportRouteService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TransportRouteService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(TransportRouteService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() inserts the decimal-string amount straight through (no float coercion)', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.create({ name: 'Route A', code: 'ROUTE-A', monthlyAmount: '1500.00' });
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transport_routes'),
      'Route A',
      'ROUTE-A',
      '1500.00',
    );
    expect(result.monthlyAmount).toBe(1500);
  });

  it('findAll() applies search + isActive filters', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, total_count: '1' }]);
    const result = await service.findAll({ search: 'Route', isActive: true });
    expect(result.meta.total).toBe(1);
    const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('name ILIKE');
    expect(sql).toContain('is_active =');
  });

  it('update() 404s on a missing row', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('softDelete() 404s on a missing row, succeeds on an existing one', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
    await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);

    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);
    await expect(service.softDelete('tr-1')).resolves.toBeUndefined();
  });
});
