import { Test } from '@nestjs/testing';
import { ExaminationListener } from '../listeners/examination.listener';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('ExaminationListener', () => {
  let listener: ExaminationListener;
  let notificationService: jest.Mocked<NotificationService>;
  let pushService: jest.Mocked<PushService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  const EVENT = {
    tenantSlug: 'demo',
    examTypeId: 'et-1',
    examTypeName: 'First Terminal',
    academicYearId: 'ay-1',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExaminationListener,
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

    listener = module.get(ExaminationListener);
    notificationService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    pushService = module.get(PushService) as jest.Mocked<PushService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
  });

  afterEach(() => jest.clearAllMocks());

  it('scopes the audience to the exam type: students with results + their parents', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
      { id: 'student-user-1' },
      { id: 'parent-user-1' },
    ]);

    await listener.handleResultPublished(EVENT);

    // Audience query is scoped by exam_type_id
    const [sql, examTypeId] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('student_results');
    expect(examTypeId).toBe('et-1');

    const [userIds, title, body, type, data] = notificationService.createNotificationsBulk.mock.calls[0];
    expect(userIds).toEqual(['student-user-1', 'parent-user-1']);
    expect(title).toBe('Results Published');
    expect(body).toContain('First Terminal');
    expect(type).toBe('EXAM');
    expect(data).toEqual({ examTypeId: 'et-1', route: 'results' });

    const [recipients, payload] = pushService.sendToRecipients.mock.calls[0];
    expect(recipients).toEqual([
      { userId: 'student-user-1', notificationId: 'n-student-user-1' },
      { userId: 'parent-user-1', notificationId: 'n-parent-user-1' },
    ]);
    expect(payload.route).toBe('results');
  });

  it('creates rows before pushing (mirror rule)', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'u-1' }]);

    await listener.handleResultPublished(EVENT);

    expect(notificationService.createNotificationsBulk.mock.invocationCallOrder[0]).toBeLessThan(
      pushService.sendToRecipients.mock.invocationCallOrder[0],
    );
  });

  it('is a no-op when nobody has results or linked accounts', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

    await listener.handleResultPublished(EVENT);

    expect(notificationService.createNotificationsBulk).not.toHaveBeenCalled();
    expect(pushService.sendToRecipients).not.toHaveBeenCalled();
  });

  it('never throws (fire-and-forget)', async () => {
    (tenantPrisma.query as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(listener.handleResultPublished(EVENT)).resolves.not.toThrow();
  });
});
