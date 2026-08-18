# BILL-PRINT-1 — Nepali review sheet

**For:** a native Nepali speaker, ideally someone who has handled a Nepali school's fee bills or
receipts.
**Purpose:** these strings are printed on bills and receipts that go home to parents. Until this
sheet comes back, Nepali print is switched off in the software and every school gets English.

**You do not need to read any code.** For each row, either tick the proposed Nepali or write a
better one in the last column. "Better" means what a Nepali school office would actually print —
not the most literal translation.

---

## How to read this

- **English** — what the software prints today.
- **Proposed Nepali** — what it would print in Nepali. Taken from the approved design files.
- **Where it appears** — so you can judge register (a column heading reads differently from a
  sentence).
- **Your correction** — leave blank if the proposal is right.

Two things worth knowing before you start:

1. **Numbers stay in Arabic digits (0–9) in both languages** — `Rs. 3,150.00`, never `३,१५०`. That
   is a deliberate decision, not an oversight. You are only reviewing words.
2. **Space is tight.** These are printed on half an A4 sheet. A label that is much longer than the
   English may not fit. If your correction is long, a shorter alternative in brackets helps.

---

## Part A — new strings (BILL-PRINT-1)

These are new. None has been reviewed before.

| # | English | Proposed Nepali | Where it appears | Your correction |
|---|---|---|---|---|
| A1 | Student Copy | विद्यार्थी प्रति | Small label at the top of the upper half — marks which of the two copies this is | |
| A2 | Office Copy | कार्यालय प्रति | Same, on the lower half | |
| A3 | cut | काट्ने | Tiny word next to a scissors mark on the dashed line between the two copies | |
| A4 | FY / Installment | आ.व. / किस्ता | Label beside `2083/84 · Ashwin 2083` on the bill | |
| A5 | Class / Sec. | कक्षा / सेक्सन | Column label above `Grade 9 / A` | |
| A6 | Roll | रोल नं. | Column label above the roll number | |
| A7 | Student ID | विद्यार्थी परिचय नं. | Column label above the admission number | |
| A8 | Guardian | संरक्षक | Column label above the guardian's name | |
| A9 | Previous balance outstanding | अघिल्लो बाँकी रकम | Row in the totals block, above the final amount | |
| A10 | Scan | स्कान | First line of the label inside the payment QR box | |
| A11 | to pay | गर्नुहोस् | Second line of the same label. **Note:** together these read "स्कान गर्नुहोस्". Please check the two-line split works | |
| A12 | Authorised signature | अधिकृत हस्ताक्षर | Above the signature line at the bottom right | |
| A13 | Principal | प्रधानाध्यापक | Under the signature line, below the principal's printed name | |
| A14 | This is a computer-generated invoice. | यो कम्प्युटरबाट तयार भएको बिल हो। | Fine print at the very bottom of a bill | |
| A15 | This is a computer-generated receipt. | यो कम्प्युटरबाट तयार भएको रसिद हो। | Fine print at the very bottom of a receipt | |
| A16 | Transaction ref. | कारोबार सन्दर्भ | Column label above an eSewa/Khalti reference or cheque number | |
| A17 | Amount applied | लागू रकम | Column heading over the amounts in the "paid towards" table | |
| A18 | Balance after this payment | भुक्तानी पश्चात् बाँकी रकम | The line telling a parent what is still owed after paying. **The most-read line on a receipt** | |
| A19 | Remarks | कैफियत | Above three blank ruled lines for handwriting on a receipt | |
| A20 | Received by | रकम बुझ्नेको नाम | Above the name of the staff member who took the money | |
| A21 | more fee items | थप शुल्क शीर्षक | Used as `+ 3 थप शुल्क शीर्षक` when a bill has too many lines to print them all | |
| A22 | more invoices | थप बिल | Same idea on a receipt: `+ 3 थप बिल` | |

### A note on A21 / A22

These appear in a row that also carries a money amount, so the printed lines still add up. In
English it reads `+ 3 more fee items ....... 1,240.00`. Please check the Nepali reads naturally in
that position, and that the number-then-words order (`+ ३ थप...`) is right — **the count here is
printed in Arabic digits like every other number.**

---

## Part B — divergences (a decision is needed)

For these five, the software already prints one Nepali string that a previous review approved
(2026-07-30). The design files propose a **different** string.

The software still prints the previously-approved version. Nothing has been changed. **Please pick
one per row**, or write a third option.

| # | English | Currently printed (approved 2026-07-30) | Design proposes instead | Which is right? |
|---|---|---|---|---|
| B1 | Due | तिर्नुपर्ने मिति | भुक्तानी मिति | |
| B2 | Non-taxable | कर रहित | कर नलाग्ने | |
| B3 | Taxable | करयोग्य | कर लाग्ने | |
| B4 | Total receivable | कुल बुझ्नुपर्ने रकम | कुल बुझाउनुपर्ने रकम | |
| B5 | Paid towards | तिरेको बापत | जसको बापत भुक्तानी | |

Context for each:

- **B1** appears beside the date the bill must be paid by.
- **B2 / B3** are column headings in the fee table, next to `कर` (tax). They must be short — these
  are narrow columns.
- **B4** is the label on the single largest number on the bill. `बुझ्नु` vs `बुझाउनु` is the
  question: who is doing the receiving.
- **B5** heads the table showing which bills a payment was applied to.

---

## Part C — already reviewed, listed only for consistency

Not under review. Included so you can see the surrounding wording and tell us if a Part A or Part B
choice clashes with one of these.

| English | Nepali |
|---|---|
| Invoice | बिल |
| Receipt | रसिद |
| Student | विद्यार्थी |
| Class | कक्षा |
| Installment | किस्ता |
| Issued | जारी मिति |
| Date | मिति |
| PAN No. | स्थायी लेखा नं. |
| Reg. No. | दर्ता नं. |
| Fee head | शुल्क शीर्षक |
| Gross | कुल |
| Concession | छुट |
| Total | जम्मा |
| Subtotal | उप-जम्मा |
| Tax | कर |
| Amount in words | अक्षरमा रकम |
| only | मात्र |
| Payment instructions | भुक्तानी निर्देशन |
| Amount received | प्राप्त रकम |
| Method | माध्यम |
| Advance credit | पेश्की जम्मा |

**One known wording question in this set**, worth a glance while you are here: `Gross` is `कुल` and
`Total` is `जम्मा`, but `Total receivable` (B4) also starts with `कुल`. On the printed bill the fee
table has a `कुल` column and a `जम्मा` column side by side. Please confirm that reads correctly to
a parent, or suggest a fix.

---

## What happens with your answers

- Part A corrections and Part B choices are applied to the software.
- Two switches then get turned on together: the Nepali translation gate, and a check that Devanagari
  letters render correctly on the production server.
- Until both are on, every school prints English regardless of its setting. There is no way for a
  school to turn Nepali on early.

*Amounts in words (e.g. "तीन हजार एक सय पचास रुपैयाँ मात्र") were reviewed on 2026-07-30 and are
not re-opened here.*
