import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from '../http-exception.filter';
import { errorBody } from '../../errors/error-codes';

function capture(exception: unknown, opts?: { presetRequestId?: string }) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const headers: Record<string, string> = {};
  if (opts?.presetRequestId) headers['X-Request-Id'] = opts.presetRequestId;
  const res = {
    status,
    getHeader: (name: string) => headers[name],
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', path: '/x', headers: {} }),
    }),
  } as unknown as import('@nestjs/common').ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return { status, body: json.mock.calls[0]?.[0], headers };
}

function prismaKnownError(code: string, message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: 'test',
  });
}

describe('HttpExceptionFilter — ERR-1 envelope', () => {
  it('honors a custom catalog code from the exception body', () => {
    const { status, body } = capture(
      new ForbiddenException(
        errorBody('PASSWORD_CHANGE_REQUIRED', 'You must change your temporary password before continuing.'),
      ),
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(body.error.message).toMatch(/temporary password/);
  });

  it('maps AUTH_INVALID_CREDENTIALS with the safe default message', () => {
    const { status, body } = capture(
      new UnauthorizedException(errorBody('AUTH_INVALID_CREDENTIALS')),
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(body.error.message).toBe('Invalid email or password.');
  });

  it('maps FORBIDDEN_SCOPE for object-scope denials', () => {
    const { status, body } = capture(new ForbiddenException(errorBody('FORBIDDEN_SCOPE')));
    expect(status).toHaveBeenCalledWith(403);
    expect(body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('derives a semantic code from the HTTP status when none is explicit', () => {
    const notFound = capture(new NotFoundException('Student not found'));
    expect(notFound.body.error.code).toBe('RESOURCE_NOT_FOUND');
    // author-written message is preserved (not a raw internal string)
    expect(notFound.body.error.message).toBe('Student not found');

    const badRequest = capture(new BadRequestException('bad input'));
    expect(badRequest.body.error.code).toBe('BAD_REQUEST');
    expect(badRequest.body.error.message).toBe('bad input');
  });

  it('normalises a class-validator array-message BadRequest to VALIDATION_FAILED (422)', () => {
    const { status, body } = capture(
      new BadRequestException({ message: ['email must be an email', 'password should not be empty'] }),
    );
    expect(status).toHaveBeenCalledWith(422);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.fields).toBeDefined();
  });

  describe('Prisma known request errors', () => {
    it('maps P2002 → CONFLICT_DUPLICATE (409) and never leaks the raw message', () => {
      const { status, body } = capture(
        prismaKnownError('P2002', 'Unique constraint failed on the fields: (`slug`)'),
      );
      expect(status).toHaveBeenCalledWith(409);
      expect(body.error.code).toBe('CONFLICT_DUPLICATE');
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/constraint/i);
      expect(serialized).not.toMatch(/prisma/i);
      expect(serialized).not.toMatch(/slug/);
    });

    it('maps P2025 → RESOURCE_NOT_FOUND (404)', () => {
      const { status, body } = capture(prismaKnownError('P2025', 'Record to update not found.'));
      expect(status).toHaveBeenCalledWith(404);
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('maps any other Prisma code → INTERNAL_ERROR (500)', () => {
      const { status, body } = capture(prismaKnownError('P2010', 'Raw query failed'));
      expect(status).toHaveBeenCalledWith(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toMatch(/raw query/i);
    });
  });

  describe('unhandled (non-HTTP) errors', () => {
    it('becomes INTERNAL_ERROR (500) with the requestId woven into the message', () => {
      const { status, body } = capture(new Error('boom at db layer'), { presetRequestId: 'req-abc' });
      expect(status).toHaveBeenCalledWith(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.requestId).toBe('req-abc');
      expect(body.error.message).toContain('req-abc');
      // the raw message must not surface in the user-facing `message`
      expect(body.error.message).not.toContain('boom');
    });

    it('keeps raw text OUT of the body message in production', () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { body } = capture(new Error('SELECT * FROM users -- secret'));
        expect(body.error._debug).toBeUndefined();
        expect(JSON.stringify(body)).not.toMatch(/SELECT/);
      } finally {
        process.env.NODE_ENV = prev;
      }
    });
  });

  describe('requestId', () => {
    it('reuses the X-Request-Id header set by the LoggingInterceptor', () => {
      const { body } = capture(new NotFoundException('x'), { presetRequestId: 'req-123' });
      expect(body.error.requestId).toBe('req-123');
    });

    it('synthesizes a requestId + sets the header when the interceptor never ran', () => {
      const { body, headers } = capture(new ForbiddenException(errorBody('FORBIDDEN_ROLE')));
      expect(typeof body.error.requestId).toBe('string');
      expect(body.error.requestId.length).toBeGreaterThan(0);
      expect(headers['X-Request-Id']).toBe(body.error.requestId);
    });
  });
});
