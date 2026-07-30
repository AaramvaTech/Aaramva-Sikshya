import { NEPALI_PRINT_REVIEWED } from '../../common/nepali-print-review-gate';

/**
 * BILL-8 B8-5 — the fixed label set for bilingual bill/receipt print.
 *
 * NOT native-speaker reviewed yet — gated the same as amount-in-words
 * (see common/nepali-print-review-gate.ts). These are a good-faith
 * standard-Nepali-administrative-terminology attempt, not a certified
 * translation; treat them as part of what the native-speaker review must
 * confirm, not as already-correct.
 */
export type PrintLanguage = 'EN' | 'NE' | 'BOTH';

export const PRINT_LANGUAGES: readonly PrintLanguage[] = ['EN', 'NE', 'BOTH'];

interface LabelPair { en: string; ne: string; }

const LABELS = {
  invoice: { en: 'Invoice', ne: 'बिल' },
  receipt: { en: 'Receipt', ne: 'रसिद' },
  invoiceNo: { en: 'Invoice No.', ne: 'बिल नं.' },
  receiptNo: { en: 'Receipt No.', ne: 'रसिद नं.' },
  student: { en: 'Student', ne: 'विद्यार्थी' },
  class: { en: 'Class', ne: 'कक्षा' },
  installment: { en: 'Installment', ne: 'किस्ता' },
  issued: { en: 'Issued', ne: 'जारी मिति' },
  due: { en: 'Due', ne: 'तिर्नुपर्ने मिति' },
  date: { en: 'Date', ne: 'मिति' },
  panNo: { en: 'PAN No.', ne: 'स्थायी लेखा नं.' },
  regNo: { en: 'Reg. No.', ne: 'दर्ता नं.' },
  feeHead: { en: 'Fee head', ne: 'शुल्क शीर्षक' },
  gross: { en: 'Gross', ne: 'कुल' },
  concession: { en: 'Concession', ne: 'छुट' },
  nonTaxable: { en: 'Non-taxable', ne: 'कर रहित' },
  taxable: { en: 'Taxable', ne: 'करयोग्य' },
  total: { en: 'Total', ne: 'जम्मा' },
  subtotal: { en: 'Subtotal', ne: 'उप-जम्मा' },
  tax: { en: 'Tax', ne: 'कर' },
  previousBalanceDr: { en: 'Previous balance (Dr)', ne: 'अघिल्लो बाँकी (डेबिट)' },
  previousBalanceCr: { en: 'Previous balance (Cr)', ne: 'अघिल्लो बाँकी (क्रेडिट)' },
  totalReceivable: { en: 'Total receivable', ne: 'कुल बुझ्नुपर्ने रकम' },
  amountInWords: { en: 'Amount in words', ne: 'अक्षरमा रकम' },
  only: { en: 'only', ne: 'मात्र' },
  paymentInstructions: { en: 'Payment instructions', ne: 'भुक्तानी निर्देशन' },
  forSchool: { en: 'For', ne: 'को तर्फबाट' },
  amountReceived: { en: 'Amount received', ne: 'प्राप्त रकम' },
  method: { en: 'Method', ne: 'माध्यम' },
  paidTowards: { en: 'Paid towards', ne: 'तिरेको बापत' },
  advanceCredit: { en: 'Advance credit', ne: 'पेश्की जम्मा' },
  thankYou: { en: 'Thank you', ne: 'धन्यवाद' },
} satisfies Record<string, LabelPair>;

export type LabelKey = keyof typeof LABELS;

/** BOTH mode shows "English / Nepali" inline — simplest bilingual
 *  treatment for fixed short labels; not yet layout-reviewed for BOTH
 *  mode specifically (English-only and Nepali-only each had their own
 *  review round; BOTH is a first pass). */
export function printLabel(key: LabelKey, lang: PrintLanguage): string {
  const pair = LABELS[key];
  if (lang === 'EN') return pair.en;
  if (lang === 'NE') return pair.ne;
  return `${pair.en} / ${pair.ne}`;
}

/**
 * Render-time defensive resolution (belt-and-suspenders alongside the
 * settings-write-time gate check in settings.service.ts): a NE/BOTH value
 * that somehow reached the stored column while the gate was/is closed
 * silently falls back to EN rather than erroring. Language is a
 * presentational nicety that must never block generating a bill/receipt —
 * the money-critical document always has to render. `override` (staff
 * query-param, B8-5 §5) takes precedence over the tenant default when
 * present and itself valid+gate-permitted.
 */
export function resolvePrintLanguage(stored: string | null | undefined, override?: string): PrintLanguage {
  const candidate = override ?? stored ?? 'EN';
  if (!PRINT_LANGUAGES.includes(candidate as PrintLanguage)) return 'EN';
  if (candidate !== 'EN' && !NEPALI_PRINT_REVIEWED) return 'EN';
  return candidate as PrintLanguage;
}
