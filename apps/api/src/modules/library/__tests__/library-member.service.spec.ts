import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LibraryMemberService } from '../library-member.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const baseMemberRow = {
  id: 'member-1',
  user_id: null,
  student_id: 'student-1',
  member_number: 'LIB-2083-0001',
  max_books: 2,
  is_active: true,
  joined_at: new Date('2024-01-01'),
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
};

describe('LibraryMemberService', () => {
  let service: LibraryMemberService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LibraryMemberService,
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

    service = module.get(LibraryMemberService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('registerMember()', () => {
    it('generates a LIB-YEAR-NNNN member number using the sequence', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([{ value: BigInt(23) }]) // sequence → 23
        .mockResolvedValueOnce([baseMemberRow]); // INSERT result

      await service.registerMember({ type: 'STUDENT', studentId: 'student-1' });

      const insertCall = mockTx.$queryRawUnsafe.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO library_members'),
      );
      expect(insertCall).toBeDefined();
      const memberNum = insertCall![1] as string;
      expect(memberNum).toMatch(/^LIB-\d{4}-0023$/);
    });

    it('throws BadRequestException if student already has a member record', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([baseMemberRow]); // existing member found

      await expect(
        service.registerMember({ type: 'STUDENT', studentId: 'student-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if type is STUDENT but studentId is missing', async () => {
      await expect(service.registerMember({ type: 'STUDENT' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if type is STAFF but userId is missing', async () => {
      await expect(service.registerMember({ type: 'STAFF' })).rejects.toThrow(BadRequestException);
    });
  });
});
