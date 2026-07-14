import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

/**
 * Catches every thrown exception (HttpException or unknown) and returns a
 * uniform error envelope:
 *   { success: false, error: { code, message, details } }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();

      let customCode: string | undefined;
      if (typeof raw === 'string') {
        message = raw;
      } else if (typeof raw === 'object' && raw !== null) {
        const r = raw as Record<string, unknown>;
        message = (r['message'] as string) ?? exception.message;
        details = r['details'] ?? null;
        // Allow an exception to carry a stable machine-readable code
        // (e.g. REG-1 PASSWORD_CHANGE_REQUIRED) instead of the HTTP status name.
        if (typeof r['code'] === 'string') customCode = r['code'];
      }

      code = customCode ?? HttpStatus[status] ?? 'HTTP_ERROR';
    } else {
      // Unexpected (non-HTTP) errors — log stack, hide details from client
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
      // OPS-1 T2: forward to Sentry (no-op when SENTRY_DSN is absent). Tags:
      // tenant slug + route; user id only — no bodies, headers, or other PII.
      const req = ctx.getRequest<Request & { user?: { userId?: string } }>();
      Sentry.withScope((scope) => {
        scope.setTag('route', `${req.method} ${req.path}`);
        const slug = req.headers['x-tenant-slug'];
        if (typeof slug === 'string' && slug) scope.setTag('tenant', slug);
        if (req.user?.userId) scope.setUser({ id: req.user.userId });
        Sentry.captureException(exception);
      });
      // Expose message in dev so errors are debuggable without reading terminal
      if (process.env.NODE_ENV !== 'production') {
        message = exception instanceof Error ? exception.message : String(exception);
      }
    }

    const body: ErrorBody = {
      success: false,
      error: { code, message, details },
    };

    res.status(status).json(body);
  }
}
