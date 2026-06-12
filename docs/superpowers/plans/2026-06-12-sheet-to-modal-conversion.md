# Sheet → Dialog Modal Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all four Sheet (right-side slide-out panel) usages with centered Dialog modals for consistent, polished UX.

**Architecture:** Pure UI swap — no logic, hooks, or API changes. Each Sheet component is converted to use `Dialog/DialogContent/DialogHeader/DialogBody/DialogFooter` from `@/components/ui/dialog`. Content stays identical; only the container and action button placement change.

**Tech Stack:** Next.js 14 App Router, React, shadcn/ui Dialog (`@base-ui/react/dialog` under the hood), Tailwind CSS, `cn()` with tailwind-merge.

---

## File Map

| Action | File |
|---|---|
| Rename + rewrite | `apps/web/components/finance/invoice-detail-sheet.tsx` → `invoice-detail-modal.tsx` |
| Update import | `apps/web/app/(school)/finance/invoices/page.tsx` |
| Modify inline component | `apps/web/app/(school)/hr/payroll/page.tsx` (`SlipsSheet` → `SlipsModal`) |
| Modify inline component | `apps/web/app/(school)/finance/fee-structures/page.tsx` (`CategoryManagerSheet` → `CategoryManagerModal`) |
| Modify inline component | `apps/web/app/(school)/library/books/page.tsx` (inline Sheet → Dialog) |

---

## Task 1: Convert InvoiceDetailSheet → InvoiceDetailModal

**Files:**
- Create: `apps/web/components/finance/invoice-detail-modal.tsx`
- Modify: `apps/web/app/(school)/finance/invoices/page.tsx`

No unit tests — this is a pure UI container swap. Verify visually: open the Invoices page and click any invoice row.

- [ ] **Step 1: Create the new modal file**

Create `apps/web/components/finance/invoice-detail-modal.tsx` with this content:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { BsDate } from '@/components/shared/bs-date';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { AmountDisplay } from './amount-display';
import { PaymentForm } from './payment-form';
import { useInvoice, useVoidInvoice, useCancelPayment, useRecalculateFine } from '@/lib/hooks/use-finance';
import type { InvoiceSummary } from '@/types/api.types';

interface InvoiceDetailModalProps {
  invoiceId: string | null;
  onClose: () => void;
}

