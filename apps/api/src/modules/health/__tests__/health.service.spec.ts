import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health.service';
import { PrismaService } from '../../../prisma/prisma.service';

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

  const configWith = (values: Record<string, unknown>) => {
    config.get.mockImplementation((key: string, def?: unknown) => values[key] ?? def);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = { $queryRaw: jest.fn() };
    config = { get: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
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
