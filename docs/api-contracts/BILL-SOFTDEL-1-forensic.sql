-- BILL-SOFTDEL-1 — forensic. READ ONLY. Run before the fix ships.
--
-- Question: do wrong bills ALREADY exist? That is, was money posted referencing
-- a parent row that had ALREADY been soft-deleted at posting time?
--
-- This matters because correcting the read path makes the next run differ from
-- the last. If that difference is money a school has already been charged, it
-- needs a deliberate answer (credit note, or a decision to let it stand) rather
-- than a silent correction.
--
-- Usage, per tenant schema:
--   psql -d <db> -v schema=tenant_<slug> -v S=tenant_<slug> -f BILL-SOFTDEL-1-forensic.sql
--
-- `created_at` is the posting moment — bill_invoices rows are written by the
-- post runner and there is no separate posted_at column.
\pset footer off

\echo '### 1. soft-deleted billing parents'
SELECT :'S' AS tenant, 'fee_heads' AS parent, count(*) AS soft_deleted,
       min(deleted_at)::date AS earliest, max(deleted_at)::date AS latest
FROM :schema.fee_heads WHERE deleted_at IS NOT NULL
UNION ALL SELECT :'S', 'transport_routes', count(*), min(deleted_at)::date, max(deleted_at)::date
FROM :schema.transport_routes WHERE deleted_at IS NOT NULL
UNION ALL SELECT :'S', 'bill_fee_structures', count(*), min(deleted_at)::date, max(deleted_at)::date
FROM :schema.bill_fee_structures WHERE deleted_at IS NOT NULL
UNION ALL SELECT :'S', 'academic_years', count(*), min(deleted_at)::date, max(deleted_at)::date
FROM :schema.academic_years WHERE deleted_at IS NOT NULL;

\echo '### 2. BACKWARD (D2/D4): invoices that billed a fee head deleted before posting'
SELECT :'S' AS tenant, fh.name AS fee_head, fh.deleted_at::date AS head_deleted,
       count(DISTINCT bi.id) AS invoices_after, count(*) AS items_after,
       COALESCE(sum(bii.net_amount), 0) AS money_billed
FROM :schema.bill_invoice_items bii
JOIN :schema.bill_invoices bi ON bi.id = bii.bill_invoice_id
JOIN :schema.fee_heads fh ON fh.id = bii.fee_head_id
WHERE fh.deleted_at IS NOT NULL AND bi.created_at > fh.deleted_at
GROUP BY fh.name, fh.deleted_at ORDER BY 6 DESC;

\echo '### 3. BACKWARD (D1): invoices that billed a transport route deleted before posting'
SELECT :'S' AS tenant, tr.name AS route, tr.deleted_at::date AS route_deleted,
       count(DISTINCT bi.id) AS invoices_after, count(*) AS items_after,
       COALESCE(sum(bii.net_amount), 0) AS money_billed
FROM :schema.bill_invoice_items bii
JOIN :schema.bill_invoices bi ON bi.id = bii.bill_invoice_id
JOIN :schema.transport_routes tr ON tr.id = bii.transport_route_id
WHERE tr.deleted_at IS NOT NULL AND bi.created_at > tr.deleted_at
GROUP BY tr.name, tr.deleted_at ORDER BY 6 DESC;

\echo '### 4. BACKWARD (D3/D8): live assignments on a deleted structure, invoices posted after'
SELECT :'S' AS tenant, bfs.name AS structure, bfs.deleted_at::date AS struct_deleted,
       count(DISTINCT a.student_id) AS students_assigned,
       count(DISTINCT bi.id) AS invoices_after
FROM :schema.bill_fee_structures bfs
JOIN :schema.student_fee_structure_assignments a
  ON a.fee_structure_id = bfs.id AND a.deleted_at IS NULL
LEFT JOIN :schema.bill_invoices bi
  ON bi.student_id = a.student_id AND bi.created_at > bfs.deleted_at AND bi.deleted_at IS NULL
WHERE bfs.deleted_at IS NOT NULL
GROUP BY bfs.name, bfs.deleted_at ORDER BY 5 DESC;

\echo '### 5. BACKWARD (D5-D7): money rows created against an academic year deleted before them'
SELECT :'S' AS tenant, 'bill_invoices' AS tbl, count(*) AS rows_after,
       COALESCE(sum(x.total_receivable), 0) AS money
FROM :schema.bill_invoices x JOIN :schema.academic_years ay ON ay.id = x.academic_year_id
WHERE ay.deleted_at IS NOT NULL AND x.created_at > ay.deleted_at
UNION ALL SELECT :'S', 'bill_payments', count(*), COALESCE(sum(p.amount), 0)
FROM :schema.bill_payments p JOIN :schema.academic_years ay ON ay.id = p.academic_year_id
WHERE ay.deleted_at IS NOT NULL AND p.created_at > ay.deleted_at
UNION ALL SELECT :'S', 'bill_corrections', count(*), COALESCE(sum(c.amount), 0)
FROM :schema.bill_corrections c JOIN :schema.academic_years ay ON ay.id = c.academic_year_id
WHERE ay.deleted_at IS NOT NULL AND c.created_at > ay.deleted_at
UNION ALL SELECT :'S', 'student_ledger_entries', count(*), COALESCE(sum(l.debit - l.credit), 0)
FROM :schema.student_ledger_entries l JOIN :schema.academic_years ay ON ay.id = l.academic_year_id
WHERE ay.deleted_at IS NOT NULL AND l.created_at > ay.deleted_at;

\echo '### 6. FORWARD: what the NEXT run would bill that the fix will remove'
-- This is the number that predicts the change, and it is the one that decides
-- whether the fix can ship quietly. Backward counts can be zero while this is not.
SELECT :'S' AS tenant, 'deleted head still in a LIVE structure item' AS exposure,
       fh.name AS parent, count(DISTINCT bfsi.fee_structure_id) AS structures,
       count(DISTINCT a.student_id) AS students_billed_next_run,
       COALESCE(sum(DISTINCT bfsi.amount), 0) AS amount_per_head
FROM :schema.fee_heads fh
JOIN :schema.bill_fee_structure_items bfsi ON bfsi.fee_head_id = fh.id
LEFT JOIN :schema.student_fee_structure_assignments a
       ON a.fee_structure_id = bfsi.fee_structure_id AND a.deleted_at IS NULL
WHERE fh.deleted_at IS NOT NULL
GROUP BY fh.name
UNION ALL
SELECT :'S', 'deleted route with a LIVE transport assignment', tr.name,
       0, count(DISTINCT sta.student_id), COALESCE(sum(DISTINCT tr.monthly_amount), 0)
FROM :schema.transport_routes tr
JOIN :schema.student_transport_assignments sta
  ON sta.transport_route_id = tr.id AND sta.deleted_at IS NULL
WHERE tr.deleted_at IS NOT NULL
GROUP BY tr.name
ORDER BY 5 DESC;
