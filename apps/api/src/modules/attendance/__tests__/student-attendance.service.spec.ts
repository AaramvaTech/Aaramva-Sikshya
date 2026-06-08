import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentAttendanceService } from '../student-attendance.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StudentAttendanceStatus } from '../dto/student-attendance.dto';

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
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'student-1' },
        { id: 'student-2' },
      ]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(baseBulkDto, 'teacher-1');

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('is idempotent — SQL uses ON CONFLICT DO UPDATE', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'student-1' }]);
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
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'student-1' }]);

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
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'student-1' }]);
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

    it('does not emit event when no students are absent', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'student-1' }]);
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
});
