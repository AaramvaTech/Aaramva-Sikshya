import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

// The redis branch constructs a throwaway ioredis client — mock the module so
// "configured but unreachable" is simulated without a socket.
const redisConnect = jest.fn();
const redisPing = jest.fn();
const redisDisconnect = jest.fn();
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    connect: redisConnect,
    ping: redisPing,
    disconnect: redisDisconnect,
  })),
}));

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let config: { get: jest.Mock };
  let storage: { isEnabled: jest.Mock; assertReachable: jest.Mock };

  const configWith = (values: Record<string, unknown>) => {
    config.get.mockImplementation((key: string, def?: unknown) => values[key] ?? def);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = { $queryRaw: jest.fn() };
    config = { get: jest.fn() };
    // default: storage disabled (base64 legacy mode) so unrelated tests stay ok
    storage = { isEnabled: jest.fn().mockReturnValue(false), assertReachable: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('reports ok with redis disabled when redis is not configured', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    configWith({ REDIS_ENABLED: false });

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.components.db.status).toBe('up');
    expect(report.components.redis.status).toBe('disabled');
    expect(report.components.storage.status).toBe('disabled');
  });

  it('reports storage up when the S3 backend is configured and reachable', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    configWith({ REDIS_ENABLED: false });
    storage.isEnabled.mockReturnValue(true);
    storage.assertReachable.mockResolvedValue(undefined);

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.components.storage.status).toBe('up');
    expect(storage.assertReachable).toHaveBeenCalled();
  });

  it('reports degraded (not error) when storage is configured but unreachable', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    configWith({ REDIS_ENABLED: false });
    storage.isEnabled.mockReturnValue(true);
    storage.assertReachable.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:9000'));

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.components.db.status).toBe('up');
    expect(report.components.storage.status).toBe('down');
    expect(report.components.storage.error).toContain('ECONNREFUSED');
  });

  it('reports error when the db check throws (db down)', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    configWith({ REDIS_ENABLED: false });

    const report = await service.check();

    expect(report.status).toBe('error');
    expect(report.components.db.status).toBe('down');
    expect(report.components.db.error).toContain('connection refused');
  });

  it('reports degraded (not error) when redis is configured but unreachable', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    configWith({ REDIS_ENABLED: true, REDIS_HOST: 'localhost' });
    redisConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.components.db.status).toBe('up');
    expect(report.components.redis.status).toBe('down');
    expect(redisDisconnect).toHaveBeenCalled();
  });

  it('reports ok when redis is configured and reachable', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    configWith({ REDIS_ENABLED: true, REDIS_HOST: 'localhost' });
    redisConnect.mockResolvedValue(undefined);
    redisPing.mockResolvedValue('PONG');

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.components.redis.status).toBe('up');
  });
});
