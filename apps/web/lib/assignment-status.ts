import type { MyAssignment } from '@/types/api.types';

export interface AssignmentStatusConfig {
  label: string;
  className: string;
}

/**
 * WEB-P Phase 4 — shared between the assignments list screen and the
 * dashboard's upcoming-assignments widget (two real call sites). Mirrors
 * mobile's lib/assignmentStatus.ts semantic-literal convention: isPastDue is
 * DISPLAY-ONLY, the server's Kathmandu end-of-day rule is authoritative for
 * what actually counts as LATE once a submission exists.
 */
export function assignmentStatusConfig(a: MyAssignment): AssignmentStatusConfig {
  if (a.mySubmission?.status === 'REVIEWED') {
    return { label: 'Reviewed', className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400' };
  }
  if (a.mySubmission?.status === 'LATE') {
    return { label: 'Submitted late', className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400' };
  }
  if (a.mySubmission?.status === 'SUBMITTED') {
    return { label: 'Submitted', className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400' };
  }
  const isPastDue = new Date(a.dueDate).getTime() < Date.now();
  if (a.status === 'CLOSED') {
    return { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  }
  if (isPastDue) {
    return { label: 'Overdue', className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400' };
  }
  return { label: 'Open', className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400' };
}
