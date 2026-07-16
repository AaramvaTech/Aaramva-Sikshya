import type { ValidationError } from 'class-validator';
import {
  ERROR_CATALOG,
  defaultCodeForStatus,
  errorBody,
  isErrorCode,
} from '../error-codes';
import { flattenValidationErrors, validationExceptionFactory } from '../validation.util';

describe('error-codes catalog', () => {
  it('every entry has a numeric status and a non-empty message', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(typeof entry.status).toBe('number');
      expect(entry.message.length).toBeGreaterThan(0);
      expect(code).toMatch(/^[A-Z0-9_]+$/); // SCREAMING_SNAKE
    }
  });

  it('the spec catalog codes are all present', () => {
    for (const code of [
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_SESSION_EXPIRED',
      'FORBIDDEN_ROLE',
      'FORBIDDEN_SCOPE',
      'RESOURCE_NOT_FOUND',
      'CONFLICT_DUPLICATE',
      'VALIDATION_FAILED',
      'TENANT_NOT_FOUND',
      'TENANT_SUSPENDED',
      'PAYMENT_GATEWAY_UNAVAILABLE',
      'PAYMENT_VERIFICATION_FAILED',
      'STORAGE_UNAVAILABLE',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it('defaultCodeForStatus maps each emitted status to a catalog code', () => {
    expect(defaultCodeForStatus(400)).toBe('BAD_REQUEST');
    expect(defaultCodeForStatus(401)).toBe('AUTH_SESSION_EXPIRED');
    expect(defaultCodeForStatus(403)).toBe('FORBIDDEN_ROLE');
    expect(defaultCodeForStatus(404)).toBe('RESOURCE_NOT_FOUND');
    expect(defaultCodeForStatus(409)).toBe('CONFLICT_DUPLICATE');
    expect(defaultCodeForStatus(422)).toBe('VALIDATION_FAILED');
    expect(defaultCodeForStatus(429)).toBe('RATE_LIMITED');
    expect(defaultCodeForStatus(500)).toBe('INTERNAL_ERROR');
    expect(defaultCodeForStatus(418)).toBe('INTERNAL_ERROR'); // unmapped → generic
  });

  it('isErrorCode rejects non-catalog strings', () => {
    expect(isErrorCode('NOPE')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });

  describe('errorBody', () => {
    it('uses the catalog default message when none is given', () => {
      expect(errorBody('AUTH_INVALID_CREDENTIALS')).toEqual({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    });
    it('accepts a message override and details', () => {
      expect(errorBody('FORBIDDEN_SCOPE', 'nope', { id: 1 })).toEqual({
        code: 'FORBIDDEN_SCOPE',
        message: 'nope',
        details: { id: 1 },
      });
    });
  });
});

describe('validation flattening', () => {
  const err = (property: string, constraints: Record<string, string>, children?: ValidationError[]): ValidationError => ({
    property,
    constraints,
    children: children ?? [],
  });

  it('keeps the first constraint message per field', () => {
    const errors: ValidationError[] = [
      err('email', { isEmail: 'email must be an email' }),
      err('password', { minLength: 'password must be longer', isString: 'password must be a string' }),
    ];
    expect(flattenValidationErrors(errors)).toEqual({
      email: 'email must be an email',
      password: 'password must be longer',
    });
  });

  it('walks nested children with dot paths', () => {
    const errors: ValidationError[] = [
      err('address', {}, [err('district', { isString: 'district must be a string' })]),
    ];
    expect(flattenValidationErrors(errors)).toEqual({
      'address.district': 'district must be a string',
    });
  });

  it('validationExceptionFactory returns a 422 VALIDATION_FAILED envelope with details.fields', () => {
    const ex = validationExceptionFactory([err('email', { isEmail: 'email must be an email' })]);
    expect(ex.getStatus()).toBe(422);
    const body = ex.getResponse() as { code: string; message: string; details: { fields: Record<string, string> } };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details.fields).toEqual({ email: 'email must be an email' });
  });
});
