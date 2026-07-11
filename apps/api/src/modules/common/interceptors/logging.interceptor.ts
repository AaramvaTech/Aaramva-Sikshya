import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Structured request logging (OPS-1 T3). One line per request:
 *   { reqId, method, path, status, ms, tenant?, userId? }
 *
 * Deliberately NEVER includes bodies, query strings, or any header beyond
 * X-Tenant-Slug's value. /health is excluded (monitoring noise). The reqId is
 * echoed back as an X-Request-Id response header for correlation.
 * Interceptor-based by design (Step 0): the codebase is uniformly on Nest's
 * Logger, and main.ts switches ConsoleLogger to JSON in production — one
 * logging system, structured where it matters.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
    if (req.path === '/health') return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const reqId = randomUUID();
    res.setHeader('X-Request-Id', reqId);
    const start = Date.now();

    const line = (status: number): string => {
      const slug = req.headers['x-tenant-slug'];
      return JSON.stringify({
        reqId,
        method: req.method,
        path: req.path,
        status,
        ms: Date.now() - start,
        ...(typeof slug === 'string' && slug ? { tenant: slug } : {}),
        ...(req.user?.userId ? { userId: req.user.userId } : {}),
      });
    };

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(line(res.statusCode)),
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.logger.log(line(status));
        },
      }),
    );
  }
}
