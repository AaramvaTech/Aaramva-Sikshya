'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Mail, Check } from 'lucide-react';
import {
  useCreateStudentAccount,
  useResendStudentAccount,
  useCreateGuardianAccount,
  useResendGuardianAccount,
} from '@/lib/hooks/use-students';
import { extractApiErrors } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Guardian } from '@/types/api.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CreateTarget =
  | { kind: 'student'; label: string; defaultEmail: string }
  | { kind: 'guardian'; guardianId: string; label: string; defaultEmail: string };

/**
 * REG-1: create/resend the STUDENT's and each GUARDIAN's login account. Creating
 * one generates a temporary password on the server and emails the credentials
 * (forced change on first login). Admission alone does NOT create logins — this
 * is the surface that does. Wraps POST /students/:id/account and
 * POST /students/:id/guardians/:gid/account (+ their /resend variants).
 */
export function LoginAccountsCard({
  studentId,
  studentUserId,
  studentName,
  studentEmail,
  guardians,
}: {
  studentId: string;
  studentUserId: string | null;
  studentName: string;
  studentEmail: string | null;
  guardians: Guardian[];
}) {
  const [dialog, setDialog] = useState<CreateTarget | null>(null);
  const [email, setEmail] = useState('');

  const createStudent = useCreateStudentAccount(studentId);
  const resendStudent = useResendStudentAccount(studentId);
  const createGuardian = useCreateGuardianAccount(studentId);
  const resendGuardian = useResendGuardianAccount(studentId);

  const submitting = createStudent.isPending || createGuardian.isPending;

  function openCreate(t: CreateTarget) {
    setEmail(t.defaultEmail);
    setDialog(t);
  }

  async function submitCreate() {
    if (!dialog) return;
    if (!EMAIL_RE.test(email)) {
      toast.error('Enter a valid login email');
      return;
    }
    try {
      if (dialog.kind === 'student') {
        await createStudent.mutateAsync(email);
        toast.success('Student login created — credentials emailed');
      } else {
        const res = await createGuardian.mutateAsync({ guardianId: dialog.guardianId, email });
        toast.success(
          res.enqueued
            ? 'Parent login created — credentials emailed'
            : 'Linked an existing parent account (no new email sent)',
        );
      }
      setDialog(null);
    } catch (err) {
      toast.error(extractApiErrors(err, 'Failed to create login account').join(' • '));
    }
  }

  async function resendStudentCreds() {
    try {
      await resendStudent.mutateAsync();
      toast.success('New credentials emailed to the student');
    } catch (err) {
      toast.error(extractApiErrors(err, 'Failed to resend credentials').join(' • '));
    }
  }

  async function resendGuardianCreds(guardianId: string) {
    try {
      await resendGuardian.mutateAsync(guardianId);
      toast.success('New credentials emailed to the parent');
    } catch (err) {
      toast.error(extractApiErrors(err, 'Failed to resend credentials').join(' • '));
    }
  }

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-5 py-3.5 dark:border-strokedark">
        <h4 className="font-semibold text-sm text-black dark:text-white flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-500" /> Login accounts
        </h4>
        <p className="text-xs text-gray-400 mt-0.5">
          Creating a login generates a temporary password and emails it — the person sets their own on first login.
        </p>
      </div>
      <div className="p-4 space-y-2.5">
        <AccountRow
          title={`${studentName} — student`}
          subtitle={studentEmail}
          hasAccount={!!studentUserId}
          onCreate={() =>
            openCreate({ kind: 'student', label: `${studentName} (student)`, defaultEmail: studentEmail ?? '' })
          }
          onResend={resendStudentCreds}
          resending={resendStudent.isPending}
        />
        {guardians.map((g) => (
          <AccountRow
            key={g.id}
            title={`${g.firstName} ${g.lastName} — ${g.relation.toLowerCase()}`}
            subtitle={g.email}
            hasAccount={g.hasAccount}
            onCreate={() =>
              openCreate({
                kind: 'guardian',
                guardianId: g.id,
                label: `${g.firstName} ${g.lastName}`,
                defaultEmail: g.email ?? '',
              })
            }
            onResend={() => resendGuardianCreds(g.id)}
            resending={resendGuardian.isPending}
          />
        ))}
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Create login for {dialog?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="acct-email">Login email *</Label>
            <Input
              id="acct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
            <p className="text-xs text-gray-400">
              A temporary password will be generated and emailed to this address.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={submitCreate}
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create & email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountRow({
  title,
  subtitle,
  hasAccount,
  onCreate,
  onResend,
  resending,
}: {
  title: string;
  subtitle: string | null | undefined;
  hasAccount: boolean;
  onCreate: () => void;
  onResend: () => void;
  resending: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-800/30">
      <div className="min-w-0">
        <p className="font-medium text-sm text-black dark:text-white truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
            <Mail className="h-3 w-3 text-gray-400 shrink-0" /> {subtitle}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {hasAccount ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-green-500/30 bg-green-50 text-green-600">
              <Check className="h-3 w-3 mr-1" /> Has login
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-brand-500"
              onClick={onResend}
              disabled={resending}
            >
              {resending ? 'Sending…' : 'Resend'}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCreate}>
            Create login &amp; email
          </Button>
        )}
      </div>
    </div>
  );
}
