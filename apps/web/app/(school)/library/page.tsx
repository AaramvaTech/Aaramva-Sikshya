'use client';

import { useRouter } from 'next/navigation';
import { BookOpen, AlertTriangle, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { useBooks, useOverdueIssues, useIssues, useReturnBook } from '@/lib/hooks/use-library';
import type { BookIssue } from '@/types/api.types';

export default function LibraryPage() {
  const router = useRouter();

  const { data: booksResponse, isLoading: booksLoading } = useBooks({ page: 1, limit: 1 });
  const { data: overdueIssues, isLoading: overdueLoading } = useOverdueIssues();
  const { data: issuesResponse, isLoading: issuesLoading } = useIssues({ status: 'ISSUED', page: 1, limit: 1 });
  const returnBook = useReturnBook();

  const totalBooks = booksResponse?.meta?.total ?? 0;
  const activeIssues = issuesResponse?.meta?.total ?? 0;
  const overdueCount = overdueIssues?.length ?? 0;

  const statsLoading = booksLoading || issuesLoading || overdueLoading;

  const statCards = [
    { label: 'Total Books', value: totalBooks, icon: BookOpen, color: 'text-brand-500' },
    { label: 'Active Issues', value: activeIssues, icon: Activity, color: 'text-blue-600' },
    { label: 'Overdue', value: overdueCount, icon: AlertTriangle, color: 'text-error-600' },
  ];

  async function handleReturn(issue: BookIssue) {
    try {
      await returnBook.mutateAsync({ issueId: issue.id });
      toast.success(`Returned: ${issue.bookTitle}`);
    } catch {
      toast.error('Failed to return book');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library"
        description="Books, members, and issue/return management"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/library/books')}
            >
              Book Catalogue
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={() => router.push('/library/issues')}
            >
              Issue Book
            </Button>
          </div>
        }
      />

      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{card.label}</span>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-error-500" />
            Overdue Issues
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {overdueLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !overdueIssues || overdueIssues.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No overdue issues</p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Book</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Copy</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Issued</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue Days</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fine</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overdueIssues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-800">{issue.memberName}</p>
                        <p className="text-xs text-gray-400 font-mono">{issue.memberNumber}</p>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{issue.bookTitle}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 text-xs">{issue.copyNumber}</td>
                      <td className="px-3 py-2.5 text-gray-600">
                        <BsDate date={issue.issuedAt} showAd={false} />
                      </td>
                      <td className="px-3 py-2.5 text-error-600">
                        <BsDate date={issue.dueDate} showAd={false} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {issue.overdueDays != null ? (
                          <Badge className="bg-error-100 text-error-700 border-0 text-xs">{issue.overdueDays}d</Badge>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {issue.fineAmount > 0 ? (
                          <AmountDisplay amount={issue.fineAmount} className="text-error-600 text-xs" />
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs bg-brand-500 hover:bg-brand-600 text-white"
                          onClick={() => handleReturn(issue)}
                          disabled={returnBook.isPending}
                        >
                          Return
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-brand-500 hover:text-brand-600"
            onClick={() => router.push('/library/issues')}
          >
            View all issues →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
