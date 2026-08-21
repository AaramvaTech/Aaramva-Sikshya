import { describe, it, expect } from 'vitest';
import { getErrorDisplay, isNetworkError } from '../errors';

describe('getErrorDisplay — network / offline class (ERR-1 §1.4)', () => {
  it('axios ERR_NETWORK → offline message + retryable', () => {
    const d = getErrorDisplay({ code: 'ERR_NETWORK', message: 'Network Error', request: {} });
    expect(d.kind).toBe('network');
    expect(d.retryable).toBe(true);
    expect(d.message).toMatch(/Can't reach the server/);
  });

  it('timeout (ECONNABORTED) → offline + retryable', () => {
    const d = getErrorDisplay({ code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded', request: {} });
    expect(d.kind).toBe('network');
    expect(d.retryable).toBe(true);
  });

  it('request sent but no response received → offline', () => {
    const d = getErrorDisplay({ request: {}, message: 'Network Error' });
    expect(d.kind).toBe('network');
    expect(d.retryable).toBe(true);
  });

  it('isNetworkError is false once a response arrived', () => {
    expect(isNetworkError({ response: { status: 500 }, code: 'ERR_BAD_RESPONSE' })).toBe(false);
  });
});

describe('getErrorDisplay — enveloped server errors', () => {
  it('422 VALIDATION_FAILED → validation kind + details.fields, not retryable', () => {
    const d = getErrorDisplay({
      response: {
        status: 422,
        data: { error: { code: 'VALIDATION_FAILED', message: 'Please correct the highlighted fields.', details: { fields: { email: 'Must be a valid email' } } } },
      },
    });
    expect(d.kind).toBe('validation');
    expect(d.fields).toEqual({ email: 'Must be a valid email' });
    expect(d.retryable).toBe(false);
  });

  it('AUTH_SESSION_EXPIRED → session-expired kind', () => {
    const d = getErrorDisplay({ response: { status: 401, data: { error: { code: 'AUTH_SESSION_EXPIRED' } } } });
    expect(d.kind).toBe('session-expired');
  });

  // ERR-MAP-1 ruling 3 CHANGED this contract. It used to assert retryable:true.
  // A 500 is unexplained by definition, so a Retry affordance asserts a
  // transience nobody established — and re-sending the same request with the
  // same bad data fails identically, forever. The kind, message and Ref are
  // unchanged; only the affordance goes.
  it('INTERNAL_ERROR (500) → server kind, Ref requestId, and NOT retryable', () => {
    const d = getErrorDisplay({ response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', requestId: 'req_9f8a' } } } });
    expect(d.kind).toBe('server');
    expect(d.requestId).toBe('req_9f8a');
    expect(d.message).toMatch(/Ref: req_9f8a/);
    expect(d.retryable).toBe(false);
  });

  it('a 5xx with no cataloged code is also not retryable', () => {
    const d = getErrorDisplay({ response: { status: 502, data: {} } });
    expect(d.kind).toBe('server');
    expect(d.retryable).toBe(false);
  });

  // Only genuinely transient errors opt in — the SAME request may later succeed
  // without the caller changing anything.
  it.each([
    ['STORAGE_UNAVAILABLE', 503],
    ['SERVICE_UNAVAILABLE', 503],
    ['PAYMENT_GATEWAY_UNAVAILABLE', 502],
    ['RATE_LIMITED', 429],
  ])('%s opts in to retryable', (code, status) => {
    const d = getErrorDisplay({ response: { status, data: { error: { code } } } });
    expect(d.retryable).toBe(true);
  });

  it('transport failure stays retryable — no request reached the server', () => {
    expect(getErrorDisplay({ code: 'ERR_NETWORK', request: {} }).retryable).toBe(true);
  });

  // ERR-MAP-1 ruling 6 — the six codes that had drifted out of CODE_MESSAGES,
  // plus this ticket's new one. Each must resolve to its OWN message, not the
  // generic fallback and not the server's string.
  it.each([
    ['PASSWORD_CHANGE_REQUIRED', /temporary password/i],
    ['CLASS_MISMATCH', /different class/i],
    ['RECEIPT_PAYMENT_BOUNCED', /bounced/i],
    ['RECEIPT_PAYMENT_VOIDED', /voided/i],
    ['BAD_REQUEST', /could not be processed/i],
    ['SERVICE_UNAVAILABLE', /temporarily unavailable/i],
    ['RELATED_RECORD_NOT_FOUND', /no longer exists/i],
  ])('%s has its own client message', (code, pattern) => {
    const d = getErrorDisplay({
      response: { status: 400, data: { error: { code, message: 'SERVER STRING' } } },
    });
    expect(d.message).toMatch(pattern);
    expect(d.message).not.toBe('SERVER STRING');
    expect(d.message).not.toBe('Something went wrong. Please try again.');
  });

  it('cataloged business code → mapped message, not retryable', () => {
    const d = getErrorDisplay({ response: { status: 403, data: { error: { code: 'FORBIDDEN_SCOPE', message: 'Access denied' } } } });
    expect(d.kind).toBe('business');
    expect(d.message).toBe("You don't have access to this record.");
  });

  it('unknown code falls back to the server message', () => {
    const d = getErrorDisplay({ response: { status: 400, data: { error: { code: 'SOMETHING_NEW', message: 'A specific server message' } } } });
    expect(d.message).toBe('A specific server message');
  });
});

describe('getErrorDisplay — never leaks a raw axios/JS string', () => {
  it('a raw axios Error becomes the generic message', () => {
    const d = getErrorDisplay(new Error('Request failed with status code 500'));
    expect(d.message).not.toContain('Request failed with status code');
    expect(d.message).toMatch(/Something went wrong/);
  });

  it('manufactured "CODE: message" (2xx success:false) → mapped by code', () => {
    const d = getErrorDisplay(new Error('CONFLICT_DUPLICATE: A record with this value already exists.'));
    expect(d.kind).toBe('business');
    expect(d.message).toBe('A record with this value already exists.');
  });
});
