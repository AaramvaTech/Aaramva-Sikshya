import { Test } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

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
    it('inserts a notification record for the given user', async () => {
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.createNotification('user-1', 'Payment received', 'Rs.500 received', 'FEE');

      const [sql, userId] = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls[0] as [string, string];
      expect(sql.toLowerCase()).toContain('notifications');
      expect(userId).toBe('user-1');
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
