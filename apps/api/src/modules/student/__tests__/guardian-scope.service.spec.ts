import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GuardianScopeService } from '../guardian-scope.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTenantPrisma = { query: jest.fn() };

describe('GuardianScopeService', () => {
  let service: GuardianScopeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianScopeService,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
      ],
    }).compile();

    service = module.get<GuardianScopeService>(GuardianScopeService);
    jest.clearAllMocks();
  });

  describe('assertOwnsStudent', () => {
    it('resolves when an active guardian link exists', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([{ ok: 1 }]);
      await expect(service.assertOwnsStudent('parent-1', 'student-1')).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when no link exists at all', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      await expect(service.assertOwnsStudent('parent-1', 'student-1')).rejects.toThrow(ForbiddenException);
    });

    // CL — the behavior none of the ~10 copies this replaces ever had: a
    // soft-deleted (removed) guardian-student link must be treated as absent.
    it('throws ForbiddenException when the only link is soft-deleted', async () => {
      // deleted_at IS NULL in the WHERE clause means a soft-deleted row never
      // reaches the mock as a match — simulate that by resolving empty.
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      await expect(service.assertOwnsStudent('parent-1', 'student-1')).rejects.toThrow(ForbiddenException);
      const [sql, callerId, studentId] = mockTenantPrisma.query.mock.calls[0];
      expect(sql).toMatch(/deleted_at IS NULL/);
      expect(callerId).toBe('parent-1');
      expect(studentId).toBe('student-1');
    });
  });

  describe('assertOwnsStudentInSection', () => {
    it('resolves when the guardian has an active child in the section', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([{ id: 'student-1' }]);
      await expect(
        service.assertOwnsStudentInSection('parent-1', 'section-1'),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when the guardian has no active child in the section', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      await expect(
        service.assertOwnsStudentInSection('parent-1', 'section-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('filters both the guardian link and the student on deleted_at IS NULL', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      await expect(
        service.assertOwnsStudentInSection('parent-1', 'section-1'),
      ).rejects.toThrow(ForbiddenException);
      const sql = mockTenantPrisma.query.mock.calls[0][0] as string;
      expect(sql).toMatch(/g\.deleted_at IS NULL/);
      expect(sql).toMatch(/s\.deleted_at IS NULL/);
    });
  });
});
