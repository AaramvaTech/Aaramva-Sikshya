# Specification: School Invoice & Payment Receipt (print stationery)

Measured spec for `Invoice.dc.html` and `Receipt.dc.html`. Self-sufficient — a developer who was not
in the design conversation can implement from this document alone.

---

## 1. Overview

Two printed documents produced by the billing module of a Nepali school management platform:

- **Fee invoice (bill)** — what a student owes for an installment period.
- **Payment receipt** — acknowledgement of money received against one or more invoices.

Each renders as **one A4 sheet containing two A5 documents** stacked vertically with a cut line
between them.

## 2. About the design files

`Invoice.dc.html` and `Receipt.dc.html` are **design references created in HTML** — prototypes
showing the intended look, geometry, and content, not production code to ship. They are authored in
a streaming component format with all styling inline and no stylesheet.

The task is to **recreate these designs in the target codebase's existing environment** — its
templating engine, its styling conventions, its PDF pipeline. If the project has no such environment
yet, choose the most appropriate one; for a print-stationery generator that is typically a plain
server-rendered HTML template printed by headless Chromium via Puppeteer with `printBackground: true`.

## 3. Fidelity

**High-fidelity.** Final colours, type scale, spacing, and geometry. Recreate pixel-for-pixel using
the codebase's own libraries and patterns. Every value in this document is the intended final value.

## 4. Design tokens

### Colour — four values total

| Token | Value | Used for |
|---|---|---|
| Ink | `#111111` | all body text, all data-carrying rules (`0.5pt`) |
| Grey-1 | `#5a5a5a` | labels, eyebrows, tagline, concession figures, fine print |
| Grey-2 | `#b0b0b0` | hairlines (`0.25pt`), cut line, placeholder box borders |
| Grey-3 | `#dcdcdc` | interior table row separators only |
| Accent | `#0d5c43` | header rule, document title, total rule, monogram border |

The accent appears in exactly four places per document: the `0.75pt` header rule, the document
title, the `0.75pt` rule above the total figure, and the logo monogram border. **Nowhere else.**
There are no filled backgrounds, no tints, no zebra striping anywhere in either document.

Page background is `#fff` in print; the preview shell uses `#e9e9e7` behind the sheet, suppressed
under `@media print`.

### Rule weights

| Weight | Colour | Role |
|---|---|---|
| `0.75pt` | `#0d5c43` | header rule; rule above the total figure |
| `0.5pt` | `#111` | table closing rule; signature line |
| `0.5pt` | `#b0b0b0` | placeholder box borders (logo, QR) |
| `0.25pt` | `#b0b0b0` | group separators; in-words underline; remark lines |
| `0.25pt` | `#dcdcdc` | interior table row separators |
| `0.25pt dashed` | `#b0b0b0` | cut line |

### Typography

Latin stack: `'Helvetica Neue', Helvetica, Arial, sans-serif`
Devanagari stack: `'Noto Sans Devanagari', 'Mukta', 'Kalimati', 'Helvetica Neue', Helvetica, Arial, sans-serif`

No `@font-face`, no webfont, no network request. **If the print container has no Devanagari font
installed, the Nepali half will fall back to Latin metrics and render tofu — verify this on the
actual render host, and inline a base64 subset of Noto Sans Devanagari if it does.**

Per-locale line-height, deliberately not shared:

| Locale | line-height |
|---|---|
| Latin (`lang="en"`) | `1.35` |
| Devanagari (`lang="ne"`) | `1.40`–`1.42` |

Devanagari sits lower than the 1.5 the brief suggested because the halves are height-constrained;
it was tightened during fitting and verified against glyph clipping. Devanagari eyebrow labels run
`6.5pt` (vs `6.25pt` Latin) and are untracked, since tracking damages conjuncts.

`font-variant-numeric: tabular-nums` is set on the document root and re-declared on every `<table>`
and every money span, so it survives any font-stack fallback.

### Type scale

