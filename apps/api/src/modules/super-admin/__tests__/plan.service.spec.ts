import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlanService } from '../plan.service';
import { PublicPrismaService } from '../public-prisma.service';

const mockPlan = {
  id: 'plan-uuid-1',
  name: 'Pro',
  monthlyPrice: '2499.00',
  annualPrice: '24990.00',
  maxStudents: 2000,
  maxStaff: 200,
  features: { sms: true, elearning: true, reports: true },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlanService', () => {
  let service: PlanService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlanService,
        {
          provide: PublicPrismaService,
          useValue: {
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PlanService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
  });

  describe('create()', () => {
    it('creates a plan record and returns formatted result', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([mockPlan]);

      const result = await service.create({
        name: 'Pro',
        monthlyPrice: 2499,
        annualPrice: 24990,
        maxStudents: 2000,
        maxStaff: 200,
        features: { sms: true, elearning: true, reports: true },
      });

      expect(result.id).toBe(mockPlan.id);
      expect(result.monthlyPrice).toBe(2499);
      expect(result.name).toBe('Pro');
    });
  });

  describe('update()', () => {
    it('updates features JSONB correctly', async () => {
      const updated = { ...mockPlan, features: { sms: false, elearning: false, reports: true } };
      (publicPrisma.query as jest.Mock).mockResolvedValue([updated]);

      const result = await service.update('plan-uuid-1', {
        features: { sms: false, elearning: false, reports: true },
      });

      expect(publicPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('features = '),
        expect.any(String),
        expect.any(String),
      );
      expect(result.features).toEqual({ sms: false, elearning: false, reports: true });
    });

    it('throws NotFoundException when plan not found', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([]);

      await expect(
        service.update('non-existent-uuid', { monthlyPrice: 999 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate()', () => {
    it('sets is_active=false without deleting the record', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...mockPlan, isActive: false },
      ]);

      const result = await service.deactivate('plan-uuid-1');

      expect(result.isActive).toBe(false);
      expect(publicPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('"isActive" = false'),
        expect.any(String),
      );
    });
  });
});
