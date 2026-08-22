import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from '../calendar.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTenantPrisma = guardSurvivingMocks({ query: jest.fn(), execute: jest.fn() });

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

describe('CalendarService (Phase 2 — school holiday CRUD; Phase 3 — working-day query surface)', () => {
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

  // ── Phase 3: working-day query surface ────────────────────────────────────

  describe('isHoliday', () => {
    it('returns true when a live holiday row exists', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([{ ok: 1 }]);
      await expect(service.isHoliday('2026-10-21')).resolves.toBe(true);
    });

    it('returns false when no row exists', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      await expect(service.isHoliday('2026-08-18')).resolves.toBe(false);
    });
  });

  describe('isWorkingDay', () => {
    it('returns false for a Saturday without needing a DB call', async () => {
      // 2026-08-15 is a Saturday
      const result = await service.isWorkingDay('2026-08-15');
      expect(result).toBe(false);
      expect(mockTenantPrisma.query).not.toHaveBeenCalled();
    });

    it('returns false for a weekday that is a holiday', async () => {
      // 2026-10-21 (Vijaya Dashami) is a Wednesday
      mockTenantPrisma.query.mockResolvedValueOnce([{ ok: 1 }]);
      await expect(service.isWorkingDay('2026-10-21')).resolves.toBe(false);
    });

    it('returns true for an ordinary weekday', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      await expect(service.isWorkingDay('2026-08-18')).resolves.toBe(true); // Tuesday
    });
  });

  describe('countWorkingDays', () => {
    it('counts correctly across a range spanning one govt holiday, one school holiday, and Saturdays', async () => {
      // 2026-08-17 (Mon) .. 2026-08-23 (Sun) — one full week.
      // 2026-08-22 is a Saturday (excluded by weekday rule).
      // Craft a GOVT holiday on 2026-08-19 (Wed) and a SCHOOL holiday on 2026-08-20 (Thu).
      mockTenantPrisma.query.mockResolvedValueOnce([
        { date: '2026-08-19' },
        { date: '2026-08-20' },
      ]);

      const result = await service.countWorkingDays('2026-08-17', '2026-08-23');

      // Mon 17, Tue 18, Wed 19(holiday), Thu 20(holiday), Fri 21, Sat 22(weekend), Sun 23
      // Working days: 17, 18, 21, 23 = 4
      expect(result).toBe(4);
    });

    it('returns 0 when startDate is after endDate', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([]);
      const result = await service.countWorkingDays('2026-08-20', '2026-08-17');
      expect(result).toBe(0);
    });

    it('returns 0 for a range that is entirely one govt holiday', async () => {
      mockTenantPrisma.query.mockResolvedValueOnce([{ date: '2026-10-21' }]);
      const result = await service.countWorkingDays('2026-10-21', '2026-10-21');
      expect(result).toBe(0);
    });
  });
});
