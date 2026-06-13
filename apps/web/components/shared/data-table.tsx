'use client';

import React from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Download, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { EmptyState } from './empty-state';
import { exportToCsv } from '@/lib/export';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

type CsvRow = Record<string, string | number | boolean | null | undefined>;

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  pagination?: PaginationState;
  /** Renders inside the toolbar — put search + filter controls here */
  filterBar?: React.ReactNode;
  /** When provided shows an Export CSV button */
  exportConfig?: {
    filename: string;
    getData: () => CsvRow[];
  };
  /** Shows "N active · Clear all" link next to the export button */
  activeFilterCount?: number;
  onClearFilters?: () => void;
  /** Legacy — still supported, renders a search box in the toolbar */
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  pagination,
  filterBar,
  exportConfig,
  activeFilterCount = 0,
  onClearFilters,
  onSearchChange,
  searchPlaceholder = 'Search...',
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination ? Math.ceil(pagination.total / pagination.limit) : undefined,
  });

  const hasToolbar = !!(filterBar || exportConfig || onSearchChange);
  const hasActiveFilters = activeFilterCount > 0 && !!onClearFilters;

  const from = pagination ? Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total) : 0;
  const to = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      {/* ── Toolbar ── */}
      {hasToolbar && (
        <div className="flex items-center gap-2.5 flex-wrap px-4 py-3 border-b border-stroke dark:border-strokedark">
          {/* Legacy search */}
          {onSearchChange && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                placeholder={searchPlaceholder}
                className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:focus:border-brand-800"
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          )}

          {/* Custom filters */}
          {filterBar && (
            <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
              {filterBar}
            </div>
          )}

          {/* Right side: active filter pill + export */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100 transition-colors dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-400"
              >
                <X className="h-3 w-3" />
                {activeFilterCount} active · Clear
              </button>
            )}
            {exportConfig && (
              <button
                type="button"
                onClick={() => exportToCsv(exportConfig.filename, exportConfig.getData())}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 h-9 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="max-w-full overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              {table.getHeaderGroups().map((hg) =>
                hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="min-w-[100px] px-4 py-4 text-sm font-semibold text-gray-700 dark:text-white"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-stroke dark:border-strokedark">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-stroke dark:border-strokedark hover:bg-gray-2 dark:hover:bg-meta-4 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3.5 text-sm text-black dark:text-white">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState message="No records found" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-stroke dark:border-strokedark">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing <span className="font-medium text-gray-700 dark:text-gray-200">{from}–{to}</span>{' '}
            of <span className="font-medium text-gray-700 dark:text-gray-200">{pagination.total}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[64px] text-center text-xs font-medium text-gray-600 dark:text-gray-400">
              Page {pagination.page}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
