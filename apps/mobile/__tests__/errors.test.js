// ERR-1 §1.4 — mobile getErrorDisplay matrix (mirror of the web vitest suite).
// .js so it runs under jest-expo without being pulled into `tsc --noEmit`.
import { getErrorDisplay, isNetworkError } from '../lib/errors';

describe('getErrorDisplay — network / offline class (first-class on mobile)', () => {
  it('axios ERR_NETWORK → offline message + retryable', () => {
    const d = getErrorDisplay({ code: 'ERR_NETWORK', message: 'Network Error', request: {} });
    expect(d.kind).toBe('network');
    expect(d.retryable).toBe(true);
    expect(d.message).toMatch(/Can't reach the server/);
  });

  it('timeout (ECONNABORTED) → offline + retryable', () => {
    const d = getErrorDisplay({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded', request: {} });
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
      response: { status: 422, data: { error: { code: 'VALIDATION_FAILED', message: 'x', details: { fields: { email: 'Must be a valid email' } } } } },
    });
    expect(d.kind).toBe('validation');
    expect(d.fields).toEqual({ email: 'Must be a valid email' });
    expect(d.retryable).toBe(false);
  });

  it('AUTH_SESSION_EXPIRED → session-expired kind', () => {
    const d = getErrorDisplay({ response: { status: 401, data: { error: { code: 'AUTH_SESSION_EXPIRED' } } } });
    expect(d.kind).toBe('session-expired');
  });

  it('AUTH_INVALID_CREDENTIALS → mapped login message', () => {
    const d = getErrorDisplay({ response: { status: 401, data: { error: { code: 'AUTH_INVALID_CREDENTIALS' } } } });
    expect(d.message).toBe('Invalid email or password.');
  });

  it('INTERNAL_ERROR (500) → server kind + Ref requestId, retryable', () => {
    const d = getErrorDisplay({ response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', requestId: 'req_1' } } } });
    expect(d.kind).toBe('server');
    expect(d.message).toMatch(/Ref: req_1/);
    expect(d.retryable).toBe(true);
  });

  it('cataloged business code → mapped message', () => {
    const d = getErrorDisplay({ response: { status: 403, data: { error: { code: 'FORBIDDEN_SCOPE', message: 'Access denied' } } } });
    expect(d.message).toBe("You don't have access to this record.");
  });
});

describe('getErrorDisplay — local + raw', () => {
  it('controlled local error surfaces userMessage (file-pick/upload validation)', () => {
    const err = Object.assign(new Error('boom internal'), { userMessage: 'The file is larger than 10 MB.' });
    const d = getErrorDisplay(err);
    expect(d.kind).toBe('business');
    expect(d.message).toBe('The file is larger than 10 MB.');
  });

  it('a raw axios Error becomes the generic message (never leaked)', () => {
    const d = getErrorDisplay(new Error('Request failed with status code 500'));
    expect(d.message).not.toContain('Request failed with status code');
    expect(d.message).toMatch(/Something went wrong/);
  });

  it('manufactured "CODE: message" (2xx success:false) → mapped by code', () => {
    const d = getErrorDisplay(new Error('CONFLICT_DUPLICATE: dup'));
    expect(d.message).toBe('A record with this value already exists.');
  });
});
