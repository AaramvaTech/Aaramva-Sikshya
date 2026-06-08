'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { useAuditLogs } from '@/lib/hooks/use-super-admin';
import type { AuditLog } from '@/types/api.types';
import { cn } from '@/lib/utils';

const ACTION_BADGE: Record<string, { label: string; className: string }> = {
  TENANT_CREATED: {
    label: 'Created',
    className: 'bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-400',
  },
  TENANT_SUSPENDED: {
    label: 'Suspended',
    className: 'bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-400',
  },
  TENANT_ACTIVATED: {
    label: 'Activated',
    className: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400',
  },
  PLAN_CHANGED: {
    label: 'Plan Changed',
    className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400',
  },
  IMPERSONATION: {
    label: 'Impersonation',
    className:
      'bg-orange-50 text-orange-800 font-bold dark:bg-orange-500/[0.12] dark:text-orange-400',
  },
};

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_BADGE[action];
  const cls = cfg?.className ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const label = cfg?.label ?? action;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium',
        cls,
      )}
    >
      {label}
    </span>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogs({ page, limit: 20 });

  const logs = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="All platform admin actions, ordered by most recent"
      />

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
                : logs.map((log: AuditLog) => {
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
                            <>
                              <span className="text-gray-500 dark:text-gray-400">
                                {log.targetType}
                              </span>
                              {log.targetId && (
                                <span className="ml-1 font-mono text-gray-400 dark:text-gray-500">
                                  {log.targetId.slice(0, 8)}…
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {log.details ? (
                            <span className="text-theme-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px] block">
                              {Object.entries(log.details)
                                .slice(0, 2)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(', ')}
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
              {!isLoading && logs.length === 0 && (
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
            {Math.min((page - 1) * 20 + 1, meta.total)}–{Math.min(page * 20, meta.total)} of{' '}
            {meta.total}
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
