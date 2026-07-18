'use client';

import { useState, useEffect } from 'react';
import { Plus, Copy, UserPlus, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useCreateStaff, useEmploymentTypes } from '@/lib/hooks/use-hr';
import type { CreateStaffData } from '@/types/api.types';

// Staff-creatable roles (the school owner already exists — not offered here).
const ROLES: { value: string; label: string }[] = [
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'ACADEMIC_COORDINATOR', label: 'Academic Coordinator' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'LIBRARIAN', label: 'Librarian' },
  { value: 'PRINCIPAL', label: 'Principal' },
];

// Same shape as the import path's server-side temp password (≥8 chars, letter+digit).
function genTempPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const rand = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 9);
  return 'Ab1' + rand;
}

const today = () => new Date().toISOString().slice(0, 10);

interface CreatedStaff {
  fullName: string;
  email: string;
  roleLabel: string;
  tempPassword: string;
}

export function StaffStep({ onChanged }: { onChanged?: () => void }) {
  const createStaff = useCreateStaff();
  const { data: employmentTypes } = useEmploymentTypes();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TEACHER');
  const [employmentTypeId, setEmploymentTypeId] = useState('');
  const [phone, setPhone] = useState('');
  const [joinDate, setJoinDate] = useState(today());
  const [baseSalary, setBaseSalary] = useState('0');
  const [created, setCreated] = useState<CreatedStaff[]>([]);

  useEffect(() => {
    if (!employmentTypeId && employmentTypes?.length) {
      const permanent = employmentTypes.find((t) => t.name === 'Permanent');
      setEmploymentTypeId(permanent?.id ?? employmentTypes[0].id);
    }
  }, [employmentTypes, employmentTypeId]);

  const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role;

  function reset() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setRole('TEACHER');
    setJoinDate(today());
    setBaseSalary('0');
    setEmploymentTypeId(employmentTypes?.find((t) => t.name === 'Permanent')?.id ?? '');
  }

  async function add() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !employmentTypeId) {
      toast.error('First name, last name, email, and employment type are required');
      return;
    }
    const tempPassword = genTempPassword();
    const payload: CreateStaffData = {
      email: email.trim(),
      password: tempPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      joinDate,
      baseSalary: Number(baseSalary) || 0,
      employmentTypeId,
      phone: phone.trim() || undefined,
    };
    try {
      await createStaff.mutateAsync(payload);
      setCreated((c) => [
        { fullName: `${payload.firstName} ${payload.lastName}`, email: payload.email, roleLabel, tempPassword },
        ...c,
      ]);
      toast.success(`${payload.firstName} added`);
      reset();
      onChanged?.();
    } catch {
      toast.error('Could not add staff member (email may already be in use)');
    }
  }

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-black dark:text-white">
          <UserPlus className="h-4 w-4" /> Add a staff member
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Sita" />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Sharma" />
          </Field>
          <Field label="Email (login)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu.np" />
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={(v) => v && setRole(v)}>
              <SelectTrigger className="w-full">
                <span>{roleLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Employment Type">
            <Select value={employmentTypeId} onValueChange={(v) => v && setEmploymentTypeId(v)}>
              <SelectTrigger className="w-full">
                <span>{employmentTypes?.find((t) => t.id === employmentTypeId)?.name ?? 'Select type'}</span>
              </SelectTrigger>
              <SelectContent>
                {employmentTypes?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" inputMode="tel" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Join date (AD)">
              <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className={dateInputClass} />
            </Field>
            <Field label="Base salary">
              <Input value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} inputMode="numeric" placeholder="0" />
            </Field>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-500">A temporary login password is generated and shown below.</span>
          <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={add} disabled={createStaff.isPending}>
            {createStaff.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add staff
          </Button>
        </div>
      </div>

      {/* Created list with temp passwords (OB2 pattern) */}
      {created.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-500/30 dark:bg-success-500/10">
            <CheckCircle2 className="h-5 w-5 text-success-600" />
            <span className="text-sm font-medium text-success-700 dark:text-success-400">
              {created.length} staff login{created.length === 1 ? '' : 's'} created.
            </span>
          </div>
          <div className="rounded-sm border border-stroke dark:border-strokedark">
            <div className="border-b border-stroke px-3 py-2 text-xs font-semibold text-gray-500 dark:border-strokedark">
              New staff logins — share these temporary passwords with each member (no SMS is sent).
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-2 text-left dark:bg-meta-4">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Temp Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke dark:divide-strokedark">
                {created.map((s) => (
                  <tr key={s.email}>
                    <td className="px-3 py-2">{s.fullName}</td>
                    <td className="px-3 py-2 text-gray-500">{s.roleLabel}</td>
                    <td className="px-3 py-2">{s.email}</td>
                    <td className="px-3 py-2">
                      <button
                        className="inline-flex items-center gap-1 font-mono text-brand-600 hover:underline"
                        onClick={() => {
                          navigator.clipboard?.writeText(s.tempPassword);
                          toast.success('Password copied');
                        }}
                      >
                        {s.tempPassword} <Copy className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            Need to add dozens at once? Bulk CSV import for staff can reuse the student-import pattern in a later pass —
            for now, add them individually here.
          </p>
        </div>
      )}
    </div>
  );
}

const dateInputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">{label}</Label>
      {children}
    </div>
  );
}
