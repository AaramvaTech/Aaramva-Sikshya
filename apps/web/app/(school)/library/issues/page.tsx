'use client';

import { useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  useIssues,
  useLibraryMembers,
  useBooks,
  useBookDetail,
  useIssueBook,
  useReturnBook,
  usePayFine,
} from '@/lib/hooks/use-library';
import type { BookIssue, LibraryMember } from '@/types/api.types';

export default function IssuesPage() {
  const [page, setPage] = useState(1);
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');

  const [issueMemberSearch, setIssueMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<LibraryMember | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedCopyId, setSelectedCopyId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [finePerDay, setFinePerDay] = useState('');

  const memberDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memberSearchActive, setMemberSearchActive] = useState('');
  const [bookSearchActive, setBookSearchActive] = useState('');

  const { data: issuesResponse, isLoading: issuesLoading } = useIssues({
    page,
    limit: 20,
    status: statusFilter || undefined,
  });

  const { data: memberResults } = useLibraryMembers({
    search: memberSearchActive || undefined,
    limit: 10,
  });

  const { data: bookResults } = useBooks({
    search: bookSearchActive || undefined,
    limit: 10,
  });

  const { data: bookDetail } = useBookDetail(selectedBookId);

  const issueBook = useIssueBook();
  const returnBook = useReturnBook();
  const payFine = usePayFine();

  const allIssues = issuesResponse?.data ?? [];
  const meta = issuesResponse?.meta;

  // Member search + date range are client-side filtered
  const issues = allIssues.filter((i) => {
    if (memberSearch) {
      const q = memberSearch.toLowerCase();
      if (!i.memberName.toLowerCase().includes(q) && !i.memberNumber.toLowerCase().includes(q)) return false;
    }
    if (dueDateFrom && (i.dueDate?.ad ?? '') < dueDateFrom) return false;
    if (dueDateTo && (i.dueDate?.ad ?? '') > dueDateTo) return false;
    return true;
  });

  const activeFilterCount = [memberSearch, statusFilter, dueDateFrom, dueDateTo].filter(Boolean).length;

  function clearFilters() {
    setMemberSearch('');
    setStatusFilter('');
    setDueDateFrom('');
    setDueDateTo('');
    setPage(1);
  }

  function handleMemberSearchInput(value: string) {
    setIssueMemberSearch(value);
    if (memberDebounceRef.current) clearTimeout(memberDebounceRef.current);
    memberDebounceRef.current = setTimeout(() => setMemberSearchActive(value), 400);
  }

  function handleBookSearchInput(value: string) {
    setBookSearch(value);
    if (bookDebounceRef.current) clearTimeout(bookDebounceRef.current);
    bookDebounceRef.current = setTimeout(() => {
      setBookSearchActive(value);
      setSelectedBookId('');
      setSelectedCopyId('');
    }, 400);
  }

  function selectMember(member: LibraryMember) {
    setSelectedMember(member);
    setIssueMemberSearch('');
    setMemberSearchActive('');
  }

  function clearMember() {
    setSelectedMember(null);
    setIssueMemberSearch('');
    setMemberSearchActive('');
  }

  function selectBook(id: string) {
    setSelectedBookId(id);
    setSelectedCopyId('');
    setBookSearch('');
    setBookSearchActive('');
  }

  async function handleReturn(issue: BookIssue) {
    try {
      await returnBook.mutateAsync({ issueId: issue.id });
      toast.success(`Returned: ${issue.bookTitle}`);
    } catch {
      toast.error('Failed to return book');
    }
  }

  async function handlePayFine(issue: BookIssue) {
    try {
      await payFine.mutateAsync(issue.id);
      toast.success('Fine paid');
    } catch {
      toast.error('Failed to record fine payment');
    }
  }

  async function handleIssueBook() {
    if (!selectedMember) { toast.error('Please select a member'); return; }
    if (!selectedCopyId) { toast.error('Please select a book copy'); return; }
    if (!dueDate) { toast.error('Please enter a due date'); return; }
    try {
      await issueBook.mutateAsync({
        bookCopyId: selectedCopyId,
        memberId: selectedMember.id,
        dueDate,
        finePerDay: finePerDay ? Number(finePerDay) : undefined,
      });
      toast.success('Book issued successfully');
      setSelectedMember(null);
      setSelectedBookId('');
      setSelectedCopyId('');
      setDueDate('');
      setFinePerDay('');
      setIssueMemberSearch('');
      setMemberSearchActive('');
      setBookSearch('');
      setBookSearchActive('');
    } catch {
      toast.error('Failed to issue book');
    }
  }

  const availableCopies = bookDetail?.copies.filter((c) => c.isAvailable) ?? [];

  const columns: ColumnDef<BookIssue>[] = [
    {
      id: 'member',
      header: 'Member',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-black dark:text-white text-sm">{row.original.memberName}</p>
          <p className="text-xs text-gray-500 font-mono">{row.original.memberNumber}</p>
        </div>
      ),
    },
    {
      id: 'book',
      header: 'Book',
      cell: ({ row }) => (
        <span className="text-sm text-black dark:text-white">{row.original.bookTitle}</span>
      ),
    },
    {
      accessorKey: 'copyNumber',
      header: 'Copy',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-gray-600">{getValue<string>()}</span>
      ),
    },
    {
      id: 'issuedAt',
      header: 'Issued',
      cell: ({ row }) => <BsDate date={row.original.issuedAt} showAd={false} />,
    },
    {
      id: 'dueDate',
      header: 'Due',
      cell: ({ row }) => {
        const isOverdue = row.original.status === 'OVERDUE';
        return (
          <span className={isOverdue ? 'text-error-600 font-medium' : ''}>
            <BsDate date={row.original.dueDate} showAd={false} />
          </span>
        );
      },
    },
    {
      id: 'fine',
      header: 'Fine',
      cell: ({ row }) => {
        const { fineAmount, finePaid } = row.original;
        if (fineAmount <= 0) return <span className="text-gray-400 text-xs">—</span>;
        return (
          <div>
            <AmountDisplay amount={fineAmount} className={`text-xs ${finePaid ? 'text-gray-400 line-through' : 'text-error-600'}`} />
            {finePaid && <span className="text-xs text-success-600 ml-1">Paid</span>}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const issue = row.original;
        const canReturn = issue.status === 'ISSUED' || issue.status === 'OVERDUE';
        const canPayFine = issue.fineAmount > 0 && !issue.finePaid;
        return (
          <div className="flex gap-1.5">
            {canReturn && (
              <Button size="sm" className="h-7 px-2 text-xs bg-brand-500 hover:bg-brand-600 text-white" onClick={() => handleReturn(issue)} disabled={returnBook.isPending}>
                Return
              </Button>
            )}
            {canPayFine && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => handlePayFine(issue)} disabled={payFine.isPending}>
                Pay Fine
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const filterBar = (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search member name or no."
          className="h-9 w-52 pl-9 text-sm"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
      </div>

      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className={statusFilter ? '' : 'text-muted-foreground'}>
            {statusFilter ? statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase() : 'All Status'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Status</SelectItem>
          <SelectItem value="ISSUED">Issued</SelectItem>
          <SelectItem value="OVERDUE">Overdue</SelectItem>
          <SelectItem value="RETURNED">Returned</SelectItem>
          <SelectItem value="LOST">Lost</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 shrink-0">Due:</span>
        <input
          type="date"
          value={dueDateFrom}
          onChange={(e) => setDueDateFrom(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={dueDateTo}
          onChange={(e) => setDueDateTo(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Issue & Return" description="Manage book loans and returns" />

      <Tabs defaultValue="issues">
        <TabsList>
          <TabsTrigger value="issues">Active Issues</TabsTrigger>
          <TabsTrigger value="issue-book">Issue a Book</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="mt-4">
          <DataTable
            columns={columns}
            data={issues}
            isLoading={issuesLoading}
            filterBar={filterBar}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
            exportConfig={{
              filename: 'book_issues',
              getData: () =>
                issues.map((i) => ({
                  Member: i.memberName,
                  'Member No.': i.memberNumber,
                  Book: i.bookTitle,
                  'Copy No.': i.copyNumber,
                  'Issued Date': i.issuedAt?.bs ?? '',
                  'Due Date': i.dueDate?.bs ?? '',
                  'Fine (NPR)': i.fineAmount,
                  'Fine Paid': i.finePaid ? 'Yes' : 'No',
                  Status: i.status,
                })),
            }}
            pagination={
              meta && !memberSearch && !dueDateFrom && !dueDateTo
                ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage }
                : undefined
            }
          />
        </TabsContent>

        <TabsContent value="issue-book" className="mt-4">
          <div className="max-w-xl space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">1. Select Member</Label>
              {selectedMember ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{selectedMember.memberName}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {selectedMember.memberNumber} · {selectedMember.memberType} · {selectedMember.currentIssueCount}/{selectedMember.maxBooks} books
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-error-500" onClick={clearMember}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input placeholder="Search member by name or number..." className="pl-9" value={issueMemberSearch} onChange={(e) => handleMemberSearchInput(e.target.value)} />
                  </div>
                  {memberResults && memberResults.data && memberResults.data.length > 0 && issueMemberSearch && (
                    <div className="rounded-sm border border-stroke divide-y divide-stroke bg-white dark:border-strokedark dark:divide-strokedark dark:bg-boxdark overflow-hidden">
                      {memberResults.data.map((m) => (
                        <button key={m.id} type="button" className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-2 dark:hover:bg-meta-4 transition-colors" onClick={() => selectMember(m)}>
                          <p className="font-medium text-black dark:text-white">{m.memberName}</p>
                          <p className="text-xs text-gray-500 font-mono">
                            {m.memberNumber} · {m.memberType}
                            {!m.isActive && <span className="ml-1 text-error-500">Inactive</span>}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">2. Select Book & Copy</Label>
              {!selectedCopyId ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input placeholder="Search book by title, author, ISBN..." className="pl-9" value={bookSearch} onChange={(e) => handleBookSearchInput(e.target.value)} />
                  </div>
                  {bookResults && bookResults.data && bookResults.data.length > 0 && bookSearch && !selectedBookId && (
                    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                      {bookResults.data.map((b) => (
                        <button key={b.id} type="button" className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors" onClick={() => selectBook(b.id)} disabled={b.availableCopies === 0}>
                          <p className="font-medium text-gray-800">{b.title}</p>
                          <p className="text-xs text-gray-400">
                            {b.author ?? 'Unknown author'}
                            {b.availableCopies === 0
                              ? <span className="ml-2 text-error-500">No copies available</span>
                              : <span className="ml-2 text-success-600">{b.availableCopies} available</span>
                            }
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedBookId && availableCopies.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-gray-500 font-medium">
                        Available copies for <span className="text-gray-700">{bookDetail?.title}</span>:
                      </p>
                      <div className="space-y-1.5">
                        {availableCopies.map((copy) => (
                          <button
                            key={copy.id}
                            type="button"
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${selectedCopyId === copy.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                            onClick={() => setSelectedCopyId(copy.id)}
                          >
                            <p className="font-mono font-semibold text-gray-800">{copy.copyNumber}</p>
                            <p className="text-xs text-gray-500">
                              {copy.shelfLocation ? `Shelf: ${copy.shelfLocation}` : 'No shelf location'}
                              {copy.accessionNumber ? ` · Acc: ${copy.accessionNumber}` : ''}
                              {` · ${copy.condition}`}
                            </p>
                          </button>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setSelectedBookId(''); setSelectedCopyId(''); setBookSearch(''); }}>
                        ← Change book
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{bookDetail?.title}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      Copy: {bookDetail?.copies.find((c) => c.id === selectedCopyId)?.copyNumber}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-error-500" onClick={() => { setSelectedCopyId(''); setSelectedBookId(''); setBookSearch(''); setBookSearchActive(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="due-date">Due Date *</Label>
                <input
                  id="due-date"
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fine-per-day">Fine Per Day (NPR)</Label>
                <Input id="fine-per-day" type="number" min={0} value={finePerDay} onChange={(e) => setFinePerDay(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {selectedMember && selectedCopyId && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                <p className="font-medium text-gray-700">Summary</p>
                <p className="text-gray-600">
                  Issuing <span className="font-semibold">{bookDetail?.title}</span> (copy{' '}
                  {bookDetail?.copies.find((c) => c.id === selectedCopyId)?.copyNumber}) to{' '}
                  <span className="font-semibold">{selectedMember.memberName}</span>
                </p>
                {dueDate && <p className="text-gray-500 text-xs">Due: <BsDate date={dueDate} showAd={false} /></p>}
              </div>
            )}

            <Button
              className="w-full bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleIssueBook}
              disabled={issueBook.isPending || !selectedMember || !selectedCopyId || !dueDate}
            >
              {issueBook.isPending ? 'Issuing…' : 'Issue Book'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
