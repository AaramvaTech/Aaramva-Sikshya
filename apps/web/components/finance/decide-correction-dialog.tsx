'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { canSubmitDecision } from '@/lib/bill-correction-form';

/**
 * UI-5-SPEC.md §3.4 — not <ConfirmDialog>, per ruling 2 (refined): a
 * decision note is required to REJECT (the audit trail needs a real "why"
 * for a refusal) but optional to APPROVE (the request's own reason code
 * already carries the "why" — forcing a second one is friction on the
 * routine case). The backend's DecideCorrectionDto marks `note` as
 * @IsOptional() on both — this stricter reject-side rule is UI-only.
 */
interface DecideCorrectionDialogProps {
  action: 'approve' | 'reject';
  correctionNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void | Promise<void>;
}

export function DecideCorrectionDialog({
  action, correctionNumber, open, onOpenChange, onConfirm,
}: DecideCorrectionDialogProps) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const isReject = action === 'reject';

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(note.trim() ? note.trim() : '');
      setNote('');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = canSubmitDecision(action, note);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) { onOpenChange(next); if (!next) setNote(''); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isReject ? 'Reject' : 'Approve'} correction {correctionNumber}?</DialogTitle>
          <DialogDescription>
            {isReject
              ? 'This correction will not be posted. Explain why — the requester and the audit trail both need a real reason for a refusal.'
              : 'This posts a real ledger entry and cannot be undone except by a reversal. A note is optional — the request already carries its own reason.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="decision-note">
            {isReject ? 'Reason for rejection *' : 'Note (optional)'}
          </Label>
          <Textarea
            id="decision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isReject ? 'Why is this being rejected?' : 'Optional'}
            rows={3}
          />
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !canSubmit}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-theme-sm font-medium text-white disabled:opacity-50 transition-colors ${
              isReject ? 'bg-error-500 hover:bg-error-600' : 'bg-success-500 hover:bg-success-600'
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isReject ? 'Reject' : 'Approve'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
