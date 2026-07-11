import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

/**
 * GET /health — public liveness + component checks (OPS-1 T1).
 *
 * Served at the ROOT path (excluded from the api/v1 global prefix in main.ts)
 * and excluded from TenantMiddleware (no tenant context) and throttling.
 * HTTP 200 for ok/degraded (redis down is degraded — the app legitimately
 * runs without Redis), 503 when the db is unreachable.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check() {
    const report = await this.health.check();
    if (report.status === 'error') {
      // Shaped by HttpExceptionFilter → { success: false, error: { …, details: report } }
      throw new ServiceUnavailableException({
        message: 'Database unreachable',
        details: report,
      });
    }
    return report;
  }
}
