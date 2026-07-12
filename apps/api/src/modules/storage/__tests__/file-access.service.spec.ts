import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileAccessService } from '../file-access.service';
import { StorageService } from '../storage.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';

const UUID_PART = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PHOTO_KEY = `tenant_demo/student-photo/${UUID_PART}.jpg`;
const DOC_KEY = `tenant_demo/staff-document/${UUID_PART}.pdf`;
const SIGN_KEY = `tenant_demo/principal-signature/${UUID_PART}.png`;
const LOGO_KEY = `tenant_demo/school-logo/${UUID_PART}.png`;

function user(role: Role, userId = 'u-1'): AuthUser {
  return { userId, email: 'x@example.com', role, tenantId: 't-1', tenantSlug: 'demo' };
}

describe('FileAccessService (presigned-read scoping)', () => {
  let service: FileAccessService;
  const queryMock = jest.fn();
  const presignReadMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    presignReadMock.mockResolvedValue('https://signed.example/get');

    const module = await Test.createTestingModule({
      providers: [
        FileAccessService,
        { provide: StorageService, useValue: { presignRead: presignReadMock } },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) },
        },
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();

    service = module.get(FileAccessService);
  });

  it('rejects a missing or malformed key', async () => {
    await expect(service.presignRead(undefined, user(Role.PRINCIPAL))).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.presignRead('not-a-key', user(Role.PRINCIPAL))).rejects.toThrow(
      BadRequestException,
    );
  });

  it("404s another tenant's key without revealing it exists", async () => {
    await expect(
      service.presignRead(
        `tenant_other/student-photo/${UUID_PART}.jpg`,
        user(Role.PRINCIPAL),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('404s an uploaded-but-unreferenced key (no row points at it)', async () => {
    queryMock.mockResolvedValueOnce([]); // students lookup
    await expect(service.presignRead(PHOTO_KEY, user(Role.PRINCIPAL))).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('student-photo', () => {
    const studentRow = { id: 's-1', user_id: 'student-user-1' };

    it('allows staff readers (teacher)', async () => {
      queryMock.mockResolvedValueOnce([studentRow]);
      await expect(service.presignRead(PHOTO_KEY, user(Role.TEACHER))).resolves.toEqual({
        url: 'https://signed.example/get',
        expiresIn: 300,
      });
    });

    it('allows the student themself, forbids another student', async () => {
      queryMock.mockResolvedValueOnce([studentRow]);
      await expect(
        service.presignRead(PHOTO_KEY, user(Role.STUDENT, 'student-user-1')),
      ).resolves.toMatchObject({ url: expect.any(String) });

      queryMock.mockResolvedValueOnce([studentRow]);
      await expect(
        service.presignRead(PHOTO_KEY, user(Role.STUDENT, 'other-student')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a linked parent, forbids an unlinked parent (IDOR probe)', async () => {
      queryMock
        .mockResolvedValueOnce([studentRow]) // students lookup
        .mockResolvedValueOnce([{ ok: 1 }]); // guardians link exists
      await expect(
        service.presignRead(PHOTO_KEY, user(Role.PARENT, 'parent-a')),
      ).resolves.toMatchObject({ url: expect.any(String) });

      queryMock
        .mockResolvedValueOnce([studentRow]) // students lookup
        .mockResolvedValueOnce([]); // no guardians link
      await expect(
        service.presignRead(PHOTO_KEY, user(Role.PARENT, 'parent-b')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('staff-document', () => {
    const docRow = { user_id: 'staff-user-1' };

    it('allows document managers (principal) and the owning staff member', async () => {
      queryMock.mockResolvedValueOnce([docRow]);
      await expect(
        service.presignRead(DOC_KEY, user(Role.PRINCIPAL)),
      ).resolves.toMatchObject({ url: expect.any(String) });

      queryMock.mockResolvedValueOnce([docRow]);
      await expect(
        service.presignRead(DOC_KEY, user(Role.TEACHER, 'staff-user-1')),
      ).resolves.toMatchObject({ url: expect.any(String) });
    });

    it("forbids other staff reading a colleague's document", async () => {
      queryMock.mockResolvedValueOnce([docRow]);
      await expect(
        service.presignRead(DOC_KEY, user(Role.TEACHER, 'other-teacher')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('settings images', () => {
    it('allows settings viewers (accountant) when the tenants row references the key', async () => {
      queryMock.mockResolvedValueOnce([{ ok: 1 }]);
      await expect(
        service.presignRead(SIGN_KEY, user(Role.ACCOUNTANT)),
      ).resolves.toMatchObject({ url: expect.any(String) });
    });

    it('forbids non-viewer roles (teacher) from the signature', async () => {
      await expect(service.presignRead(SIGN_KEY, user(Role.TEACHER))).rejects.toThrow(
        ForbiddenException,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  it('serves school-logo to any tenant user without a DB lookup', async () => {
    await expect(service.presignRead(LOGO_KEY, user(Role.PARENT))).resolves.toMatchObject({
      url: expect.any(String),
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
