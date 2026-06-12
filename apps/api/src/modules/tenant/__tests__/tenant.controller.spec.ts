// apps/api/src/modules/tenant/__tests__/tenant.controller.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantController } from '../tenant.controller';
import { PrismaService } from '../../../prisma/prisma.service';

const mockActiveTenant = {
  slug: 'sunrise-ktm',
  name: 'Sunrise Secondary School',
  logoUrl: 'https://cdn.example.com/sunrise.png',
  address: 'Kathmandu',
};

describe('TenantController.verifySlug()', () => {
  let controller: TenantController;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      tenant: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TenantController);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // Test 7: active slug → 200 with name/logo
  it('returns tenant info for an active slug', async () => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValueOnce(mockActiveTenant);

    const result = await controller.verifySlug('sunrise-ktm');

    expect(result.slug).toBe('sunrise-ktm');
    expect(result.name).toBe('Sunrise Secondary School');
    expect(result.logoUrl).toBe('https://cdn.example.com/sunrise.png');
    expect(result.address).toBe('Kathmandu');
  });

  // Test 8: nonexistent/suspended slug → 404 (identical response, no leak)
  it('throws NotFoundException for a nonexistent slug', async () => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(controller.verifySlug('no-such-school')).rejects.toThrow(NotFoundException);
  });

  // Test 9: uppercase input → normalized to lowercase before lookup
  it('normalizes uppercase slug to lowercase before lookup', async () => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValueOnce(mockActiveTenant);

    await controller.verifySlug('SUNRISE-KTM');

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ slug: 'sunrise-ktm' }) }),
    );
  });
});
