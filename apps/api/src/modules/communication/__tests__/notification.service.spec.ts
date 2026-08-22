import { Test } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

describe('NotificationService', () => {
  let service: NotificationService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationService,
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

    service = module.get(NotificationService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('createNotification()', () => {
    it('inserts a notification record and returns the new row id (PUSH-1 mirror rule)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'notif-9' }]);

      const id = await service.createNotification('user-1', 'Payment received', 'Rs.500 received', 'FEE');

      expect(id).toBe('notif-9');
      const [sql, userId] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, string];
      expect(sql.toLowerCase()).toContain('notifications');
      expect(sql.toUpperCase()).toContain('RETURNING');
      expect(userId).toBe('user-1');
    });
  });

  describe('createNotificationsBulk()', () => {
    it('inserts one row per user in a single statement and returns (id, userId) pairs', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'n-1', user_id: 'user-1' },
        { id: 'n-2', user_id: 'user-2' },
      ]);

      const rows = await service.createNotificationsBulk(
        ['user-1', 'user-2'],
        'Results Published',
        'Results for First Terminal have been published.',
        'EXAM',
        { examTypeId: 'et-1', route: 'results' },
      );

      expect(rows).toEqual([
        { id: 'n-1', userId: 'user-1' },
        { id: 'n-2', userId: 'user-2' },
      ]);
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, userIds] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, string[]];
      expect(sql.toLowerCase()).toContain('unnest');
      expect(userIds).toEqual(['user-1', 'user-2']);
    });

    it('returns [] without touching the DB for an empty audience', async () => {
      const rows = await service.createNotificationsBulk([], 'T', 'B', 'NOTICE');
      expect(rows).toEqual([]);
      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead()', () => {
    it('sets is_read=true and read_at timestamp for the notification', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'notif-1', user_id: 'user-1', is_read: false },
      ]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.markAsRead('notif-1', 'user-1');

      const calls = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls as [string, ...unknown[]][];
      const updateCall = calls.find(([sql]) => sql.toUpperCase().includes('UPDATE'));
      expect(updateCall).toBeDefined();
      const [updateSql] = updateCall!;
      expect(updateSql).toContain('is_read');
    });
  });

  describe('getUnreadCount()', () => {
    it('returns the correct unread count for a user', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ count: '5' }]);

      const count = await service.getUnreadCount('user-1');

      expect(count).toBe(5);
      const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string];
      expect(sql).toContain('is_read');
      expect(sql).toContain('user_id');
    });
  });
});
