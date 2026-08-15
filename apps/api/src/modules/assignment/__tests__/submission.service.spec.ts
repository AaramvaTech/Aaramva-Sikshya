import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubmissionService } from '../submission.service';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { GuardianService } from '../../student/guardian.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';

const studentUser: AuthUser = {
  userId: 'student-user-1',
  email: 's@example.com',
  role: Role.STUDENT,
  tenantId: 't-1',
  tenantSlug: 'demo',
};

const teacherUser: AuthUser = {
  userId: 'teacher-user-1',
  email: 't@example.com',
  role: Role.TEACHER,
  tenantId: 't-1',
  tenantSlug: 'demo',
};

const enrolledStudent = { id: 'stu-1', class_id: 'class-1', section_id: 'sec-A' };

const publishedAssignment = {
  id: 'asg-1',
  academic_year_id: 'year-1',
  class_id: 'class-1',
  section_id: 'sec-A',
  subject_id: 'subj-1',
  created_by: 'teacher-user-1',
  title: 'Essay on Rivers of Nepal',
  description: null,
  due_date: new Date('2099-01-01T00:00:00Z'), // far future → SUBMITTED
  attachment_keys: [],
  status: 'PUBLISHED',
  published_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const submissionRow = {
  id: 'sub-1',
  assignment_id: 'asg-1',
  student_id: 'stu-1',
  text_answer: 'my answer',
  file_key: null,
  submitted_at: new Date(),
  status: 'SUBMITTED',
  marks: null,
  feedback: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('SubmissionService', () => {
  let service: SubmissionService;
  const queryMock = jest.fn();
  const emitMock = jest.fn();
  const storageMock = {
    verifyConfirmedKey: jest.fn().mockResolvedValue({ size: 100, contentType: 'application/pdf' }),
    presignUpload: jest.fn().mockResolvedValue({ key: 'k', uploadUrl: 'u', expiresIn: 600, headers: {} }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SubmissionService,
        { provide: TenantPrismaService, useValue: { query: queryMock, execute: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) },
        },
        { provide: StorageService, useValue: storageMock },
        { provide: EventEmitter2, useValue: { emit: emitMock } },
        { provide: GuardianService, useValue: { getActiveChildStudents: jest.fn() } },
      ],
    }).compile();
    service = module.get(SubmissionService);
  });

  describe('submit() eligibility (hard scope)', () => {
    it('403s a student from another section', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...enrolledStudent, section_id: 'sec-B' }]) // own student row
        .mockResolvedValueOnce([publishedAssignment]); // assignment (targets sec-A)

      await expect(
        service.submit('asg-1', { textAnswer: 'hello' }, studentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('403s a student from another class even for whole-class assignments', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...enrolledStudent, class_id: 'class-OTHER' }])
        .mockResolvedValueOnce([{ ...publishedAssignment, section_id: null }]);

      await expect(
        service.submit('asg-1', { textAnswer: 'hello' }, studentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepts a whole-class assignment from any section of that class', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...enrolledStudent, section_id: 'sec-B' }])
        .mockResolvedValueOnce([{ ...publishedAssignment, section_id: null }])
        .mockResolvedValueOnce([]) // no existing submission
        .mockResolvedValueOnce([submissionRow]); // upsert

      const result = await service.submit('asg-1', { textAnswer: 'hello' }, studentUser);
      expect(result.status).toBe('SUBMITTED');
    });

    it('409s DRAFT and CLOSED assignments', async () => {
      queryMock
        .mockResolvedValueOnce([enrolledStudent])
        .mockResolvedValueOnce([{ ...publishedAssignment, status: 'DRAFT' }]);
      await expect(
        service.submit('asg-1', { textAnswer: 'x' }, studentUser),
      ).rejects.toThrow(ConflictException);

      queryMock
        .mockResolvedValueOnce([enrolledStudent])
        .mockResolvedValueOnce([{ ...publishedAssignment, status: 'CLOSED' }]);
      await expect(
        service.submit('asg-1', { textAnswer: 'x' }, studentUser),
      ).rejects.toThrow(ConflictException);
    });

    it('404s a user with no linked active student row', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(
        service.submit('asg-1', { textAnswer: 'x' }, studentUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty submission (neither text nor file)', async () => {
      await expect(service.submit('asg-1', {}, studentUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  describe('submit() late boundary (Kathmandu end-of-day)', () => {
    afterEach(() => jest.restoreAllMocks());

    function mockSubmitFlow(dueDate: Date) {
      queryMock
        .mockResolvedValueOnce([enrolledStudent])
        .mockResolvedValueOnce([{ ...publishedAssignment, due_date: dueDate }])
        .mockResolvedValueOnce([]) // no existing submission
        .mockImplementationOnce((sql: string, ...params: unknown[]) =>
          Promise.resolve([{ ...submissionRow, status: params[4] }]),
        );
    }

    it('flags LATE one ms after Nepal end-of-day', async () => {
      // due 2026-07-12 → boundary 2026-07-12T18:14:59.999Z
      jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-12T18:15:00.000Z'));
      mockSubmitFlow(new Date('2026-07-12T00:00:00Z'));
      const result = await service.submit('asg-1', { textAnswer: 'x' }, studentUser);
      expect(result.status).toBe('LATE');
    });

    it('keeps SUBMITTED at the last Nepal millisecond', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-12T18:14:59.999Z'));
      mockSubmitFlow(new Date('2026-07-12T00:00:00Z'));
      const result = await service.submit('asg-1', { textAnswer: 'x' }, studentUser);
      expect(result.status).toBe('SUBMITTED');
    });
  });

  describe('resubmission', () => {
    it('409s once the submission is REVIEWED (never erases a review)', async () => {
      queryMock
        .mockResolvedValueOnce([enrolledStudent])
        .mockResolvedValueOnce([publishedAssignment])
        .mockResolvedValueOnce([{ status: 'REVIEWED' }]);
      await expect(
        service.submit('asg-1', { textAnswer: 'new' }, studentUser),
      ).rejects.toThrow(ConflictException);
    });

    it('uses UPSERT on (assignment_id, student_id) — resubmits update, not duplicate', async () => {
      queryMock
        .mockResolvedValueOnce([enrolledStudent])
        .mockResolvedValueOnce([publishedAssignment])
        .mockResolvedValueOnce([{ status: 'SUBMITTED' }]) // existing, not reviewed
        .mockResolvedValueOnce([submissionRow]);
      await service.submit('asg-1', { textAnswer: 'v2' }, studentUser);
      const upsertSql = queryMock.mock.calls[3][0] as string;
      expect(upsertSql).toContain('ON CONFLICT (assignment_id, student_id) DO UPDATE');
    });
  });

  describe('presignSubmissionUpload()', () => {
    it('grants only after the eligibility check and flags eligibilityVerified', async () => {
      queryMock
        .mockResolvedValueOnce([enrolledStudent])
        .mockResolvedValueOnce([publishedAssignment]);
      await service.presignSubmissionUpload(
        'asg-1',
        { filename: 'hw.pdf', contentType: 'application/pdf', size: 1000 },
        studentUser,
      );
      expect(storageMock.presignUpload).toHaveBeenCalledWith(
        'submission-file',
        'application/pdf',
        1000,
        'demo',
        Role.STUDENT,
        { eligibilityVerified: true },
      );
    });

    it('does NOT presign for an untargeted student', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...enrolledStudent, section_id: 'sec-B' }])
        .mockResolvedValueOnce([publishedAssignment]);
      await expect(
        service.presignSubmissionUpload(
          'asg-1',
          { filename: 'hw.pdf', contentType: 'application/pdf', size: 1000 },
          studentUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(storageMock.presignUpload).not.toHaveBeenCalled();
    });
  });

  describe('review()', () => {
    it('fires submission.reviewed on the →REVIEWED edge only', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...submissionRow, status: 'REVIEWED', marks: '8.50', prev_status: 'SUBMITTED' }])
        .mockResolvedValueOnce([{ title: 'Essay on Rivers of Nepal' }]);
      await service.review('asg-1', 'sub-1', { marks: 8.5 }, teacherUser);
      expect(emitMock).toHaveBeenCalledTimes(1);
      expect(emitMock).toHaveBeenCalledWith('submission.reviewed', expect.objectContaining({
        assignmentId: 'asg-1',
        studentId: 'stu-1',
        marks: 8.5,
      }));
    });

    it('re-review updates marks WITHOUT re-firing the event', async () => {
      queryMock.mockResolvedValueOnce([
        { ...submissionRow, status: 'REVIEWED', marks: '9.00', prev_status: 'REVIEWED' },
      ]);
      const result = await service.review('asg-1', 'sub-1', { marks: 9 }, teacherUser);
      expect(result.marks).toBe(9);
      expect(emitMock).not.toHaveBeenCalled();
    });

    it('rejects an empty review', async () => {
      await expect(service.review('asg-1', 'sub-1', {}, teacherUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listForAssignment() — the missing list', () => {
    it('returns submissions AND enrolled-minus-submitted as missing', async () => {
      queryMock
        .mockResolvedValueOnce([publishedAssignment]) // assignment lookup
        .mockResolvedValueOnce([
          { ...submissionRow, first_name: 'Aarav', last_name: 'Sharma', roll_number: 1 },
          { ...submissionRow, id: 'sub-2', student_id: 'stu-2', status: 'LATE', first_name: 'Bina', last_name: 'Rai', roll_number: 2 },
        ])
        .mockResolvedValueOnce([
          { id: 'stu-3', first_name: 'Chetan', last_name: 'KC', roll_number: 3 },
        ]);

      const result = await service.listForAssignment('asg-1');
      expect(result.submissions).toHaveLength(2);
      expect(result.missing).toEqual([
        { studentId: 'stu-3', studentName: 'Chetan KC', rollNumber: 3 },
      ]);

      // the missing query must be scoped to the assignment's class/section
      // and exclude submitters via NOT EXISTS
      const missingSql = queryMock.mock.calls[2][0] as string;
      expect(missingSql).toContain('NOT EXISTS');
      expect(missingSql).toContain("st.status = 'ACTIVE'");
    });
  });
});
