import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeeHeadService } from '../fee-head.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { FeeHeadRecurrence, ProrationPolicy } from '../dto/fee-head.dto';

const mockFeeHeadRow = {
  id: 'fh-1',
  name: 'Tuition Fee',
  code: 'TUITION',
  recurrence: 'MONTHLY',
  is_taxable: false,
  is_refundable: false,
  proration_policy: 'NONE',
  gl_account_code: null,
  display_order: 0,
  is_active: true,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('FeeHeadService', () => {
  let service: FeeHeadService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FeeHeadService,
        {
          provide: TenantPrismaService,
          useValue: { query: jest.fn(), execute: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(FeeHeadService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('inserts with defaults applied for optional fields', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockFeeHeadRow]);

      const result = await service.create({
        name: 'Tuition Fee',
        code: 'TUITION',
        recurrence: FeeHeadRecurrence.MONTHLY,
      });

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fee_heads'),
        'Tuition Fee',
        'TUITION',
        FeeHeadRecurrence.MONTHLY,
        false, // isTaxable default
        false, // isRefundable default
        'NONE', // prorationPolicy default
        null,
        0,
      );
      expect(result.id).toBe('fh-1');
      expect(result.recurrence).toBe('MONTHLY');
    });

    it('respects explicit taxable/refundable/proration values', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockFeeHeadRow,
        is_taxable: true,
        is_refundable: true,
        proration_policy: 'MONTHLY',
      }]);

      await service.create({
        name: 'Transport Fee',
        code: 'TRANSPORT',
        recurrence: FeeHeadRecurrence.MONTHLY,
        isTaxable: true,
        isRefundable: true,
        prorationPolicy: ProrationPolicy.MONTHLY,
      });

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fee_heads'),
        'Transport Fee',
        'TRANSPORT',
        FeeHeadRecurrence.MONTHLY,
        true,
        true,
        'MONTHLY',
        null,
        0,
      );
    });
  });

  describe('findAll()', () => {
    it('filters by search and isActive, paginates', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockFeeHeadRow, total_count: '1' },
      ]);

      const result = await service.findAll({ search: 'Tuition', isActive: true, page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0];
      expect(sql).toContain('name ILIKE');
      expect(sql).toContain('is_active =');
    });

    it('returns empty with zero total when nothing matches', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.findAll({});
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('update()', () => {
    it('builds a partial SET clause from only the provided fields', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockFeeHeadRow, name: 'Renamed Fee' },
      ]);

      const result = await service.update('fh-1', { name: 'Renamed Fee' });

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        'Renamed Fee',
        'fh-1',
      );
      expect(result.name).toBe('Renamed Fee');
    });

    it('throws NotFoundException when the row does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes an existing row', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);
      await expect(service.softDelete('fh-1')).resolves.toBeUndefined();
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = NOW()'),
        'fh-1',
      );
    });

    it('throws NotFoundException when nothing was deleted', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
