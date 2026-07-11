import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentMeService, todayInNepal } from '../student-me.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { ResultService } from '../../examination/result.service';

// ─── Shared mock data ──────────────────────────────────────────────────────────

const STUDENT_USER_ID = 'user-student-1';

const mockStudentRow = {
  id: 'student-uuid-1',
  student_id: '2082-0001',
  first_name: 'Aarav',
  last_name: 'Shrestha',
  photo_url: null,
  section_id: 'section-uuid-1',
  roll_number: 12,
};

const mockStudentNoSection = {
  ...mockStudentRow,
  section_id: null,
  roll_number: null,
};

const mockEnrollmentRow = {
  class_name: 'Class 8',
  section_name: 'B',
  academic_year_id: 'year-uuid-1',
  academic_year_name: '2082',
};

const mockAcademicYear = {
  id: 'year-uuid-1',
  name: '2082',
  start_date: new Date('2025-04-13'),
  end_date: new Date('2026-04-12'),
};

const mockTimetableSlot = {
  slot_id: 'slot-uuid-1',
  period_number: 1,
  start_time: '10:00:00',
  end_time: '10:45:00',
  subject_id: 'subj-uuid-1',
  subject_name: 'Mathematics',
  subject_code: 'MATH',
  teacher_id: 'teacher-uuid-1',
  teacher_full_name: 'Sita Rai',
  room: '201',
};

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('StudentMeService', () => {
  let service: StudentMeService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let resultService: jest.Mocked<ResultService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentMeService,
        {
          provide: TenantPrismaService,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: ResultService,
          useValue: {
            getStudentResults: jest.fn(),
            getReportCard: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(StudentMeService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    resultService = module.get(ResultService) as jest.Mocked<ResultService>;
    jest.clearAllMocks();
  });

  // ─── Self-results (Task 2) ──────────────────────────────────────────────────

  describe('getMyResults() / getMyReportCard()', () => {
    it('resolves studentId from the token and delegates to ResultService', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockStudentRow]); // resolveStudent
      (resultService.getStudentResults as jest.Mock).mockResolvedValueOnce([{ examTypeName: 'First Terminal' }]);

      const result = await service.getMyResults(STUDENT_USER_ID);

      // studentId comes from the resolved record, never from a param
      expect(resultService.getStudentResults).toHaveBeenCalledWith('student-uuid-1', STUDENT_USER_ID, 'STUDENT');
      expect(result).toEqual([{ examTypeName: 'First Terminal' }]);
    });

    it('report-card delegates with the resolved studentId', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockStudentRow]);
      (resultService.getReportCard as jest.Mock).mockResolvedValueOnce({ student: { id: 'student-uuid-1' } });

      await service.getMyReportCard(STUDENT_USER_ID);

      expect(resultService.getReportCard).toHaveBeenCalledWith('student-uuid-1', STUDENT_USER_ID, 'STUDENT');
    });

    it('throws ForbiddenException (no delegate) when the account has no linked student', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // no student

      await expect(service.getMyResults('unlinked-user')).rejects.toThrow(ForbiddenException);
      expect(resultService.getStudentResults).not.toHaveBeenCalled();
    });
  });

  // ─── B.1: getMyProfile() ────────────────────────────────────────────────────

  describe('getMyProfile()', () => {
    it('returns own profile with enrollment info when student has a section', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentRow])      // resolveStudent
        .mockResolvedValueOnce([mockEnrollmentRow]);  // enrollment JOIN

      const result = await service.getMyProfile(STUDENT_USER_ID);

      expect(result.id).toBe('student-uuid-1');
      expect(result.admissionNumber).toBe('2082-0001');
      expect(result.firstName).toBe('Aarav');
      expect(result.lastName).toBe('Shrestha');
      expect(result.photoUrl).toBeNull();
      expect(result.currentEnrollment).not.toBeNull();
      expect(result.currentEnrollment!.className).toBe('Class 8');
      expect(result.currentEnrollment!.sectionName).toBe('B');
      expect(result.currentEnrollment!.rollNumber).toBe(12);
      expect(result.currentEnrollment!.sectionId).toBe('section-uuid-1'); // POL-2 T2
      expect(result.currentEnrollment!.academicYearId).toBe('year-uuid-1');
      expect(result.currentEnrollment!.academicYearName).toBe('2082');
    });

    it('throws ForbiddenException when userId has no linked student record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // no student

      await expect(service.getMyProfile('unlinked-user')).rejects.toThrow(ForbiddenException);
    });

    it('returns null currentEnrollment when student has no section_id', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentNoSection]); // no section_id → no JOIN

      const result = await service.getMyProfile(STUDENT_USER_ID);

      expect(result.currentEnrollment).toBeNull();
      // Should NOT make a second query since section_id is null
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
    });
  });

  // ─── B.2: getMyTodayTimetable() ─────────────────────────────────────────────

  describe('getMyTodayTimetable()', () => {
    it('returns isSchoolDay:false with empty periods on Saturday (dayOfWeek=6)', async () => {
      // 2026-06-13 is a Saturday. 2026-06-13T01:00:00Z → Nepal: 2026-06-13T06:45 → Saturday
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-13T01:00:00Z').getTime());

      const result = await service.getMyTodayTimetable(STUDENT_USER_ID);

      expect(result.isSchoolDay).toBe(false);
      expect(result.periods).toHaveLength(0);
      expect(result.dayOfWeek).toBe(6);
      // Must NOT call tenantPrisma (Saturday guard fires before DB access)
      expect(tenantPrisma.query).not.toHaveBeenCalled();
    });

    it('respects Nepal midnight boundary: just before midnight UTC = still previous day', async () => {
      // 2026-06-14 is a Sunday. Nepal midnight = 2026-06-13T18:15:00Z
      // One millisecond before midnight: 2026-06-13T18:14:59.999Z → Nepal still June 13 (Saturday)
      const beforeMidnight = new Date('2026-06-13T18:14:59.999Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(beforeMidnight);

      const { dateAd, dayOfWeek } = todayInNepal();
      expect(dateAd).toBe('2026-06-13');
      expect(dayOfWeek).toBe(6); // Saturday
    });

    it('respects Nepal midnight boundary: just after midnight UTC = next day in Nepal', async () => {
      // One millisecond after midnight: 2026-06-13T18:15:00.001Z → Nepal June 14 (Sunday)
      const afterMidnight = new Date('2026-06-13T18:15:00.001Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(afterMidnight);

      const { dateAd, dayOfWeek } = todayInNepal();
      expect(dateAd).toBe('2026-06-14');
      expect(dayOfWeek).toBe(0); // Sunday
    });

    it('returns isSchoolDay:false when student has no section_id', async () => {
      // Use a non-Saturday (Monday UTC)
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-15T06:00:00Z').getTime()); // Monday
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockStudentNoSection]);

      const result = await service.getMyTodayTimetable(STUDENT_USER_ID);

      expect(result.isSchoolDay).toBe(false);
      expect(result.periods).toHaveLength(0);
    });

    it('returns periods for a school day when slots exist', async () => {
      // Use a Wednesday (dayOfWeek=3)
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-17T06:00:00Z').getTime());
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentRow])        // resolveStudent
        .mockResolvedValueOnce([mockTimetableSlot]);    // timetable query

      const result = await service.getMyTodayTimetable(STUDENT_USER_ID);

      expect(result.isSchoolDay).toBe(true);
      expect(result.periods).toHaveLength(1);

      const period = result.periods[0];
      expect(period.slotId).toBe('slot-uuid-1');
      expect(period.periodNumber).toBe(1);
      expect(period.startTime).toBe('10:00');
      expect(period.endTime).toBe('10:45');
      expect(period.subject.name).toBe('Mathematics');
      expect(period.subject.code).toBe('MATH');
      expect(period.teacher.fullName).toBe('Sita Rai');
      expect(period.room).toBe('201');
    });
  });

  // ─── B.3: getMyAttendanceSummary() ──────────────────────────────────────────

  describe('getMyAttendanceSummary()', () => {
    const mockCounts = [
      { status: 'PRESENT', count: '130' },
      { status: 'ABSENT', count: '6' },
      { status: 'LATE', count: '4' },
      { status: 'LEAVE', count: '2' },
    ];
    const mockWorkingDays = [{ working_days: '142' }];
    const mockHistory = [
      { date: new Date('2026-06-12'), status: 'PRESENT', remarks: null },
    ];

    it('uses is_current academic year when no academicYearId provided', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentRow])   // resolveStudent
        .mockResolvedValueOnce([mockAcademicYear]) // current year lookup
        .mockResolvedValueOnce(mockCounts)         // counts by status
        .mockResolvedValueOnce(mockWorkingDays)    // working days
        .mockResolvedValueOnce(mockHistory);        // recent history

      const result = await service.getMyAttendanceSummary(STUDENT_USER_ID, {});

      expect(result.academicYearId).toBe('year-uuid-1');
      expect(result.academicYearName).toBe('2082');
      // Verify first DB query for year used is_current=true
      expect(tenantPrisma.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('is_current = true'),
      );
    });

    it('uses provided academicYearId when given explicitly', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentRow])   // resolveStudent
        .mockResolvedValueOnce([mockAcademicYear]) // explicit year lookup
        .mockResolvedValueOnce(mockCounts)         // counts by status
        .mockResolvedValueOnce(mockWorkingDays)    // working days
        .mockResolvedValueOnce(mockHistory);        // recent history

      const result = await service.getMyAttendanceSummary(STUDENT_USER_ID, {
        academicYearId: 'year-uuid-1',
      });

      expect(result.academicYearId).toBe('year-uuid-1');
      expect(result.totalWorkingDays).toBe(142);
      expect(result.present).toBe(130);
      expect(result.absent).toBe(6);
      expect(result.late).toBe(4);
      expect(result.leave).toBe(2);
      // attendancePercent = round((130 + 4) / 142 * 1000) / 10 = round(943.66..) / 10 = 94.4
      expect(result.attendancePercent).toBe(94.4);
      expect(result.recentHistory).toHaveLength(1);
      expect(result.recentHistory[0].dateAd).toBe('2026-06-12');
      expect(result.recentHistory[0].status).toBe('PRESENT');
      // Verify no 'bs' field is present on history items
      expect((result.recentHistory[0] as any).bs).toBeUndefined();
    });

    it('throws ForbiddenException when userId has no linked student record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // no student

      await expect(
        service.getMyAttendanceSummary('unlinked-user', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── B.4: getMyAttendanceHistory() ──────────────────────────────────────────

  describe('getMyAttendanceHistory()', () => {
    const mockHistoryRows = [
      { date: new Date('2026-06-12'), status: 'PRESENT', remarks: null, total_count: '142' },
      { date: new Date('2026-06-11'), status: 'ABSENT', remarks: 'Sick', total_count: '142' },
    ];

    it('applies correct offset for page=2, limit=5', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentRow])   // resolveStudent
        .mockResolvedValueOnce([mockAcademicYear]) // current year (for default dates)
        .mockResolvedValueOnce(mockHistoryRows);    // attendance rows

      await service.getMyAttendanceHistory(STUDENT_USER_ID, { page: 2, limit: 5 });

      const historyCall = (tenantPrisma.query as jest.Mock).mock.calls[2];
      // The query should have LIMIT 5 OFFSET 5 (page=2, limit=5 → offset=5)
      expect(historyCall).toContain(5);  // limit
      expect(historyCall).toContain(5);  // offset
    });

    it('falls back to academic year start/end when no date params given', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStudentRow])   // resolveStudent
        .mockResolvedValueOnce([mockAcademicYear]) // current year
        .mockResolvedValueOnce(mockHistoryRows);    // rows

      const result = await service.getMyAttendanceHistory(STUDENT_USER_ID, {});

      // Should call query with dates derived from academic year
      const historyCall = (tenantPrisma.query as jest.Mock).mock.calls[2];
      expect(historyCall).toContain('2025-04-13'); // start_date
      expect(historyCall).toContain('2026-04-12'); // end_date

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(142);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(31);
    });

    it('throws ForbiddenException when userId has no linked student record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // no student

      await expect(
        service.getMyAttendanceHistory('unlinked-user', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
