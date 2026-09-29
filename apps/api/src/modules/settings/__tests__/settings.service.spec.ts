import { Test } from '@nestjs/testing';
import { SettingsService } from '../settings.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { BrandingColorService } from '../../branding/branding-color.service';
import { StorageService } from '../../storage/storage.service';

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: 't-1', name: 'Demo School', slug: 'demo', logo_url: null, primary_color: '#2563EB',
    description: null, motto: null, established_year: null, website: null, address: null,
    province: null, district: null, phone: null, alternate_phone: null, email: null,
    pan_number: null, registration_number: null, affiliation_board: null, affiliation_number: null,
    principal_name: null, principal_signature_url: null, school_stamp_url: null,
    brand_color: null, print_language: null, primary_foreground: null, color_source: 'auto',
    logo_palette: null, payment_instructions: null, qr_image_url: null,
    ...over,
  };
}

describe('SettingsService — UI-7 paymentInstructions/qrImageUrl', () => {
  let service: SettingsService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let storage: jest.Mocked<StorageService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PublicPrismaService, useValue: { query: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) } },
        { provide: BrandingColorService, useValue: { deriveThemeFromLogo: jest.fn() } },
        {
          provide: StorageService,
          useValue: { verifyConfirmedKey: jest.fn(), getObjectBuffer: jest.fn(), publicUrlFor: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SettingsService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    storage = module.get(StorageService) as jest.Mocked<StorageService>;
    jest.clearAllMocks();
  });

  it('getProfile includes paymentInstructions/qrImageUrl (were exposed nowhere before UI-7)', async () => {
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([
      profileRow({ payment_instructions: 'Pay via eSewa to 98XXXXXXXX', qr_image_url: 'tenant_demo/qr-image/abc.png' }),
    ]);

    const result = await service.getProfile();

    expect(result.paymentInstructions).toBe('Pay via eSewa to 98XXXXXXXX');
    expect(result.qrImageUrl).toBe('tenant_demo/qr-image/abc.png');
  });

  it('updateProfile persists a plain paymentInstructions text field', async () => {
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([
      profileRow({ payment_instructions: 'Bank: NIC Asia, A/C 123' }),
    ]);

    const result = await service.updateProfile({ paymentInstructions: 'Bank: NIC Asia, A/C 123' } as any);

    expect(result.paymentInstructions).toBe('Bank: NIC Asia, A/C 123');
    expect(publicPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('"paymentInstructions" = $1'),
      'Bank: NIC Asia, A/C 123', 't-1',
    );
  });

  it('updateProfile verifies a qrImageFileKey against the qr-image kind and persists the KEY, not a public URL (matches principal-signature/school-stamp)', async () => {
    (storage.verifyConfirmedKey as jest.Mock).mockResolvedValueOnce(undefined);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([
      profileRow({ qr_image_url: 'tenant_demo/qr-image/xyz.png' }),
    ]);

    const result = await service.updateProfile({ qrImageFileKey: 'tenant_demo/qr-image/xyz.png' } as any);

    expect(storage.verifyConfirmedKey).toHaveBeenCalledWith('tenant_demo/qr-image/xyz.png', 'qr-image', 'demo');
    expect(result.qrImageUrl).toBe('tenant_demo/qr-image/xyz.png');
    expect(publicPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('"qrImageUrl" = $1'),
      'tenant_demo/qr-image/xyz.png', 't-1',
    );
    // publicUrlFor is the school-logo-only path (the one public-read kind) — never called for qr-image.
    expect(storage.publicUrlFor).not.toHaveBeenCalled();
  });
});

describe('SettingsService.updateProfile — FILE-1-BLOB *Url guard', () => {
  let service: SettingsService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  const DATA = 'data:image/png;base64,AAAA';
  const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const SIG = `tenant_demo/principal-signature/${UUID}.png`;
  const current = (over: Record<string, unknown> = {}) => [{ logo: null, sig: null, stamp: null, qr: null, ...over }];

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PublicPrismaService, useValue: { query: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) } },
        { provide: BrandingColorService, useValue: { deriveThemeFromLogo: jest.fn() } },
        {
          provide: StorageService,
          useValue: {
            verifyConfirmedKey: jest.fn(),
            getObjectBuffer: jest.fn(),
            publicUrlFor: jest.fn((k: string) => `http://s3.test/bucket/${k}`),
          },
        },
      ],
    }).compile();
    service = module.get(SettingsService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
  });

  const updateSqlRan = () => (publicPrisma.query as jest.Mock).mock.calls.some((c) => /UPDATE tenants/.test(c[0]));

  it.each([['logoUrl'], ['principalSignatureUrl'], ['schoolStampUrl'], ['qrImageUrl']])(
    'rejects a data: %s with 422 ASSET_LEGACY_BASE64_REJECTED and never updates',
    async (field) => {
      (publicPrisma.query as jest.Mock).mockResolvedValueOnce(current());
      await expect(service.updateProfile({ [field]: DATA } as any)).rejects.toMatchObject({
        status: 422,
        response: { code: 'ASSET_LEGACY_BASE64_REJECTED', details: { field } },
      });
      expect(updateSqlRan()).toBe(false);
    },
  );

  it('rejects an unchanged stored data: value resent (forces the cleanup to run first)', async () => {
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce(current({ sig: DATA }));
    await expect(service.updateProfile({ principalSignatureUrl: DATA } as any)).rejects.toMatchObject({
      response: { code: 'ASSET_LEGACY_BASE64_REJECTED' },
    });
  });

  it('rejects a foreign-tenant key with ASSET_REF_INVALID {field}', async () => {
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce(current());
    await expect(
      service.updateProfile({ schoolStampUrl: `tenant_other/school-stamp/${UUID}.png` } as any),
    ).rejects.toMatchObject({ response: { code: 'ASSET_REF_INVALID', details: { field: 'schoolStampUrl' } } });
  });

  it("stores '' as NULL", async () => {
    (publicPrisma.query as jest.Mock)
      .mockResolvedValueOnce(current({ sig: SIG }))
      .mockResolvedValueOnce([profileRow()]);
    await service.updateProfile({ principalSignatureUrl: '' } as any);
    expect(publicPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('"principalSignatureUrl" = $1'), null, 't-1',
    );
  });

  it('still accepts a valid storage key resent in the *Url field (web resends the stored value)', async () => {
    (publicPrisma.query as jest.Mock)
      .mockResolvedValueOnce(current({ sig: SIG }))
      .mockResolvedValueOnce([profileRow({ principal_signature_url: SIG })]);
    const r = await service.updateProfile({ principalSignatureUrl: SIG } as any);
    expect(r.principalSignatureUrl).toBe(SIG);
  });

  it("accepts this deployment's public logo URL", async () => {
    const url = `http://s3.test/bucket/tenant_demo/school-logo/${UUID}.png`;
    (publicPrisma.query as jest.Mock)
      .mockResolvedValueOnce(current())
      .mockResolvedValueOnce([profileRow({ logo_url: url, color_source: 'manual' })]);
    const r = await service.updateProfile({ logoUrl: url } as any);
    expect(r.logoUrl).toBe(url);
  });
});
