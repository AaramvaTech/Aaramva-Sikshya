import { Test } from '@nestjs/testing';
import { NoticeListener } from '../listeners/notice.listener';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('NoticeListener', () => {
  let listener: NoticeListener;
  let notificationService: jest.Mocked<NotificationService>;
  let pushService: jest.Mocked<PushService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  const baseEvent = {
    tenantSlug: 'demo',
    noticeId: 'notice-1',
    title: 'Holiday Notice',
    body: 'School closed on Friday.',
    audience: 'STUDENTS',
    classId: null as string | null,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NoticeListener,
        {
          provide: NotificationService,
          useValue: {
            createNotificationsBulk: jest.fn().mockImplementation(
              async (userIds: string[]) => userIds.map((u) => ({ id: `n-${u}`, userId: u })),
            ),
          },
        },
        { provide: PushService, useValue: { sendToRecipients: jest.fn().mockResolvedValue(undefined) } },
        { provide: TenantPrismaService, useValue: { query: jest.fn(), run: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    listener = module.get(NoticeListener);
    notificationService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    pushService = module.get(PushService) as jest.Mocked<PushService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
  });

  afterEach(() => jest.clearAllMocks());

  it('targets roles whose ROLE_AUDIENCES visibility includes the notice audience', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'u-1' }, { id: 'u-2' }]);

    await listener.handleNoticePosted(baseEvent);

    const [sql, roles] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('FROM users');
    // STUDENTS-audience visibility per ROLE_AUDIENCES
    expect(roles).toEqual(
      expect.arrayContaining(['STUDENT', 'PRINCIPAL', 'SCHOOL_OWNER', 'ACADEMIC_COORDINATOR']),
    );
    expect(roles).not.toContain('PARENT');
    expect(roles).not.toContain('TEACHER');

    const [userIds, title, , type, data] = notificationService.createNotificationsBulk.mock.calls[0];
    expect(userIds).toEqual(['u-1', 'u-2']);
    expect(title).toBe('Holiday Notice');
    expect(type).toBe('NOTICE');
    expect(data).toEqual({ noticeId: 'notice-1', route: 'notices' });
    expect(pushService.sendToRecipients).toHaveBeenCalledTimes(1);
  });

  it('CLASS audience resolves that class\'s students + their parents only', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'stu-u-1' }, { id: 'par-u-1' }]);

    await listener.handleNoticePosted({ ...baseEvent, audience: 'CLASS', classId: 'class-9' });

    const [sql, classId] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('sections');
    expect(sql).toContain('guardians');
    expect(classId).toBe('class-9');
    const [userIds] = notificationService.createNotificationsBulk.mock.calls[0];
    expect(userIds).toEqual(['stu-u-1', 'par-u-1']);
  });

  it('CLASS audience without classId is a no-op', async () => {
    await listener.handleNoticePosted({ ...baseEvent, audience: 'CLASS', classId: null });

    expect(tenantPrisma.query).not.toHaveBeenCalled();
    expect(notificationService.createNotificationsBulk).not.toHaveBeenCalled();
    expect(pushService.sendToRecipients).not.toHaveBeenCalled();
  });

  it('truncates long bodies for the notification/push copy', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'u-1' }]);
    const longBody = 'x'.repeat(500);

    await listener.handleNoticePosted({ ...baseEvent, body: longBody });

    const [, , storedBody] = notificationService.createNotificationsBulk.mock.calls[0];
    expect((storedBody as string).length).toBeLessThanOrEqual(180);
    expect(storedBody).toContain('…');
  });

  it('never throws (fire-and-forget)', async () => {
    (tenantPrisma.query as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(listener.handleNoticePosted(baseEvent)).resolves.not.toThrow();
  });
});
