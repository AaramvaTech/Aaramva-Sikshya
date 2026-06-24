import { Test } from '@nestjs/testing';
import { OnboardingService } from '../onboarding.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: { tenant: { findUnique: jest.Mock; update: jest.Mock } };
  let tenantPrisma: { query: jest.Mock };

  beforeEach(async () => {
    prisma = { tenant: { findUnique: jest.fn(), update: jest.fn() } };
    tenantPrisma = { query: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) },
        },
      ],
    }).compile();

    service = moduleRef.get(OnboardingService);
    jest.clearAllMocks();
  });

  // counts are queried in order: currentYears, classes, sections, classSubjects
  function mockCounts(year: number, classes: number, sections: number, classSubjects: number) {
    tenantPrisma.query
      .mockResolvedValueOnce([{ n: String(year) }])
      .mockResolvedValueOnce([{ n: String(classes) }])
      .mockResolvedValueOnce([{ n: String(sections) }])
      .mockResolvedValueOnce([{ n: String(classSubjects) }]);
  }

  it('empty school → step 1, nothing done, not completed', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ onboardingCompletedAt: null });
    mockCounts(0, 0, 0, 0);

    const s = await service.getStatus();

    expect(s.steps).toEqual({ year: false, classes: false, sections: false, subjects: false });
    expect(s.currentStep).toBe(1);
    expect(s.academicComplete).toBe(false);
    expect(s.completed).toBe(false);
  });

  it('derives currentStep from data presence (year + classes only → step 3)', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ onboardingCompletedAt: null });
    mockCounts(1, 2, 0, 0);

    const s = await service.getStatus();

    expect(s.steps).toEqual({ year: true, classes: true, sections: false, subjects: false });
    expect(s.currentStep).toBe(3); // first incomplete = sections
    expect(s.academicComplete).toBe(false);
  });

  it('all steps satisfied → academicComplete, currentStep 5; completed reflects the flag', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ onboardingCompletedAt: new Date() });
    mockCounts(1, 3, 5, 8);

    const s = await service.getStatus();

    expect(s.steps).toEqual({ year: true, classes: true, sections: true, subjects: true });
    expect(s.academicComplete).toBe(true);
    expect(s.currentStep).toBe(5);
    expect(s.completed).toBe(true);
    expect(s.counts).toEqual({ hasCurrentYear: true, classes: 3, sections: 5, classSubjects: 8 });
  });

  it('complete() sets the flag then returns fresh status', async () => {
    prisma.tenant.update.mockResolvedValue({});
    prisma.tenant.findUnique.mockResolvedValue({ onboardingCompletedAt: new Date() });
    mockCounts(1, 1, 1, 1);

    const s = await service.complete();

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't-1' },
        data: expect.objectContaining({ onboardingCompletedAt: expect.any(Date) }),
      }),
    );
    expect(s.completed).toBe(true);
  });
});
