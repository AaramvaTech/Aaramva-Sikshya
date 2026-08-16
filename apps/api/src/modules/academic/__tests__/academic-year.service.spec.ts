import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AcademicYearService } from '../academic-year.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockYearRow = {
  id: 'year-1',
  name: '2081-82',
  year_bs: 2081,
  start_date: new Date('2024-04-14'),
  end_date: new Date('2025-04-12'),
  is_current: false,
  created_at: new Date('2024-04-14T00:00:00Z'),
  updated_at: new Date('2024-04-14T00:00:00Z'),
  deleted_at: null,
  total_count: '1',
};

describe('AcademicYearService', () => {
  let service: AcademicYearService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  const mockTx = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AcademicYearService,
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

    service = module.get(AcademicYearService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('create()', () => {
    it('creates an academic year and returns mapped response', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([]) // assertNoOverlap: no conflict
        .mockResolvedValueOnce([mockYearRow]); // INSERT ... RETURNING

      const result = await service.create({
        name: '2081-82',
        yearBs: 2081,
        startDate: '2024-04-14',
        endDate: '2025-04-12',
      });

      expect(result.id).toBe('year-1');
      expect(result.name).toBe('2081-82');
      expect(result.yearBs).toBe(2081);
      expect(result.startDate.ad).toBe('2024-04-14');
      expect(result.isCurrent).toBe(false);
    });

    // BILL-DATA-1 Phase 3.
    it('throws BadRequestException when endDate is before startDate', async () => {
      await expect(
        service.create({ name: 'x', yearBs: 2081, startDate: '2025-04-12', endDate: '2024-04-14' }),
      ).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.query).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the range overlaps an existing academic year', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'year-1', name: '2081-82' }]);

      await expect(
        service.create({ name: '2082-83', yearBs: 2082, startDate: '2024-12-01', endDate: '2025-12-01' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update()', () => {
    it('throws ConflictException when the new range overlaps another academic year', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ start_date: '2024-04-14', end_date: '2025-04-12' }]) // current row
        .mockResolvedValueOnce([{ id: 'year-2', name: 'Other Year' }]); // assertNoOverlap: conflict

      await expect(
        service.update('year-1', { startDate: '2024-01-01' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when the resulting range has endDate before startDate', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ start_date: '2024-04-14', end_date: '2025-04-12' }]); // current row

      await expect(
        service.update('year-1', { endDate: '2024-01-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when updating dates on a nonexistent year', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.update('nonexistent', { startDate: '2024-01-01' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setCurrentYear()', () => {
    it('unsets previous current year and sets new one in same transaction', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ ...mockYearRow, is_current: true }]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.setCurrentYear('year-1');

      expect(tenantPrisma.run).toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('is_current = false'),
      );
      expect(result.isCurrent).toBe(true);
    });

    it('throws NotFoundException if academic year does not exist', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]);

      await expect(service.setCurrentYear('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
