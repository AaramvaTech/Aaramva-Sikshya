import {
  isRateLimitError,
  rateLimitBackoffSeconds,
  MAX_RETRY_HOLDS,
} from '../retry-classifier.util';

describe('retry-classifier (MAIL-2 §2)', () => {
  it('flags SMTP transient/greylist codes 421/450/451 as rate-limited', () => {
    expect(isRateLimitError('Message failed: 421 4.7.0 Too many messages')).toBe(true);
    expect(isRateLimitError('450 4.2.1 mailbox temporarily unavailable')).toBe(true);
    expect(isRateLimitError('451 Requested action aborted: local error')).toBe(true);
  });

  it('flags HTTP 429 / "too many requests"', () => {
    expect(isRateLimitError('Sparrow SMS failed: HTTP 429')).toBe(true);
    expect(isRateLimitError('429 Too Many Requests')).toBe(true);
    expect(isRateLimitError('Provider says: too many requests, slow down')).toBe(true);
  });

  it('flags provider quota / rate-limit / throttle text', () => {
    expect(isRateLimitError('Daily sending quota exceeded')).toBe(true);
    expect(isRateLimitError('rate limit reached')).toBe(true);
    expect(isRateLimitError('Your account is being throttled')).toBe(true);
  });

  it('does NOT flag connection / timeout / auth / decrypt / empty errors', () => {
    expect(isRateLimitError('connect ECONNREFUSED 127.0.0.1:587')).toBe(false);
    expect(isRateLimitError('Greeting never received (timeout)')).toBe(false);
    expect(isRateLimitError('535 Authentication credentials invalid')).toBe(false);
    expect(isRateLimitError('credential secret missing (expired or already delivered)')).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError('')).toBe(false);
  });

  it('rateLimitBackoffSeconds escalates with holds and caps at 10 minutes', () => {
    expect(rateLimitBackoffSeconds(0)).toBe(60); // floored at 1 step
    expect(rateLimitBackoffSeconds(1)).toBe(60);
    expect(rateLimitBackoffSeconds(5)).toBe(300);
    expect(rateLimitBackoffSeconds(10)).toBe(600);
    expect(rateLimitBackoffSeconds(50)).toBe(600); // capped
  });

  it('caps holds at 50', () => {
    expect(MAX_RETRY_HOLDS).toBe(50);
  });
});
