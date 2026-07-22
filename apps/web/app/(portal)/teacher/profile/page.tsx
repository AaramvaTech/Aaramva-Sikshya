'use client';

import type { ReactNode } from 'react';
import { Mail, Phone, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyStaffProfile, useRoleLabels } from '@/lib/hooks/use-hr';
import { useFileUrl } from '@/lib/hooks/use-file-url';
import { roleLabelLookup } from '@/lib/role-labels';

/**
 * WEB-P Phase 3 Task 1 — teacher's own HR profile, VIEW-ONLY.
 *
 * There is no self-edit endpoint: `GET /hr/staff/me` (TEACHER_AND_ABOVE,
 * self-scoped from the JWT) is the only route a teacher can call for their
 * own HR record — `PATCH /hr/staff/:id` is PRINCIPAL_AND_ABOVE only and not
 * reachable here, even for the caller's own id. This page renders data only
 * — no form inputs, no edit affordance, no mutation of any kind. Layout
 * mirrors the admin staff-detail page's card grouping
 * (`app/(school)/hr/staff/[id]/page.tsx`: hero + Personal Details +
 * Employment Details + Emergency Contact) but uses the teacher-portal card
 * convention (rounded-2xl border-gray-200 shadow-theme-sm) instead of the
 * admin shell's rounded-sm/border-stroke convention, and drops the
 * Documents/Leave tabs and photo upload — those are admin-HR-management or
 * belong to a separate Phase 3 screen (`/teacher/leave`).
 */

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="font-medium text-right text-gray-800 dark:text-white">
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function TeacherProfilePage() {
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useMyStaffProfile();
  const { data: roleLabels } = useRoleLabels();

  // FILE-1: storage keys resolve to presigned GETs; legacy values pass through.
  const resolvedPhotoUrl = useFileUrl(profile?.photoUrl);

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Your HR record on file with the school — view only"
      />

      {isLoading ? (
        <div className="space-y-5">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : !profile ? (
        <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          Profile not found.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Hero / summary card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-6">
              <Avatar size="lg" className="h-24 w-24 ring-2 ring-brand-100 dark:ring-brand-500/20">
                <AvatarImage src={resolvedPhotoUrl} className="object-cover" />
                <AvatarFallback className="text-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400">
                  {initials(profile.fullName)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white truncate">
                    {profile.fullName}
                  </h2>
                  <StatusBadge status={profile.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-3">
                  {profile.employeeId}
                </p>

                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {profile.departmentName && (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-800 dark:text-white">Dept:</span>
                      {profile.departmentName}
                    </span>
                  )}
                  {profile.designationTitle && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {profile.designationTitle}
                    </span>
                  )}
                  {profile.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {profile.phone}
                    </span>
                  )}
                  {profile.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {profile.email}
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end gap-1.5 text-sm text-right shrink-0">
                <span className="text-gray-400 dark:text-gray-500">Joined</span>
                <span className="font-medium text-gray-800 dark:text-white">
                  <BsDate date={profile.joinDate} />
                </span>
                <span className="text-gray-400 dark:text-gray-500 mt-1">Employment</span>
                <span className="font-medium text-gray-800 dark:text-white">
                  {profile.employmentTypeName ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Personal + Employment details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
                Personal Details
              </h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
                Contact and identity information on file
              </p>
              <div className="space-y-3">
                <InfoRow
                  label="Date of Birth"
                  value={profile.dateOfBirth ? <BsDate date={profile.dateOfBirth} /> : null}
                />
                <InfoRow
                  label="Gender"
                  value={
                    profile.gender
                      ? profile.gender.charAt(0) + profile.gender.slice(1).toLowerCase()
                      : null
                  }
                />
                <InfoRow label="Phone" value={profile.phone} />
                <InfoRow label="Email" value={profile.email} />
                <InfoRow label="Address" value={profile.permanentAddress} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
                Employment Details
              </h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
                Role, tenure, and payroll information on file
              </p>
              <div className="space-y-3">
                <InfoRow label="Role" value={roleLabelLookup(roleLabels, profile.role)} />
                <InfoRow label="Department" value={profile.departmentName} />
                <InfoRow label="Designation" value={profile.designationTitle} />
                <InfoRow label="Employment Type" value={profile.employmentTypeName ?? '—'} />
                <InfoRow label="Join Date" value={<BsDate date={profile.joinDate} />} />
                {profile.endDate && (
                  <InfoRow label="End Date" value={<BsDate date={profile.endDate} />} />
                )}
                <InfoRow
                  label="Base Salary"
                  value={<AmountDisplay amount={profile.baseSalary} />}
                />
                <InfoRow label="PAN Number" value={profile.panNumber} />
                <InfoRow label="Bank Name" value={profile.bankName} />
                <InfoRow label="Bank Account" value={profile.bankAccount} />
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          {(profile.emergencyContactName || profile.emergencyContactPhone) && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
                Emergency Contact
              </h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400 mb-4">
                Who the school should reach in an emergency
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoRow label="Name" value={profile.emergencyContactName} />
                <InfoRow label="Phone" value={profile.emergencyContactPhone} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
