import { Test } from '@nestjs/testing';
import { AttendanceReportService } from '../attendance-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('AttendanceReportService', () => {
  let service: AttendanceReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AttendanceReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(AttendanceReportService);
  });

  describe('getTrends — BS-month folding of SQL day rows', () => {
    it('folds days across a BS month boundary into exact buckets (hand-computed)', async () => {
      // 1 Shrawan 2083 = 2026-07-17 (bs-calendar hotfix: Ashadh 2083 has 32
      // days, not 31, and Shrawan has 31, not 32 — a transposed pair in
      // BS_MONTH_DATA's 2083 row). That means 2026-07-16 is 32 Ashadh, still
      // the SAME BS month as 07-14/07-15 — three Ashadh days + one Shrawan day:
      queryMock.mockResolvedValueOnce([
        { date: new Date('2026-07-14T00:00:00Z'), present: '8', absent: '2', late: '0', leave: '0' },
        { date: new Date('2026-07-15T00:00:00Z'), present: '7', absent: '1', late: '1', leave: '1' },
        { date: new Date('2026-07-16T00:00:00Z'), present: '9', absent: '1', late: '0', leave: '0' },
        { date: new Date('2026-07-17T00:00:00Z'), present: '6', absent: '3', late: '1', leave: '0' },
      ]);

      const result = await service.getTrends({ from: '2026-07-14', to: '2026-07-17' });

      expect(result.groupBy).toBe('bs-month');
      expect(result.buckets).toEqual([
        {
          bucket: '2083-03', label: 'Ashadh 2083',
          // 8+7+9 present, 2+1+1 absent, 0+1+0 late, 0+1+0 leave → total 30, rate (24+1)/30 = 83.3
          present: 24, absent: 4, late: 1, leave: 1, total: 30, attendanceRate: 83.3,
        },
        {
          bucket: '2083-04', label: 'Shrawan 2083',
          // 6, 3, 1, 0 → total 10, rate (6+1)/10 = 70
          present: 6, absent: 3, late: 1, leave: 0, total: 10, attendanceRate: 70,
        },
      ]);
    });

    it('passes day buckets through unchanged for groupBy=day', async () => {
      queryMock.mockResolvedValueOnce([
        { date: new Date('2026-07-14T00:00:00Z'), present: '3', absent: '1', late: '0', leave: '0' },
      ]);
      const result = await service.getTrends({
        from: '2026-07-14',
        to: '2026-07-14',
        groupBy: 'day',
      });
      expect(result.buckets).toEqual([
        { bucket: '2026-07-14', label: '2026-07-14', present: 3, absent: 1, late: 0, leave: 0, total: 4, attendanceRate: 75 },
      ]);
    });

    it('sends the bounded range + filters to SQL (never unbounded)', async () => {
      queryMock.mockResolvedValueOnce([]);
      await service.getTrends({ from: '2026-06-01', to: '2026-06-30', classId: 'class-1' });
      const params = queryMock.mock.calls[0];
      expect(params[1]).toBe('2026-06-01');
      expect(params[2]).toBe('2026-06-30');
      expect(params[3]).toBe('class-1');
    });
  });

  describe('getLowAttendance — the threshold filter, hand-computed', () => {
    it('keeps only students strictly below the threshold, worst first', async () => {
      queryMock.mockResolvedValueOnce([
        // 18 of 20 marked present+late → 90% (above 75 → excluded)
        { student_id: 's1', first_name: 'High', last_name: 'Achiever', roll_number: 1, class_name: 'G9', section_name: 'A', present: '17', late: '1', total: '20' },
        // 14 of 20 → 70% (below → included)
        { student_id: 's2', first_name: 'Often', last_name: 'Away', roll_number: 2, class_name: 'G9', section_name: 'A', present: '13', late: '1', total: '20' },
        // 10 of 20 → 50% (below, and worse → first)
        { student_id: 's3', first_name: 'Rarely', last_name: 'Seen', roll_number: 3, class_name: 'G9', section_name: 'A', present: '10', late: '0', total: '20' },
      ]);

      const result = await service.getLowAttendance({ from: '2026-06-01', to: '2026-06-30' });
      expect(result.threshold).toBe(75);
      expect(result.students.map((s) => [s.studentName, s.attendanceRate])).toEqual([
        ['Rarely Seen', 50],
        ['Often Away', 70],
      ]);
    });

    it('an exactly-at-threshold student is NOT flagged (strictly below)', async () => {
      queryMock.mockResolvedValueOnce([
        { student_id: 's1', first_name: 'On', last_name: 'The Line', roll_number: 1, class_name: 'G9', section_name: 'A', present: '15', late: '0', total: '20' },
      ]);
      const result = await service.getLowAttendance({
        from: '2026-06-01',
        to: '2026-06-30',
        threshold: 75,
      });
      expect(result.students).toHaveLength(0);
    });
  });

  describe('getClassComparison', () => {
    it('computes side-by-side section rates (hand-computed)', async () => {
      queryMock.mockResolvedValueOnce([
        { section_id: 'secA', section_name: 'A', present: '40', absent: '5', late: '5', leave: '0' },
        { section_id: 'secB', section_name: 'B', present: '30', absent: '15', late: '0', leave: '5' },
      ]);
      const result = await service.getClassComparison({ classId: 'c1', from: '2026-06-01', to: '2026-06-30' });
      // A: (40+5)/50 = 90 ; B: (30+0)/50 = 60
      expect(result.sections.map((s) => [s.sectionName, s.attendanceRate])).toEqual([
        ['A', 90],
        ['B', 60],
      ]);
    });
  });
});
