import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { StudentService } from '../student.service';
import { GuardianService } from '../guardian.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTenantCtx = {
  tenantId: 'tid-1',
  slug: 'testschool',
  schemaName: 'tenant_testschool',
};

// MIG-2: StudentService delegates the guardian write to GuardianService and
// reads guardians from the normalized table. Both are mocked here.
const mockGuardianService = {
  insertGuardiansTx: jest.fn().mockResolvedValue([]),
};

const admissionDateAd = '2024-07-16'; // corresponds to BS 2081-04-01

const mockStudentRow = {
  id: 'sid-1',
  tenant_id: 'tid-1',
  student_id: '2081-0001',
  user_id: null,
  first_name: 'Aarav',
  last_name: 'Sharma',
  date_of_birth: new Date('2010-05-15'),
  gender: 'MALE',
  blood_group: 'O+',
  religion: null,
  ethnicity: null,
  nationality: 'Nepali',
  mother_tongue: null,
  phone: '9841000000',
  email: null,
  permanent_address: null,
  temporary_address: null,
  guardians: null,
  class_name: 'Class 10',
  section_name: 'A',
  roll_number: 1,
  admission_date: new Date(admissionDateAd),
  academic_year: '2081-2082',
  previous_school: null,
  photo_url: null,
  documents: [],
  status: 'ACTIVE',
  created_by: 'uid-1',
  created_at: new Date('2024-07-16T10:00:00Z'),
  updated_at: new Date('2024-07-16T10:00:00Z'),
  deleted_at: null,
  total_count: '1',
};

const createDto = {
  firstName: 'Aarav',
  lastName: 'Sharma',
  dateOfBirth: '2010-05-15',
  gender: 'MALE' as const,
  bloodGroup: 'O+',
  admissionDate: admissionDateAd,
  academicYear: '2081-2082',
  className: 'Class 10',
  sectionName: 'A',
  rollNumber: 1,
};

