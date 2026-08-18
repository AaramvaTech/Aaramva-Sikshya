'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { todayBs, BS_MONTH_NAMES_EN } from 'bs-calendar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { BulkJobProgress } from './bulk-job-progress';
import { useClasses } from '@/lib/hooks/use-students';
import { useSchoolProfile } from '@/lib/hooks/use-settings';
import { useBulkPrintRun, useBulkPrintClass } from '@/lib/hooks/use-bill-print';
import {
  PRINT_LANGUAGES, PRINT_LANGUAGE_LABELS, defaultPrintLanguage, printErrorMessage,
  type PrintLanguage,
} from '@/lib/print-document';

/** Month-end (a whole posted run) or ad hoc (one class + BS period). */
type Scope =
  | { kind: 'run'; runId: string; runLabel: string }
  | { kind: 'class' };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: Scope;
}

/**
 * BILL-8-UI Phase 2 — one dialog for both entry points, because they differ
 * only in what identifies the set: a run id, or class+period (addendum A1 —
 * "ad hoc" is deliberately NOT a hand-picked list; that is BILL-8-ADHOC).
 *
 * Progress reuses <BulkJobProgress> verbatim; bill-print and bulk-assign share
 * `GET /finance/jobs/:id`, so there is no second poller and no forked
 * component — only `noun="invoice"` to fix the wording.
 */
export function BulkPrintDialog({ open, onOpenChange, scope }: Props) {
  const bsNow = useMemo(() => todayBs(), []);
  const { data: profile } = useSchoolProfile();
  const tenantDefault = defaultPrintLanguage(profile?.printLanguage);

  const [lang, setLang] = useState<PrintLanguage | ''>('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [bsYear, setBsYear] = useState(bsNow.year);
  const [bsMonth, setBsMonth] = useState(bsNow.month);
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: classes } = useClasses();
  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];

  const printRun = useBulkPrintRun();
  const printClass = useBulkPrintClass();
  const isPending = printRun.isPending || printClass.isPending;

  const effectiveLang = (lang || tenantDefault) as PrintLanguage;
  const canSubmit = scope.kind === 'run' ? true : !!classId;

  function reset() {
    setLang('');
    setClassId('');
    setSectionId('');
    setBsYear(bsNow.year);
    setBsMonth(bsNow.month);
    setJobId(null);
  }

  async function handleSubmit() {
    if (!canSubmit) { toast.error('Pick a class first'); return; }
    try {
      const job = scope.kind === 'run'
        ? await printRun.mutateAsync({ runId: scope.runId, lang: effectiveLang })
        : await printClass.mutateAsync({
            data: { classId, sectionId: sectionId || undefined, bsYear, bsMonth },
            lang: effectiveLang,
          });
      setJobId(job.id);
    } catch (err) {
      // Same storage-unavailable path as Phase 1 — a 503 here is a
      // deployment problem, not "no invoices to print".
      toast.error(printErrorMessage(err, 'Failed to start the print job'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {scope.kind === 'run' ? 'Print all bills in this run' : 'Print bills for a class'}
          </DialogTitle>
        </DialogHeader>

        {jobId ? (
          <>
            <BulkJobProgress jobId={jobId} noun="invoice" />
            <DialogFooter>
              <Button
                className="bg-brand-500 hover:bg-brand-600 text-white"
                onClick={() => { reset(); onOpenChange(false); }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {scope.kind === 'run' ? (
                <p className="text-sm text-gray-500">
                  Every posted invoice in <span className="font-medium text-gray-800 dark:text-white">{scope.runLabel}</span>{' '}
                  will be rendered into one merged PDF.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Class *</Label>
                    <Select value={classId} onValueChange={(v) => { setClassId(v ?? ''); setSectionId(''); }}>
                      <SelectTrigger>
                        <span className={classId ? '' : 'text-muted-foreground'}>
                          {classId ? (classes?.find((c) => c.id === classId)?.name ?? 'Loading…') : 'Select class'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {classId && sections.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Section (optional)</Label>
                      <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? '')}>
                        <SelectTrigger>
                          <span className={sectionId ? '' : 'text-muted-foreground'}>
                            {sectionId ? (sections.find((s) => s.id === sectionId)?.name ?? 'Loading…') : 'All sections'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label>BS Year *</Label>
                      <Select value={String(bsYear)} onValueChange={(v) => setBsYear(Number(v ?? bsNow.year))}>
                        <SelectTrigger><span>{bsYear}</span></SelectTrigger>
                        <SelectContent>
                          {[bsNow.year - 1, bsNow.year, bsNow.year + 1].map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label>BS Month *</Label>
                      <Select value={String(bsMonth)} onValueChange={(v) => setBsMonth(Number(v ?? bsNow.month))}>
                        <SelectTrigger><span>{BS_MONTH_NAMES_EN[bsMonth - 1]}</span></SelectTrigger>
                        <SelectContent>
                          {BS_MONTH_NAMES_EN.map((m, i) => (
                            <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={effectiveLang} onValueChange={(v) => setLang((v ?? '') as PrintLanguage | '')}>
                  <SelectTrigger><span>{PRINT_LANGUAGE_LABELS[effectiveLang]}</span></SelectTrigger>
                  <SelectContent>
                    {PRINT_LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {PRINT_LANGUAGE_LABELS[l]}{l === tenantDefault ? ' (default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
              <Button
                className="bg-brand-500 hover:bg-brand-600 text-white"
                onClick={handleSubmit}
                disabled={!canSubmit || isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start printing
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
