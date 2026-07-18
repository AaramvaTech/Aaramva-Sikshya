import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoleLabelService } from '../role-label.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('RoleLabelService', () => {
  let service: RoleLabelService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RoleLabelService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(RoleLabelService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('findAll()', () => {
    it('falls back to the computed default label when no override exists', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.findAll();

      expect(result).toContainEqual({ role: 'ACADEMIC_COORDINATOR', label: 'Academic Coordinator', isOverridden: false });
      expect(result).toHaveLength(6);
    });

    it('uses the override label and flags isOverridden when a row exists', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { role: 'ACCOUNTANT', label: 'Finance Officer', updated_at: new Date('2024-01-01') },
      ]);

      const result = await service.findAll();

      expect(result).toContainEqual({ role: 'ACCOUNTANT', label: 'Finance Officer', isOverridden: true });
    });
  });

  describe('upsert()', () => {
    it('rejects a role outside the editable set', async () => {
      await expect(service.upsert('STUDENT', 'Learner')).rejects.toThrow(BadRequestException);
      await expect(service.upsert('PLATFORM_ADMIN', 'Owner')).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.execute).not.toHaveBeenCalled();
    });

    it('upserts a label for an editable role', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await service.upsert('TEACHER', 'Facilitator');

      expect(result).toEqual({ role: 'TEACHER', label: 'Facilitator', isOverridden: true });
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO role_labels'),
        'TEACHER',
        'Facilitator',
      );
    });
  });

  describe('reset()', () => {
    it('rejects a role outside the editable set', async () => {
      await expect(service.reset('PARENT')).rejects.toThrow(BadRequestException);
    });

    it('deletes the override and returns the default label', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await service.reset('LIBRARIAN');

      expect(result).toEqual({ role: 'LIBRARIAN', label: 'Librarian', isOverridden: false });
    });
  });
});
