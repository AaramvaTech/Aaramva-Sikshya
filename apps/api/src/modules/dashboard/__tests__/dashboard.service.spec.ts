import { Test } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: TenantPrismaService,
          useValue: { query: jest.fn() },
        },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue({
              tenantId: 'tenant-1',
              slug: 'test-school',
              schemaName: 'tenant_test',
            }),
          },
        },
      ],
    }).compile();

    service = module.get(DashboardService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    tenantContext = module.get(TenantContextService);
  });

  describe('getOverview()', () => {
    it('returns complete overview with all sections populated', async () => {
      (tenantPrisma.query as jest.Mock)
        // 1. Student counts
        .mockResolvedValueOnce([{ total: '450', active: '420' }])
        // 2. Attendance by class
        .mockResolvedValueOnce([
          {
            class_id: 'c1', class_name: 'Class 10',
            total: '50', present: '45', absent: '3', late: '1', leave: '1', marked: '50',
          },
          {
            class_id: 'c2', class_name: 'Class 9',
            total: '40', present: '38', absent: '1', late: '1', leave: '0', marked: '40',
          },
        ])
        // 3. Current academic year
        .mockResolvedValueOnce([{ id: 'ay-1' }])
        // 4. Fee collection
        .mockResolvedValueOnce([{ invoiced: '500000', collected: '420000' }])
        // 5. Unread notifications
        .mockResolvedValueOnce([{ count: '12' }]);

      const result = await service.getOverview();

      expect(result.asOf).toHaveProperty('ad');
      expect(result.asOf).toHaveProperty('bs');
      expect(result.students.total).toBe(450);
      expect(result.students.active).toBe(420);
      expect(result.attendance.totalStudents).toBe(90);
      expect(result.attendance.present).toBe(83);
      expect(result.attendance.absent).toBe(4);
      expect(result.attendance.late).toBe(2);
      expect(result.attendance.leave).toBe(1);
      expect(result.attendance.notMarked).toBe(0);
      expect(result.attendance.attendanceRate).toBeCloseTo(92.2, 1);
      expect(result.attendance.byClass).toHaveLength(2);
      expect(result.attendance.byClass[0].className).toBe('Class 10');
      expect(result.attendance.byClass[0].rate).toBe(90);
      expect(result.fees).not.toBeNull();
      expect(result.fees?.totalInvoiced).toBe(500000);
      expect(result.fees?.totalCollected).toBe(420000);
      expect(result.fees?.totalPending).toBe(80000);
      expect(result.fees?.collectionRate).toBe(84);
      expect(result.unreadNotifications).toBe(12);
    });

    it('MON-1: fee pending/collection-rate computed to the cent via Money, not float division', async () => {
      // 100000/300000*100 = 33.3333...repeating -> rounds to 33.33
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '0', active: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'ay-1' }])
        .mockResolvedValueOnce([{ invoiced: '300000.00', collected: '100000.00' }])
        .mockResolvedValueOnce([{ count: '0' }]);

      const result = await service.getOverview();

      expect(result.fees?.totalInvoiced).toBe(300000);
      expect(result.fees?.totalCollected).toBe(100000);
      expect(result.fees?.totalPending).toBe(200000);
      expect(result.fees?.collectionRate).toBe(33.33);
    });

    it('returns null fees when no current academic year', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '100', active: '95' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]) // no academic year
        .mockResolvedValueOnce([{ count: '0' }]);

      const result = await service.getOverview();

      expect(result.fees).toBeNull();
      expect(result.students.total).toBe(100);
    });

    it('handles zero students gracefully', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '0', active: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      const result = await service.getOverview();

      expect(result.attendance.attendanceRate).toBe(0);
      expect(result.attendance.totalStudents).toBe(0);
      expect(result.attendance.byClass).toHaveLength(0);
    });

    // QA-1 OBS-E-5: today's-attendance board uses Nepal-today, not UTC-today.
    // At 2026-07-14 00:30 +05:45 (= 2026-07-13 18:45Z) Nepal is on the 14th.
    it('queries today\'s attendance for Nepal-today, not UTC-today', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0));
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '5', active: '5' }])
        .mockResolvedValueOnce([]) // attendance-by-class
        .mockResolvedValueOnce([]) // no academic year
        .mockResolvedValueOnce([{ count: '0' }]);

      await service.getOverview();

      const attendanceCall = (tenantPrisma.query as jest.Mock).mock.calls[1];
      expect(attendanceCall[1]).toBe('2026-07-14'); // Nepal date, not UTC 2026-07-13
      jest.restoreAllMocks();
    });
  });

  describe('getWeeklyAttendance()', () => {
    it('returns 7 days of attendance data', async () => {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 6);

      const mockRows = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        mockRows.push({
          date: d.toISOString().split('T')[0],
          present: '80',
          total: '100',
        });
      }

      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce(mockRows);

      const result = await service.getWeeklyAttendance();

      expect(result.days).toHaveLength(7);
      expect(result.weekStart).toHaveProperty('ad');
      expect(result.weekEnd).toHaveProperty('ad');
      // Days with data should have correct rate
      expect(result.days[0].rate).toBe(80);
      expect(result.days[0].present).toBe(80);
      expect(result.days[0].total).toBe(100);
      // Days without data (weekend) should have 0
      expect(result.days[5].rate).toBe(0);
      expect(result.days[5].present).toBe(0);
      expect(result.days[5].total).toBe(0);
    });

    // QA-1 OBS-E-5: the rolling 7-day window ends on Nepal-today and each day is
    // labeled by its true day-of-week (NOT ISO Monday-start), TZ-independently.
    it('anchors the 7-day window to Nepal-today with correct day-of-week labels', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0)); // 2026-07-14 Nepal
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.getWeeklyAttendance();

      const call = (tenantPrisma.query as jest.Mock).mock.calls[0];
      expect(call[1]).toBe('2026-07-08'); // weekStart = today − 6
      expect(call[2]).toBe('2026-07-14'); // Nepal-today
      expect(result.weekEnd.ad).toBe('2026-07-14');
      expect(result.weekStart.ad).toBe('2026-07-08');
      expect(result.days).toHaveLength(7);
      expect(result.days[6].date.ad).toBe('2026-07-14');
      expect(result.days[6].dayOfWeek).toBe('Tue'); // 2026-07-14 is a Tuesday
      expect(result.days[0].dayOfWeek).toBe('Wed');  // 2026-07-08 is a Wednesday
      jest.restoreAllMocks();
    });
  });

  describe('getRecentActivity()', () => {
    it('returns recent students, payments, and notices', async () => {
      (tenantPrisma.query as jest.Mock)
        // Recent students
        .mockResolvedValueOnce([
          { id: 's1', first_name: 'Ram', last_name: 'Sharma', admission_date: '2025-01-15' },
          { id: 's2', first_name: 'Sita', last_name: 'Devi', admission_date: '2025-02-01' },
        ])
        // Recent payments
        .mockResolvedValueOnce([
          { id: 'p1', student_first: 'Ram', student_last: 'Sharma', amount: '5000.75', created_at: new Date() },
        ])
        // Recent notices
        .mockResolvedValueOnce([
          { id: 'n1', title: 'Exam Schedule', published_at: new Date() },
          { id: 'n2', title: 'Holiday Notice', published_at: null },
        ]);

      const result = await service.getRecentActivity();

      expect(result.recentStudents).toHaveLength(2);
      expect(result.recentStudents[0].name).toBe('Ram Sharma');
      expect(result.recentStudents[0].admittedAt).toHaveProperty('bs');
      expect(result.recentPayments).toHaveLength(1);
      expect(result.recentPayments[0].studentName).toBe('Ram Sharma');
      expect(result.recentPayments[0].amount).toBe(5000.75);
      expect(result.recentNotices).toHaveLength(2);
      expect(result.recentNotices[0].title).toBe('Exam Schedule');
      expect(result.recentNotices[0].publishedAt).not.toBeNull();
      expect(result.recentNotices[1].publishedAt).toBeNull();
    });

    it('handles empty tables gracefully', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getRecentActivity();

      expect(result.recentStudents).toHaveLength(0);
      expect(result.recentPayments).toHaveLength(0);
      expect(result.recentNotices).toHaveLength(0);
    });
  });

  describe('getUpcoming()', () => {
    it('returns upcoming exams sorted by date', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          id: 'e1', subject_name: 'Mathematics', class_name: 'Class 10',
          exam_date: '2025-07-01', start_time: '09:00', end_time: '12:00',
        },
        {
          id: 'e2', subject_name: 'Science', class_name: 'Class 9',
          exam_date: '2025-07-02', start_time: '09:00', end_time: '12:00',
        },
      ]);

      const result = await service.getUpcoming();

      expect(result.exams).toHaveLength(2);
      expect(result.exams[0].subjectName).toBe('Mathematics');
      expect(result.exams[0].className).toBe('Class 10');
      expect(result.exams[0].examDate).toHaveProperty('bs');
      expect(result.exams[0].startTime).toBe('09:00');
    });

    it('returns empty array when no upcoming exams', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.getUpcoming();

      expect(result.exams).toHaveLength(0);
    });
  });
});
