import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssignmentService } from '../assignment.service';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';

const teacherUser: AuthUser = {
  userId: 'teacher-user-1',
  email: 't@example.com',
  role: Role.TEACHER,
  tenantId: 't-1',
  tenantSlug: 'demo',
};

const baseRow = {
  id: 'asg-1',
  academic_year_id: 'year-1',
  class_id: 'class-1',
  section_id: 'sec-A',
  subject_id: 'subj-1',
  created_by: 'teacher-user-1',
  title: 'Essay',
  description: null,
  due_date: new Date('2026-07-20T00:00:00Z'),
  attachment_keys: [] as string[],
  status: 'DRAFT',
  published_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const enrichedRow = {
  ...baseRow,
  class_name: 'Class 5',
  section_name: 'A',
  subject_name: 'Nepali',
  teacher_name: 'Hari Sir',
  submission_count: '0',
};

describe('AssignmentService', () => {
  let service: AssignmentService;
  const queryMock = jest.fn();
  const executeMock = jest.fn();
  const emitMock = jest.fn();
  const storageMock = {
    verifyConfirmedKey: jest.fn().mockResolvedValue({ size: 100, contentType: 'application/pdf' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AssignmentService,
        { provide: TenantPrismaService, useValue: { query: queryMock, execute: executeMock } },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) },
        },
        { provide: StorageService, useValue: storageMock },
        { provide: EventEmitter2, useValue: { emit: emitMock } },
      ],
    }).compile();
    service = module.get(AssignmentService);
  });

  describe('create()', () => {
    it('HEAD-verifies every attachment key against the assignment-attachment policy', async () => {
      const KEY = 'tenant_demo/assignment-attachment/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf';
      queryMock
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class
        .mockResolvedValueOnce([{ id: 'sec-A' }]) // section
        .mockResolvedValueOnce([{ id: 'subj-1' }]) // subject
        .mockResolvedValueOnce([{ id: 'year-1' }]) // current year
        .mockResolvedValueOnce([baseRow]) // insert
        .mockResolvedValueOnce([enrichedRow]); // findOne

      await service.create(
        {
          title: 'Essay',
          classId: 'class-1',
          sectionId: 'sec-A',
          subjectId: 'subj-1',
          dueDate: '2026-07-20',
          attachmentKeys: [KEY],
        },
        teacherUser,
      );
      expect(storageMock.verifyConfirmedKey).toHaveBeenCalledWith(
        KEY,
        'assignment-attachment',
        'demo',
      );
    });

    it('404s an unknown class before inserting anything', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(
        service.create(
          { title: 'x', classId: 'nope', subjectId: 's', dueDate: '2026-07-20' },
          teacherUser,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(queryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish() — the DRAFT→PUBLISHED edge', () => {
    it('publishes and emits assignment.published exactly once', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...baseRow, status: 'PUBLISHED', published_at: new Date() }]) // conditional UPDATE
        .mockResolvedValueOnce([{ ...enrichedRow, status: 'PUBLISHED' }]); // findOne for event payload

      await service.publish('asg-1', teacherUser);
      expect(emitMock).toHaveBeenCalledTimes(1);
      expect(emitMock).toHaveBeenCalledWith('assignment.published', expect.objectContaining({
        tenantSlug: 'demo',
        assignmentId: 'asg-1',
        classId: 'class-1',
        sectionId: 'sec-A',
      }));
    });

    it('409s a second publish and does NOT re-emit (edge-only rule)', async () => {
      queryMock
        .mockResolvedValueOnce([]) // conditional UPDATE matched nothing
        .mockResolvedValueOnce([{ ...enrichedRow, status: 'PUBLISHED' }]); // findOne → exists

      await expect(service.publish('asg-1', teacherUser)).rejects.toThrow(ConflictException);
      expect(emitMock).not.toHaveBeenCalled();
    });

    it('404s publishing a nonexistent assignment', async () => {
      queryMock
        .mockResolvedValueOnce([]) // conditional UPDATE
        .mockResolvedValueOnce([]); // findOne → missing
      await expect(service.publish('missing', teacherUser)).rejects.toThrow(NotFoundException);
      expect(emitMock).not.toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('closes PUBLISHED without emitting any event', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'asg-1' }]) // conditional UPDATE
        .mockResolvedValueOnce([{ ...enrichedRow, status: 'CLOSED' }]); // findOne
      const result = await service.close('asg-1', teacherUser);
      expect(result.status).toBe('CLOSED');
      expect(emitMock).not.toHaveBeenCalled();
    });

    it('409s closing a DRAFT', async () => {
      queryMock
        .mockResolvedValueOnce([]) // conditional UPDATE matched nothing
        .mockResolvedValueOnce([enrichedRow]); // findOne → exists as DRAFT
      await expect(service.close('asg-1', teacherUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('update()', () => {
    it('409s editing a CLOSED assignment', async () => {
      queryMock.mockResolvedValueOnce([{ ...baseRow, status: 'CLOSED' }]);
      await expect(service.update('asg-1', { title: 'new' }, teacherUser)).rejects.toThrow(
        ConflictException,
      );
      expect(executeMock).not.toHaveBeenCalled();
    });

    it('edits a PUBLISHED assignment WITHOUT firing any event', async () => {
      queryMock
        .mockResolvedValueOnce([{ ...baseRow, status: 'PUBLISHED' }]) // existing
        .mockResolvedValueOnce([{ ...enrichedRow, status: 'PUBLISHED', title: 'v2' }]); // findOne
      executeMock.mockResolvedValueOnce(1);
      await service.update('asg-1', { title: 'v2' }, teacherUser);
      expect(emitMock).not.toHaveBeenCalled();
    });

    // QA-1 Phase 4 (decision 3): a cross-teacher edit is soft-scoped but must
    // record the ACTOR — updated_by = the editor, NOT the original created_by.
    it('stamps updated_by with the editing actor (soft-scope accountability)', async () => {
      const otherTeacher: AuthUser = { ...teacherUser, userId: 'teacher-user-2' };
      queryMock
        .mockResolvedValueOnce([{ ...baseRow, status: 'PUBLISHED', created_by: 'teacher-user-1' }])
        .mockResolvedValueOnce([{ ...enrichedRow, status: 'PUBLISHED' }]);
      executeMock.mockResolvedValueOnce(1);

      await service.update('asg-1', { title: 'edited-by-2' }, otherTeacher);

      const [sql, ...params] = executeMock.mock.calls[0];
      expect(sql).toMatch(/updated_by = \$7::uuid/);
      expect(params[params.length - 1]).toBe('teacher-user-2'); // actor, not the author
    });
  });
});
