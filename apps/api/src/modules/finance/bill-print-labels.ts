import { NEPALI_PRINT_PERMITTED } from '../../common/nepali-print-review-gate';

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
  // The unallocated part of a payment that went against EXISTING debt rather
  // than being held as credit. "Advance credit" claims money is being held;
  // when the student still owed, nothing was advanced.
  appliedToBalance: { en: 'Applied to balance', ne: 'बाँकी रकममा समायोजन' },
  thankYou: { en: 'Thank you', ne: 'धन्यवाद' },

  // ── BILL-RCPT-STATUS — the PENDING (uncleared cheque) variant ─────────────
  // The school holds the instrument; the bank has not paid. `amountTendered`
  // REPLACES amountReceived on that slip — it does not sit beside it — because
  // the whole point is that the received claim must not appear.
  //
  // NOT design-supplied (the approved references only ever drew a cleared
  // receipt) and NOT reviewed — gated behind BILL_RCPT_STATUS_NEPALI_REVIEWED,
  // its own round on the review sheet. See the gate's comment for why these
  // two carry more risk than an ordinary label.
  // The document's own title on a PENDING slip. A slip headed RECEIPT
  // contradicts the 'Amount tendered' label beneath it, and the title is the
  // line a parent actually reads.
  //
  // The Nepali is the LEAST confident string in this ticket: the obvious
  // candidates (भर्पाई, प्राप्ति) all carry the sense of 'receipt for money',
  // which is the exact meaning this title exists to avoid. निस्सा denotes a
  // slip/token/counterfoil rather than a receipt-for-money, so it is proposed
  // here — but it is Part D's PRIMARY question, not a settled choice.
  acknowledgement: { en: 'Acknowledgement', ne: 'निस्सा' },
  // The footer fine print, same swap as the title. "This is a computer-
  // generated receipt." under an ACKNOWLEDGEMENT heading reads as an
  // oversight rather than a distinction - and a slip that looks careless is
  // a slip a parent argues with.
  //
  // Only the A5 carries this line; the 80mm thermal footer has never had one.
  computerGeneratedAcknowledgement: {
    en: 'This is a computer-generated acknowledgement.',
    ne: 'यो कम्प्युटरबाट तयार भएको निस्सा हो।',
  },
  amountTendered: { en: 'Amount tendered', ne: 'बुझाइएको रकम' },
  subjectToClearance: {
    en: 'Subject to clearance. This is not a receipt for money received.',
    ne: 'भुक्तानी नभएसम्म मान्य हुने छैन। यो प्राप्त रकमको रसिद होइन।',
  },

  // ── BILL-PRINT-1 — A5 print stationery ────────────────────────────────────
  // Every Nepali value below is lifted VERBATIM from the approved design
  // references (docs/design/billing-print/Invoice.dc.html + Receipt.dc.html),
  // per SPEC §9's instruction to read them from the reference files rather
  // than hand-author them.
  //
  // IMPORTANT: NEPALI_PRINT_REVIEWED was set true on 2026-07-30 against the
  // label set as it stood THEN. These keys are new and have NOT been through
  // that review. They are design-supplied, not session-invented, but that is
  // not the same as native-speaker-reviewed — see the BILL-PRINT-1 report.
  //
  // Where the design's Nepali differs from an ALREADY-REVIEWED key above
  // (due, nonTaxable, taxable, totalReceivable, paidTowards) the reviewed
  // string is kept and the design's variant is NOT adopted. Those divergences
  // are listed in the report for a ruling; silently replacing a reviewed
  // translation with an unreviewed one is exactly the failure this gate
  // exists to prevent.
  studentCopy: { en: 'Student Copy', ne: 'विद्यार्थी प्रति' },
  officeCopy: { en: 'Office Copy', ne: 'कार्यालय प्रति' },
  cut: { en: 'cut', ne: 'काट्ने' },
  fyInstallment: { en: 'FY / Installment', ne: 'आ.व. / किस्ता' },
  classSection: { en: 'Class / Sec.', ne: 'कक्षा / सेक्सन' },
  roll: { en: 'Roll', ne: 'रोल नं.' },
  studentIdNo: { en: 'Student ID', ne: 'विद्यार्थी परिचय नं.' },
  guardian: { en: 'Guardian', ne: 'संरक्षक' },
  previousBalanceOutstanding: { en: 'Previous balance outstanding', ne: 'अघिल्लो बाँकी रकम' },
  scan: { en: 'Scan', ne: 'स्कान' },
  toPay: { en: 'to pay', ne: 'गर्नुहोस्' },
  authorisedSignature: { en: 'Authorised signature', ne: 'अधिकृत हस्ताक्षर' },
  principal: { en: 'Principal', ne: 'प्रधानाध्यापक' },
  computerGeneratedInvoice: {
    en: 'This is a computer-generated invoice.',
    ne: 'यो कम्प्युटरबाट तयार भएको बिल हो।',
  },
  computerGeneratedReceipt: {
    en: 'This is a computer-generated receipt.',
    ne: 'यो कम्प्युटरबाट तयार भएको रसिद हो।',
  },
  transactionRef: { en: 'Transaction ref.', ne: 'कारोबार सन्दर्भ' },
  amountApplied: { en: 'Amount applied', ne: 'लागू रकम' },
  balanceAfterPayment: { en: 'Balance after this payment', ne: 'भुक्तानी पश्चात् बाँकी रकम' },
  remarks: { en: 'Remarks', ne: 'कैफियत' },
  receivedBy: { en: 'Received by', ne: 'रकम बुझ्नेको नाम' },
  // Decision 3's continuation row — "+ 1 more fee item" / "+ 3 more fee items".
  // English inflects, so singular and plural are separate keys. The Nepali is
  // the SAME string for both: थप शुल्क शीर्षक does not take a count-driven
  // plural the way English does. That is flagged in the review sheet rather
  // than assumed — if a native speaker wants a distinct plural, the key is
  // already there to hold it.
  moreFeeItem: { en: 'more fee item', ne: 'थप शुल्क शीर्षक' },
  moreFeeItems: { en: 'more fee items', ne: 'थप शुल्क शीर्षक' },
  moreAllocation: { en: 'more invoice', ne: 'थप बिल' },
  moreAllocations: { en: 'more invoices', ne: 'थप बिल' },

  // Payment methods. The stored values are enum constants (CASH, BANK_TRANSFER,
  // ESEWA…) and printing them raw put "ESEWA" on a parent's receipt.
  // eSewa and Khalti are BRAND names and stay Latin in both locales — which is
  // what the approved design files themselves do (the Nepali half of
  // Receipt.dc.html reads "माध्यम / eSewa").
  methodCash: { en: 'Cash', ne: 'नगद' },
  methodCheque: { en: 'Cheque', ne: 'चेक' },
  methodBankTransfer: { en: 'Bank Transfer', ne: 'बैंक ट्रान्सफर' },
  methodEsewa: { en: 'eSewa', ne: 'eSewa' },
  methodKhalti: { en: 'Khalti', ne: 'Khalti' },
} satisfies Record<string, LabelPair>;

