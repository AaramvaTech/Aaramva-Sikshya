import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentAttendanceService } from '../student-attendance.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StudentAttendanceStatus } from '../dto/student-attendance.dto';
import { Role } from '../../common/enums/role.enum';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const TODAY = '2024-04-15';
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
})();

const baseBulkDto = {
  sectionId: 'section-1',
  academicYearId: 'year-1',
  date: TODAY,
  records: [
    { studentId: 'student-1', status: StudentAttendanceStatus.PRESENT },
    { studentId: 'student-2', status: StudentAttendanceStatus.PRESENT },
  ],
};

describe('StudentAttendanceService', () => {
  let service: StudentAttendanceService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentAttendanceService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
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
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(StudentAttendanceService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    tenantContext = module.get(TenantContextService) as jest.Mocked<TenantContextService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
    (tenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-1',
      slug: 'test-school',
      schemaName: 'tenant_test',
    });
  });

  describe('bulkMark()', () => {
    it('inserts N records for N students in a section', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section A' }])               // section name lookup
        .mockResolvedValueOnce([                                       // enrollment check
          { id: 'student-1', section_id: 'section-1' },
          { id: 'student-2', section_id: 'section-1' },
        ]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(baseBulkDto, 'teacher-1');

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('is idempotent — SQL uses ON CONFLICT DO UPDATE', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section A' }])               // section name lookup
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]); // enrollment
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(
        { ...baseBulkDto, records: [{ studentId: 'student-1', status: StudentAttendanceStatus.PRESENT }] },
        'teacher-1',
      );

      const [sql] = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls[0] as [string];
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE');
    });

    it('throws BadRequestException if a studentId is not enrolled in the section', async () => {
      // Only student-1 returned as enrolled; student-not-in-section is missing
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section A' }])               // section name lookup
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]); // enrollment

      await expect(
        service.bulkMark(
          {
            ...baseBulkDto,
            records: [
              { studentId: 'student-1', status: StudentAttendanceStatus.PRESENT },
              { studentId: 'student-not-in-section', status: StudentAttendanceStatus.PRESENT },
            ],
          },
          'teacher-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a future date', async () => {
      await expect(
        service.bulkMark({ ...baseBulkDto, date: TOMORROW }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it("emits 'attendance.absent' event for absent students", async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section A' }])               // section name lookup
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]); // enrollment
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(
        {
          ...baseBulkDto,
          records: [{ studentId: 'student-1', status: StudentAttendanceStatus.ABSENT }],
        },
        'teacher-1',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'attendance.absent',
        expect.objectContaining({
          tenantSlug: 'test-school',
          date: TODAY,
          absentStudents: expect.arrayContaining([
            expect.objectContaining({ studentId: 'student-1' }),
          ]),
        }),
      );
    });

    it('records marked_by = caller userId on every attendance row', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section A' }])
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(
        { ...baseBulkDto, records: [{ studentId: 'student-1', status: StudentAttendanceStatus.PRESENT }] },
        'marking-teacher-uuid',
      );

      const [sql, ...params] = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls[0] as [string, ...unknown[]];
      expect(sql).toContain('marked_by');
      expect(params).toContain('marking-teacher-uuid');
    });

    it('does not emit event when no students are absent', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section A' }])               // section name lookup
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]); // enrollment
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(
        { ...baseBulkDto, records: [{ studentId: 'student-1', status: StudentAttendanceStatus.PRESENT }] },
        'teacher-1',
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getStudentSummary()', () => {
    it('calculates attendancePercent correctly', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1', full_name: 'Ram Sharma', section_id: 'section-1' }])
        .mockResolvedValueOnce([
          { status: 'PRESENT', count: '80' },
          { status: 'ABSENT', count: '10' },
          { status: 'LATE', count: '5' },
          { status: 'LEAVE', count: '5' },
        ])
        .mockResolvedValueOnce([{ working_days: '100' }])
        .mockResolvedValueOnce([{ date: new Date('2024-04-15'), status: 'PRESENT' }]);

      const result = await service.getStudentSummary('student-1', 'year-1');

      // (present + late) / workingDays * 100 = (80 + 5) / 100 * 100 = 85.0
      expect(result.attendancePercent).toBe(85.0);
      expect(result.present).toBe(80);
      expect(result.absent).toBe(10);
      expect(result.late).toBe(5);
      expect(result.leave).toBe(5);
    });

    it('returns correct totalWorkingDays', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1', full_name: 'Ram Sharma', section_id: 'section-1' }])
        .mockResolvedValueOnce([{ status: 'PRESENT', count: '50' }])
        .mockResolvedValueOnce([{ working_days: '60' }])
        .mockResolvedValueOnce([]);

      const result = await service.getStudentSummary('student-1', 'year-1');

      expect(result.totalWorkingDays).toBe(60);
      // (50 + 0) / 60 * 100 = 83.3
      expect(result.attendancePercent).toBe(83.3);
    });
  });

  describe('soft-scope policy', () => {
    it('a TEACHER not assigned to a section can still call bulkMark — no 403 thrown', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section X' }])               // section name lookup
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]); // enrollment
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await expect(
        service.bulkMark(
          { ...baseBulkDto, records: [{ studentId: 'student-1', status: StudentAttendanceStatus.PRESENT }] },
          'some-cover-teacher-uuid',
        ),
      ).resolves.toBeUndefined();
    });

    it('records the substitute teacherʼs userId in marked_by even for a non-assigned section', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: 'Section X' }])
        .mockResolvedValueOnce([{ id: 'student-1', section_id: 'section-1' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(
        { ...baseBulkDto, records: [{ studentId: 'student-1', status: StudentAttendanceStatus.PRESENT }] },
        'substitute-teacher-uuid',
      );

      const [, ...params] = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls[0] as [string, ...unknown[]];
      expect(params).toContain('substitute-teacher-uuid');
    });
  });

  describe('IDOR protection — PARENT role', () => {
    it('getStudentSummary throws ForbiddenException when student is not the caller\'s child', async () => {
      // guardians query returns no children for this parent
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.getStudentSummary('other-student', 'year-1', 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getStudentSummary allows a PARENT whose child matches the requested student', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ student_id: 'child-uuid' }]) // IDOR check returns a match
        .mockResolvedValueOnce([{ id: 'child-uuid', full_name: 'Aarav Sharma', section_id: 'sec-1' }])
        .mockResolvedValueOnce([{ status: 'PRESENT', count: '40' }])
        .mockResolvedValueOnce([{ working_days: '50' }])
        .mockResolvedValueOnce([]);

      const result = await service.getStudentSummary('child-uuid', 'year-1', 'parent-uuid', Role.PARENT);

      expect(result.present).toBe(40);
    });

    it('getStudentHistory throws ForbiddenException when student is not the caller\'s child', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.getStudentHistory('other-student', {}, 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getStudentHistory skips IDOR check when callerRole is not PARENT', async () => {
      // No guardians query should be issued for a TEACHER
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);  // getByQuery result

      await expect(
        service.getStudentHistory('any-student', {}, 'teacher-uuid', Role.TEACHER),
      ).resolves.toBeDefined();
    });
  });
});
