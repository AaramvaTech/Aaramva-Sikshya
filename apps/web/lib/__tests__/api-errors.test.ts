import { describe, it, expect } from 'vitest';
import { extractApiErrors, apiErrorCode } from '../api-errors';

describe('extractApiErrors (REG-1 Phase 5)', () => {
  it('returns the ARRAY of field-level validation messages', () => {
    const err = {
      response: {
        data: { error: { message: ['phone must be a valid Nepali mobile', 'email must be an email'] } },
      },
    };
    expect(extractApiErrors(err)).toEqual([
      'phone must be a valid Nepali mobile',
      'email must be an email',
    ]);
  });

  it('ERR-1-CONTRACT-1: prefers details.fields (422 shape) over the summary message', () => {
    const err = {
      response: {
        data: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Please correct the highlighted fields.',
            details: { fields: { email: 'email must be an email', phone: 'phone must be a valid Nepali mobile' } },
          },
        },
      },
    };
    expect(extractApiErrors(err)).toEqual([
      'email must be an email',
      'phone must be a valid Nepali mobile',
    ]);
  });

  it('wraps a single string message', () => {
    expect(extractApiErrors({ response: { data: { error: { message: 'nope' } } } })).toEqual([
      'nope',
    ]);
  });

  it('falls back when there is no server message', () => {
    expect(extractApiErrors({}, 'fallback')).toEqual(['fallback']);
    expect(extractApiErrors(new Error('x'), 'fallback')).toEqual(['fallback']);
  });
});

describe('apiErrorCode', () => {
  it('reads the machine-readable error code', () => {
    expect(
      apiErrorCode({ response: { data: { error: { code: 'PASSWORD_CHANGE_REQUIRED' } } } }),
    ).toBe('PASSWORD_CHANGE_REQUIRED');
  });
  it('is undefined when absent', () => {
    expect(apiErrorCode({})).toBeUndefined();
  });
});
