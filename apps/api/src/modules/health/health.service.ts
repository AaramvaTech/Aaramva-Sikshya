import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export type ComponentStatus = 'up' | 'down' | 'disabled';

export interface ComponentReport {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  /** ok = all components up; degraded = a non-fatal component (redis or file
   *  storage) is configured but unreachable — the app legitimately runs
   *  without either; error = db down. */
  status: 'ok' | 'degraded' | 'error';
  uptimeSec: number;
  timestamp: string;
  components: {
    db: ComponentReport;
    redis: ComponentReport;
    storage: ComponentReport;
  };
}

const DB_TIMEOUT_MS = 2000;
const REDIS_TIMEOUT_MS = 1500;
const STORAGE_TIMEOUT_MS = 1500;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async check(): Promise<HealthReport> {
    const [db, redis, storage] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkStorage(),
    ]);
    // db down → error (503). A non-fatal component down (redis OR storage) →
    // degraded (still HTTP 200); the app runs without either. BUG-1: storage
    // unreachable is now visible here instead of only surfacing as a failed
    // client-side upload.
    const status: HealthReport['status'] =
      db.status === 'down'
        ? 'error'
        : redis.status === 'down' || storage.status === 'down'
          ? 'degraded'
          : 'ok';
    return {
      status,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      components: { db, redis, storage },
    };
  }

  private async checkDb(): Promise<ComponentReport> {
    const start = Date.now();
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message.split('\n')[0] };
    }
  }

  private async checkRedis(): Promise<ComponentReport> {
    const enabled = this.config.get<boolean>('REDIS_ENABLED');
    const url = this.config.get<string>('REDIS_URL');
    const host = this.config.get<string>('REDIS_HOST');
    if (!enabled || !(url || host)) {
      return { status: 'disabled' };
    }
    const client = url
      ? new Redis(url, {
          lazyConnect: true,
          connectTimeout: REDIS_TIMEOUT_MS,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        })
      : new Redis({
          host,
          port: this.config.get<number>('REDIS_PORT', 6379),
          lazyConnect: true,
          connectTimeout: REDIS_TIMEOUT_MS,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        });
    const start = Date.now();
    try {
      await this.withTimeout(client.connect().then(() => client.ping()), REDIS_TIMEOUT_MS);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message.split('\n')[0] };
    } finally {
      client.disconnect();
    }
  }

  /** BUG-1: cheap reachability probe of the S3/MinIO backend. `disabled` when
   *  no S3_* config (base64 legacy path is the intended mode); otherwise a
   *  short-timeout HeadBucket → up/down. Never throws to the caller. */
  private async checkStorage(): Promise<ComponentReport> {
    if (!this.storage.isEnabled()) {
      return { status: 'disabled' };
    }
    const start = Date.now();
    try {
      await this.withTimeout(this.storage.assertReachable(), STORAGE_TIMEOUT_MS);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message.split('\n')[0] };
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref(),
      ),
    ]);
  }
}
