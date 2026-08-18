# Design Brief — School Invoice & Payment Receipt (print stationery)

## Context

I run **Aaramva Shikshya**, a school management platform used by schools and colleges in Nepal. The billing module generates two printed documents: a **fee invoice (bill)** and a **payment receipt**. The current templates are web components that were sent to a printer, and they fail as stationery — dead whitespace, broken image placeholders, a watermark colliding with the signature block, and a solid-fill "total" pill that photocopies as a black blob.

Redesign both as **print stationery first**. This is not a dashboard. It is a document a parent folds into a bag, a clerk files in a ledger box, and an accountant photocopies at 300 DPI on a mono laser printer.

## What to produce

Two self-contained HTML files, each containing complete inline CSS. No JavaScript. No external assets, webfonts, CDNs, or network calls at print time.

1. `invoice.html` — fee invoice / bill
2. `receipt.html` — payment receipt

Each file renders **one A4 sheet containing two A5 documents**, stacked vertically, separated by a cut line.

Support both stacking modes with a single layout skeleton:

- **Duplicate mode** — the same document twice, top half labelled *Student Copy*, bottom half *Office Copy*. This is the default.
- **Batch mode** — two different students' documents on one sheet, for bulk printing. Same skeleton, no copy label.

The copy label must be a small caps eyebrow, not a badge or ribbon.

## Page geometry — hard constraints

```
@page { size: A4 portrait; margin: 0; }
```

- A4 sheet: 210 × 297 mm
- Each half: 210 × 148.5 mm — **exact**, no overflow, no reflow onto a third half
- Content safe area inside each half: 12 mm outer margins, 10 mm at the cut line
- Cut line at exactly 148.5 mm: 0.25 pt dashed hairline, mid-grey, with a small scissors glyph or the word `cut` at the left edge in 5 pt
- Every dimension in `mm` or `pt`. No `px`, no `rem`, no viewport units.
- Each half must be a fixed-height container. If content would overflow, it is a design failure — solve it by tightening the type scale and row density, never by letting the box grow.
- Render target is headless Chromium (Puppeteer `printBackground: true`). CSS Grid and Flexbox are fine. Do not rely on anything that needs JS to lay out.

## Typography

- Devanagari: `Noto Sans Devanagari` / `Mukta`, with a generic fallback
- Latin: a neutral grotesque with real small caps or a convincing tracked-uppercase treatment
- Money and all numerals: **tabular figures** (`font-variant-numeric: tabular-nums`) — non-negotiable, this is why the current columns wobble
- Body text 7.5–8.5 pt, table rows 8 pt, labels 6–6.5 pt, document title 13–15 pt
- Devanagari needs its own line-height (roughly 1.5 vs 1.35 for Latin) and wider label columns. Set these per-locale, do not share one value.

## Content — Invoice

Header band:
- School logo (fixed box, with a defined fallback that is a bordered monogram, **never a bare coloured rectangle**), school name, one-line tagline
- Address, phone, website
- PAN No., Registration No. — right aligned, small, these are statutory and must be legible after photocopy

Document identity:
- Title: `INVOICE` / `बिल`
- Invoice number, prominent
- Issue date and due date, each in **AD (BS)** dual format
- Fiscal year and installment/month

Party block:
- Student name, class, section, roll number, guardian name
- Student ID / admission number

Fee table — one row per fee head:

| Fee Head | Gross | Concession | Non-taxable | Taxable | Total |
|---|---|---|---|---|---|

All numeric columns right-aligned on a shared decimal grid. Concessions in a distinct but **print-safe** treatment — a parenthesised negative or a lighter weight, not a colour that vanishes in greyscale.

Totals block:
- Subtotal
- Previous balance, with an explicit Dr/Cr marker and a plain-language label
- **Total receivable** — the single strongest element on the page, achieved with weight, size and a rule, **not** a filled shape
- Amount in words, bilingual-capable, on its own ruled line

Footer zone:
- Payment instructions (eSewa/Khalti, bank name, account number, branch, "quote the invoice number as remarks")
- QR code box — fixed 22 × 22 mm, labelled, with a bordered fallback that reads as a deliberate placeholder
- Authorised signature line with printed name and designation beneath it
- `This is a computer-generated invoice.` in 5.5 pt
- Sequential document number repeated small at the footer edge for filing

## Content — Receipt

The receipt is the acknowledgement of money received. It is shorter than the invoice and must be denser at the top so it stays readable when the bottom is torn or folded.

- Same header band as the invoice, at reduced height
- Title: `RECEIPT` / `रसिद`
- Receipt number, date (AD + BS)
- Student name, class, section, roll
- Payment method (cash / eSewa / Khalti / bank transfer / cheque), plus a transaction reference field
- **Amount received** — the dominant figure
- Amount in words
- *Paid towards* — an allocation table listing each invoice number the payment was applied to, with the amount applied to each. Multiple rows must be supported.
- **Balance after this payment**, with a Dr/Cr marker. The current receipt omits this and it is the single most requested line on a fee slip.
- Received by (staff name), authorised signature line
- Remarks line, left blank for hand-annotation
- `This is a computer-generated receipt.`

