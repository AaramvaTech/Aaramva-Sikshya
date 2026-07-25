import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TaxRateService } from '../tax-rate.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockRow = {
  id: 'tax-1',
  name: 'VAT',
  rate: '13.000',
  applies_to: 'ALL',
  effective_from: new Date('2026-01-01'),
  effective_to: null,
  created_by: 'user-1',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('TaxRateService', () => {
  let service: TaxRateService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TaxRateService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TaxRateService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('create()', () => {
    it('creates when no overlap exists, preserving 3dp rate precision', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no overlap
        .mockResolvedValueOnce([mockRow]); // insert RETURNING

      const result = await service.create(
        { name: 'VAT', rate: 13.5, appliesTo: undefined, effectiveFrom: '2026-01-01' } as never,
        'user-1',
      );

      expect(result.name).toBe('VAT');
      const insertCall = mockTx.$queryRawUnsafe.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO tax_rates');
      expect(insertCall[2]).toBe(13.5); // rate passed through untouched, not through Money (2dp)
    });

    it('rejects when the new range overlaps an existing active rate', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-tax' }]); // overlap found

      await expect(
        service.create(
          { name: 'VAT v2', rate: 13, effectiveFrom: '2026-06-01' } as never,
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);

      // Never reached the INSERT
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('overlap check compares against COALESCE(effective_to, infinity) both directions', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([mockRow]);

      await service.create(
        { name: 'VAT', rate: 13, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' } as never,
        'user-1',
      );

      const [sql, from, to] = mockTx.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('infinity');
      expect(from).toBe('2026-01-01');
      expect(to).toBe('2026-12-31');
    });
  });

  describe('update()', () => {
    it('re-checks overlap when effective dates change, excluding itself', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([mockRow]) // existing lookup
        .mockResolvedValueOnce([]) // no overlap (self excluded)
        .mockResolvedValueOnce([{ ...mockRow, effective_to: '2026-12-31' }]); // update RETURNING

      await service.update('tax-1', { effectiveTo: '2026-12-31' });

      const overlapCall = mockTx.$queryRawUnsafe.mock.calls[1];
      expect(overlapCall[0]).toContain('id <>');
      expect(overlapCall[3]).toBe('tax-1'); // [sql, effectiveFrom, effectiveTo, excludeId]
    });

    it('does not re-check overlap when only the name changes', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([{ ...mockRow, name: 'VAT renamed' }]);

      await service.update('tax-1', { name: 'VAT renamed' });

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2); // lookup + update, no overlap check
    });

    it('404s when the row does not exist', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete()', () => {
    it('404s on a missing row', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
