import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TimetableService } from '../timetable.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockSlotRow = {
  id: 'slot-1',
  section_id: 'sec-1',
  subject_id: 'sub-1',
  teacher_id: 'teacher-1',
  academic_year_id: 'year-1',
  day_of_week: 1,
  period_number: 1,
  start_time: '10:00',
  end_time: '10:45',
  room: 'Room 1',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const createSlotDto = {
  sectionId: 'sec-1',
  subjectId: 'sub-1',
  teacherId: 'teacher-1',
  academicYearId: 'year-1',
  dayOfWeek: 1,
  periodNumber: 1,
  startTime: '10:00',
  endTime: '10:45',
  room: 'Room 1',
};

describe('TimetableService', () => {
  let service: TimetableService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  const mockTx = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TimetableService,
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

    service = module.get(TimetableService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('createSlot()', () => {
    it('throws ConflictException if teacher already has a slot at that time', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-slot' }]);

      await expect(service.createSlot(createSlotDto))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if section already has a slot at that time', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([])                      // teacher check: no conflict
        .mockResolvedValueOnce([{ id: 'existing-slot' }]); // section check: conflict

      await expect(service.createSlot(createSlotDto))
        .rejects.toThrow(ConflictException);
    });

    it('creates slot when no conflicts exist', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([])           // teacher check
        .mockResolvedValueOnce([])           // section check
        .mockResolvedValueOnce([mockSlotRow]); // INSERT RETURNING

      const result = await service.createSlot(createSlotDto);

      expect(result.id).toBe('slot-1');
      expect(result.dayOfWeek).toBe(1);
      expect(result.periodNumber).toBe(1);
    });
  });

  describe('bulkReplaceTimetable()', () => {
    it('soft-deletes existing slots before inserting new ones', async () => {
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(3);  // soft-delete 3 slots
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([])           // teacher check slot 1
        .mockResolvedValueOnce([])           // section check slot 1
        .mockResolvedValueOnce([mockSlotRow]); // INSERT slot 1

      const dto = {
        academicYearId: 'year-1',
        slots: [{
          subjectId: 'sub-1',
          teacherId: 'teacher-1',
          dayOfWeek: 1,
          periodNumber: 1,
          startTime: '10:00',
          endTime: '10:45',
        }],
      };

      await service.bulkReplaceTimetable('sec-1', dto);

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = NOW()'),
        'sec-1',
        'year-1',
      );
    });
  });

  describe('getTeacherTimetable()', () => {
    it('groups timetable slots by day_of_week correctly', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          ...mockSlotRow,
          day_of_week: 1,
          period_number: 1,
          subject_name: 'Math',
          subject_code: 'MTH',
          teacher_full_name: 'Ram Sharma',
          section_name: 'A',
          class_id: 'class-1',
          class_name: 'Grade 10',
        },
        {
          ...mockSlotRow,
          id: 'slot-2',
          day_of_week: 2,
          period_number: 1,
          subject_name: 'Science',
          subject_code: 'SCI',
          teacher_full_name: 'Ram Sharma',
          section_name: 'A',
          class_id: 'class-1',
          class_name: 'Grade 10',
        },
      ]);

      const result = await service.getTeacherTimetable('teacher-1');

      expect(result.teacherName).toBe('Ram Sharma');
      expect(result.schedule[1]).toHaveLength(1);
      expect(result.schedule[2]).toHaveLength(1);
      expect(result.schedule[0]).toHaveLength(0);
      expect(result.schedule[1][0].subject.name).toBe('Math');
    });
  });
});