| Role | Size | Weight | Tracking | Notes |
|---|---|---|---|---|
| Document title | `14pt` | 700 | `0.04em` Latin, none Devanagari | accent colour |
| Amount received (receipt) | `16pt` | 700 | `-0.01em` | the dominant figure |
| Total receivable (invoice) | `15pt` | 700 | `-0.01em` | the dominant figure |
| School name | `11pt` | 700 | `0.01em` | |
| Logo monogram | `11pt` (invoice) / `9.5pt` (receipt) | 700 | | |
| Balance-after figure (receipt) | `9pt` | 700 | | |
| Document number | `8.5pt` | 700 | | `white-space: nowrap` |
| Party values, table body | `8pt` | 400 | | money cells 500, totals 600 |
| Tagline, address, in-words, payment instructions | `7.5pt` | 400 | in-words 600 | |
| Eyebrows, column heads, labels | `6.25pt` Latin / `6.5pt` Devanagari | 600 | `0.09em` Latin, uppercase | |
| Statutory labels (PAN, Reg.) | `5.5pt` | 400 | `0.09em`, uppercase | |
| Computer-generated note, filing number | `5.5pt` Latin / `6pt` Devanagari | 400 | `0.03em` | |
| Cut marker, QR label | `5pt` | 400 | `0.12em` / `0.06em`, uppercase | |

Nothing falls below `5pt`, and everything at `5.5pt` and under is fine print that survives
photocopy because it is set in grey on white with no adjacent rule.

### Spacing

Vertical rhythm is a small set of `mm` steps applied between rule groups: `1.2`, `1.6`, `1.8`, `2`,
`4mm`. Table row padding is `1.1mm` vertical (Latin) and `0.7mm` (Devanagari, absorbing the taller
line box). Column-head padding-bottom is `1mm` / `0.9mm`. Grid gap in the party block is `4mm`.
Footer band internal gap is `6mm` (invoice) / `8mm` (receipt).

These values are the result of fitting content to a fixed 148.5 mm box. **If you change content
volume, re-fit by adjusting these steps and row density — never by changing the half's height.**

## 5. Page geometry

```
Sheet:        210mm × 297mm, position: relative, background #fff
Half:         210mm × 148.5mm, box-sizing: border-box, overflow: hidden
              padding: 12mm 12mm 10mm 12mm
              display: flex; flex-direction: column
Cut line:     position: absolute; left: 0; top: 148.5mm; width: 210mm; height: 0
              border-top: 0.25pt dashed #b0b0b0
Cut marker:   position: absolute; left: 3mm; top: 146.4mm
              5pt uppercase #b0b0b0, background #fff, padding: 0 1mm, text "✂ cut"
```

Content box inside a half is `210 − 24 = 186mm` wide and `148.5 − 22 = 126.5mm` tall. A
`flex: 1 1 auto; min-height: 0` spacer sits above the footer band, pinning it to the bottom edge of
the safe area so the half fills without content floating at the top.

**Verification, required:** for each half assert `scrollHeight - clientHeight <= 2` (a 2 px residual
is the fractional-height rounding of 148.5 mm at 96 dpi, not overflow) and assert the last child's
bounding-box bottom sits above the half's content-box bottom.

## 6. Invoice — structure top to bottom

**Header band.** Flex row, `gap: 5mm`.
- Logo: `15 × 15mm` fixed box, `0.5pt solid #0d5c43` border, centred `11pt/700` accent monogram
  (`DS`). This is the fallback when no logo asset exists — a bordered monogram, never a filled or
  bare rectangle. When an asset does exist it goes inside the same fixed box, `object-fit: contain`.
- Centre column: school name `11pt/700`; tagline `7.5pt` Grey-1; then address · phone · website on
  one `7.5pt` Ink line, separated by `·` with `&nbsp;` padding.
- Right column, right-aligned: `PAN No.` eyebrow `5.5pt` Grey-1 over `8pt/600` value; `Reg. No.`
  eyebrow over `8pt/600` value. Statutory, must stay legible after photocopy.

**Header rule.** `0.75pt solid #0d5c43`, `margin-top: 1.8mm`.

**Document identity.** Flex row, `align-items: flex-end`.
- Left: copy eyebrow (`Student Copy`) → title `INVOICE` `14pt/700` accent tracked `0.04em` →
  invoice number `8.5pt/700` `nowrap`.
- Right, right-aligned: three label/value rows — `Issued`, `Due`, `FY / Installment`. Each is a flex
  row with `gap: 3mm`, the label a `6.25pt` tracked grey eyebrow `nowrap` vertically centred, the
  value `7.5pt/600` with `min-width: 38mm` so the three values form a hard right column. Dates in
  `2026-08-10 (BS 2083-04-25)` form.

