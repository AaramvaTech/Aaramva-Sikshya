import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SubjectService } from '../subject.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockSubjectRow = {
  id: 'sub-1',
  name: 'Mathematics',
  code: 'MTH',
  type: 'THEORY',
  created_at: new Date('2024-04-14T00:00:00Z'),
  updated_at: new Date('2024-04-14T00:00:00Z'),
  deleted_at: null,
};

const mockClassSubjectRow = {
  id: 'cs-1',
  class_id: 'class-1',
  subject_id: 'sub-1',
  academic_year_id: 'year-1',
  full_marks: 100,
  pass_marks: 40,
  created_at: new Date('2024-04-14T00:00:00Z'),
};

const assignDto = {
  subjectId: 'sub-1',
  academicYearId: 'year-1',
  fullMarks: 100,
  passMarks: 40,
};

describe('SubjectService', () => {
  let service: SubjectService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SubjectService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn(),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SubjectService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
  });

  describe('assignSubjectToClass()', () => {
    it('creates class_subject record when no duplicate exists', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([])                      // duplicate check: empty
        .mockResolvedValueOnce([mockClassSubjectRow])   // INSERT RETURNING
        .mockResolvedValueOnce([mockSubjectRow]);        // enrich with subject details

      const result = await service.assignSubjectToClass('class-1', assignDto);

      expect(result.classId).toBe('class-1');
      expect(result.subjectId).toBe('sub-1');
      expect(result.fullMarks).toBe(100);
    });

    it('throws ConflictException on duplicate assignment', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'cs-existing' }]);

      await expect(service.assignSubjectToClass('class-1', assignDto))
        .rejects.toThrow(ConflictException);
    });
  });
});
