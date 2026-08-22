import { Test } from '@nestjs/testing';
import { StaffAttendanceService } from '../staff-attendance.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { StaffAttendanceStatus } from '../dto/staff-attendance.dto';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

const TODAY = '2024-04-15';

describe('StaffAttendanceService', () => {
  let service: StaffAttendanceService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StaffAttendanceService,
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

    service = module.get(StaffAttendanceService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('bulkMark()', () => {
    it('upserts staff attendance records and uses ON CONFLICT DO UPDATE', async () => {
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.bulkMark(
        {
          date: TODAY,
          records: [
            { userId: 'user-1', status: StaffAttendanceStatus.PRESENT },
            { userId: 'user-2', status: StaffAttendanceStatus.ABSENT },
          ],
        },
        'admin-1',
      );

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      const [sql] = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls[0] as [string];
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE');
    });
  });

  describe('getByQuery() — self-scoped (my attendance)', () => {
    it('filters by the provided userId so a caller can only see their own records', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await service.getByQuery({ userId: 'my-user-id' });

      const [sql, ...params] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string, ...unknown[]];
      expect(sql).toContain('user_id');
      expect(params).toContain('my-user-id');
    });

    it('returns paginated result scoped to the userId', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          id: 'attn-1',
          user_id: 'my-user-id',
          date: new Date('2024-04-15'),
          status: 'PRESENT',
          check_in: null,
          check_out: null,
          remarks: null,
          marked_by: 'admin-1',
          marked_at: new Date('2024-04-15'),
          updated_at: new Date('2024-04-15'),
          total_count: '1',
        },
      ]);

      const result = await service.getByQuery({ userId: 'my-user-id', page: 1, limit: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getStaffSummary()', () => {
    it('returns correct counts for a month', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { status: 'PRESENT', count: '18' },
        { status: 'ABSENT', count: '2' },
        { status: 'LATE', count: '3' },
        { status: 'LEAVE', count: '1' },
        { status: 'HOLIDAY', count: '2' },
      ]);

      const result = await service.getStaffSummary('user-1', 2024, 4);

      expect(result.present).toBe(18);
      expect(result.absent).toBe(2);
      expect(result.late).toBe(3);
      expect(result.leave).toBe(1);
      expect(result.holiday).toBe(2);
      expect(result.total).toBe(26);
    });
  });
});