**Hairline**, then **party block**: CSS grid, `grid-template-columns: 1.5fr 1fr 0.6fr 1.2fr 1.3fr`,
`gap: 4mm`. Five cells — Student, Class / Sec., Roll, Student ID, Guardian — each a `6.25pt` tracked
grey eyebrow over an `8pt/600` value. Devanagari uses the same fractions but wider labels absorb
into the same tracks, so the two locales overlay exactly.

**Hairline**, then **fee table.** `width: 100%`, `border-collapse: collapse`.

| Column | Align | Width |
|---|---|---|
| Fee Head | left | auto |
| Gross | right | `22mm` |
| Concession | right | `24mm` |
| Non-taxable | right | `24mm` |
| Taxable | right | `22mm` |
| Total | right | `24mm` |

Column heads are `6.25pt` tracked grey eyebrows. First row's cells carry `border-top: 0.25pt solid
#b0b0b0`; subsequent rows `0.25pt solid #dcdcdc`. Body cells `8pt`, money `500`, the Total column
`600`. Concessions render as **`(100.00)` in `#5a5a5a` at weight 400** — parenthesised, greyscale-safe.
Table closes with a `0.5pt solid #111` rule.

**Totals block.** Right-aligned, `74mm` wide (`82mm` Devanagari, absorbing longer labels).
- `Subtotal` / value `8pt/600`, space-between.
- `Previous balance outstanding (DR)` / value — the `(DR)` is a `6.25pt` tracked grey inline span.
- `0.75pt solid #0d5c43` rule, `margin-top: 2mm`.
- `TOTAL RECEIVABLE` eyebrow, `align-self: flex-end`, `padding-bottom: 0.6mm`, `nowrap` — baseline-
  aligned against `Rs. 3,150.00` at `15pt/700`, `letter-spacing: -0.01em`. **This is the strongest
  element on the page and it is achieved entirely with weight, size, and the rule above it.**

**Amount in words.** Eyebrow over `7.5pt/600` text with `padding-bottom: 1.2mm` and
`border-bottom: 0.25pt solid #b0b0b0` — the words sit on their own ruled line.

**Spacer.** `flex: 1 1 auto; min-height: 0`.

**Footer band.** `border-top: 0.25pt solid #b0b0b0`, `padding-top: 1.8mm`, flex row `gap: 6mm`,
`align-items: flex-start`. Three columns:
1. Payment instructions — eyebrow over `7.5pt` text, `max-width: 78mm`, bank name / account number
   bolded to `600`. Copy: *"Pay via eSewa or Khalti, or transfer to **Global IME Bank**, A/C
   **0123456789012**, Naya Baneshwor branch. Quote the invoice number as remarks."*
2. QR placeholder — `18 × 18mm` fixed, `0.5pt solid #b0b0b0`, containing a `7 × 7mm`
   `0.25pt` outlined square and a `5pt` uppercase grey `SCAN / TO PAY` label, `gap: 0.8mm`,
   centred. Reads as a deliberate placeholder, never as a bare rectangle.
3. Signature — `46mm` wide, `align-self: stretch`, content justified to flex-end. `Authorised
   signature` eyebrow `nowrap`, then a `2.6mm` clear gap for the wet signature, then
   `0.5pt solid #111` rule, then printed name `8pt/600` and designation `6.25pt` tracked grey `nowrap`.

**Fine print.** Flex row space-between, `5.5pt` Grey-1: `This is a computer-generated invoice.` on
the left, the sequential document number repeated on the right for filing. Both `nowrap`.

## 7. Receipt — differences from the invoice

The receipt acknowledges money received. It is shorter and **denser at the top**, so it stays
readable when the bottom is torn or folded.

- **Header band at reduced height:** logo `12 × 12mm` with a `9.5pt` monogram, tagline dropped,
  address line retained.
- **Identity:** title `RECEIPT`; no copy of the invoice's three-row date stack — just `Receipt No.`
  (`8.5pt/700`) and `Date` (`7.5pt/600`), `min-width: 40mm`.
- **Party block:** grid `1.6fr 1fr 0.55fr 1fr 1.5fr` — Student, Class / Sec., Roll, Method,
  Transaction ref. Method covers cash / eSewa / Khalti / bank transfer / cheque.
- **Amount received band:** flex row. Left, amount in words (eyebrow over `7.5pt/600`). Right,
  `74mm` (`80mm` Devanagari): `0.75pt` accent rule, then `AMOUNT RECEIVED` eyebrow baseline-aligned
  against `Rs. 1,000.00` at `16pt/700`.
