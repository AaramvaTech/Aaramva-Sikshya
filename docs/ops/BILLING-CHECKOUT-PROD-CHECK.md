# Production check — has checkout overcharged anyone? (BILLING-CALC-AUDIT-1 / D32)

**Read-only. Two `SELECT` queries. Nothing here writes, and nothing here needs the app stopped.**

Run this if you have five minutes and a terminal. You do not need to know anything about the
billing module to run it or to read the result.

---

## Why

Until this is fixed, the "Pay with eSewa / Khalti" button in the parent mobile app can ask for
**more than the invoice it is attached to is worth**. The amount it asks for is that invoice's
own charge **plus every unpaid rupee carried forward from earlier months**. Because paying it
only marks *that* invoice settled, the earlier invoices stay on screen with their own live Pay
buttons — so the same arrears can be charged twice.

This is confirmed to have happened on the dev database (student *Aarav Shrestha*, `demo`
tenant, 2026-08-12: charged 4,260, collected 6,260, left holding a 2,000 credit). **Nobody has
checked production.** These two queries answer that.

---

## Before you start

```bash
ssh ubuntu@<prod-host>
cd /srv/aaramva
```

The app connects as the `aaramva_app` role. Get a psql session with the same credentials the
app uses — this reads `DATABASE_URL` out of the API's env file and does not print the password:

```bash
export PGPASSWORD=$(grep -E '^DATABASE_URL' apps/api/.env | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
export PGUSER=aaramva_app PGDATABASE=aaramva_shikshya PGHOST=localhost
psql -c 'SELECT 1'      # expect: one row, value 1. If this fails, stop and say so.
```

Then list the schools on this server — each is one Postgres schema:

```bash
psql -tAc "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' ORDER BY 1"
```

Both queries below must be run **once per schema in that list.** The loop does it for you.

---

## Query 1 — did a gateway payment clear against a carry-forward invoice?

This is the direct question: *did online money actually move against one of these inflated
numbers?*

```bash
for s in $(psql -tAc "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' ORDER BY 1"); do
  echo "=== $s ==="
  psql -P pager=off -c "SET search_path TO $s;
    SELECT bp.receipt_number, bp.method, bp.amount AS charged,
           bi.invoice_number, bi.net_amount AS invoice_own_charge,
           bi.previous_balance AS carried_forward,
           bp.received_date
    FROM bill_payments bp
    JOIN bill_payment_allocations bpa ON bpa.bill_payment_id = bp.id
    JOIN bill_invoices bi ON bi.id = bpa.bill_invoice_id
    WHERE bp.method IN ('ESEWA','KHALTI')
      AND bp.status = 'CLEARED'
      AND bi.previous_balance <> 0
    ORDER BY bp.received_date;"
done
```

### How to read it

**`(0 rows)` for every school → you are clear on this query. Nothing to do.** Go to Query 2
anyway; it is the wider net.

Any row at all means a parent was charged `charged`, while the invoice named in
`invoice_number` was only worth `invoice_own_charge` on its own. The difference is
`carried_forward` — arrears from earlier months, folded in silently.

**A row is not automatically a double-charge.** It becomes one only if those same arrears were
*also* paid on their own invoice. Query 2 detects that.

⚠️ Some rows may be your own sandbox testing. Check the `received_date` and the school name
before treating any row as a real parent.

---

## Query 2 — is anyone holding money they should not be?

This is the wider net and the one that matters. It finds students whose account is in credit —
i.e. the school is holding money over and above what that student was ever charged.

```bash
for s in $(psql -tAc "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' ORDER BY 1"); do
  echo "=== $s ==="
  psql -P pager=off -c "SET search_path TO $s;
    SELECT s.student_id AS admission_no,
           s.first_name || ' ' || s.last_name AS student,
           SUM(e.debit) - SUM(e.credit) AS balance,
           SUM(e.debit)  AS total_charged,
           SUM(e.credit) AS total_received
    FROM student_ledger_entries e
    JOIN students s ON s.id = e.student_id
    GROUP BY s.student_id, s.first_name, s.last_name
    HAVING SUM(e.debit) - SUM(e.credit) < 0
    ORDER BY 3;"
done
```

### How to read it

**`(0 rows)` for every school → nobody is in credit. Combined with a clean Query 1, production
is unaffected. Record that and move on.**

A row means that student's account is `balance` in credit (the figure is negative — a balance
of `-2000.00` means the school holds NPR 2,000 of theirs).

**A credit balance is not proof of a fault.** There is a legitimate way to get one: a deposit
taken deliberately in advance (`allocation_mode = 'ADVANCE_ONLY'`). To tell them apart, for any
student that appears, run:

```bash
psql -P pager=off -c "SET search_path TO <schema>;
  SELECT p.receipt_number, p.amount, p.method, p.allocation_mode, p.status, p.received_date
  FROM bill_payments p JOIN students s ON s.id = p.student_id
  WHERE s.student_id = '<admission_no>' ORDER BY p.received_date;"
```

- An `ADVANCE_ONLY` payment roughly covering the credit → **deliberate deposit, not a fault.**
- Only `AUTO_FIFO` / `MANUAL` payments, no deposit → **likely overcollection.** Escalate.

---

## What to report back

Copy the output verbatim. The three things that decide what happens next:

1. **How many schools returned rows from Query 1**, and whether their dates/names look like real
   parents or sandbox testing.
2. **How many students returned rows from Query 2**, and for each, whether an `ADVANCE_ONLY`
   deposit explains it.
3. **The total of the negative balances** that are *not* explained by a deposit. That is the
   money to be refunded or credited.

If both queries are empty everywhere: say so plainly. That closes the urgent half of D32 and the
fix reverts to a normal-priority correctness ticket.

---

## What NOT to do

- **Do not** `UPDATE` or `DELETE` anything, including anything that looks obviously wrong.
  `student_ledger_entries` is append-only and enforced by a database trigger — an attempted edit
  will fail loudly, which is correct. Corrections are made by posting new compensating entries
  through the app, never by rewriting history.
- **Do not** refund a credit balance until someone has confirmed it is not a deliberate deposit.
- **Do not** disable the payment gateways on the strength of this alone. If Query 1 and Query 2
  are both empty, the mechanism has not fired here and there is nothing to stop.

---

*Source: `docs/api-contracts/BILLING-CALC-AUDIT-1-phase0b.md` §1. Fix tracked as
**BILL-CHECKOUT-1**.*
