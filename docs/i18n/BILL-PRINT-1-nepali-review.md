# BILL-PRINT-1 — Nepali review sheet

**Status: BLOCKING.** Nepali and bilingual print are switched off in the software until this sheet
comes back. Every school currently prints English regardless of its setting.

**Reviewer:** a native Nepali speaker, ideally one who has handled a Nepali school's fee bills or
receipts. No code knowledge needed — you only read the English and Nepali columns.

**Scope:** 27 new strings (Part A) and 5 disagreements with an earlier review (Part B). The
`Key` column is for the developer applying your answers; ignore it.

---

## How to fill this in

- **Approved / Corrected** — write `OK` if the Nepali is right, or write the correct Nepali.
- **Where it appears** tells you the register and the space available. A column heading in a
  narrow table cannot be a long phrase; free prose can.
- **Numbers are always Arabic digits (0–9) in both languages** — `Rs. 3,150.00`, never `३,१५०`.
  That is settled; you are reviewing words only.
- **Space is tight.** These print on half an A4 sheet. Where a string is marked *fixed width*, a
  much longer Nepali phrase will not fit — if your correction is long, a shorter alternative in
  brackets helps.

---

## Part A — new strings (27)

None of these has been reviewed by anyone. They were taken from the approved design files, which
means they are design-supplied, not native-speaker-approved.

### A1. Invoice — copy designation and cut line

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 1 | `studentCopy` | Student Copy | विद्यार्थी प्रति | Small tracked label at the very top of the upper half, marking which copy this is. *Fixed width, must not wrap.* | |
| 2 | `officeCopy` | Office Copy | कार्यालय प्रति | Same position on the lower half. *Fixed width, must not wrap.* | |
| 3 | `cut` | cut | काट्ने | Tiny 5pt word on the dashed line separating the two copies. *Very small — keep it short.* (The ✂ glyph was dropped: it is absent from the embedded font and printed as a tofu box) | |

### A2. Invoice — header and party block

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 4 | `fyInstallment` | FY / Installment | आ.व. / किस्ता | Label beside `2083/84 · Ashwin 2083` in the top-right date stack. *Fixed width.* | |
| 5 | `classSection` | Class / Sec. | कक्षा / सेक्सन | Column label over `Grade 9 / A`. *Fixed-width grid cell.* | |
| 6 | `roll` | Roll | रोल नं. | Column label over the roll number. *Narrowest cell in the row.* | |
| 7 | `studentIdNo` | Student ID | विद्यार्थी परिचय नं. | Column label over the admission number. *Fixed-width grid cell.* | |
| 8 | `guardian` | Guardian | संरक्षक | Column label over the guardian's name. *Fixed-width grid cell.* | |

### A3. Invoice — totals and fee table

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 9 | `previousBalanceOutstanding` | Previous balance outstanding | अघिल्लो बाँकी रकम | Row in the totals block, directly above the final amount. Followed by a `(DR)` or `(CR)` marker. | |
| 10 | `moreFeeItems` | more fee items | थप शुल्क शीर्षक | Only when a bill has more fee lines than fit. Prints as `+ ३ थप शुल्क शीर्षक ......... 1,240.00` — a real row carrying the omitted count and the money still owed for them. See the note below. | |

### A4. Invoice — footer

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 11 | `scan` | Scan | स्कान | First of two lines inside the payment-QR box. *5pt, very small box.* | |
| 12 | `toPay` | to pay | गर्नुहोस् | Second line, directly under #11. Together they read `स्कान गर्नुहोस्` — **please check that splitting it across two lines works.** | |
| 13 | `authorisedSignature` | Authorised signature | अधिकृत हस्ताक्षर | Above the signature line, bottom right. *Fixed 46mm, must not wrap.* | |
| 14 | `principal` | Principal | प्रधानाध्यापक | Under the signature line, below the printed name. *Fixed 46mm.* | |
| 15 | `computerGeneratedInvoice` | This is a computer-generated invoice. | यो कम्प्युटरबाट तयार भएको बिल हो। | Fine print, bottom-left of a bill. *Free prose, 5.5pt.* | |

### A5. Receipt

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 16 | `transactionRef` | Transaction ref. | कारोबार सन्दर्भ | Column label over an eSewa/Khalti reference or cheque details. Blank for cash. *Fixed-width grid cell.* | |
| 17 | `amountApplied` | Amount applied | लागू रकम | Right-aligned column heading over the money in the "paid towards" table. *Fixed 30mm.* | |
| 18 | `balanceAfterPayment` | Balance after this payment | भुक्तानी पश्चात् बाँकी रकम | The line telling a parent what is still owed after paying. Followed by `(DR)`/`(CR)`. **The most-read line on a receipt.** Also appears on the 80mm thermal slip. | |
| 19 | `remarks` | Remarks | कैफियत | Above three blank ruled lines for handwriting. | |
| 20 | `receivedBy` | Received by | रकम बुझ्नेको नाम | Above the name of the staff member who took the money. *Fixed 40mm.* | |
| 21 | `computerGeneratedReceipt` | This is a computer-generated receipt. | यो कम्प्युटरबाट तयार भएको रसिद हो। | Fine print, bottom-left of a receipt. *Free prose, 5.5pt.* | |
| 22 | `moreAllocations` | more invoices | थप बिल | Only when a payment covers more invoices than fit. Prints as `+ ३ थप बिल ......... 1,240.00`. See the note below. | |