export function InvoiceDetailModal({ invoiceId, onClose }: InvoiceDetailModalProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { data: invoice, isLoading } = useInvoice(invoiceId ?? '');
  const voidMutation = useVoidInvoice();
  const cancelPayment = useCancelPayment();
  const recalcFine = useRecalculateFine();

  async function handleVoid() {
    if (!invoiceId) return;
    try {
      await voidMutation.mutateAsync(invoiceId);
      toast.success('Invoice voided');
      onClose();
    } catch {
      toast.error('Failed to void invoice');
    }
  }

  const canVoid = invoice && invoice.status !== 'PAID' && invoice.status !== 'WAIVED';
  const canRecalc = invoice && (invoice.status === 'OVERDUE' || invoice.status === 'UNPAID');

  return (
    <>
      <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="font-mono text-lg">
                {invoice?.invoiceNumber ?? 'Invoice Detail'}
              </DialogTitle>
              {invoice && <InvoiceStatusBadge status={invoice.status} />}
            </div>
            {invoice && (
              <p className="text-sm text-gray-500">
                Due: <BsDate date={invoice.dueDate} />
              </p>
            )}
          </DialogHeader>

          <DialogBody className="max-h-[60vh] overflow-y-auto space-y-5">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : invoice ? (
              <>
                <div className="text-sm space-y-1 text-gray-700">
                  <p>
                    <span className="text-gray-500">Student: </span>
                    <span className="font-medium">{invoice.studentName}</span>
                    <span className="font-mono text-xs text-gray-400 ml-1">({invoice.admissionNumber})</span>
                  </p>
                  <p>
                    <span className="text-gray-500">Class: </span>
                    {invoice.className}
                  </p>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Fee Breakdown
                  </p>
                  <div className="space-y-2">
                    {invoice.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.feeCategoryName}</span>
                        <AmountDisplay amount={item.originalAmount} />
                      </div>
                    ))}
                    {invoice.discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-error-600">
                        <span>Discount</span>
                        <AmountDisplay amount={invoice.discountAmount} negative />
                      </div>
                    )}
                    {invoice.fineAmount > 0 && (
                      <div className="flex justify-between text-sm text-orange-600">
                        <span>Late Fine</span>
                        <AmountDisplay amount={invoice.fineAmount} />
                      </div>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex justify-between font-semibold text-sm">
                    <span>Total</span>
                    <AmountDisplay amount={invoice.totalAmount} />
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Payments Received
                  </p>
                  {invoice.payments.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No payments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {invoice.payments.map((payment) => (
                        <div key={payment.id} className="flex items-start justify-between text-sm gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-gray-500">{payment.paymentNumber}</span>
                            <span className="text-gray-400 mx-1">·</span>
                            <span className="text-gray-700">{payment.method.replace(/_/g, ' ')}</span>
                            <span className="text-gray-400 mx-1">·</span>
                            <span className="text-gray-500">by {payment.receivedBy}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <AmountDisplay amount={payment.amount} className="text-success-700" />
                            <ConfirmDialog
                              title="Cancel Payment"
                              description={`Cancel payment ${payment.paymentNumber}? This will reverse the payment and update the invoice balance.`}
                              onConfirm={() =>
                                cancelPayment.mutate(payment.id, {
                                  onSuccess: () => toast.success('Payment cancelled'),
                                  onError: () => toast.error('Failed to cancel payment'),
                                })
                              }
                              confirmLabel="Cancel Payment"
                              variant="destructive"
                              trigger={
                                <button className="text-xs text-error-500 hover:text-error-700">
                                  Cancel
                                </button>
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-base">
                  <span>Balance Due</span>
                  <AmountDisplay
                    amount={invoice.balance}
                    className={invoice.balance > 0 ? 'text-error-600' : 'text-success-600'}
                  />
                </div>
              </>
            ) : null}
          </DialogBody>

          {invoice && (
            <DialogFooter>
              {canVoid && (
                <ConfirmDialog
                  title="Void Invoice"
                  description={`Are you sure you want to void invoice ${invoice.invoiceNumber}? This action cannot be undone.`}
                  onConfirm={handleVoid}
                  confirmLabel="Void Invoice"
                  variant="destructive"
                  trigger={
                    <Button variant="outline" size="sm" className="text-error-600 border-red-200 hover:bg-error-50">
                      Void Invoice
                    </Button>
                  }
                />
              )}
              {canRecalc && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recalcFine.isPending}
                  onClick={() =>
                    recalcFine.mutate(invoiceId!, {
                      onSuccess: () => toast.success('Fine recalculated'),
                      onError: () => toast.error('Failed to recalculate fine'),
                    })
                  }
                >
                  Recalculate Fine
                </Button>
              )}
              {invoice.balance > 0 && (
                <Button
                  size="sm"
                  className="bg-brand-500 hover:bg-brand-600 text-white"
                  onClick={() => setPaymentOpen(true)}
                >
                  + Record Payment
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {invoice && (
        <PaymentForm
          invoice={invoice as InvoiceSummary}
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Update the import in invoices/page.tsx**

In `apps/web/app/(school)/finance/invoices/page.tsx`, find and replace:

```tsx
import { InvoiceDetailSheet } from '@/components/finance/invoice-detail-sheet';
```

with:

```tsx
import { InvoiceDetailModal } from '@/components/finance/invoice-detail-modal';
```

Then find and replace every usage of `<InvoiceDetailSheet` with `<InvoiceDetailModal` and `</InvoiceDetailSheet>` with `</InvoiceDetailModal>`.

- [ ] **Step 3: Delete the old sheet file**

```bash
rm apps/web/components/finance/invoice-detail-sheet.tsx
```

- [ ] **Step 4: Verify — start dev server and open Invoices page**

```bash
cd apps/web && npm run dev
```

Open `localhost:3000/finance/invoices`. Click any invoice row. Confirm:
- Centered modal appears (not a right-side panel)
- Invoice number + status badge in header
- Fee breakdown, payments in scrollable body
- "Record Payment", "Recalculate Fine", "Void Invoice" appear in footer based on invoice state

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/finance/invoice-detail-modal.tsx \
        apps/web/app/\(school\)/finance/invoices/page.tsx
git commit -m "feat(web): convert InvoiceDetailSheet to centered Dialog modal"
```

---

## Task 2: Convert CategoryManagerSheet → CategoryManagerModal

**Files:**
- Modify: `apps/web/app/(school)/finance/fee-structures/page.tsx`

- [ ] **Step 1: Update imports at top of fee-structures/page.tsx**

Remove these lines from the import block:

```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
```

The file already imports `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` — add `DialogBody` to that existing import:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
```

- [ ] **Step 2: Replace the CategoryManagerSheet function**

Find the entire `function CategoryManagerSheet(...)` block (lines ~55–218) and replace it with `CategoryManagerModal` using Dialog:

```tsx
function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: categories, isLoading } = useFeeCategories();
  const createCategory = useCreateFeeCategory();
  const updateCategory = useUpdateFeeCategory();
  const deleteCategory = useDeleteFeeCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<FeeCategory['type']>('ONE_TIME');

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FeeCategory['type']>('ONE_TIME');

  function startEdit(cat: FeeCategory) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditType(cat.type);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    try {
      await updateCategory.mutateAsync({ id: editingId, data: { name: editName.trim(), type: editType } });
      toast.success('Category updated');
      setEditingId(null);
    } catch {
      toast.error('Failed to update category');
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { toast.error('Name is required'); return; }
    try {
      await createCategory.mutateAsync({ name: newName.trim(), type: newType });
      toast.success('Category created');
      setNewName('');
      setNewType('ONE_TIME');
    } catch {
      toast.error('Failed to create category');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCategory.mutateAsync(id);
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category — it may be in use');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fee Categories</DialogTitle>
        </DialogHeader>

        <DialogBody className="max-h-[65vh] overflow-y-auto space-y-6">
          {/* Create new */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add Category</p>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <Input
                placeholder="Category name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Select value={newType} onValueChange={(v) => setNewType(v as FeeCategory['type'])}>
                <SelectTrigger>
                  <span className="text-xs">{newType.replace(/_/g, ' ')}</span>
                </SelectTrigger>
                <SelectContent>
                  {FEE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleCreate}
              disabled={createCategory.isPending || !newName.trim()}
            >
              {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : (categories?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>
            ) : (
              categories?.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                >
                  {editingId === cat.id ? (
                    <>
                      <Input
                        className="h-8 text-sm flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <Select value={editType} onValueChange={(v) => setEditType(v as FeeCategory['type'])}>
                        <SelectTrigger className="w-32 h-8">
                          <span className="text-xs">{editType.replace(/_/g, ' ')}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {FEE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={saveEdit} className="text-success-600 hover:text-success-700 p-1">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{cat.name}</p>
                        <Badge className="text-xs border-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 mt-0.5">
                          {cat.type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <button
                        onClick={() => startEdit(cat)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <ConfirmDialog
                        title="Delete Category"
                        description={`Delete "${cat.name}"? This will fail if the category is used in any fee structure.`}
                        onConfirm={() => handleDelete(cat.id)}
                        confirmLabel="Delete"
                        variant="destructive"
                        trigger={
                          <button className="text-gray-400 hover:text-error-600 p-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Update the usage at the bottom of FeeStructuresPage**

Find:
```tsx
<CategoryManagerSheet
  open={categorySheetOpen}
  onClose={() => setCategorySheetOpen(false)}
/>
```

Replace with:
```tsx
<CategoryManagerModal
  open={categorySheetOpen}
  onClose={() => setCategorySheetOpen(false)}
/>
```

- [ ] **Step 4: Verify — open Fee Structures page**

Open `localhost:3000/finance/fee-structures`. Click "Categories" button in the page header. Confirm:
- Centered modal appears
- "Add Category" form at top, list of categories below
- Inline edit/delete works

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(school\)/finance/fee-structures/page.tsx
git commit -m "feat(web): convert CategoryManagerSheet to centered Dialog modal"
```

---

## Task 3: Convert SlipsSheet → SlipsModal

**Files:**
- Modify: `apps/web/app/(school)/hr/payroll/page.tsx`

- [ ] **Step 1: Update imports at top of payroll/page.tsx**

Remove:
```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
```

The file already imports `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` — add `DialogBody`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
```

- [ ] **Step 2: Replace the SlipsSheet function with SlipsModal**

Find the entire `function SlipsSheet(...)` block and replace with:

```tsx
function SlipsModal({
  month,
  open,
  onClose,
}: {
  month: PayrollMonth | null;
  open: boolean;
  onClose: () => void;
}) {
  const [adjustingSlip, setAdjustingSlip] = useState<SalarySlip | null>(null);
  const generatePayroll = useGeneratePayroll();
  const finalizePayroll = useFinalizePayroll();

  const { data: slips, isLoading: slipsLoading } = usePayrollSlips(month?.id ?? '');

  async function handleGenerate() {
    if (!month) return;
    try {
      await generatePayroll.mutateAsync({ monthId: month.id });
      toast.success('Salary slips generated');
    } catch {
      toast.error('Failed to generate payroll');
    }
  }

  async function handleFinalize() {
    if (!month) return;
    try {
      await finalizePayroll.mutateAsync(month.id);
      toast.success('Payroll finalized');
      onClose();
    } catch {
      toast.error('Failed to finalize');
    }
  }

  const slipList = slips ?? [];
  const isDraft = month?.status === 'DRAFT';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <div className="flex items-center gap-3 pr-8">
              <DialogTitle>
                {month ? monthLabel(month) : ''} — Salary Slips
              </DialogTitle>
              {month && <StatusBadge status={month.status} />}
            </div>
          </DialogHeader>

          <DialogBody className="p-0 max-h-[65vh] overflow-y-auto">
            {slipsLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : slipList.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400 mb-3">No salary slips yet.</p>
                {isDraft && (
                  <Button
                    size="sm"
                    className="bg-brand-500 hover:bg-brand-600 text-white"
                    onClick={handleGenerate}
                    disabled={generatePayroll.isPending}
                  >
                    {generatePayroll.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Generate for All Staff
                  </Button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-stroke dark:border-strokedark sticky top-0">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Base</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Allowances</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave Ded.</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Net</th>
                    {isDraft && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {slipList.map((slip) => (
                    <tr key={slip.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-black dark:text-white">{slip.staffName}</p>
                        <p className="text-xs text-gray-400 font-mono">{slip.employeeId}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={slip.baseSalary} /></td>
                      <td className="px-4 py-2.5 text-right text-success-600">
                        {slip.allowanceTotal > 0 ? <AmountDisplay amount={slip.allowanceTotal} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-error-600">
                        {slip.deductionTotal > 0 ? <AmountDisplay amount={slip.deductionTotal} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-error-600">
                        {slip.leaveDeduction > 0 ? <AmountDisplay amount={slip.leaveDeduction} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-brand-500">
                        <AmountDisplay amount={slip.netSalary} />
                      </td>
                      {isDraft && (
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-brand-500"
                            onClick={() => setAdjustingSlip(slip)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-white/5 border-t-2 border-stroke dark:border-strokedark font-semibold sticky bottom-0">
                    <td className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider">{slipList.length} staff</td>
                    <td className="px-4 py-2.5 text-right text-sm"><AmountDisplay amount={slipList.reduce((s, r) => s + r.baseSalary, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-success-600"><AmountDisplay amount={slipList.reduce((s, r) => s + r.allowanceTotal, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-error-600"><AmountDisplay amount={slipList.reduce((s, r) => s + r.deductionTotal, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-error-600"><AmountDisplay amount={slipList.reduce((s, r) => s + r.leaveDeduction, 0)} /></td>
                    <td className="px-4 py-2.5 text-right text-sm text-brand-500"><AmountDisplay amount={slipList.reduce((s, r) => s + r.netSalary, 0)} /></td>
                    {isDraft && <td />}
                  </tr>
                </tfoot>
              </table>
            )}
          </DialogBody>

          {isDraft && slipList.length > 0 && (
            <DialogFooter>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generatePayroll.isPending}
              >
                {generatePayroll.isPending
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating…</>
                  : 'Re-generate'
                }
              </Button>
              <ConfirmDialog
                title="Finalize Payroll"
                description={`Finalize ${month ? monthLabel(month) : ''}? This locks all salary slips and cannot be undone.`}
                onConfirm={handleFinalize}
                confirmLabel="Finalize"
                trigger={
                  <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white">
                    Finalize
                  </Button>
                }
              />
            </DialogFooter>
          )}

          {isDraft && slipList.length === 0 && (
            <DialogFooter>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generatePayroll.isPending}
              >
                {generatePayroll.isPending
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating…</>
                  : 'Generate Slips'
                }
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {adjustingSlip && month && (
        <AdjustSlipDialog
          slip={adjustingSlip}
          monthId={month.id}
          open={!!adjustingSlip}
          onClose={() => setAdjustingSlip(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Update the usage at the bottom of PayrollPage**

Find:
```tsx
{/* Slips Sheet */}
<SlipsSheet
  month={selectedMonth}
  open={!!selectedMonth}
  onClose={() => setSelectedMonth(null)}
/>
```

Replace with:
```tsx
<SlipsModal
  month={selectedMonth}
  open={!!selectedMonth}
  onClose={() => setSelectedMonth(null)}
/>
```

- [ ] **Step 4: Verify — open Payroll page**

Open `localhost:3000/hr/payroll`. Click "View Slips" on any payroll month. Confirm:
- Centered wide modal appears
- Salary slips table is readable with all columns
- "Re-generate" and "Finalize" are in the footer
- Pencil edit button on each row still opens the AdjustSlipDialog

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(school\)/hr/payroll/page.tsx
git commit -m "feat(web): convert SlipsSheet to centered Dialog modal"
```

---

## Task 4: Convert Book Detail Sheet → Dialog

**Files:**
- Modify: `apps/web/app/(school)/library/books/page.tsx`

- [ ] **Step 1: Update imports at top of books/page.tsx**

Remove:
```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
```

Add `DialogBody` to the existing Dialog import:
```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
```

- [ ] **Step 2: Replace the inline Sheet JSX with Dialog**

Find the inline Sheet block starting at:
```tsx
<Sheet open={!!selectedBookId} onOpenChange={(open) => { if (!open) { setSelectedBookId(null); setShowAddCopyForm(false); } }}>
  <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
    <SheetHeader>
      <SheetTitle>{bookDetail?.title ?? 'Book Detail'}</SheetTitle>
    </SheetHeader>

    {detailLoading ? (
      <div className="mt-4 space-y-3 p-4">
```

Replace the entire Sheet block (from `<Sheet` to `</Sheet>`) with:

```tsx
<Dialog open={!!selectedBookId} onOpenChange={(open) => { if (!open) { setSelectedBookId(null); setShowAddCopyForm(false); } }}>
  <DialogContent className="sm:max-w-2xl">
    <DialogHeader>
      <DialogTitle>{bookDetail?.title ?? 'Book Detail'}</DialogTitle>
    </DialogHeader>

    <DialogBody className="max-h-[75vh] overflow-y-auto space-y-6">
      {detailLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : bookDetail ? (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Author</span>
              <p className="text-black dark:text-white font-medium">{bookDetail.author ?? '—'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Publisher</span>
              <p className="text-black dark:text-white">{bookDetail.publisher ?? '—'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Edition</span>
              <p className="text-black dark:text-white">{bookDetail.edition ?? '—'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">ISBN</span>
              <p className="text-black dark:text-white font-mono">{bookDetail.isbn ?? '—'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Language</span>
              <p className="text-black dark:text-white">{bookDetail.language}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Category</span>
              <p className="text-black dark:text-white">{bookDetail.categoryName ?? '—'}</p>
            </div>
            {bookDetail.description && (
              <div className="col-span-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Description</span>
                <p className="text-gray-700 mt-0.5">{bookDetail.description}</p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Copies ({bookDetail.copies.length})
                <span className="ml-2 text-success-600 font-normal">{bookDetail.availableCopies} available</span>
              </h3>
            </div>

            <div className="space-y-2">
              {bookDetail.copies.map((copy) => (
                <div
                  key={copy.id}
                  className="rounded-lg border border-gray-200 p-3 text-sm flex items-start justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-800">{copy.copyNumber}</span>
                      {copy.accessionNumber && (
                        <span className="text-xs text-gray-400 font-mono">Acc: {copy.accessionNumber}</span>
                      )}
                    </div>
                    {copy.shelfLocation && (
                      <p className="text-xs text-gray-500">Shelf: {copy.shelfLocation}</p>
                    )}
                    <p className="text-xs text-gray-500">Condition: {copy.condition}</p>
                    {!copy.isAvailable && copy.currentIssue && (
                      <div className="mt-1 text-xs text-orange-700 space-y-0.5">
                        <p>Member: <span className="font-mono">{copy.currentIssue.memberNumber}</span></p>
                        <p className="flex items-center gap-1">
                          Due: <BsDate date={copy.currentIssue.dueDate} showAd={false} />
                          {copy.currentIssue.isOverdue && (
                            <Badge className="bg-error-100 text-error-700 border-0 text-xs ml-1">Overdue</Badge>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  <Badge
                    className={`text-xs border-0 ${copy.isAvailable ? 'bg-success-100 text-success-700' : 'bg-orange-100 text-orange-700'}`}
                  >
                    {copy.isAvailable ? 'Available' : 'Checked Out'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full flex items-center justify-between"
              onClick={() => setShowAddCopyForm((v) => !v)}
            >
              <span>Add Copy</span>
              {showAddCopyForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showAddCopyForm && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-number">Copy Number *</Label>
                  <Input
                    id="cp-number"
                    value={copyForm.copyNumber}
                    onChange={(e) => setCopyField('copyNumber', e.target.value)}
                    placeholder="e.g. C001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-acc">Accession Number</Label>
                  <Input
                    id="cp-acc"
                    value={copyForm.accessionNumber}
                    onChange={(e) => setCopyField('accessionNumber', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-shelf">Shelf Location</Label>
                  <Input
                    id="cp-shelf"
                    value={copyForm.shelfLocation}
                    onChange={(e) => setCopyField('shelfLocation', e.target.value)}
                    placeholder="e.g. A-12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Condition</Label>
                  <Select
                    value={copyForm.condition || 'NONE'}
                    onValueChange={(v) => setCopyField('condition', (v ?? '') === 'NONE' ? '' : (v ?? ''))}
                  >
                    <SelectTrigger>
                      <span className="truncate">
                        {copyForm.condition ? copyForm.condition.charAt(0) + copyForm.condition.slice(1).toLowerCase() : 'Select condition'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Select condition</SelectItem>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white"
                  onClick={handleAddCopy}
                  disabled={addCopy.isPending || !copyForm.copyNumber.trim()}
                >
                  {addCopy.isPending ? 'Adding…' : 'Add Copy'}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </DialogBody>
  </DialogContent>
</Dialog>
```

- [ ] **Step 3: Verify — open Library Books page**

Open `localhost:3000/library/books`. Click "View" on any book. Confirm:
- Centered modal appears (not a right panel)
- Book metadata grid, copies list display correctly
- "Add Copy" toggle form works inline at the bottom

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(school\)/library/books/page.tsx
git commit -m "feat(web): convert book detail Sheet to centered Dialog modal"
```

---

## Self-Review Checklist

- [x] All 4 Sheet usages covered: InvoiceDetail, CategoryManager, SlipsSheet, BookDetail
- [x] `invoice-detail-sheet.tsx` old file explicitly deleted in Task 1
- [x] `invoices/page.tsx` import updated
- [x] `DialogBody` added to all Dialog imports that need it
- [x] All `Sheet*` imports removed from each file
- [x] `SlipsModal` footer: Generate shown when slips exist (Re-generate) AND when empty (Generate Slips)
- [x] No placeholders, no TBDs
- [x] Component rename in JSX usage updated in all 3 inline cases
