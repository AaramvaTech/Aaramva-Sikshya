import { Money } from './money';
import { amountInWords } from './amount-in-words';

describe('amountInWords', () => {
  describe('English (lakh/crore, not millions)', () => {
    it('49,800 -> "Forty-Nine Thousand Eight Hundred Rupees" (reference Ullens bill)', () => {
      expect(amountInWords(Money.fromNumber(49800), 'en')).toBe(
        'Forty-Nine Thousand Eight Hundred Rupees',
      );
    });

    it('1,00,000 -> "One Lakh Rupees"', () => {
      expect(amountInWords(Money.fromNumber(100000), 'en')).toBe('One Lakh Rupees');
    });

    it('1,25,50,000 -> "One Crore Twenty-Five Lakh Fifty Thousand Rupees"', () => {
      expect(amountInWords(Money.fromNumber(12550000), 'en')).toBe(
        'One Crore Twenty-Five Lakh Fifty Thousand Rupees',
      );
    });

    it('0 -> "Zero Rupees"', () => {
      expect(amountInWords(Money.zero(), 'en')).toBe('Zero Rupees');
    });

    it('handles paisa: 100.50 -> "One Hundred Rupees and Fifty Paisa"', () => {
      expect(amountInWords(Money.fromNumber(100.5), 'en')).toBe(
        'One Hundred Rupees and Fifty Paisa',
      );
    });

    it('handles paisa-only: 0.05 -> "Zero Rupees and Five Paisa"', () => {
      expect(amountInWords(Money.fromNumber(0.05), 'en')).toBe('Zero Rupees and Five Paisa');
    });

    it('a single-digit thousand group has no trailing hyphen artefact: 9000 -> "Nine Thousand Rupees"', () => {
      expect(amountInWords(Money.fromNumber(9000), 'en')).toBe('Nine Thousand Rupees');
    });

    it('teens render correctly inside a group: 19000 -> "Nineteen Thousand Rupees"', () => {
      expect(amountInWords(Money.fromNumber(19000), 'en')).toBe('Nineteen Thousand Rupees');
    });

    it('a round hundred has no dangling remainder words: 500 -> "Five Hundred Rupees"', () => {
      expect(amountInWords(Money.fromNumber(500), 'en')).toBe('Five Hundred Rupees');
    });

    it('a value under 100 with no higher groups: 7 -> "Seven Rupees"', () => {
      expect(amountInWords(Money.fromNumber(7), 'en')).toBe('Seven Rupees');
    });

    it('negative amounts are prefixed Minus', () => {
      expect(amountInWords(Money.fromNumber(-500), 'en')).toBe('Minus Five Hundred Rupees');
    });
  });

  describe('Nepali (Devanagari)', () => {
    it('returns Devanagari script ending in रुपैयाँ', () => {
      const words = amountInWords(Money.fromNumber(49800), 'ne');
      expect(words.endsWith('रुपैयाँ')).toBe(true);
      expect(words).toMatch(/^[ऀ-ॿ\s]+$/); // pure Devanagari + spaces
    });

    it('zero renders as शून्य रुपैयाँ', () => {
      expect(amountInWords(Money.zero(), 'ne')).toBe('शून्य रुपैयाँ');
    });

    it('handles paisa with the पैसा suffix and र connector', () => {
      const words = amountInWords(Money.fromNumber(100.5), 'ne');
      expect(words).toContain('रुपैयाँ');
      expect(words).toContain('पैसा');
      expect(words).toContain('र');
    });

    it('one lakh renders with लाख', () => {
      expect(amountInWords(Money.fromNumber(100000), 'ne')).toContain('लाख');
    });

    it('one crore renders with करोड', () => {
      expect(amountInWords(Money.fromNumber(10000000), 'ne')).toContain('करोड');
    });
  });
});