### A6. Payment method names (added after the visual review)

The stored values are database constants (`CASH`, `BANK_TRANSFER`, `ESEWA`...) and were printing
raw — a parent's receipt literally read `ESEWA`. These are the printable names.

**eSewa and Khalti are brand names and are proposed to stay in Latin script in the Nepali document
too** — which is what the approved design does: the Nepali half of `Receipt.dc.html` reads
`माध्यम / eSewa`. Please confirm, or give the Devanagari form if a school would expect it.

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 23 | `methodCash` | Cash | नगद | Receipt party block, under `माध्यम`. *Fixed-width grid cell.* Also on the 80mm thermal slip | |
| 24 | `methodCheque` | Cheque | चेक | Same slot | |
| 25 | `methodBankTransfer` | Bank Transfer | बैंक ट्रान्सफर | Same slot — the longest of the five, and the cell is narrow | |
| 26 | `methodEsewa` | eSewa | eSewa *(brand, unchanged)* | Same slot | |
| 27 | `methodKhalti` | Khalti | Khalti *(brand, unchanged)* | Same slot | |

### Note on #10 and #22 — the continuation rows

These sit in a table row that also carries a money amount, so the printed lines still add up to the
total. In English: `+ 3 more fee items ......... 1,240.00`.

Please check two things: that the Nepali reads naturally in that position, and that
number-then-words order (`+ ३ थप...`) is correct. **The count prints in Arabic digits** like every
other number on the document.

---

## Part B — five disagreements (a decision is needed)

For these five, a Nepali string was **already approved on 2026-07-30 and is what the software
prints today**. The design files propose something different.

**The reviewed string is in force. The design variant is a candidate only.** Nothing has been
changed. Please mark which should stand.

| # | Key | English | **Current — in force** (approved 2026-07-30) | Candidate — design variant (not adopted) | Which stands? |
|---|---|---|---|---|---|
| B1 | `due` | Due | **तिर्नुपर्ने मिति** | भुक्तानी मिति | |
| B2 | `nonTaxable` | Non-taxable | **कर रहित** | कर नलाग्ने | |
| B3 | `taxable` | Taxable | **करयोग्य** | कर लाग्ने | |
| B4 | `totalReceivable` | Total receivable | **कुल बुझ्नुपर्ने रकम** | कुल बुझाउनुपर्ने रकम | |
| B5 | `paidTowards` | Paid towards | **तिरेको बापत** | जसको बापत भुक्तानी | |

Context for each:

- **B1** — beside the date the bill must be paid by, in the invoice's top-right date stack. Fixed
  width.
- **B2 / B3** — adjacent column headings in the fee table, sitting next to `कर` (tax). **These are
  the two narrowest headings on the document** (22–24mm); a long phrase will be clipped.
- **B4** — the label on the single largest number on the bill. The question is `बुझ्नु` vs
  `बुझाउनु`: who is doing the receiving.
- **B5** — heads the table on a receipt showing which bills a payment was applied to.

---

## Part C — already approved, for consistency only

Not under review. Listed so you can check that a Part A or Part B choice does not clash with a word
already in use on the same document.

| Key | English | Nepali (in force) |
|---|---|---|
| `invoice` | Invoice | बिल |
| `receipt` | Receipt | रसिद |
| `invoiceNo` | Invoice No. | बिल नं. |
| `receiptNo` | Receipt No. | रसिद नं. |
| `student` | Student | विद्यार्थी |
| `class` | Class | कक्षा |
| `installment` | Installment | किस्ता |
| `issued` | Issued | जारी मिति |
| `date` | Date | मिति |
| `panNo` | PAN No. | स्थायी लेखा नं. |
| `regNo` | Reg. No. | दर्ता नं. |
| `feeHead` | Fee head | शुल्क शीर्षक |
| `gross` | Gross | कुल |
| `concession` | Concession | छुट |
| `total` | Total | जम्मा |
| `subtotal` | Subtotal | उप-जम्मा |
| `tax` | Tax | कर |
| `amountInWords` | Amount in words | अक्षरमा रकम |
| `only` | only | मात्र |
| `paymentInstructions` | Payment instructions | भुक्तानी निर्देशन |
| `amountReceived` | Amount received | प्राप्त रकम |
| `method` | Method | माध्यम |
| `advanceCredit` | Advance credit | पेश्की जम्मा |

**One question worth a glance while you are here.** `Gross` is `कुल` and `Total` is `जम्मा`, but
`Total receivable` (B4) also begins with `कुल`. On the printed fee table a `कुल` column and a
`जम्मा` column sit side by side. Please confirm that reads correctly to a parent, or suggest a fix.

---

## What happens next

1. Part A corrections and Part B decisions are applied to `bill-print-labels.ts`.
2. Two switches are turned on together, in one reviewable commit:
   `BILL_PRINT_1_NEPALI_REVIEWED` (this sheet), and a staging check that Devanagari renders
   correctly in the production container.
3. Until both are on, every school prints English regardless of its setting, and a school cannot
   turn Nepali on early — the setting is rejected at save time.

*Amounts in words (e.g. `तीन हजार एक सय पचास रुपैयाँ मात्र`) were approved on 2026-07-30 and are
not re-opened here.*
