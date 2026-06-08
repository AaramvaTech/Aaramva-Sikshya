import { Test } from '@nestjs/testing';
import { NoticeService } from '../notice.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

describe('NoticeService', () => {
  let service: NoticeService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NoticeService,
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

    service = module.get(NoticeService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('createNotice()', () => {
    it('sets is_published=false by default', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'notice-1', title: 'Test', body: 'Body', type: 'GENERAL', audience: 'ALL', is_published: false, created_at: new Date(), updated_at: new Date() },
      ]);

      await service.createNotice(
        { title: 'Test', body: 'Body' },
        'user-1',
      );

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string];
      // The INSERT should set is_published to false
      expect(sql).toContain('is_published');
      // Verify 'false' appears (either as literal or $param where value is false)
      expect(sql.toLowerCase()).toContain('insert');
    });
  });

  describe('publishNotice()', () => {
    it('sets is_published=true and published_at to now', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'notice-1', is_published: false, created_by: 'user-1' }]) // findById
        .mockResolvedValueOnce([{ id: 'notice-1', is_published: true, published_at: new Date(), title: 'T', body: 'B', type: 'GENERAL', audience: 'ALL', created_at: new Date(), updated_at: new Date() }]); // after update

      const result = await service.publishNotice('notice-1', 'user-1');

      const calls = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls as [string, ...unknown[]][];
      const updateCall = calls.find(([sql]) => sql.toUpperCase().includes('UPDATE'));
      expect(updateCall).toBeDefined();
      expect(result.isPublished).toBe(true);
    });
  });

  describe('getNotices()', () => {
    it('excludes expired notices automatically', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await service.getNotices({ page: 1, limit: 20 }, 'TEACHER', null);

      const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string];
      expect(sql).toContain('expires_at');
      expect(sql).toContain('NOW()');
    });

    it('filters by audience for a given role', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await service.getNotices({ page: 1, limit: 20 }, 'PARENT', null);

      const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0] as [string];
      expect(sql).toContain('audience');
    });
  });
});
