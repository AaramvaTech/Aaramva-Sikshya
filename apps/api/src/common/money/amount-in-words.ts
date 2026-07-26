import { Money } from './money';

type Locale = 'en' | 'ne';

// ─── English ──────────────────────────────────────────────────────────────────

const EN_ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const EN_TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

/** 0-99 -> "Forty-Nine" / "Nineteen" / "Seven". */
function enTwoDigits(n: number): string {
  if (n < 20) return EN_ONES[n];
  const tens = EN_TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${EN_ONES[ones]}`;
}

/** Indian/Nepali grouping (crore/lakh/thousand/hundred), English words. */
function enGroups(rupees: number): string[] {
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;

  if (crore > 0) parts.push(`${enTwoDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${enTwoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${enTwoDigits(thousand)} Thousand`);
  if (hundred > 0) parts.push(`${EN_ONES[hundred]} Hundred`);
  if (remainder > 0) parts.push(enTwoDigits(remainder));

  return parts;
}

function amountInWordsEn(rupees: number, paisa: number, negative: boolean): string {
  const rupeeWords = rupees === 0 ? 'Zero' : enGroups(rupees).join(' ');
  let result = `${rupeeWords} Rupees`;
  if (paisa > 0) {
    result += ` and ${enTwoDigits(paisa)} Paisa`;
  }
  return negative ? `Minus ${result}` : result;
}

// ─── Nepali (Devanagari) ────────────────────────────────────────────────────
//
// Nepali cardinals 1-99 are not compositionally derivable from tens+ones the
// way English is (vowel contraction, irregular forms), so this is a flat
// lookup table — the standard approach for Devanagari amount-in-words.
// NOTE: per this project's I18N-1 precedent (CLAUDE.md), AI-authored Nepali
// text is not self-certified for correctness — this table should get the
// same native-speaker review pass I18N-1's mobile strings went through
// before being trusted on a real printed bill.
const NE_ONES: string[] = [
  'शून्य', 'एक', 'दुई', 'तीन', 'चार', 'पाँच', 'छ', 'सात', 'आठ', 'नौ',
  'दस', 'एघार', 'बाह्र', 'तेह्र', 'चौध', 'पन्ध्र', 'सोह्र', 'सत्र', 'अठार', 'उन्नाइस',
  'बीस', 'एक्काइस', 'बाइस', 'तेइस', 'चौबीस', 'पच्चिस', 'छब्बिस', 'सत्ताइस', 'अठ्ठाइस', 'उनन्तिस',
  'तीस', 'एकतिस', 'बत्तिस', 'तेत्तिस', 'चौँतिस', 'पैँतिस', 'छत्तिस', 'सैँतिस', 'अठतिस', 'उनन्चालिस',
  'चालिस', 'एकचालिस', 'बयालिस', 'त्रिचालिस', 'चवालिस', 'पैँतालिस', 'छयालिस', 'सतचालिस', 'अठचालिस', 'उनन्चास',
  'पचास', 'एकाउन्न', 'बाउन्न', 'त्रिपन्न', 'चवन्न', 'पचपन्न', 'छपन्न', 'सन्ताउन्न', 'अन्ठाउन्न', 'उनन्साठी',
  'साठी', 'एकसाठी', 'बयसठ्ठी', 'त्रिसठ्ठी', 'चौंसठ्ठी', 'पैंसठ्ठी', 'छयसठ्ठी', 'सतसठ्ठी', 'अठसठ्ठी', 'उनन्सत्तरी',
  'सत्तरी', 'एकहत्तर', 'बहत्तर', 'त्रिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छयहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी',
  'असी', 'एकासी', 'बयासी', 'त्रियासी', 'चौरासी', 'पचासी', 'छयासी', 'सतासी', 'अठासी', 'उनान्नब्बे',
  'नब्बे', 'एकान्नब्बे', 'बयान्नब्बे', 'त्रियान्नब्बे', 'चौरान्नब्बे', 'पन्चान्नब्बे', 'छयान्नब्बे', 'सन्तान्नब्बे', 'अन्ठान्नब्बे', 'उनान्सय',
];

function neGroups(rupees: number): string[] {
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;

  if (crore > 0) parts.push(`${NE_ONES[crore]} करोड`);
  if (lakh > 0) parts.push(`${NE_ONES[lakh]} लाख`);
  if (thousand > 0) parts.push(`${NE_ONES[thousand]} हजार`);
  if (hundred > 0) parts.push(`${NE_ONES[hundred]} सय`);
  if (remainder > 0) parts.push(NE_ONES[remainder]);

  return parts;
}

function amountInWordsNe(rupees: number, paisa: number, negative: boolean): string {
  const rupeeWords = rupees === 0 ? 'शून्य' : neGroups(rupees).join(' ');
  let result = `${rupeeWords} रुपैयाँ`;
  if (paisa > 0) {
    result += ` र ${NE_ONES[paisa]} पैसा`;
  }
  return negative ? `ऋण ${result}` : result;
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * BILL-0: amount in words for bill printing. English uses the lakh/crore
 * system (not millions/billions); Nepali returns Devanagari. Both handle
 * paisa. Splits on the Money.toDb() decimal STRING (not float math) — pure
 * digit-substring parsing is exact, unlike parseFloat/Number() on the
 * decimal value itself, which R1 forbids.
 */
export function amountInWords(m: Money, locale: Locale): string {
  const db = m.toDb(); // e.g. "-1234.56"
  const negative = db.startsWith('-');
  const [rupeesStr, paisaStr] = (negative ? db.slice(1) : db).split('.');
  const rupees = parseInt(rupeesStr, 10);
  const paisa = parseInt(paisaStr, 10);

  return locale === 'ne'
    ? amountInWordsNe(rupees, paisa, negative)
    : amountInWordsEn(rupees, paisa, negative);
}
