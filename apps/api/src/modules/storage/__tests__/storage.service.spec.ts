import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage.service';
import { isStorageKey, parseStorageKey, UPLOADER_ROLES } from '../storage.policy';
import { Role } from '../../common/enums/role.enum';

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn();
  return {
    __esModule: true,
    __sendMock: send,
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((input: unknown) => ({ input, cmd: 'Put' })),
    GetObjectCommand: jest.fn((input: unknown) => ({ input, cmd: 'Get' })),
    HeadObjectCommand: jest.fn((input: unknown) => ({ input, cmd: 'Head' })),
    DeleteObjectCommand: jest.fn((input: unknown) => ({ input, cmd: 'Delete' })),
    ListObjectsV2Command: jest.fn((input: unknown) => ({ input, cmd: 'List' })),
  };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  __esModule: true,
  getSignedUrl: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __sendMock: sendMock, PutObjectCommand } = jest.requireMock('@aws-sdk/client-s3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner');

const ENABLED_ENV: Record<string, unknown> = {
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'test-access',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'aaramva-test',
  S3_FORCE_PATH_STYLE: true,
};

async function makeService(env: Record<string, unknown>) {
  const module = await Test.createTestingModule({
    providers: [
      StorageService,
      { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
    ],
  }).compile();
  const service = module.get(StorageService);
  service.onModuleInit();
  return service;
}

const UUID_KEY_RE =
  /^tenant_demo\/student-photo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSignedUrl.mockResolvedValue('https://signed.example/put');
  });

  describe('disabled path (S3_* absent)', () => {
    it('reports disabled and 503s presign attempts', async () => {
      const service = await makeService({});
      expect(service.isEnabled()).toBe(false);
      await expect(
        service.presignUpload('student-photo', 'image/jpeg', 1000, 'demo', Role.PRINCIPAL),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rejects fileKey confirmation while disabled (legacy base64 era)', async () => {
      const service = await makeService({});
      await expect(
        service.verifyConfirmedKey(
          'tenant_demo/student-photo/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg',
          'student-photo',
          'demo',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('presignUpload policy validation', () => {
    it('rejects an unknown kind', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.presignUpload('passport-scan', 'image/jpeg', 1000, 'demo', Role.PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a role outside the kind uploadRoles (TEACHER on student-photo)', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.presignUpload('student-photo', 'image/jpeg', 1000, 'demo', Role.TEACHER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a disallowed content type (pdf as student photo)', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.presignUpload('student-photo', 'application/pdf', 1000, 'demo', Role.PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an oversize declaration (3 MB student photo, 2 MB cap)', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.presignUpload('student-photo', 'image/jpeg', 3 * 1024 * 1024, 'demo', Role.PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects zero/negative/non-integer sizes', async () => {
      const service = await makeService(ENABLED_ENV);
      for (const size of [0, -5, 12.7]) {
        await expect(
          service.presignUpload('student-photo', 'image/jpeg', size, 'demo', Role.PRINCIPAL),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('presignUpload key generation', () => {
    it('generates tenant_<slug>/<kind>/<uuid>.<ext> and signs type+length', async () => {
      const service = await makeService(ENABLED_ENV);
      const result = await service.presignUpload(
        'student-photo',
        'image/jpeg',
        123456,
        'demo',
        Role.PRINCIPAL,
      );

      expect(result.key).toMatch(UUID_KEY_RE);
      expect(result.uploadUrl).toBe('https://signed.example/put');
      expect(result.expiresIn).toBe(600);
      expect(result.headers).toEqual({ 'Content-Type': 'image/jpeg' });
      expect(result.publicUrl).toBeUndefined(); // private kind

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'aaramva-test',
        Key: result.key,
        ContentType: 'image/jpeg',
        ContentLength: 123456,
      });
    });

    it('derives the extension from the content type, never the filename', async () => {
      const service = await makeService(ENABLED_ENV);
      // Even a malicious "filename" cannot influence the key — the DTO field
      // is not even passed here; extension is policy-table-driven.
      const result = await service.presignUpload(
        'staff-document',
        'application/pdf',
        5000,
        'demo',
        Role.SCHOOL_OWNER,
      );
      expect(result.key).toMatch(/\.pdf$/);
    });

    it('returns publicUrl for public-read kinds (school-logo)', async () => {
      const service = await makeService(ENABLED_ENV);
      const result = await service.presignUpload(
        'school-logo',
        'image/png',
        2048,
        'demo',
        Role.SCHOOL_OWNER,
      );
      expect(result.publicUrl).toBe(`http://127.0.0.1:9000/aaramva-test/${result.key}`);
    });

    it('honors S3_PUBLIC_URL for the public base when set', async () => {
      const service = await makeService({
        ...ENABLED_ENV,
        S3_PUBLIC_URL: 'https://cdn.aaramvashikshya.com',
      });
      const result = await service.presignUpload(
        'school-logo',
        'image/png',
        2048,
        'demo',
        Role.SCHOOL_OWNER,
      );
      expect(result.publicUrl).toBe(`https://cdn.aaramvashikshya.com/${result.key}`);
    });
  });

  describe('verifyConfirmedKey (confirm-side gate)', () => {
    const GOOD_KEY = 'tenant_demo/student-photo/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg';

    it('rejects a key for another tenant', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.verifyConfirmedKey(
          'tenant_other/student-photo/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg',
          'student-photo',
          'demo',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a key of the wrong kind (logo key confirmed as photo)', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.verifyConfirmedKey(
          'tenant_demo/school-logo/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png',
          'student-photo',
          'demo',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a client-invented key shape', async () => {
      const service = await makeService(ENABLED_ENV);
      await expect(
        service.verifyConfirmedKey('tenant_demo/student-photo/evil.jpg', 'student-photo', 'demo'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the object was never uploaded (HEAD 404)', async () => {
      const service = await makeService(ENABLED_ENV);
      sendMock.mockRejectedValueOnce(
        Object.assign(new Error('NotFound'), { name: 'NotFound' }),
      );
      await expect(
        service.verifyConfirmedKey(GOOD_KEY, 'student-photo', 'demo'),
      ).rejects.toThrow(/upload before confirming/i);
    });

    it('rejects when the stored object violates the size policy', async () => {
      const service = await makeService(ENABLED_ENV);
      sendMock.mockResolvedValueOnce({
        ContentLength: 5 * 1024 * 1024,
        ContentType: 'image/jpeg',
      });
      await expect(
        service.verifyConfirmedKey(GOOD_KEY, 'student-photo', 'demo'),
      ).rejects.toThrow(/size\/type policy/i);
    });

    it('returns the verified object info on the happy path', async () => {
      const service = await makeService(ENABLED_ENV);
      sendMock.mockResolvedValueOnce({ ContentLength: 4096, ContentType: 'image/jpeg' });
      await expect(
        service.verifyConfirmedKey(GOOD_KEY, 'student-photo', 'demo'),
      ).resolves.toEqual({ size: 4096, contentType: 'image/jpeg' });
    });
  });
});

describe('EDU-1 scopedOnly kinds (submission-file)', () => {
  it('the generic presign path REJECTS submission-file even for a STUDENT', async () => {
    const service = await makeService(ENABLED_ENV);
    await expect(
      service.presignUpload('submission-file', 'application/pdf', 1000, 'demo', Role.STUDENT),
    ).rejects.toThrow(ForbiddenException);
  });

  it('grants submission-file when the feature endpoint attests eligibility', async () => {
    const service = await makeService(ENABLED_ENV);
    const result = await service.presignUpload(
      'submission-file',
      'application/pdf',
      1000,
      'demo',
      Role.STUDENT,
      { eligibilityVerified: true },
    );
    expect(result.key).toMatch(/^tenant_demo\/submission-file\/.+\.pdf$/);
  });

  it('UPLOADER_ROLES (generic controller gate) excludes STUDENT but includes TEACHER', () => {
    expect(UPLOADER_ROLES).not.toContain(Role.STUDENT);
    expect(UPLOADER_ROLES).toContain(Role.TEACHER);
  });

  it('assignment-attachment presigns for TEACHER via the generic path', async () => {
    const service = await makeService(ENABLED_ENV);
    const result = await service.presignUpload(
      'assignment-attachment',
      'application/pdf',
      1000,
      'demo',
      Role.TEACHER,
    );
    expect(result.key).toMatch(/^tenant_demo\/assignment-attachment\/.+\.pdf$/);
    expect(result.publicUrl).toBeUndefined();
  });
});

describe('storage.policy key helpers', () => {
  const VALID = 'tenant_motherland-school/staff-document/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf';

  it('parses a valid key into slug/kind/basename', () => {
    expect(parseStorageKey(VALID)).toEqual({
      slug: 'motherland-school',
      kind: 'staff-document',
      basename: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf',
    });
  });

  it('rejects unknown kinds, foreign shapes, data-URIs and URLs', () => {
    expect(parseStorageKey('tenant_demo/passport/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg')).toBeNull();
    expect(parseStorageKey('etc/passwd')).toBeNull();
    expect(parseStorageKey('tenant_demo/student-photo/../../secret.jpg')).toBeNull();
    expect(isStorageKey('data:image/png;base64,AAAA')).toBe(false);
    expect(isStorageKey('https://cdn.example.com/x.png')).toBe(false);
    expect(isStorageKey(null)).toBe(false);
    expect(isStorageKey(VALID)).toBe(true);
  });
});
