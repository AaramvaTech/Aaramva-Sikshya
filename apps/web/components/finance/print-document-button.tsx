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
 * The print action, minus any trigger — for embedding in a menu a surface
 * ALREADY has (the payments table's row menu), so a row never grows a second
 * dropdown next to its existing one.
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

/** The language items alone, for embedding in an existing dropdown. */
export function PrintLanguageItems({ doc, heading }: { doc: PrintDoc; heading: string }) {
  const { print, tenantDefault } = usePrintDocument(doc);
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{heading}</DropdownMenuLabel>
      {PRINT_LANGUAGES.map((lang) => (
        <DropdownMenuItem key={lang} onClick={() => print(lang)}>
          {PRINT_LANGUAGE_LABELS[lang]}
          {lang === tenantDefault && <span className="ml-2 text-xs text-gray-400">default</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/**
 * BILL-8-UI Phase 1 — the one print affordance, used by every single-document
 * surface (student Billing tab, bill run detail, payment history, and the
 * payment-recorded confirmation).
 *
 * Flow, per addendum A4: click → fetch a fresh presigned URL → open it
 * immediately. The URL is never held in state, cached, or rendered into an
 * `href`; a mutation (not a query) guarantees that structurally.
 *
 * The language split-button only appears when the tenant has a choice worth
 * making. `?lang=` is a staff-only server override, and this is a staff-only
 * screen, so sending it is always legitimate here.
 */
export function PrintDocumentButton({ doc, label, className }: Props) {
  const { print, tenantDefault, isPending } = usePrintDocument(doc);

  const Icon = doc.kind === 'invoice' ? Printer : Receipt;
  const text = label ?? (doc.kind === 'invoice' ? 'Print bill' : 'Print receipt');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={isPending} className={className}>
            {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Icon className="mr-1.5 h-4 w-4" />}
            {text}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {PRINT_LANGUAGES.map((lang) => (
          <DropdownMenuItem key={lang} onClick={() => print(lang)}>
            {PRINT_LANGUAGE_LABELS[lang]}
            {lang === tenantDefault && (
              <span className="ml-2 text-xs text-gray-400">default</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
