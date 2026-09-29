import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTaxRateDto } from '../dto/tax-rate.dto';
import { Test } from '@nestjs/testing';
import { TaxRateService } from '../tax-rate.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

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

    it('changes applies_to when no posted bill used a rate', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([mockRow]) // existing
        .mockResolvedValueOnce([{ used: false }]) // usage check
        .mockResolvedValueOnce([{ ...mockRow, applies_to: 'TAXABLE_HEADS' }]); // UPDATE

      const result = await service.update('tax-1', { appliesTo: 'TAXABLE_HEADS' } as never);

      expect(result.appliesTo).toBe('TAXABLE_HEADS');
      const [sql, ...params] = mockTx.$queryRawUnsafe.mock.calls[2];
      expect(sql).toContain('applies_to = $1');
      expect(params).toEqual(['TAXABLE_HEADS', 'tax-1']);
    });

    it('changes the rate when no posted bill used a rate', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([{ used: false }])
        .mockResolvedValueOnce([{ ...mockRow, rate: '13.500' }]);

      await service.update('tax-1', { rate: 13.5 } as never);

      const [sql, ...params] = mockTx.$queryRawUnsafe.mock.calls[2];
      expect(sql).toContain('rate = $1');
      expect(params).toEqual([13.5, 'tax-1']);
    });

    it.each([
      ['applies_to', { appliesTo: 'TAXABLE_HEADS' }],
      ['rate', { rate: 15 }],
    ])('409 TAX_RATE_IN_USE when a posted bill used a rate and %s changes; nothing is written', async (_n, dto) => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([{ used: true }]);

      const err = await service.update('tax-1', dto as never).catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().code).toBe('TAX_RATE_IN_USE');
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2); // no UPDATE
    });

    it('an unchanged applies_to/rate never consults usage, so renaming a used rate still works', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([{ ...mockRow, name: 'VAT2' }]);

      await service.update('tax-1', { name: 'VAT2', appliesTo: 'ALL', rate: 13 } as never);

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2); // lookup + update only
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

  describe('UpdateTaxRateDto validation', () => {
    const errs = (o: object) => validate(plainToInstance(UpdateTaxRateDto, o));

    it('accepts ALL and TAXABLE_HEADS', async () => {
      expect(await errs({ appliesTo: 'ALL' })).toHaveLength(0);
      expect(await errs({ appliesTo: 'TAXABLE_HEADS' })).toHaveLength(0);
    });

    it('rejects an unknown applies_to and an out-of-range/over-precise rate', async () => {
      expect((await errs({ appliesTo: 'SOME' }))[0].property).toBe('appliesTo');
      expect((await errs({ rate: 101 }))[0].property).toBe('rate');
      expect((await errs({ rate: 13.0001 }))[0].property).toBe('rate');
    });
  });
});
