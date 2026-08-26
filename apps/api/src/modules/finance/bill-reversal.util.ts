/**
 * D24-D27-REVERSAL — the one definition of "has this ledger entry been
 * reversed", shared by the corrections cap and the fine engine.
 *
 * Before this, the two subsystems answered the same question in opposite
 * directions and neither recorded the choice: `creditableAmount` filtered on
 * `bill_corrections.status` alone and never looked at the chain, so a reversed
 * credit note consumed its cap forever; `bill_fine_accruals` consulted the
 * chain but only to *drop* reversed accruals, so a reversed fine re-posted on
 * the next run. Ruling: a reversal undoes the financial effect in both.
 *
 * THE CHAIN IS THE ONLY RECORD, BY DESIGN. Both `BillCorrectionService.reverse`
 * and `BillFineService.reverseAccrual` deliberately leave their own row
 * untouched — the correction stays APPROVED, the accrual keeps its
 * `delta_posted` — because "both entries visible" is the ledger's
 * `reverses_entry_id` chain rather than a status flag. So no `reversed_at`
 * column is added here either; asking the chain is asking the only thing that
 * knows.
 *
 * Safe against double-counting: `LedgerService.reverseInTx` refuses to reverse
 * an entry that already has a reversal, so at most one `rev` row can ever match.
 *
 * Kept as shared constants rather than copied SQL for the same reason
 * `bill-own-balance.util.ts` and `bill-class-guard.util.ts` exist: a rule
 * duplicated in several places is a rule that eventually disagrees with
 * itself — which is precisely how D24 and D27 came to contradict each other.
 */

/** `true` when the entry named by `ledgerEntryIdCol` has a reversal against it. */
export const reversedExpr = (ledgerEntryIdCol: string): string =>
  `EXISTS (SELECT 1 FROM student_ledger_entries rev
            WHERE rev.reverses_entry_id = ${ledgerEntryIdCol})`;

/**
 * `true` when it has NOT been reversed — i.e. its financial effect still stands.
 *
 * A NULL `ledgerEntryIdCol` makes the inner comparison NULL, so `EXISTS` is
 * false and this is TRUE: a row with no posted entry counts as not-reversed.
 * That is the safe default everywhere it is used — an unposted correction
 * still consumes cap conservatively, rather than silently freeing headroom.
 */
export const notReversedExpr = (ledgerEntryIdCol: string): string =>
  `NOT ${reversedExpr(ledgerEntryIdCol)}`;
