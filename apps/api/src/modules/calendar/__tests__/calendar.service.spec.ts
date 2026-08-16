import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from '../calendar.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTenantPrisma = { query: jest.fn(), execute: jest.fn() };

const govtRow = (over: Record<string, unknown> = {}) => ({
  id: 'govt-1',
  date: '2026-10-21',
  academic_year_id: null,
  is_holiday: true,
  source: 'GOVT',
  label_en: 'Vijaya Dashami',
  label_ne: 'विजया दशमी',
  created_by: null,
  created_at: new Date('2026-08-15'),
  updated_at: new Date('2026-08-15'),
  deleted_at: null,
  ...over,
});

const schoolRow = (over: Record<string, unknown> = {}) => ({
  id: 'school-1',
  date: '2026-09-10',
  academic_year_id: null,
  is_holiday: true,
  source: 'SCHOOL',
  label_en: "Founder's Day",
  label_ne: null,
  created_by: 'owner-1',
  created_at: new Date('2026-08-15'),
  updated_at: new Date('2026-08-15'),
  deleted_at: null,
  ...over,
});

describe('CalendarService (Phase 2 — school holiday CRUD)', () => {
  let service: CalendarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
    jest.clearAllMocks();
  });

  describe('createSchoolHoliday', () => {
    it('creates a SCHOOL holiday row', async () => {
      mockTenantPrisma.query
        .mockResolvedValueOnce([]) // no existing row on that date
        .mockResolvedValueOnce([schoolRow()]); // INSERT RETURNING

      const result = await service.createSchoolHoliday(
        { date: '2026-09-10', labelEn: "Founder's Day" },
        'owner-1',
      );

      expect(result.source).toBe('SCHOOL');
      expect(result.labelEn).toBe("Founder's Day");
      const insertSql = mockTenantPrisma.query.mock.calls[1][0] as string;
      expect(insertSql).toContain("'SCHOOL'");
    });

    it('throws ConflictException when a SCHOOL holiday already exists for that date', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([{ id: 'existing' }]);

      await expect(
        service.createSchoolHoliday({ date: '2026-09-10', labelEn: 'Dup' }, 'owner-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateSchoolHoliday', () => {
    it('updates label fields on a SCHOOL row', async () => {
      mockTenantPrisma.query
        .mockResolvedValueOnce([schoolRow()]) // findLiveOrThrow
        .mockResolvedValueOnce([schoolRow({ label_en: 'Renamed' })]); // UPDATE RETURNING

      const result = await service.updateSchoolHoliday('school-1', { labelEn: 'Renamed' });

      expect(result.labelEn).toBe('Renamed');
    });

    it('throws NotFoundException for an unknown id', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);

      await expect(
        service.updateSchoolHoliday('missing', { labelEn: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    // CAL-1 locked decision: GOVT rows are fixed, not overridable per-school.
    it('throws ForbiddenException when the row is source=GOVT', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([govtRow()]);

      await expect(
        service.updateSchoolHoliday('govt-1', { labelEn: 'Nice try' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when moving the date onto another SCHOOL holiday', async () => {
      mockTenantPrisma.query
        .mockResolvedValueOnce([schoolRow()]) // findLiveOrThrow
        .mockResolvedValueOnce([{ id: 'other-school-row' }]); // date-conflict check

      await expect(
        service.updateSchoolHoliday('school-1', { date: '2026-09-11' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeSchoolHoliday', () => {
    it('soft-deletes a SCHOOL row', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([schoolRow()]);
      mockTenantPrisma.execute.mockResolvedValueOnce(1);

      await service.removeSchoolHoliday('school-1');

      const [sql] = mockTenantPrisma.execute.mock.calls[0];
      expect(sql).toContain('deleted_at = NOW()');
      expect(sql).toContain("source = 'SCHOOL'");
    });

    it('throws NotFoundException for an unknown id', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);

      await expect(service.removeSchoolHoliday('missing')).rejects.toThrow(NotFoundException);
    });

    // CAL-1 locked decision, the core Phase 2 checkpoint.
    it('throws ForbiddenException when the row is source=GOVT, and never calls execute', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([govtRow()]);

      await expect(service.removeSchoolHoliday('govt-1')).rejects.toThrow(ForbiddenException);
      expect(mockTenantPrisma.execute).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('paginates and returns both sources', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([
        { ...govtRow(), total_count: '2' },
        { ...schoolRow(), total_count: '2' },
      ]);

      const result = await service.list({ page: 1, limit: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });
});
