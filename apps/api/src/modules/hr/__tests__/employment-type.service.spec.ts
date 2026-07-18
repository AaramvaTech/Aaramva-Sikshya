import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmploymentTypeService } from '../employment-type.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const baseRow = {
  id: 'et-1',
  name: 'Permanent',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
  staff_count: '3',
  total_count: '1',
};

describe('EmploymentTypeService', () => {
  let service: EmploymentTypeService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmploymentTypeService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(EmploymentTypeService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('inserts and returns the mapped response', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...baseRow, staff_count: '0' }]);

      const result = await service.create({ name: 'Permanent' });

      expect(result).toEqual({ id: 'et-1', name: 'Permanent', staffCount: 0, createdAt: expect.any(String) });
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO employment_types'),
        'Permanent',
      );
    });
  });

  describe('findAll()', () => {
    it('returns paginated data with staff counts', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseRow]);

      const result = await service.findAll({});

      expect(result.data).toEqual([{ id: 'et-1', name: 'Permanent', staffCount: 3, createdAt: expect.any(String) }]);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
    });
  });

  describe('update()', () => {
    it('throws NotFoundException when the row is missing', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.update('missing-id', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('renames an existing row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([baseRow])
        .mockResolvedValueOnce([{ ...baseRow, name: 'Contractual' }]);

      const result = await service.update('et-1', { name: 'Contractual' });

      expect(result.name).toBe('Contractual');
    });
  });

  describe('softDelete()', () => {
    it('throws NotFoundException when the row is missing', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.softDelete('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('marks the row deleted', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'et-1' }]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(undefined);

      await service.softDelete('et-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE employment_types SET deleted_at'),
        'et-1',
      );
    });
  });
});
