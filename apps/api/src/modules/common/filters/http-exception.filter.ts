import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  ERROR_CATALOG,
  defaultCodeForStatus,
  isErrorCode,
  type ErrorCode,
} from '../errors/error-codes';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
    requestId: string;
    /** Dev-only. Never present in production. Never carries SQL/stack in prod. */
    _debug?: unknown;
  };
}

/**
 * ERR-1 global exception filter. Every error — HttpException, Prisma, or an
 * unhandled throw — becomes the ONE nested envelope:
 *
 *   { success: false, error: { code, message, details, requestId } }
 *
 * Rulings honored:
 *  - `code` is a semantic catalog code (§1.2), NOT the HTTP status name.
 *  - Prisma P2002 → CONFLICT_DUPLICATE, P2025 → RESOURCE_NOT_FOUND, else 500;
 *    the raw Prisma message goes to logs/Sentry ONLY — never the body.
 *  - class-validator failures arrive as VALIDATION_FAILED (422) from the pipe
 *    factory; a stray array-message BadRequest is normalised here as a backstop.
 *  - Unhandled errors → INTERNAL_ERROR (500), full detail to logs + Sentry,
 *    body carries only the generic message + requestId. In production no stack,
 *    cause, or query text appears in the body; dev may add `_debug`.
 *  - requestId reuses the LoggingInterceptor's X-Request-Id so the body, the
 *    response header, and the structured log line all share one id.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { userId?: string } }>();

    const requestId = this.resolveRequestId(res);
    const isProd = process.env.NODE_ENV === 'production';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = 'INTERNAL_ERROR';
    let message: string = ERROR_CATALOG.INTERNAL_ERROR.message;
    let details: unknown = null;
    let debug: unknown;

    if (exception instanceof HttpException) {
      ({ status, code, message, details } = this.fromHttpException(exception));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Raw Prisma message → logs/Sentry ONLY, never the response body.
      this.logger.error(`[prisma ${exception.code}] ${exception.message}`);
      this.captureToSentry(req, exception);
      code = this.codeForPrisma(exception.code);
      status = ERROR_CATALOG[code as ErrorCode].status;
      message = ERROR_CATALOG[code as ErrorCode].message;
      details = null;
    } else {
      // Unhandled / non-HTTP error → 500. Full detail to logs + Sentry only.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
      this.captureToSentry(req, exception);
      code = 'INTERNAL_ERROR';
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = ERROR_CATALOG.INTERNAL_ERROR.message;
      if (!isProd) {
        debug = {
          name: exception instanceof Error ? exception.name : typeof exception,
          message: exception instanceof Error ? exception.message : String(exception),
        };
      }
    }

    // The support-facing "Ref: …" only makes sense for server faults.
    if (code === 'INTERNAL_ERROR') {
      message = ERROR_CATALOG.INTERNAL_ERROR.message.replace('{requestId}', requestId);
    }

    const body: ErrorBody = {
      success: false,
      error: {
        code,
        message,
        details,
        requestId,
        ...(debug !== undefined ? { _debug: debug } : {}),
      },
    };

    res.status(status).json(body);
  }

  /** Reuse the interceptor's correlation id; synthesize one if it never ran. */
  private resolveRequestId(res: Response): string {
    const existing = res.getHeader('X-Request-Id');
    if (typeof existing === 'string' && existing) return existing;
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  }

  private fromHttpException(exception: HttpException): {
    status: number;
    code: string;
    message: string;
    details: unknown;
  } {
    const status = exception.getStatus();
    const raw = exception.getResponse();

    let explicitCode: string | undefined;
    let explicitMessage: string | undefined;
    let arrayMessage: string[] | undefined;
    let details: unknown = null;

    if (typeof raw === 'string') {
      explicitMessage = raw;
    } else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (typeof r['code'] === 'string') explicitCode = r['code'];
      if (typeof r['message'] === 'string') explicitMessage = r['message'];
      else if (Array.isArray(r['message'])) {
        arrayMessage = (r['message'] as unknown[]).filter(
          (m): m is string => typeof m === 'string',
        );
      }
      if ('details' in r) details = r['details'] ?? null;
    }

    // Backstop: a class-validator BadRequest that didn't go through the pipe
    // factory (array message, no explicit code) → normalise to VALIDATION_FAILED.
    if (arrayMessage && !explicitCode) {
      return {
        status: ERROR_CATALOG.VALIDATION_FAILED.status,
        code: 'VALIDATION_FAILED',
        message: ERROR_CATALOG.VALIDATION_FAILED.message,
        details: {
          fields: Object.fromEntries(arrayMessage.map((m, i) => [String(i), m])),
        },
      };
    }

    // Explicit catalog code wins; a non-catalog custom code is preserved but
    // should not occur post-ERR-1; otherwise fall back to the status default.
    const code = explicitCode ?? defaultCodeForStatus(status);
    const catalogMessage = isErrorCode(code) ? ERROR_CATALOG[code].message : undefined;

    return {
      status,
      code,
      message: explicitMessage ?? catalogMessage ?? exception.message,
      details,
    };
  }

  private codeForPrisma(prismaCode: string): ErrorCode {
    if (prismaCode === 'P2002') return 'CONFLICT_DUPLICATE';
    if (prismaCode === 'P2025') return 'RESOURCE_NOT_FOUND';
    return 'INTERNAL_ERROR';
  }

  private captureToSentry(
    req: Request & { user?: { userId?: string } },
    exception: unknown,
  ): void {
    // OPS-1 T2: no-op without SENTRY_DSN. Tags route + tenant; user id only.
    Sentry.withScope((scope) => {
      scope.setTag('route', `${req.method} ${req.path}`);
      const slug = req.headers['x-tenant-slug'];
      if (typeof slug === 'string' && slug) scope.setTag('tenant', slug);
      if (req.user?.userId) scope.setUser({ id: req.user.userId });
      Sentry.captureException(exception);
    });
  }
}
