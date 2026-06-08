'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  trigger: React.ReactNode;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
}

export function ConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
  confirmLabel = 'Confirm',
  variant = 'default',
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <span
        className="inline-flex cursor-pointer"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
      >
        {trigger}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-theme-sm font-medium text-white disabled:opacity-50 transition-colors ${
                variant === 'destructive'
                  ? 'bg-error-500 hover:bg-error-600'
                  : 'bg-brand-500 hover:bg-brand-600'
              }`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