describe('StudentService', () => {
  let service: StudentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;

  const mockTx = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentService,
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
            getOrThrow: jest.fn().mockReturnValue(mockTenantCtx),
          },
        },
        { provide: GuardianService, useValue: mockGuardianService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    tenantContext = module.get(TenantContextService) as jest.Mocked<TenantContextService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
    (tenantContext.getOrThrow as jest.Mock).mockReturnValue(mockTenantCtx);
    // Default: the trailing fetchGuardians() SELECT resolves empty. Each test's
    // own mockResolvedValueOnce(...) still wins for the query it actually cares
    // about; this only backstops the extra guardians read MIG-2 added.
    (tenantPrisma.query as jest.Mock).mockResolvedValue([]);
    (mockGuardianService.insertGuardiansTx as jest.Mock).mockReset().mockResolvedValue([]);
  });

  describe('admitStudent()', () => {
    it('generates student_id "2081-0001" when no students exist yet for that year', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ max_id: null }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...mockStudentRow, student_id: '2081-0001' },
      ]);

      const result = await service.admitStudent(createDto as any, 'uid-1');

      expect(result.studentId).toBe('2081-0001');
      expect(result.firstName).toBe('Aarav');
    });

    it('increments sequence for same BS year', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ max_id: '2081-0003' }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...mockStudentRow, student_id: '2081-0004' },
      ]);

      const result = await service.admitStudent(createDto as any, 'uid-1');

      expect(result.studentId).toBe('2081-0004');
    });

    it('resets sequence for a new BS year', async () => {
      const dto2082 = { ...createDto, admissionDate: '2025-07-16' };
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ max_id: null }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...mockStudentRow, student_id: '2082-0001', admission_date: new Date('2025-07-16') },
      ]);

      const result = await service.admitStudent(dto2082 as any, 'uid-1');

      expect(result.studentId).toMatch(/^2082-/);
    });

    it('throws BadRequestException for admission date before BS 2000', async () => {
      const dtoWithOldDate = { ...createDto, admissionDate: '1940-01-01' };

      await expect(service.admitStudent(dtoWithOldDate as any, 'uid-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('writes guardians to the normalized table (not a JSONB students column) — MIG-2', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ max_id: null }])                       // generateStudentId
        .mockResolvedValueOnce([{ ...mockStudentRow, id: 'sid-1' }]);    // INSERT students RETURNING *

      const returnedGuardian = {
        id: 'g-1', relation: 'Father', firstName: 'Hari', lastName: 'Sharma',
        phone: '9800000000', email: null, isPrimary: true,
      };
      (mockGuardianService.insertGuardiansTx as jest.Mock).mockResolvedValueOnce([returnedGuardian]);

      const dtoWithGuardians = {
        ...createDto,
        guardians: [
          { relation: 'Father', firstName: 'Hari', lastName: 'Sharma', phone: '9800000000', isPrimary: true },
        ],
      };

      const result = await service.admitStudent(dtoWithGuardians as any, 'uid-1');

      // guardians persisted via the normalized-table service, in the same tx
      expect(mockGuardianService.insertGuardiansTx).toHaveBeenCalledWith(
        mockTx,
        'sid-1',
        dtoWithGuardians.guardians,
      );
      // the students INSERT no longer references a guardians column / JSONB write
      const insertSql = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[1][0] as string;
      expect(insertSql).toContain('INSERT INTO students');
      expect(insertSql).not.toMatch(/\bguardians\b/);
      // response surfaces the normalized guardians
      expect(result.guardians).toEqual([returnedGuardian]);
    });
  });

  describe('findAll()', () => {
    it('returns paginated list', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '5' },
        { ...mockStudentRow, id: 'sid-2', student_id: '2081-0002', total_count: '5' },
      ]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(5);
      expect(result.meta.page).toBe(1);
    });

    it('filters by class and status', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '1' },
      ]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        className: 'Class 10',
        status: 'ACTIVE',
      } as any);

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM students'),
        null,
        'Class 10',
        null,
        'ACTIVE',
        null,
        null,
        expect.any(Number),
        expect.any(Number),
      );
      expect(result.data).toHaveLength(1);
    });

    it('filters by sectionId (FK) so attendance can load a section roster', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '1' },
      ]);

      await service.findAll({
        page: 1,
        limit: 20,
        sectionId: 'sec-uuid-1',
        status: 'ACTIVE',
      } as any);

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('section_id'),
        null,
        null,
        null,
        'ACTIVE',
        null,
        'sec-uuid-1',
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('applies search filter when provided', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '1' },
      ]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        search: 'Aarav',
      } as any);

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        'Aarav',
        null,
        null,
        null,
        null,
        null,
        expect.any(Number),
        expect.any(Number),
      );
      expect(result.data).toHaveLength(1);
    });

    it('respects sorting order parameter', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, total_count: '1' },
      ]);

      await service.findAll({
        page: 1,
        limit: 20,
        sortBy: 'first_name',
        sortOrder: 'asc',
      } as any);

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('first_name ASC'),
        null,
        null,
        null,
        null,
        null,
        null,
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe('enroll()', () => {
    it('persists class_id and section_id FKs (not just the name strings)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'sid-1' }]) // student exists
        .mockResolvedValueOnce([{ name: 'Class 10' }]) // class lookup
        .mockResolvedValueOnce([{ name: 'A' }]) // section lookup
        .mockResolvedValueOnce([{ name: '2081-2082' }]) // academic year lookup
        .mockResolvedValueOnce([mockStudentRow]); // findOne after update
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);

      await service.enroll('sid-1', {
        classId: 'cid-1',
        sectionId: 'secid-1',
        academicYearId: 'ayid-1',
        rollNumber: 5,
      } as any);

      const updateCall = (tenantPrisma.execute as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && /UPDATE students/.test(c[0] as string),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toMatch(/class_id/);
      expect(updateCall[0]).toMatch(/section_id/);
      expect(updateCall).toContain('cid-1');
      expect(updateCall).toContain('secid-1');
    });
  });

  describe('findOne()', () => {
    it('returns student by UUID', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockStudentRow]);

      const result = await service.findOne('sid-1');

      expect(result.id).toBe('sid-1');
      expect(result.fullName).toBe('Aarav Sharma');
      expect(result.dateOfBirth.ad).toBe('2010-05-15');
    });

    it('throws NotFoundException for unknown id', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStudent()', () => {
    it('applies partial updates', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, first_name: 'Bikash' },
      ]);

      const result = await service.updateStudent('sid-1', { firstName: 'Bikash' } as any);

      expect(result.firstName).toBe('Bikash');
    });
  });

  describe('updateStatus()', () => {
    it('updates status and returns updated student', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockStudentRow, status: 'TRANSFERRED' },
      ]);

      const result = await service.updateStatus('sid-1', { status: 'TRANSFERRED' } as any);

      expect(result.status).toBe('TRANSFERRED');
    });

    it('throws NotFoundException when updating status of non-existent student', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);

      await expect(service.updateStatus('missing', { status: 'TRANSFERRED' } as any))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('removeStudent()', () => {
    it('soft-deletes the student (sets deleted_at)', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);

      await service.removeStudent('sid-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at'),
        'sid-1',
        mockTenantCtx.tenantId,
      );
    });

    it('throws NotFoundException if student does not exist', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);

      await expect(service.removeStudent('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createStudentAccount()', () => {
    const accountDto = { email: 'aarav@school.edu.np', password: 'SecurePass1' };

    it('creates a STUDENT user and links it to the student record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'sid-1' }]); // pre-check
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'sid-1', user_id: null, first_name: 'Aarav', last_name: 'Sharma' }]) // FOR UPDATE
        .mockResolvedValueOnce([]) // email conflict check → empty
        .mockResolvedValueOnce([{ id: 'uid-new', email: accountDto.email }]); // INSERT users
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1); // UPDATE students SET user_id

      const result = await service.createStudentAccount('sid-1', accountDto as any);

      expect(result.linked).toBe(true);
      expect(result.userId).toBe('uid-new');
      expect(result.email).toBe(accountDto.email);
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('user_id'),
        'uid-new',
        'sid-1',
      );
    });

    it('throws NotFoundException if student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // pre-check → not found

      await expect(service.createStudentAccount('bad-id', accountDto as any))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if student already has a linked account', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'sid-1' }]); // pre-check
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'sid-1', user_id: 'existing-uid', first_name: 'Aarav', last_name: 'Sharma' },
      ]); // FOR UPDATE → already linked

      await expect(service.createStudentAccount('sid-1', accountDto as any))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if email is already in use', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'sid-1' }]); // pre-check
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'sid-1', user_id: null, first_name: 'Aarav', last_name: 'Sharma' }]) // FOR UPDATE
        .mockResolvedValueOnce([{ id: 'other-uid' }]); // email already taken

      await expect(service.createStudentAccount('sid-1', accountDto as any))
        .rejects.toThrow(ConflictException);
    });
  });
});
