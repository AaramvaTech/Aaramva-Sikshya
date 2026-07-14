import { NEPAL_MOBILE_REGEX, isNepaliMobile, toE164Nepal } from '../phone.util';

describe('phone.util (REG-1 §2)', () => {
  describe('isNepaliMobile / NEPAL_MOBILE_REGEX', () => {
    it.each(['9812345678', '9712345678', '9612345678', '9800000000', '9888888888'])(
      'accepts valid Nepali mobile %s',
      (p) => {
        expect(isNepaliMobile(p)).toBe(true);
        expect(NEPAL_MOBILE_REGEX.test(p)).toBe(true);
      },
    );

    it.each([
      '981234567', // 9 digits (too short)
      '98123456789', // 11 digits (too long)
      '9512345678', // 95 prefix (not 96/97/98)
      '9012345678', // 90 prefix
      '1812345678', // does not start with 9
      '+9779812345678', // E.164 is not a *bare* mobile
      '98 1234 5678', // spaces
      'abcdefghij',
      '',
    ])('rejects invalid %s', (p) => {
      expect(isNepaliMobile(p)).toBe(false);
    });
  });

  describe('toE164Nepal', () => {
    it('prefixes a valid bare mobile with +977', () => {
      expect(toE164Nepal('9812345678')).toBe('+9779812345678');
    });

    it('is idempotent on already-E.164 input', () => {
      expect(toE164Nepal('+9779812345678')).toBe('+9779812345678');
    });

    it('trims surrounding whitespace before validating', () => {
      expect(toE164Nepal('  9812345678 ')).toBe('+9779812345678');
    });

    it.each(['12345', '9512345678', '', '  ', null, undefined])(
      'returns null for invalid/empty input %s',
      (p) => {
        expect(toE164Nepal(p as string | null | undefined)).toBeNull();
      },
    );
  });
});