/** Stored enum -> printable method name. Unknown values print as-is rather
 *  than blank: an unmapped method is a bug, but a blank field on a receipt is
 *  worse than an ugly one. */
export function methodLabel(raw: string, lang: PrintLanguage): string {
  const key: Partial<Record<string, LabelKey>> = {
    CASH: 'methodCash', CHEQUE: 'methodCheque', BANK_TRANSFER: 'methodBankTransfer',
    ESEWA: 'methodEsewa', KHALTI: 'methodKhalti',
  };
  const k = key[raw];
  return k ? printLabel(k, lang) : raw;
}

/** "+ 1 more fee item" vs "+ 3 more fee items". */
export function continuationLabel(count: number, kind: 'fee' | 'invoice', lang: PrintLanguage): string {
  const key: LabelKey = kind === 'fee'
    ? (count === 1 ? 'moreFeeItem' : 'moreFeeItems')
    : (count === 1 ? 'moreAllocation' : 'moreAllocations');
  return `+ ${count} ${printLabel(key, lang)}`;
}

/** Methods where no human took the money — see the receipt's received-by slot. */
export const GATEWAY_METHODS: readonly string[] = ['ESEWA', 'KHALTI'];

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
  if (candidate !== 'EN' && !NEPALI_PRINT_PERMITTED) return 'EN';
  return candidate as PrintLanguage;
}