## Formatting rules

- Currency prefix `Rs.` (configurable to `NPR`), thousands separators, always two decimals
- Money always in Arabic numerals in both locales. Only labels translate — do not render Devanagari digits for amounts.
- Every date in `YYYY-MM-DD (BS YYYY-MM-DD)` form
- Negative and credit values use a consistent marker chosen once and applied everywhere

## Bugs in the current version to fix explicitly

1. Broken image placeholders rendering as raw coloured rectangles. Every image slot needs a fixed box and a designed fallback.
2. Watermark text overlapping the signature block. Either drop the watermark or give it a reserved band with correct z-order and a printable opacity (8–12% grey max).
3. Half the page empty with content floating at the top. The A5 half is the page — fill it or tighten it.
4. Money columns not on a decimal grid.
5. Solid-fill total pill. Replace with a typographic emphasis that survives greyscale.
6. Nepali layout inheriting Latin metrics, causing clipped labels and a title that fights the header rule.
7. No copy designation, no cut line, no fiscal year, no computer-generated note.

## Design direction

Institutional and quiet. The reference points are a bank pay-in slip, a university transcript, and a well-set utility bill — documents that signal *this is a record* rather than *this is a product*.

- One accent colour, used at hairline weight and in the header rule only. Everything else is black, and two greys.
- The document must be fully legible when printed in pure black-and-white. Design in greyscale first, add the accent last, and verify nothing breaks when it is removed.
- Hairline rules (0.25–0.5 pt) instead of filled table bands. Zebra striping is banned — it costs toner and photocopies badly.
- Hierarchy comes from type scale, weight, and whitespace between rule groups.
- Zero decorative elements. If it doesn't carry information, cut it.

## Locale handling

Build one skeleton with a `lang` attribute switch. English and Nepali must be structurally identical — same grid, same column positions, same rule placement — differing only in strings, font stack, and line-height. A school printing both must be able to overlay them and see the same document.

Deliver each file with both locales demonstrated: English on the top half, Nepali on the bottom, so I can compare the two in one render.

## Sample data to render with

```json
{
  "school": {
    "name": "Demo School Nepal",
    "tagline": "Simple school management for every school in Nepal",
    "address": "Naya Baneshwor, Kathmandu-10, Nepal",
    "phone": "01-4780123",
    "website": "https://demoschool.edu.np",
    "pan": "301234567",
    "reg_no": "REG-KTM-2019-04521"
  },
  "invoice": {
    "number": "BINV-2083-000028",
    "issued_ad": "2026-08-10", "issued_bs": "2083-04-25",
    "due_ad": "2026-08-25", "due_bs": "2083-05-09",
    "fiscal_year": "2083/84",
    "installment": "Ashwin 2083",
    "student": { "name": "Om Subedi", "class": "Grade 9", "section": "A", "roll": "14", "id": "STU-2081-0142", "guardian": "Ramesh Subedi" },
    "lines": [
      { "head": "Tuition Fee", "gross": 1000.00, "concession": -100.00, "non_taxable": 0.00, "taxable": 900.00, "total": 900.00 },
      { "head": "Transportation Fee", "gross": 500.00, "concession": -50.00, "non_taxable": 450.00, "taxable": 0.00, "total": 450.00 }
    ],
    "subtotal": 1350.00,
    "previous_balance": 1800.00,
    "previous_balance_type": "Dr",
    "total_receivable": 3150.00,
    "in_words": "Three Thousand One Hundred Fifty Rupees only",
    "bank": { "name": "Global IME Bank", "account": "0123456789012", "branch": "Naya Baneshwor" },
    "signatory": { "name": "Dr. Kamala Shrestha", "designation": "Principal" }
  },
  "receipt": {
    "number": "RCPT-2083-000021",
    "date_ad": "2026-08-12", "date_bs": "2083-04-27",
    "student": { "name": "Binod Gurung", "class": "Grade 9", "section": "B", "roll": "22" },
    "method": "eSewa",
    "txn_ref": "ESW-8842190337",
    "amount": 1000.00,
    "in_words": "One Thousand Rupees only",
    "allocations": [ { "invoice": "BINV-2083-000003", "amount": 1000.00 } ],
    "balance_after": 2150.00,
    "balance_after_type": "Dr",
    "received_by": "Sita Maharjan"
  }
}
```

## Acceptance checklist

Before you show me anything, verify:

- [ ] Prints to exactly one A4 sheet. No third page, no clipped content.
- [ ] Each half is exactly 148.5 mm. Measured, not assumed.
- [ ] Every numeric column aligns on the decimal point.
- [ ] Fully legible with all colour stripped to greyscale.
- [ ] No image slot can render as a bare rectangle if the asset is missing.
- [ ] No two elements overlap at any point, including watermark and signature.
- [ ] Nepali half has no clipped glyphs and no label wrapping.
- [ ] Receipt states the balance after payment.
- [ ] Cut line present, copy designations present, computer-generated note present.

## Process

Before building, give me a short plan: the type scale, the two-plus-greys palette with the single accent, an ASCII wireframe of one A5 half for each document type, and the one element you're using to carry the hierarchy. I'll approve the plan, then you build.
