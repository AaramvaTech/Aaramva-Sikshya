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
  // plus this ticket's new one. Each must resolve to its OWN message when the
  // server sends none — not the generic fallback.
  //
  // ERR-WEB-MESSAGE-DEAD flipped the priority (server message now wins over
  // the catalog when the server sends one — see the dedicated tests below),
  // so this fixture must omit `message` to still exercise the catalog path.
  it.each([
    ['PASSWORD_CHANGE_REQUIRED', /temporary password/i],
    ['CLASS_MISMATCH', /different class/i],
    ['RECEIPT_PAYMENT_BOUNCED', /bounced/i],
    ['RECEIPT_PAYMENT_VOIDED', /voided/i],
    ['BAD_REQUEST', /could not be processed/i],
    ['SERVICE_UNAVAILABLE', /temporarily unavailable/i],
    ['RELATED_RECORD_NOT_FOUND', /no longer exists/i],
  ])('%s falls back to its own client message when the server sends none', (code, pattern) => {
    const d = getErrorDisplay({
      response: { status: 400, data: { error: { code } } },
    });
    expect(d.message).toMatch(pattern);
    expect(d.message).not.toBe('Something went wrong. Please try again.');
  });

  // ERR-WEB-MESSAGE-DEAD — the defect this covers: CODE_MESSAGES[code] ??
  // serverMessage discarded a real, specific server message (e.g. "Invoice
  // INV-0042 is already voided") in favour of a generic catalog string
  // whenever the code happened to be cataloged. The server message must win.
  it('ERR-WEB-MESSAGE-DEAD: a cataloged code with a real server message uses the SERVER message, not the catalog', () => {
    const d = getErrorDisplay({
      response: { status: 403, data: { error: { code: 'FORBIDDEN_SCOPE', message: 'Access denied for invoice INV-0042' } } },
    });
    expect(d.kind).toBe('business');
    expect(d.message).toBe('Access denied for invoice INV-0042');
    expect(d.message).not.toBe("You don't have access to this record.");
  });

  it('cataloged business code with no server message → mapped catalog message, not retryable', () => {
    const d = getErrorDisplay({ response: { status: 403, data: { error: { code: 'FORBIDDEN_SCOPE' } } } });
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

  // ERR-WEB-MESSAGE-DEAD: the fixture above can't tell old from new priority
  // — the parsed text happens to equal the catalog string for that code. Use
  // a code whose catalog text differs from the parsed message to prove the
  // parsed (server-authored) message wins, not the catalog.
  it('ERR-WEB-MESSAGE-DEAD: manufactured "CODE: message" prefers the parsed message over the catalog', () => {
    const d = getErrorDisplay(new Error('CLASS_MISMATCH: Grade 5 structure cannot bill a Grade 10 student.'));
    expect(d.kind).toBe('business');
    expect(d.message).toBe('Grade 5 structure cannot bill a Grade 10 student.');
  });
});
