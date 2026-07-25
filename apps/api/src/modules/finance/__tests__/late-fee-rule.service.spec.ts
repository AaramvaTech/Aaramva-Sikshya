import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LateFeeRuleService } from '../late-fee-rule.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'lfr-1',
  scope: 'GLOBAL',
  fee_head_id: null,
  type: 'PERCENT',
  value: '2.00',
  grace_days: 5,
  cap_amount: '500.00',
  is_enabled: false,
  effective_from: new Date('2026-01-01'),
  effective_to: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('LateFeeRuleService', () => {
  let service: LateFeeRuleService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LateFeeRuleService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(LateFeeRuleService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('PERCENT type with cap_amount set validates and persists', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);

      const result = await service.create({
        scope: 'GLOBAL' as never,
        type: 'PERCENT' as never,
        value: '2.00',
        capAmount: '500.00',
        effectiveFrom: '2026-01-01',
      });

      expect(result.type).toBe('PERCENT');
      expect(result.capAmount).toBe(500);
    });

    it('rejects scope=FEE_HEAD with no feeHeadId', async () => {
      await expect(
        service.create({
          scope: 'FEE_HEAD' as never,
          type: 'FLAT' as never,
          value: '100.00',
          effectiveFrom: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.query).not.toHaveBeenCalled();
    });

    it('forces feeHeadId to null when scope=GLOBAL, even if one was passed', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);

      await service.create({
        scope: 'GLOBAL' as never,
        feeHeadId: 'fh-should-be-ignored',
        type: 'FLAT' as never,
        value: '50.00',
        effectiveFrom: '2026-01-01',
      });

      const [, , feeHeadIdParam] = (tenantPrisma.query as jest.Mock).mock.calls[0];
      expect(feeHeadIdParam).toBeNull();
    });

    it('accepts scope=FEE_HEAD with a feeHeadId', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockRow, scope: 'FEE_HEAD', fee_head_id: 'fh-1' },
      ]);

      const result = await service.create({
        scope: 'FEE_HEAD' as never,
        feeHeadId: 'fh-1',
        type: 'PER_DAY' as never,
        value: '10.00',
        effectiveFrom: '2026-01-01',
      });

      expect(result.feeHeadId).toBe('fh-1');
    });
  });

  describe('update()', () => {
    it('404s on a missing row', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.update('missing', { isEnabled: true })).rejects.toThrow(NotFoundException);
    });

    it('toggles is_enabled', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, is_enabled: true }]);
      const result = await service.update('lfr-1', { isEnabled: true });
      expect(result.isEnabled).toBe(true);
    });
  });

  describe('softDelete()', () => {
    it('404s on a missing row', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
