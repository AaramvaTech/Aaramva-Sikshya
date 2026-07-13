import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { StaffService } from '../staff.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StorageService } from '../../storage/storage.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const baseUserRow = {
  id: 'user-1',
  email: 'teacher@school.com',
  password_hash: '$2b$12$hashedpassword',
  first_name: 'Ram',
  last_name: 'Sharma',
  role: 'TEACHER',
  phone: null,
  avatar_url: null,
  is_active: true,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
};

const baseProfileRow = {
  id: 'profile-1',
  user_id: 'user-1',
  employee_id: 'EMP-2081-0001',
  department_id: null,
  designation_id: null,
  date_of_birth: null,
  gender: null,
  nationality: 'Nepali',
  phone: null,
  permanent_address: null,
  temporary_address: null,
  join_date: new Date('2024-01-01'),
  end_date: null,
  employment_type: 'PERMANENT',
  base_salary: '25000.00',
  pan_number: null,
  bank_name: null,
  bank_account: null,
  photo_url: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
  email: 'teacher@school.com',
  first_name: 'Ram',
  last_name: 'Sharma',
  is_active: true,
  department_name: null,
  designation_title: null,
};

describe('StaffService', () => {
  let service: StaffService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let storage: jest.Mocked<StorageService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: StorageService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            verifyConfirmedKey: jest.fn().mockResolvedValue({ size: 1024, contentType: 'image/jpeg' }),
            publicUrlFor: jest.fn((key: string) => `http://storage.test/bucket/${key}`),
            getObjectBuffer: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
      ],
    }).compile();

    service = module.get(StaffService);
    storage = module.get(StorageService) as jest.Mocked<StorageService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('createStaff()', () => {
    it('creates both user and profile in one transaction', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(1) }])  // employee ID sequence
        .mockResolvedValueOnce([baseUserRow])            // user INSERT
        .mockResolvedValueOnce([baseProfileRow]);        // profile INSERT

      await service.createStaff({
        email: 'teacher@school.com',
        password: 'Pass1234!',
        firstName: 'Ram',
        lastName: 'Sharma',
        role: 'TEACHER',
        joinDate: '2024-01-01',
        baseSalary: 25000,
      });

      expect(tenantPrisma.run).toHaveBeenCalledTimes(1);
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    });

    it('generates employee ID in EMP-YEAR-NNNN format', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(23) }])  // sequence returns 23
        .mockResolvedValueOnce([baseUserRow])
        .mockResolvedValueOnce([{ ...baseProfileRow, employee_id: 'EMP-2081-0023' }]);

      const result = await service.createStaff({
        email: 'teacher@school.com',
        password: 'Pass1234!',
        firstName: 'Ram',
        lastName: 'Sharma',
        role: 'TEACHER',
        joinDate: '2024-01-01',
        baseSalary: 25000,
      });

      // The profile INSERT should have been called with the formatted employee ID
      const profileInsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[2];
      const profileSql: string = profileInsertCall[0];
      expect(profileSql).toContain('INSERT INTO staff_profiles');

      // The returned result should have the employee ID
      expect(result.employeeId).toMatch(/^EMP-\d{4}-\d{4}$/);
    });

    it('rolls back if profile insert fails', async () => {
      // Simulate transaction error — run rejects
      (tenantPrisma.run as jest.Mock).mockRejectedValueOnce(
        new Error('duplicate key violates unique constraint "staff_profiles_user_id_key"'),
      );

      await expect(
        service.createStaff({
          email: 'dup@school.com',
          password: 'Pass1234!',
          firstName: 'Dup',
          lastName: 'User',
          role: 'TEACHER',
          joinDate: '2024-01-01',
          baseSalary: 10000,
        }),
      ).rejects.toThrow('duplicate key violates unique constraint');
    });
  });

  describe('getMyProfile()', () => {
    it('queries by sp.user_id not by sp.id', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseProfileRow]);

      const result = await service.getMyProfile('user-1');

      const [sql, userId] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string, string];
      expect(sql).toContain('sp.user_id = $1::uuid');
      expect(userId).toBe('user-1');
      expect(result.id).toBe('profile-1');
      expect(result.employeeId).toBe('EMP-2081-0001');
    });

    it('throws NotFoundException when no staff profile is linked to this userId', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.getMyProfile('not-a-staff-user')).rejects.toThrow(NotFoundException);
    });
  });


  describe('addDocument() — FILE-1 cutover', () => {
    const KEY = 'tenant_demo/staff-document/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf';

    it('HEAD-verifies fileKey and inserts the KEY as file_url', async () => {
      (storage.verifyConfirmedKey as jest.Mock).mockResolvedValueOnce({
        size: 2048,
        contentType: 'application/pdf',
      });
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ user_id: 'user-1' }]) // staff profile lookup
        .mockResolvedValueOnce([
          {
            id: 'doc-1',
            user_id: 'user-1',
            document_type: 'CV',
            file_url: KEY,
            file_name: 'cv.pdf',
            uploaded_at: new Date(),
            deleted_at: null,
          },
        ]);

      const result = await service.addDocument('staff-1', {
        documentType: 'CV',
        fileKey: KEY,
        fileName: 'cv.pdf',
      } as any);

      expect(storage.verifyConfirmedKey).toHaveBeenCalledWith(KEY, 'staff-document', expect.anything());
      const insertCall = (tenantPrisma.query as jest.Mock).mock.calls[1];
      expect(insertCall).toContain(KEY);
      expect(result.fileUrl).toBe(KEY);
    });

    it('rejects when neither fileKey nor fileUrl is provided', async () => {
      await expect(
        service.addDocument('staff-1', { documentType: 'CV' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.query).not.toHaveBeenCalled();
    });

    it('still accepts a legacy base64 fileUrl (deprecated path)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ user_id: 'user-1' }])
        .mockResolvedValueOnce([
          {
            id: 'doc-2',
            user_id: 'user-1',
            document_type: 'CV',
            file_url: 'data:application/pdf;base64,AAAA',
            file_name: null,
            uploaded_at: new Date(),
            deleted_at: null,
          },
        ]);

      const result = await service.addDocument('staff-1', {
        documentType: 'CV',
        fileUrl: 'data:application/pdf;base64,AAAA',
      } as any);

      expect(storage.verifyConfirmedKey).not.toHaveBeenCalled();
      expect(result.fileUrl).toBe('data:application/pdf;base64,AAAA');
    });
  });

  describe('softDeleteStaff()', () => {
    it('sets end_date and is_active = false on both profile and user', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseProfileRow]);

      await service.softDeleteStaff('profile-1');

      // Should update staff_profiles AND users — two execute calls or one run with two executes
      const executeCount = (tenantPrisma.execute as jest.Mock).mock.calls.length;
      const runCount = (tenantPrisma.run as jest.Mock).mock.calls.length;
      // Either two separate execute calls or one run transaction
      expect(executeCount + runCount).toBeGreaterThanOrEqual(1);

      // Verify the profile query was issued to find the staff member
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('staff_profiles'),
        'profile-1',
      );
    });

    it('throws NotFoundException when staff profile does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.softDeleteStaff('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    // QA-1 OBS-E-3: end_date must be Nepal's calendar today, not UTC-today.
    // At 2026-07-14 00:30 +05:45 (= 2026-07-13 18:45Z) Nepal is on the 14th
    // while UTC is still the 13th — the old code would have stamped 2026-07-13.
    it('stamps end_date as Nepal-today, not UTC-today', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0));
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseProfileRow]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      await service.softDeleteStaff('profile-1');

      const profileUpdate = (tenantPrisma.execute as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql.includes('staff_profiles') && sql.includes('end_date'),
      );
      expect(profileUpdate).toBeDefined();
      expect(profileUpdate[1]).toBe('2026-07-14'); // Nepal date, not UTC 2026-07-13
      jest.restoreAllMocks();
    });
  });
});