- **Allocation table** — *Paid towards*. Three columns: invoice number (left, auto), Installment
  (left, `40mm`), Amount applied (right, `30mm`). **Must support multiple rows** — a payment can be
  split across several invoices. Same rule treatment as the fee table, closing `0.5pt solid #111`.
- **Balance after this payment** — right-aligned block matching the allocation table's right edge,
  label `8pt/600` with a `(DR)` marker span, value `9pt/700`. *This line was absent from the
  previous receipt and is the single most requested item on a fee slip. It must always render.*
- **Footer band:** three columns, `align-items: flex-end`, `gap: 8mm`.
  1. Remarks — eyebrow over **three ruled lines** at `5.6mm` each, `border-bottom: 0.25pt solid
     #b0b0b0`, left blank for hand annotation. These also absorb the receipt's height difference
     from the invoice so the half fills rather than floats.
  2. Received by — `40mm`: eyebrow, staff name `8pt/600`, then a `0.25pt` rule with `3.4mm` of
     signing space beneath.
  3. Authorised signature — `46mm`, same construction as the invoice.
- **Fine print:** `This is a computer-generated receipt.` and the receipt number.

## 8. Interactions & behaviour

None. There is no JavaScript, no hover state, no responsive breakpoint. The only "state" is the
template's input data and two flags:

| Flag | Values | Effect |
|---|---|---|
| `stackMode` | `duplicate` (default) \| `batch` | `duplicate` renders the same document twice with `Student Copy` / `Office Copy` eyebrows; `batch` renders two different students' documents and omits the eyebrow |
| `locale` | `en` \| `ne` | sets the half's `lang`, font stack, line-height, label widths, and strings. Nothing else changes |

Both halves of a sheet are independent renders of the same partial. Production output is one locale
per sheet; the reference files show `en` on top and `ne` below purely so the two can be compared in
one render.

## 9. Sample data

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
    "allocations": [ { "invoice": "BINV-2083-000003", "installment": "Shrawan 2083", "amount": 1000.00 } ],
    "balance_after": 2150.00,
    "balance_after_type": "Dr",
    "received_by": "Sita Maharjan"
  }
}
```

Nepali strings used in the reference (school name `डेमो स्कूल नेपाल`, titles `बिल` / `रसिद`, labels
`विद्यार्थी`, `कक्षा / सेक्सन`, `रोल नं.`, `शुल्क शीर्षक`, `कुल`, `छुट`, `कर नलाग्ने`, `कर लाग्ने`,
`जम्मा`, `उप-जम्मा`, `अघिल्लो बाँकी रकम`, `कुल बुझाउनुपर्ने रकम`, `अक्षरमा रकम`, `प्राप्त रकम`,
`भुक्तानी पश्चात् बाँकी रकम`, `कैफियत`, `अधिकृत हस्ताक्षर`) should be moved into the project's
existing i18n catalogue rather than hard-coded. Read them from the reference files.

## 10. Assets

None. There are no images, icons, or fonts in the bundle.

- **Logo** — no asset supplied. Rendered as a bordered monogram fallback; wire the real asset into
  the same fixed box.
- **QR code** — no asset supplied. Rendered as a labelled bordered placeholder; generate the real
  payment QR server-side and drop it into the same `18 × 18mm` box.
- **Icons** — none. The scissors mark is the Unicode character `✂` (`&#9986;`).

## 11. Files in this bundle

| File | Contents |
|---|---|
| `CLAUDE_CODE_PROMPT.md` | The prompt to paste into Claude Code |
| `SPEC.md` | This document |
| `Invoice.dc.html` | Invoice reference — A4 sheet, English half over Nepali half |
| `Receipt.dc.html` | Receipt reference — A4 sheet, English half over Nepali half |
| `design-brief-invoice-receipt.md` | The original brief the designs were built against |

## 12. Known open item

The Devanagari font stack is system-only, per the brief's no-external-assets rule. If the production
render host (a Puppeteer container, typically) has no Nepali font installed, the Nepali half will
render tofu. Either install `fonts-noto-devanagari` in the render image, or inline a base64 subset
of Noto Sans Devanagari into the template. Test this before shipping — it will not show up in local
development on a machine that happens to have the font.
