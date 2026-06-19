import { generateTemporaryPassword } from '../password.util';

describe('generateTemporaryPassword', () => {
  it('returns a string of the requested length (default 12)', () => {
    expect(generateTemporaryPassword()).toHaveLength(12);
    expect(generateTemporaryPassword(16)).toHaveLength(16);
  });

  it('excludes ambiguous characters 0 O 1 l I', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('includes a lowercase, an uppercase, a digit, and a symbol', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[2-9]/);
      expect(pw).toMatch(/[!@#$%^&*]/);
    }
  });

  it('produces distinct values across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(set.size).toBeGreaterThan(95);
  });
});
