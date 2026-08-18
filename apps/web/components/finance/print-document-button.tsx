'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Printer, Loader2, Receipt, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useSchoolProfile } from '@/lib/hooks/use-settings';
import { usePrintInvoicePdf, usePrintReceipt } from '@/lib/hooks/use-bill-print';
import {
  PRINT_LANGUAGES, PRINT_LANGUAGE_LABELS, defaultPrintLanguage, openPresignedUrl,
  printErrorMessage, POPUP_BLOCKED_MESSAGE, THERMAL_SCALE_WARNING, type PrintLanguage,
} from '@/lib/print-document';

export type PrintDoc =
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'receipt'; paymentId: string };

interface Props {
  doc: PrintDoc;
  label?: string;
  className?: string;
}

/**
 * The print action itself, trigger-free: fetch a fresh presigned URL and open
 * it (addendum A4 — never cached, never rendered into an `href`; the mutation
 * guarantees that structurally). Shared by both presentations below.
 */
export function usePrintDocument(doc: PrintDoc) {
  const { data: profile } = useSchoolProfile();
  const tenantDefault = defaultPrintLanguage(profile?.printLanguage);
  const invoiceMutation = usePrintInvoicePdf();
  const receiptMutation = usePrintReceipt();
  const [warnedThermal, setWarnedThermal] = useState(false);

  async function print(lang: PrintLanguage) {
    try {
      const res = doc.kind === 'invoice'
        ? await invoiceMutation.mutateAsync({ invoiceId: doc.invoiceId, lang })
        : await receiptMutation.mutateAsync({ paymentId: doc.paymentId, lang });

      if (!openPresignedUrl(res.presignedUrl)) {
        toast.error(POPUP_BLOCKED_MESSAGE);
        return;
      }
      // Shown once per mounted surface — the thermal page is genuinely 80mm,
      // so the only thing between the user and a correct print is the
      // browser's scale-to-fit default (spec §Thermal).
      if (doc.kind === 'receipt' && !warnedThermal) {
        setWarnedThermal(true);
        toast.info(THERMAL_SCALE_WARNING, { duration: 8000 });
      }
    } catch (err) {
      toast.error(
        printErrorMessage(
          err,
          doc.kind === 'invoice' ? 'Failed to open the bill PDF' : 'Failed to open the receipt',
        ),
      );
    }
  }

  return { print, tenantDefault, isPending: invoiceMutation.isPending || receiptMutation.isPending };
}

/** One language list, rendered by both presentations — so the labelling and
 *  the "default" marker can never drift between them. */
function LanguageItems({ print, tenantDefault }: ReturnType<typeof usePrintDocument>) {
  return PRINT_LANGUAGES.map((lang) => (
    <DropdownMenuItem key={lang} onClick={() => print(lang)}>
      {PRINT_LANGUAGE_LABELS[lang]}
      {lang === tenantDefault && <span className="ml-2 text-xs text-gray-400">default</span>}
    </DropdownMenuItem>
  ));
}

/**
 * The language items alone, for embedding in a menu a surface ALREADY has
 * (the payments table's row menu), so a row never grows a second dropdown
 * beside its existing one.
 */
export function PrintLanguageItems({ doc, heading }: { doc: PrintDoc; heading: string }) {
  const state = usePrintDocument(doc);
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{heading}</DropdownMenuLabel>
      <LanguageItems {...state} />
    </>
  );
}

/**
 * BILL-8-UI Phase 1 — the standalone print affordance, used wherever a surface
 * has no menu of its own: student Billing tab, bill run detail rows, the
 * payment detail modal, and the payment-recorded confirmation.
 *
 * `?lang=` is a staff-only server override and every caller here is a
 * staff-only screen, so offering the choice is always legitimate.
 */
export function PrintDocumentButton({ doc, label, className }: Props) {
  const state = usePrintDocument(doc);

  const Icon = doc.kind === 'invoice' ? Printer : Receipt;
  const text = label ?? (doc.kind === 'invoice' ? 'Print bill' : 'Print receipt');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={state.isPending} className={className}>
            {state.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Icon className="mr-1.5 h-4 w-4" />}
            {text}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <LanguageItems {...state} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
