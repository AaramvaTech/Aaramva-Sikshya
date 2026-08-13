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
