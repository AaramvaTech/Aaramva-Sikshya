# BILL-PRINT-1 — Nepali review sheet

**Status: BLOCKING.** Nepali and bilingual print are switched off in the software until this sheet
comes back. Every school currently prints English regardless of its setting.

**Reviewer:** a native Nepali speaker, ideally one who has handled a Nepali school's fee bills or
receipts. No code knowledge needed — you only read the English and Nepali columns.

**Scope:** 28 new strings (Part A), 5 disagreements with an earlier review (Part B), and — added
later, as its own round — 4 strings for the uncleared-cheque slip (Part D). The `Key` column is for
the developer applying your answers; ignore it.

**Part D was added after this sheet first went out.** If you have already answered Parts A and B,
you only need to read Part D. It is short, but it is the highest-stakes pair on the sheet.

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

## Part A — new strings (28)

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
| 28 | `appliedToBalance` | Applied to balance | बाँकी रकममा समायोजन | A row in the receipt's "paid towards" table, for money that was not tied to a specific bill and went against what the student already owed. Sits beside `पेश्की जम्मा` (Advance credit), which is for money genuinely held in credit — **the two must read as clearly different things** | |

### Note on #10 and #22 — the continuation rows, and a PLURAL question

These sit in a table row that also carries a money amount, so the printed lines still add up to the
total. In English: `+ 3 more fee items ......... 1,240.00`.

**English inflects for number and Nepali is assumed not to.** The software now prints:

| Count | English | Nepali (proposed) |
|---|---|---|
| 1 | `+ 1 more fee item` | `+ 1 थप शुल्क शीर्षक` |
| 3 | `+ 3 more fee items` | `+ 3 थप शुल्क शीर्षक` |
| 1 | `+ 1 more invoice` | `+ 1 थप बिल` |
| 3 | `+ 3 more invoices` | `+ 3 थप बिल` |

**Please confirm the Nepali is genuinely the same for one and for many.** If it is not, write the
plural form and it will get its own entry — the software already has a separate slot for it, so
this costs nothing to change.

Also check that the number-then-words order (`+ ३ थप...`) reads correctly. **The count prints in
Arabic digits** like every other number on the document.

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

## Part D — the uncleared-cheque slip (4 strings) — BILL-RCPT-STATUS

**Added 2026-08-21, after Parts A-C went out. This is a separate round; it was not part of the
original sheet.**

### What this is for

When a parent pays by **cheque**, the school has the paper but the bank has not paid yet. Until it
clears, the school must be able to hand over *something* — but that something must not say the money
was received, because it has not been.

So the slip changes in exactly four ways:

- the **title** at the top reads **Acknowledgement** instead of **Receipt**
- the big amount is labelled **tendered** instead of **received**
- a line underneath states plainly that it is **subject to clearance and is not a receipt**
- the tiny footer note reads **computer-generated acknowledgement** instead of **receipt**

Everything else on the slip is unchanged.

### Why these matter more than the rest of the sheet

Every other string on this sheet names a field — `Roll`, `Remarks`, `Class / Sec.`. If one of those
is slightly off, it reads as a clumsy translation.

Together these are the *entire difference* between **"we have your money"** and **"we have your cheque."**
If the Nepali here is weak, ambiguous, or too polite to be clear, the slip reads as a receipt — and a
parent may reasonably believe the fee is settled when the cheque later bounces. That is a dispute at
the counter, and the school will be holding a document that appears to agree with the parent.

So please read these for **force and clarity**, not just correctness. If the phrasing is
grammatically fine but would be understood as "paid", say so.

