import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { HttpExceptionFilter } from '../http-exception.filter';

function capture(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', path: '/x', headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return { status, body: json.mock.calls[0]?.[0] };
}

describe('HttpExceptionFilter — error code derivation', () => {
  it('honors a custom code from the exception body (REG-1 PASSWORD_CHANGE_REQUIRED)', () => {
    const { status, body } = capture(
      new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your temporary password before continuing.',
      }),
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(body.error.message).toMatch(/temporary password/);
  });

  it('falls back to the HTTP status name when no custom code is given', () => {
    const { body } = capture(new BadRequestException('bad input'));
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('bad input');
  });
});
