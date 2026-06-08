import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MarksService } from '../marks.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const baseScheduleRow = {
  id: 'schedule-1',
  full_marks: '100.00',
  pass_marks: '40.00',
};

const baseMarkRow = {
  id: 'mark-1',
  exam_schedule_id: 'schedule-1',
  student_id: 'student-1',
  marks_obtained: '80.00',
  theory_marks: null,
  practical_marks: null,
  is_absent: false,
  is_expelled: false,
  remarks: null,
  entered_by: 'teacher-1',
  entered_at: new Date('2024-05-01'),
  updated_at: new Date('2024-05-01'),
};

describe('MarksService', () => {
  let service: MarksService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MarksService,
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

    service = module.get(MarksService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('bulkEnterMarks()', () => {
    it('throws BadRequestException if marksObtained > fullMarks', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([baseScheduleRow]);

      await expect(
        service.bulkEnterMarks(
          {
            examScheduleId: 'schedule-1',
            marks: [{ studentId: 'student-1', marksObtained: 110 }],
          },
          'teacher-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if isAbsent=true and marksObtained provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([baseScheduleRow]);

      await expect(
        service.bulkEnterMarks(
          {
            examScheduleId: 'schedule-1',
            marks: [{ studentId: 'student-1', marksObtained: 80, isAbsent: true }],
          },
          'teacher-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses UPSERT — safe to submit twice', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([baseScheduleRow])
        .mockResolvedValueOnce([baseMarkRow]);

      await service.bulkEnterMarks(
        {
          examScheduleId: 'schedule-1',
          marks: [{ studentId: 'student-1', marksObtained: 80 }],
        },
        'teacher-1',
      );

      const calls = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls;
      const upsertCall = calls.find(([sql]: [string]) => sql?.includes('ON CONFLICT'));
      expect(upsertCall).toBeDefined();
      const [sql] = upsertCall as [string];
      expect(sql).toContain('DO UPDATE');
    });
  });
});
