import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GuardianService } from '../guardian.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { CreateGuardianAccountDto } from '../dto/create-guardian-account.dto';
import { Role } from '../../common/enums/role.enum';

const mockTenantPrisma = {
  query: jest.fn(),
  run: jest.fn(),
};

describe('GuardianService', () => {
  let service: GuardianService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianService,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
      ],
    }).compile();

    service = module.get<GuardianService>(GuardianService);
    jest.clearAllMocks();
  });

  // ── createGuardianAccount ─────────────────────────────────────────────────

  it('creates a PARENT user and links to guardian when email is new', async () => {
    const studentId = 'student-uuid';
    const guardianId = 'guardian-uuid';
    const dto: CreateGuardianAccountDto = { email: 'parent@test.com', password: 'secret123' };

    // Student existence check (outside tx)
    mockTenantPrisma.query.mockResolvedValueOnce([{ id: studentId }]);

    // Simulate the run() transaction
    mockTenantPrisma.run.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([{
            id: guardianId, student_id: studentId, relation: 'FATHER',
            first_name: 'Ram', last_name: 'Shrestha', phone: null,
            email: null, is_primary: true, user_id: null,
          }]) // guardian SELECT
          .mockResolvedValueOnce([]) // no existing user for this email
          .mockResolvedValueOnce([{ id: 'new-user-uuid', email: dto.email, role: Role.PARENT, first_name: 'Ram', last_name: 'Shrestha' }]), // user INSERT RETURNING
        $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1), // guardian UPDATE affected=1
      };
      return fn(tx);
    });

    const result = await service.createGuardianAccount(studentId, guardianId, dto);

    expect(result).toEqual({ userId: 'new-user-uuid', guardianId, email: dto.email, linked: true });
    expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictException when guardian already has a linked user', async () => {
    const studentId = 'student-uuid';
    const guardianId = 'guardian-uuid';
    const dto: CreateGuardianAccountDto = { email: 'parent@test.com', password: 'secret123' };

    mockTenantPrisma.query.mockResolvedValueOnce([{ id: studentId }]);

    mockTenantPrisma.run.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{
          id: guardianId, student_id: studentId, relation: 'MOTHER',
          first_name: 'Sita', last_name: null, phone: null,
          email: null, is_primary: false, user_id: 'existing-user-uuid', // already linked
        }]),
        $executeRawUnsafe: jest.fn(),
      };
      return fn(tx);
    });

    await expect(
      service.createGuardianAccount(studentId, guardianId, dto),
    ).rejects.toThrow(ConflictException);
  });

  it('links existing PARENT user without creating a new user', async () => {
    const studentId = 'student-uuid';
    const guardianId = 'guardian-uuid';
    const existingParentId = 'existing-parent-uuid';
    const dto: CreateGuardianAccountDto = { email: 'existing@test.com', password: 'secret123' };

    mockTenantPrisma.query.mockResolvedValueOnce([{ id: studentId }]);

    mockTenantPrisma.run.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([{
            id: guardianId, student_id: studentId, relation: 'FATHER',
            first_name: 'Hari', last_name: null, phone: null,
            email: null, is_primary: true, user_id: null,
          }]) // guardian SELECT — not yet linked
          .mockResolvedValueOnce([{ id: existingParentId, email: dto.email, role: Role.PARENT, first_name: 'Hari', last_name: '' }]), // existing PARENT user found
        $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1), // guardian UPDATE links to existing user
      };
      return fn(tx);
    });

    const result = await service.createGuardianAccount(studentId, guardianId, dto);

    expect(result.userId).toBe(existingParentId);
    expect(result.linked).toBe(true);
    expect(result.email).toBe(dto.email);
    expect(result.guardianId).toBe(guardianId);
    // run() was called once; inside tx only 2 $queryRawUnsafe calls (no INSERT)
    expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
  });

  // ── getMyChildren ─────────────────────────────────────────────────────────

  it('returns mapped children for the linked PARENT user', async () => {
    const userId = 'parent-user-uuid';

    mockTenantPrisma.query.mockResolvedValueOnce([
      {
        id: 'student-uuid', student_id: '2082-0001',
        first_name: 'Aarav', last_name: 'Shrestha', photo_url: null,
        class_name: 'Class 8', section_name: 'B', roll_number: 12,
        section_id: 'section-uuid',
        academic_year_id: 'ay-uuid', academic_year_name: '2081-2082',
        relation: 'FATHER',
      },
    ]);

    const result = await service.getMyChildren(userId);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'student-uuid',
      admissionNumber: '2082-0001',
      firstName: 'Aarav',
      lastName: 'Shrestha',
      photoUrl: null,
      relation: 'FATHER',
      currentEnrollment: {
        className: 'Class 8', sectionName: 'B', rollNumber: 12,
        sectionId: 'section-uuid',
        academicYearId: 'ay-uuid', academicYearName: '2081-2082',
      },
    });
  });

  it('returns empty array when user has no linked children', async () => {
    mockTenantPrisma.query.mockResolvedValueOnce([]);

    const result = await service.getMyChildren('parent-uuid');

    expect(result).toEqual([]);
  });

  // ── insertGuardiansTx (MIG-2 normalized write path) ───────────────────────

  describe('insertGuardiansTx', () => {
    const tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };

    // A normalized guardians-table row as returned by INSERT ... RETURNING.
    const gRow = (over: Record<string, unknown> = {}) => ({
      id: 'gid', student_id: 'stu-1', relation: 'Guardian', first_name: 'A',
      last_name: null, phone: '9800000000', email: null, is_primary: false,
      user_id: null, ...over,
    });
    // A guardian as it arrives on the create/update DTO.
    const gIn = (over: Record<string, unknown> = {}) => ({
      relation: 'Guardian', firstName: 'A', lastName: 'B', phone: '9800000000',
      isPrimary: false, ...over,
    });
    // The INSERT's last positional arg is `is_primary`.
    const isPrimaryArgOf = (i: number): unknown => {
      const call = tx.$queryRawUnsafe.mock.calls[i];
      return call[call.length - 1];
    };

    beforeEach(() => {
      tx.$queryRawUnsafe.mockReset();
      tx.$executeRawUnsafe.mockReset();
    });

    it('inserts nothing and issues no query for an empty list', async () => {
      const out = await service.insertGuardiansTx(tx as any, 'stu-1', []);
      expect(out).toEqual([]);
      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('respects an explicit single primary (not the first-listed)', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([])                                   // find g0
        .mockResolvedValueOnce([gRow({ id: 'id0', phone: '111' })]) // insert g0
        .mockResolvedValueOnce([])                                   // find g1
        .mockResolvedValueOnce([gRow({ id: 'id1', phone: '222', is_primary: true })]); // insert g1

      const out = await service.insertGuardiansTx(tx as any, 'stu-1', [
        gIn({ phone: '111', isPrimary: false }),
        gIn({ phone: '222', isPrimary: true }),
      ]);

      expect(isPrimaryArgOf(1)).toBe(false); // g0
      expect(isPrimaryArgOf(3)).toBe(true);  // g1 (the flagged one)
      expect(out).toHaveLength(2);
    });

    it('falls back to first-listed when the DTO marks ZERO primaries', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([]).mockResolvedValueOnce([gRow({ id: 'id0', phone: '111' })])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([gRow({ id: 'id1', phone: '222' })]);

      await service.insertGuardiansTx(tx as any, 'stu-1', [
        gIn({ phone: '111', isPrimary: false }),
        gIn({ phone: '222', isPrimary: false }),
      ]);

      expect(isPrimaryArgOf(1)).toBe(true);  // first-listed wins
      expect(isPrimaryArgOf(3)).toBe(false);
    });

    it('falls back to first-listed when the DTO marks MULTIPLE primaries', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([]).mockResolvedValueOnce([gRow({ id: 'id0', phone: '111' })])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([gRow({ id: 'id1', phone: '222' })]);

      await service.insertGuardiansTx(tx as any, 'stu-1', [
        gIn({ phone: '111', isPrimary: true }),
        gIn({ phone: '222', isPrimary: true }),
      ]);

      expect(isPrimaryArgOf(1)).toBe(true);  // first-listed wins
      expect(isPrimaryArgOf(3)).toBe(false);
    });

    it('is idempotent — skips (no insert) a guardian whose phone already exists', async () => {
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing' }]); // find → found

      const out = await service.insertGuardiansTx(tx as any, 'stu-1', [gIn({ phone: '111' })]);

      expect(out).toEqual([]);                          // nothing inserted
      expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1); // only the find, never the insert
    });
  });
});
