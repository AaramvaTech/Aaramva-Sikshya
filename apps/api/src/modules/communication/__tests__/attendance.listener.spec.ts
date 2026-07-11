import { Test } from '@nestjs/testing';
import { AttendanceListener } from '../listeners/attendance.listener';
import { SmsService } from '../sms.service';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

/**
 * Fixture DB: two unrelated families. The listener must resolve the audience
 * per absent student — family B must never be touched by family A's absence.
 */
const STUDENTS: Record<string, { first_name: string; last_name: string }> = {
  'stu-A': { first_name: 'Ram', last_name: 'Sharma' },
  'stu-B': { first_name: 'Sita', last_name: 'Thapa' },
};
const PHONES: Record<string, { phone: string }[]> = {
  'stu-A': [{ phone: '9841111111' }],
  'stu-B': [{ phone: '9842222222' }],
};
const PARENT_USERS: Record<string, { id: string }[]> = {
  'stu-A': [{ id: 'parent-A1' }, { id: 'parent-A2' }],
  'stu-B': [{ id: 'parent-B1' }],
};

describe('AttendanceListener', () => {
  let listener: AttendanceListener;
  let smsService: jest.Mocked<SmsService>;
  let notificationService: jest.Mocked<NotificationService>;
  let pushService: jest.Mocked<PushService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AttendanceListener,
        { provide: SmsService, useValue: { send: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: NotificationService,
          useValue: {
            createNotificationsBulk: jest.fn().mockImplementation(
              async (userIds: string[]) => userIds.map((u, i) => ({ id: `n-${u}-${i}`, userId: u })),
            ),
          },
        },
        { provide: PushService, useValue: { sendToRecipients: jest.fn().mockResolvedValue(undefined) } },
        { provide: TenantPrismaService, useValue: { query: jest.fn(), run: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    listener = module.get(AttendanceListener);
    smsService = module.get(SmsService) as jest.Mocked<SmsService>;
    notificationService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    pushService = module.get(PushService) as jest.Mocked<PushService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    (tenantPrisma.query as jest.Mock).mockImplementation(async (sql: string, ...args: unknown[]) => {
      const studentId = args[0] as string;
      if (sql.includes('FROM students')) {
        return STUDENTS[studentId] ? [STUDENTS[studentId]] : [];
      }
      if (sql.includes('JOIN users')) return PARENT_USERS[studentId] ?? [];
      if (sql.includes('FROM guardians')) return PHONES[studentId] ?? [];
      return [];
    });
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleAbsent()', () => {
    it("notifies ONLY the absent student's linked guardians (object scoping)", async () => {
      await listener.handleAbsent({
        tenantSlug: 'demo',
        date: '2083-03-27',
        absentStudents: [{ studentId: 'stu-A' }],
      });

      expect(notificationService.createNotificationsBulk).toHaveBeenCalledTimes(1);
      const [userIds] = notificationService.createNotificationsBulk.mock.calls[0];
      expect(userIds).toEqual(['parent-A1', 'parent-A2']); // family B untouched

      const [recipients] = pushService.sendToRecipients.mock.calls[0];
      expect(recipients.map((r) => r.userId).sort()).toEqual(['parent-A1', 'parent-A2']);
      expect(recipients.every((r) => r.notificationId)).toBe(true);
    });

    it('creates the in-app rows BEFORE sending the push (mirror rule)', async () => {
      await listener.handleAbsent({
        tenantSlug: 'demo',
        date: '2083-03-27',
        absentStudents: [{ studentId: 'stu-A' }],
      });

      const rowOrder = notificationService.createNotificationsBulk.mock.invocationCallOrder[0];
      const pushOrder = pushService.sendToRecipients.mock.invocationCallOrder[0];
      expect(rowOrder).toBeLessThan(pushOrder);

      const [, payload] = pushService.sendToRecipients.mock.calls[0];
      expect(payload.route).toBe('attendance');
      expect(payload.body).toContain('Ram Sharma');
      expect(payload.body).toContain('2083-03-27');
    });

    it('sends the absence SMS to the resolved primary guardian phone', async () => {
      await listener.handleAbsent({
        tenantSlug: 'demo',
        date: '2083-03-27',
        absentStudents: [{ studentId: 'stu-A' }, { studentId: 'stu-B' }],
      });

      expect(smsService.send).toHaveBeenCalledTimes(2);
      expect(smsService.send).toHaveBeenCalledWith(
        '9841111111',
        expect.stringContaining('Ram Sharma'),
        'ATTENDANCE_ABSENT',
        'stu-A',
      );
      expect(smsService.send).toHaveBeenCalledWith(
        '9842222222',
        expect.stringContaining('Sita Thapa'),
        'ATTENDANCE_ABSENT',
        'stu-B',
      );
    });

    it('skips rows + push when the student has no linked PARENT accounts', async () => {
      PARENT_USERS['stu-orphan'] = [];
      STUDENTS['stu-orphan'] = { first_name: 'Hari', last_name: 'KC' };
      PHONES['stu-orphan'] = [];

      await listener.handleAbsent({
        tenantSlug: 'demo',
        date: '2083-03-27',
        absentStudents: [{ studentId: 'stu-orphan' }],
      });

      expect(notificationService.createNotificationsBulk).not.toHaveBeenCalled();
      expect(pushService.sendToRecipients).not.toHaveBeenCalled();
    });

    it('does not throw when SMS or DB fails (must never crash attendance)', async () => {
      (smsService.send as jest.Mock).mockRejectedValueOnce(new Error('SMS provider down'));
      await expect(
        listener.handleAbsent({
          tenantSlug: 'demo',
          date: '2083-03-27',
          absentStudents: [{ studentId: 'stu-A' }],
        }),
      ).resolves.not.toThrow();

      (tenantPrisma.query as jest.Mock).mockRejectedValue(new Error('db down'));
      await expect(
        listener.handleAbsent({
          tenantSlug: 'demo',
          date: '2083-03-27',
          absentStudents: [{ studentId: 'stu-A' }],
        }),
      ).resolves.not.toThrow();
    });
  });
});
