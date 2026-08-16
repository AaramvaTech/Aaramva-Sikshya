import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentDocumentService } from '../student-document.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StorageService } from '../../storage/storage.service';
import { GuardianScopeService } from '../guardian-scope.service';
import { Role } from '../../common/enums/role.enum';

const mockDocumentRow = {
  id: 'doc-1',
  student_id: 'student-1',
  document_type: 'BIRTH_CERTIFICATE',
  file_url: 'tenant_demo/student-document/uuid.pdf',
  file_name: 'birth-cert.pdf',
  uploaded_at: new Date('2026-08-16T00:00:00Z'),
  deleted_at: null,
};

describe('StudentDocumentService', () => {
  let service: StudentDocumentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let storage: jest.Mocked<StorageService>;
  let guardianScope: jest.Mocked<GuardianScopeService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentDocumentService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) },
        },
        {
          provide: StorageService,
          useValue: { presignUpload: jest.fn(), verifyConfirmedKey: jest.fn() },
        },
        { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentDocumentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    storage = module.get(StorageService) as jest.Mocked<StorageService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;
    jest.clearAllMocks();
  });

  describe('presignUpload()', () => {
    it('presigns a student-document upload after confirming the student exists', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'student-1' }]);
      (storage.presignUpload as jest.Mock).mockResolvedValueOnce({
        key: 'k', uploadUrl: 'u', expiresIn: 600, headers: {},
      });

      const result = await service.presignUpload(
        'student-1',
        { documentType: 'BIRTH_CERTIFICATE', filename: 'x.pdf', contentType: 'application/pdf', size: 1000 },
        Role.PRINCIPAL,
      );

      expect(storage.presignUpload).toHaveBeenCalledWith(
        'student-document', 'application/pdf', 1000, 'demo', Role.PRINCIPAL,
      );
      expect(result.key).toBe('k');
    });

    it('404s when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(
        service.presignUpload(
          'missing', { documentType: 'X', filename: 'x.pdf', contentType: 'application/pdf', size: 1000 },
          Role.PRINCIPAL,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(storage.presignUpload).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload()', () => {
    it('verifies the key and persists the document row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }]) // student exists
        .mockResolvedValueOnce([mockDocumentRow]); // INSERT ... RETURNING
      (storage.verifyConfirmedKey as jest.Mock).mockResolvedValueOnce({ size: 100, contentType: 'application/pdf' });

      const result = await service.confirmUpload('student-1', {
        documentType: 'BIRTH_CERTIFICATE',
        fileKey: 'tenant_demo/student-document/uuid.pdf',
        fileName: 'birth-cert.pdf',
      });

      expect(storage.verifyConfirmedKey).toHaveBeenCalledWith(
        'tenant_demo/student-document/uuid.pdf', 'student-document', 'demo',
      );
      expect(result.id).toBe('doc-1');
      expect(result.documentType).toBe('BIRTH_CERTIFICATE');
      expect(result.fileUrl).toBe('tenant_demo/student-document/uuid.pdf');
    });

    it('404s when the student does not exist, without touching storage', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(
        service.confirmUpload('missing', {
          documentType: 'X', fileKey: 'tenant_demo/student-document/uuid.pdf',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(storage.verifyConfirmedKey).not.toHaveBeenCalled();
    });
  });

  describe('listDocuments()', () => {
    it('staff readers see the list with no ownership check', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }]) // assertStudentExists
        .mockResolvedValueOnce([mockDocumentRow]); // list
      const result = await service.listDocuments('student-1', 'staff-1', Role.TEACHER);
      expect(guardianScope.assertOwnsStudent).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc-1');
    });

    it('PARENT is scoped through GuardianScopeService.assertOwnsStudent', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockDocumentRow]);
      await service.listDocuments('student-1', 'parent-1', Role.PARENT);
      expect(guardianScope.assertOwnsStudent).toHaveBeenCalledWith('parent-1', 'student-1');
    });

    it('PARENT viewing a non-owned student is rejected before the list query', async () => {
      (guardianScope.assertOwnsStudent as jest.Mock).mockRejectedValueOnce(new ForbiddenException());
      await expect(
        service.listDocuments('student-1', 'other-parent', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
      expect(tenantPrisma.query).not.toHaveBeenCalled();
    });

    it('STUDENT viewing their own linked record succeeds', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }]) // self-check
        .mockResolvedValueOnce([mockDocumentRow]); // list
      const result = await service.listDocuments('student-1', 'user-1', Role.STUDENT);
      expect(result).toHaveLength(1);
    });

    it('STUDENT viewing a different student is rejected with FORBIDDEN_SCOPE, no list query', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // self-check fails
      await expect(
        service.listDocuments('other-student', 'user-1', Role.STUDENT),
      ).rejects.toThrow(ForbiddenException);
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
    });
  });
});
