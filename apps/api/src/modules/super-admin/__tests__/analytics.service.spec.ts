import { Test } from '@nestjs/testing';
import { AnalyticsService } from '../analytics.service';
import { PublicPrismaService } from '../public-prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PublicPrismaService,
          useValue: { query: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
  });

  describe('getOverview()', () => {
    it('returns correct counts from mock DB results', async () => {
      (publicPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '5', active: '4', suspended: '1' }]) // totals
        .mockResolvedValueOnce([
          { status: 'TRIAL', count: '2' },
          { status: 'ACTIVE', count: '2' },
        ]) // by status
        .mockResolvedValueOnce([
          { plan_name: 'Basic', count: '2' },
          { plan_name: 'Pro', count: '1' },
        ]) // by plan
        .mockResolvedValueOnce([
          { id: 't1', name: 'School A', slug: 'schoola', created_at: new Date('2024-01-01'), plan_name: 'Basic' },
        ]); // recent

      const result = await service.getOverview();

      expect(result.totals.schools).toBe(5);
      expect(result.totals.activeSchools).toBe(4);
      expect(result.totals.suspendedSchools).toBe(1);
      expect(result.totals.trialSchools).toBe(2);
      expect(result.subscriptions.trial).toBe(2);
      expect(result.subscriptions.basic).toBe(2);
      expect(result.subscriptions.pro).toBe(1);
      expect(result.recentOnboarding).toHaveLength(1);
      expect(result.asOf).toHaveProperty('ad');
      expect(result.asOf).toHaveProperty('bs');
    });
  });
});
