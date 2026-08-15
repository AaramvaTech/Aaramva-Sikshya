import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TimetableService } from '../timetable.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { Role } from '../../common/enums/role.enum';
import { GuardianScopeService } from '../../student/guardian-scope.service';

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
  let guardianScope: jest.Mocked<GuardianScopeService>;

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
        { provide: GuardianScopeService, useValue: { assertOwnsStudentInSection: jest.fn() } },
      ],
    }).compile();

    service = module.get(TimetableService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;

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

  describe('getMyTimetable()', () => {
    it('delegates to getTeacherTimetable using the callerʼs userId', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          ...mockSlotRow,
          day_of_week: 1,
          period_number: 2,
          subject_name: 'English',
          subject_code: 'ENG',
          teacher_full_name: 'Sita Rai',
          section_name: 'B',
          class_id: 'class-2',
          class_name: 'Grade 9',
        },
      ]);

      const result = await service.getMyTimetable('user-teacher-1');

      const [sql, userId] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string, string];
      expect(sql).toContain('teacher_id = $1::uuid');
      expect(userId).toBe('user-teacher-1');
      expect(result.teacherId).toBe('user-teacher-1');
      expect(result.schedule[1]).toHaveLength(1);
    });
  });

  describe('getMySections()', () => {
    it('returns sections from the union of class-teacher role and timetable slots', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { section_id: 'sec-1', section_name: 'A', class_name: 'Grade 10', class_id: 'cls-1' },
        { section_id: 'sec-2', section_name: 'B', class_name: 'Grade 10', class_id: 'cls-1' },
        { section_id: 'sec-3', section_name: 'A', class_name: 'Grade 11', class_id: 'cls-2' },
      ]);

      const result = await service.getMySections('user-1');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ sectionId: 'sec-1', sectionName: 'A', className: 'Grade 10', classId: 'cls-1' });
      expect(result[2]).toEqual({ sectionId: 'sec-3', sectionName: 'A', className: 'Grade 11', classId: 'cls-2' });
    });

    it('SQL uses DISTINCT and passes userId once for both clauses via $1', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { section_id: 'sec-1', section_name: 'A', class_name: 'Grade 10', class_id: 'cls-1' },
      ]);

      await service.getMySections('teacher-uuid');

      const [sql, userId] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string, string];
      expect(sql).toContain('DISTINCT');
      expect(sql).toContain('class_teacher_id = $1::uuid');
      expect(sql).toContain('teacher_id = $1::uuid');
      expect(userId).toBe('teacher-uuid');
    });

    it('returns an empty array when the teacher has no sections', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.getMySections('new-teacher-uuid');

      expect(result).toEqual([]);
    });
  });

  describe('IDOR protection — PARENT and STUDENT roles', () => {
    it('getSectionTimetable throws ForbiddenException when no child of parent is enrolled in the section', async () => {
      guardianScope.assertOwnsStudentInSection.mockRejectedValueOnce(new ForbiddenException());

      await expect(
        service.getSectionTimetable('other-section', 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getSectionTimetable proceeds when parent has a child enrolled in the section', async () => {
      guardianScope.assertOwnsStudentInSection.mockResolvedValueOnce(undefined);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{                             // timetable slots query
          ...mockSlotRow,
          subject_name: 'Math', subject_code: 'MTH',
          teacher_full_name: 'Ram Sharma',
          section_name: 'A', class_name: 'Grade 10',
        }]);

      const result = await service.getSectionTimetable('sec-1', 'parent-uuid', Role.PARENT);

      // schedule is a Record<dayOfWeek, SlotItemDto[]>; day 1 has 1 slot from mockSlotRow
      expect(result.schedule[1]).toHaveLength(1);
    });

    it('getSectionTimetable throws ForbiddenException when a student is not enrolled in the section', async () => {
      // enrollment check returns no matching student
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.getSectionTimetable('other-section', 'student-uuid', Role.STUDENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getSectionTimetable proceeds when the student is enrolled in the section', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-uuid' }])   // IDOR enrollment check passes
        .mockResolvedValueOnce([{                           // timetable slots query
          ...mockSlotRow,
          subject_name: 'Math', subject_code: 'MTH',
          teacher_full_name: 'Ram Sharma',
          section_name: 'A', class_name: 'Grade 10',
        }]);

      const result = await service.getSectionTimetable('sec-1', 'student-uuid', Role.STUDENT);

      expect(result.schedule[1]).toHaveLength(1);
    });

    it('getSectionTimetable skips IDOR check for staff roles (e.g. TEACHER)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // only the slots query

      const result = await service.getSectionTimetable('sec-1', 'teacher-uuid', Role.TEACHER);

      // empty slots → all days are empty arrays
      expect(result.schedule[0]).toHaveLength(0);
    });
  });
});
