-- 0023_bill_invoice_transport_item.sql — TRANSPORT-ITEM (BILL-BUGS.md):
-- transport becomes its own bill_invoice_items line instead of being folded,
-- unitemized, into the invoice's aggregate totals only. Purely additive —
-- every existing row already satisfies the new CHECK below (fee_head_id was
-- NOT NULL on every row, and no transport_route_id column existed until now).
--
-- fee_head_name -> item_name: the column already held a free-text display
-- label ("Tuition", "Admission" — a fee head's name); a transport line's
-- label is a transport route's name, not a fee head's, so the old name was
-- misleading. Renamed now while bill_invoice_items is brand new with zero
-- external consumers — free today, costlier once real invoices/UIs depend
-- on the response field name.

ALTER TABLE bill_invoice_items ALTER COLUMN fee_head_id DROP NOT NULL;
ALTER TABLE bill_invoice_items ADD COLUMN transport_route_id UUID REFERENCES transport_routes(id);
ALTER TABLE bill_invoice_items RENAME COLUMN fee_head_name TO item_name;

ALTER TABLE bill_invoice_items ADD CONSTRAINT chk_bill_invoice_items_one_kind
  CHECK ((fee_head_id IS NOT NULL AND transport_route_id IS NULL)
      OR (fee_head_id IS NULL AND transport_route_id IS NOT NULL));
