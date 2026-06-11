'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { useAuditLogs } from '@/lib/hooks/use-super-admin';
import type { AuditLog } from '@/types/api.types';
import { cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';

const ACTION_META: Record<string, { label: string; description: string; className: string }> = {
  TENANT_CREATED: {
    label: 'School Created',
    description: 'A new school was onboarded to the platform',
    className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  },
  TENANT_SUSPENDED: {
    label: 'School Suspended',
    description: 'A school account was suspended',
    className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  },
  TENANT_ACTIVATED: {
    label: 'School Activated',
    description: 'A school account was re-activated',
    className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400',
  },
  TENANT_UPDATED: {
    label: 'School Updated',
    description: 'School details were modified',
    className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400',
  },
  PLAN_CREATED: {
    label: 'Plan Created',
    description: 'A new subscription plan was created',
    className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  },
  PLAN_UPDATED: {
    label: 'Plan Updated',
    description: 'A subscription plan was modified',
    className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400',
  },
  PLAN_DEACTIVATED: {
    label: 'Plan Deactivated',
    description: 'A subscription plan was deactivated',
    className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  },
  SUBSCRIPTION_CHANGED: {
    label: 'Plan Changed',
    description: "A school's subscription plan was changed",
    className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400',
  },
  IMPERSONATION: {
    label: 'Impersonation',
    description: 'Admin logged in as a school owner',
    className:
      'bg-orange-50 text-orange-800 font-bold dark:bg-orange-500/[0.12] dark:text-orange-400',
  },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action];
  const cls = meta?.className ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const label = meta?.label ?? action;
  const description = meta?.description;
  return (
    <span
      title={description}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium cursor-help',
        cls,
      )}
    >
      {label}
    </span>
  );
}

/** Turn the raw details object into a short, human-readable summary. */
function formatDetails(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case 'TENANT_CREATED':
      return details.schoolName ? `School: ${details.schoolName}` : 'New school onboarded';
    case 'TENANT_SUSPENDED':
      return details.schoolName ? `Suspended: ${details.schoolName}` : 'School suspended';
    case 'TENANT_ACTIVATED':
      return details.schoolName ? `Activated: ${details.schoolName}` : 'School activated';
    case 'TENANT_UPDATED':
      return details.schoolName ? `Updated: ${details.schoolName}` : 'School details updated';
    case 'PLAN_CREATED':
    case 'PLAN_UPDATED':
    case 'PLAN_DEACTIVATED':
      return details.planName ? `Plan: ${details.planName}` : 'Plan modified';
    case 'SUBSCRIPTION_CHANGED': {
      const parts: string[] = [];
      if (details.schoolName) parts.push(details.schoolName as string);
      if (details.oldPlan || details.newPlan) {
        parts.push(`${details.oldPlan ?? '?'} → ${details.newPlan ?? '?'}`);
      }
      return parts.length > 0 ? parts.join(' — ') : 'Subscription plan changed';
    }
    case 'IMPERSONATION':
      return details.schoolName ? `Logged in as: ${details.schoolName}` : 'Impersonated a school';
    default:
      // Fallback: show up to 2 key-value pairs
      return Object.entries(details)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
  }
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const { data, isLoading } = useAuditLogs({ page, limit: 20 });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const filteredLogs = actionFilter ? logs.filter(l => l.action === actionFilter) : logs;

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="A record of all admin actions — who did what, when, and to which school or plan"
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <Select value={actionFilter} onValueChange={(v) => setActionFilter(v ?? '')}>
          <SelectTrigger className="w-40">
            <span className="truncate">{actionFilter || 'All Actions'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Actions</SelectItem>
            {Object.entries(ACTION_META).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Admin
                </th>
                <th className="text-left px-4 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th className="text-left px-4 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Target
                </th>
                <th className="text-left px-4 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Details
                </th>
                <th className="text-left px-4 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      {[1, 2, 3, 4, 5].map((j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filteredLogs.map((log: AuditLog) => {
                    const isImpersonation = log.action === 'IMPERSONATION';
                    return (
                      <tr
                        key={log.id}
                        className={cn(
                          'border-b border-gray-100 dark:border-gray-800 transition-colors',
                          isImpersonation
                            ? 'bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-500/[0.05] dark:hover:bg-orange-500/[0.08]'
                            : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]',
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-theme-xs text-gray-600 dark:text-gray-300">
                          {log.adminEmail}
                        </td>
                        <td className="px-4 py-3">
                          <ActionBadge action={log.action} />
                        </td>
                        <td className="px-4 py-3 text-theme-xs">
                          {log.targetType || log.targetId ? (
                            <span className="text-gray-500 dark:text-gray-400">
                              {log.targetType === 'TENANT' && log.details?.schoolName
                                ? `School: ${log.details.schoolName}`
                                : log.targetType === 'PLAN' && log.details?.planName
                                  ? `Plan: ${log.details.planName}`
                                  : log.targetType ?? `${log.targetId?.slice(0, 8)}…`}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {log.details ? (
                            <span className="text-theme-xs text-gray-500 dark:text-gray-400 truncate max-w-[240px] block" title={Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ')}>
                              {formatDetails(log.action, log.details)}
                            </span>
                          ) : (
                            <span className="text-theme-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-theme-xs text-gray-400 dark:text-gray-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && filteredLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-theme-sm text-gray-400 dark:text-gray-500"
                  >
                    No audit logs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {meta && meta.total > 0 && (
        <div className="flex items-center justify-between text-theme-sm text-gray-500 dark:text-gray-400 mt-4">
          <span>
            {actionFilter
              ? `${filteredLogs.length} of ${meta.total}`
              : `${Math.min((page - 1) * 20 + 1, meta.total)}–${Math.min(page * 20, meta.total)} of ${meta.total}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/5"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              ←
            </button>
            <span className="text-theme-xs font-medium">Page {page}</span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/5"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= meta.total}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
