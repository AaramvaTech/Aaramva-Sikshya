import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

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

      if (typeof raw === 'string') {
        message = raw;
      } else if (typeof raw === 'object' && raw !== null) {
        const r = raw as Record<string, unknown>;
        message = (r['message'] as string) ?? exception.message;
        details = r['details'] ?? null;
      }

      code = HttpStatus[status] ?? 'HTTP_ERROR';
    } else {
      // Unexpected (non-HTTP) errors — log stack, hide details from client
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      success: false,
      error: { code, message, details },
    };

    res.status(status).json(body);
  }
}
