import { Test } from '@nestjs/testing';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const VALID_A = 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]';
const VALID_B = 'ExponentPushToken[BBBBBBBBBBBBBBBBBBBBBB]';

describe('PushService', () => {
  let service: PushService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let expo: {
    chunkPushNotifications: jest.Mock;
    sendPushNotificationsAsync: jest.Mock;
    chunkPushNotificationReceiptIds: jest.Mock;
    getPushNotificationReceiptsAsync: jest.Mock;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), run: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(PushService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    expo = {
      chunkPushNotifications: jest.fn().mockImplementation((msgs: unknown[]) => [msgs]),
      sendPushNotificationsAsync: jest.fn(),
      chunkPushNotificationReceiptIds: jest.fn().mockImplementation((ids: string[]) => [ids]),
      getPushNotificationReceiptsAsync: jest.fn(),
    };
    // Swap the real Expo client for the mock (network boundary).
    (service as unknown as { expo: typeof expo }).expo = expo;
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendToRecipients()', () => {
    it('sends one message per device token with route + per-user notificationId in data', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { user_id: 'user-1', token: VALID_A },
        { user_id: 'user-2', token: VALID_B },
      ]);
      expo.sendPushNotificationsAsync.mockResolvedValueOnce([
        { status: 'ok', id: 'r-1' },
        { status: 'ok', id: 'r-2' },
      ]);

      await service.sendToRecipients(
        [
          { userId: 'user-1', notificationId: 'n-1' },
          { userId: 'user-2', notificationId: 'n-2' },
        ],
        { title: 'Absence Recorded', body: 'Ram was absent.', route: 'attendance', data: { studentId: 's-1' } },
      );

      expect(expo.sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
      const [messages] = expo.sendPushNotificationsAsync.mock.calls[0];
      expect(messages).toEqual([
        {
          to: VALID_A,
          sound: 'default',
          title: 'Absence Recorded',
          body: 'Ram was absent.',
          data: { studentId: 's-1', route: 'attendance', notificationId: 'n-1' },
        },
        {
          to: VALID_B,
          sound: 'default',
          title: 'Absence Recorded',
          body: 'Ram was absent.',
          data: { studentId: 's-1', route: 'attendance', notificationId: 'n-2' },
        },
      ]);
    });

    it('prunes the token when the ticket says DeviceNotRegistered', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ user_id: 'user-1', token: VALID_A }]) // token lookup
        .mockResolvedValueOnce([{ user_id: 'user-1' }]); // DELETE ... RETURNING
      expo.sendPushNotificationsAsync.mockResolvedValueOnce([
        { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
      ]);

      await service.sendToRecipients(
        [{ userId: 'user-1', notificationId: 'n-1' }],
        { title: 'T', body: 'B', route: 'fees' },
      );

      const deleteCall = (tenantPrisma.query as jest.Mock).mock.calls.find(([sql]) =>
        (sql as string).toUpperCase().includes('DELETE FROM DEVICE_TOKENS'),
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![1]).toBe(VALID_A);
    });

    it('prunes malformed (non-Expo) tokens without attempting a send', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ user_id: 'user-1', token: 'garbage-token' }])
        .mockResolvedValueOnce([{ user_id: 'user-1' }]);

      await service.sendToRecipients(
        [{ userId: 'user-1', notificationId: 'n-1' }],
        { title: 'T', body: 'B', route: 'fees' },
      );

      expect(expo.sendPushNotificationsAsync).not.toHaveBeenCalled();
      const deleteCall = (tenantPrisma.query as jest.Mock).mock.calls.find(([sql]) =>
        (sql as string).toUpperCase().includes('DELETE FROM DEVICE_TOKENS'),
      );
      expect(deleteCall![1]).toBe('garbage-token');
    });

    it('is a no-op when recipients have no device tokens (dormant mode)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await service.sendToRecipients(
        [{ userId: 'user-1', notificationId: 'n-1' }],
        { title: 'T', body: 'B', route: 'notices' },
      );

      expect(expo.chunkPushNotifications).not.toHaveBeenCalled();
      expect(expo.sendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it('swallows Expo API failures (fire-and-forget must never throw)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ user_id: 'user-1', token: VALID_A }]);
      expo.sendPushNotificationsAsync.mockRejectedValueOnce(new Error('expo down'));

      await expect(
        service.sendToRecipients(
          [{ userId: 'user-1', notificationId: 'n-1' }],
          { title: 'T', body: 'B', route: 'results' },
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('checkReceipts()', () => {
    it('prunes tokens whose receipts report DeviceNotRegistered', async () => {
      expo.getPushNotificationReceiptsAsync.mockResolvedValueOnce({
        'r-1': { status: 'ok' },
        'r-2': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      });
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ user_id: 'user-2' }]);

      await service.checkReceipts(
        new Map([
          ['r-1', VALID_A],
          ['r-2', VALID_B],
        ]),
      );

      const deleteCalls = (tenantPrisma.query as jest.Mock).mock.calls.filter(([sql]) =>
        (sql as string).toUpperCase().includes('DELETE FROM DEVICE_TOKENS'),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toBe(VALID_B);
    });

    it('never throws even when the receipt API fails', async () => {
      expo.getPushNotificationReceiptsAsync.mockRejectedValueOnce(new Error('boom'));
      await expect(service.checkReceipts(new Map([['r-1', VALID_A]]))).resolves.not.toThrow();
    });
  });
});