| # | Key | English | Proposed Nepali | Where it appears | Approved / Corrected |
|---|---|---|---|---|---|
| 1 | `acknowledgement` | Acknowledgement | निस्सा | **The document's title**, in large accent type at the top of the slip, exactly where `रसिद` ("Receipt") appears on a normal one. It **replaces** that title. *Fixed width; a long phrase will run into the Receipt No. / Date column beside it.* | |
| 2 | `amountTendered` | Amount tendered | बुझाइएको रकम | Small caps label directly under the largest number on the slip, where `प्राप्त रकम` ("Amount received") normally sits. It **replaces** that label — both never appear together. *Fixed width, must not wrap.* | |
| 3 | `subjectToClearance` | Subject to clearance. This is not a receipt for money received. | भुक्तानी नभएसम्म मान्य हुने छैन। यो प्राप्त रकमको रसिद होइन। | A full-width sentence immediately under the amount, in normal dark text (not faint grey). It is the line that stops the slip reading as a receipt. Room for roughly one line on the 80mm counter roll, so **shorter is better** — but not at the cost of being clear. | |
| 4 | `computerGeneratedAcknowledgement` | This is a computer-generated acknowledgement. | यो कम्प्युटरबाट तयार भएको निस्सा हो। | The tiny 5.5pt grey note at the very bottom of the A5 sheet. It replaces `यो कम्प्युटरबाट तयार भएको रसिद हो।` (already approved, Part C) on this slip only. **Whatever you choose for string 1 must be used here too** — the two have to agree, or the footer contradicts the heading. | |

### The primary question — the title (string 1)

**What is this document called in Nepali?**

This is the single most important answer on the whole sheet, and the one we are least sure of.

The obvious candidates all mean *receipt for money* — which is precisely the meaning this title
exists to avoid:

- **भर्पाई** — commonly used for a receipt / acknowledgement of payment received
- **प्राप्ति** — "receipt" in the sense of having received something
- **रसिद** — the word already used for a real receipt, so it cannot be reused here

We have proposed **निस्सा**, on the reasoning that it denotes a *slip / token / counterfoil* rather
than a receipt-for-money. **We do not know whether that is what a Nepali school or bank would
actually call this document**, and it may read as odd or archaic.

So, in order:

1. **Is there an established Nepali term** that Nepali schools or banks already use for a slip given
   when an uncleared cheque is handed over? If one exists, we should adopt it and discard our guess
   entirely.
2. **If there is no standard term, is `निस्सा` acceptable** as the title of this document — and does
   it clearly NOT mean "receipt for money received"?
3. **If neither, what should it say?** A short phrase is fine if no single word works, but the
   title slot is narrow (see the table) — roughly the width of `भुक्तानी सूचना` at most.

**Your answer to this one decides string 4 as well.** The footer note names the same document, so
whatever word you pick for the title has to appear there too. If you correct string 1, please
correct string 4 to match — or just write "same as 1" and we will apply it.

### Two further questions

4. **Does `बुझाइएको रकम` clearly mean "handed over / tendered" rather than "received"?** The whole
   design rests on a parent being able to tell these two apart at a glance. If the distinction is
   too fine in Nepali, a different construction is better than a literal translation.
5. **Is `भुक्तानी नभएसम्म मान्य हुने छैन` the right register for a school fee slip?** It is
   deliberately blunt. If normal Nepali school practice uses a softer standard phrase for an
   uncleared cheque, that phrase is probably better than ours — please write it in.

**Note:** unlike Parts A and B, these four strings are **not design-supplied** — the approved design
files only ever drew a cleared receipt, so there was no reference to lift from. They were written by
the developer and have been read by nobody.

---

## What happens next

1. Part A corrections, Part B decisions, and Part D corrections are applied to
   `bill-print-labels.ts`.
2. Three switches are turned on together, in one reviewable commit:
   `BILL_PRINT_1_NEPALI_REVIEWED` (Parts A/B), `BILL_RCPT_STATUS_NEPALI_REVIEWED` (Part D), and a
   staging check that Devanagari renders correctly in the production container.
3. Until all three are on, every school prints English regardless of its setting, and a school
   cannot turn Nepali on early — the setting is rejected at save time.

Part D has its own switch rather than riding on Parts A/B deliberately: it arrived after this sheet
had already gone out, so if Parts A and B come back and get flipped, these two strings would
otherwise ship having been read by nobody.

*Amounts in words (e.g. `तीन हजार एक सय पचास रुपैयाँ मात्र`) were approved on 2026-07-30 and are
not re-opened here.*
