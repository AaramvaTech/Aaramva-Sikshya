'use client';

import { useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useBooks,
  useBookDetail,
  useAddBook,
  useAddCopy,
  useBookCategories,
} from '@/lib/hooks/use-library';
import type { BookSummary } from '@/types/api.types';

const CONDITIONS = ['GOOD', 'FAIR', 'POOR', 'DAMAGED'];

export default function BookCataloguePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addBookOpen, setAddBookOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showAddCopyForm, setShowAddCopyForm] = useState(false);

  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    publisher: '',
    isbn: '',
    categoryId: '',
    edition: '',
    language: 'Nepali',
    description: '',
  });

  const [copyForm, setCopyForm] = useState({
    copyNumber: '',
    accessionNumber: '',
    shelfLocation: '',
    condition: '',
  });

  const { data: response, isLoading } = useBooks({
    page,
    limit: 20,
    search: search || undefined,
    categoryId: categoryId || undefined,
  });
  const { data: categories } = useBookCategories();
  const { data: bookDetail, isLoading: detailLoading } = useBookDetail(selectedBookId ?? '');
  const addBook = useAddBook();
  const addCopy = useAddCopy();

  const books = response?.data ?? [];
  const meta = response?.meta;

  function handleSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  function setBookField(key: string, value: string) {
    setBookForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCopyField(key: string, value: string) {
    setCopyForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddBook() {
    if (!bookForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    try {
      await addBook.mutateAsync({
        title: bookForm.title.trim(),
        author: bookForm.author || undefined,
        publisher: bookForm.publisher || undefined,
        isbn: bookForm.isbn || undefined,
        categoryId: bookForm.categoryId || undefined,
        edition: bookForm.edition || undefined,
        language: bookForm.language || undefined,
        description: bookForm.description || undefined,
      });
      toast.success('Book added to catalogue');
      setAddBookOpen(false);
      setBookForm({ title: '', author: '', publisher: '', isbn: '', categoryId: '', edition: '', language: 'Nepali', description: '' });
    } catch {
      toast.error('Failed to add book');
    }
  }

  async function handleAddCopy() {
    if (!selectedBookId || !copyForm.copyNumber.trim()) {
      toast.error('Copy number is required');
      return;
    }
    try {
      await addCopy.mutateAsync({
        bookId: selectedBookId,
        data: {
          copyNumber: copyForm.copyNumber.trim(),
          accessionNumber: copyForm.accessionNumber || undefined,
          shelfLocation: copyForm.shelfLocation || undefined,
          condition: copyForm.condition || undefined,
        },
      });
      toast.success('Copy added');
      setCopyForm({ copyNumber: '', accessionNumber: '', shelfLocation: '', condition: '' });
      setShowAddCopyForm(false);
    } catch {
      toast.error('Failed to add copy');
    }
  }

  const columns: ColumnDef<BookSummary>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ getValue }) => (
        <span className="font-medium text-gray-800">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'author',
      header: 'Author',
      cell: ({ getValue }) => getValue<string | null>() ?? '—',
    },
    {
      accessorKey: 'isbn',
      header: 'ISBN',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-gray-600">{getValue<string | null>() ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'categoryName',
      header: 'Category',
      cell: ({ getValue }) => getValue<string | null>() ?? '—',
    },
    {
      accessorKey: 'totalCopies',
      header: 'Total Copies',
      cell: ({ getValue }) => (
        <span className="font-mono">{getValue<number>()}</span>
      ),
    },
    {
      accessorKey: 'availableCopies',
      header: 'Available',
      cell: ({ getValue }) => {
        const n = getValue<number>();
        return (
          <span className={`font-mono font-semibold ${n > 0 ? 'text-success-600' : 'text-error-500'}`}>
            {n}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setSelectedBookId(row.original.id);
            setShowAddCopyForm(false);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Book Catalogue"
        description="Manage the school library book collection"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            size="sm"
            onClick={() => setAddBookOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Book
          </Button>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search title, author, ISBN..."
            className="pl-9 w-72"
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v ?? '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <span className="truncate">
              {categories?.find((c) => c.id === categoryId)?.name ?? 'All Categories'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={books}
        isLoading={isLoading}
        pagination={
          meta
            ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage }
            : undefined
        }
      />

      <Dialog open={addBookOpen} onOpenChange={(open) => { if (!open) setAddBookOpen(false); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Book</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="b-title">Title *</Label>
              <Input
                id="b-title"
                value={bookForm.title}
                onChange={(e) => setBookField('title', e.target.value)}
                placeholder="Book title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-author">Author</Label>
              <Input
                id="b-author"
                value={bookForm.author}
                onChange={(e) => setBookField('author', e.target.value)}
                placeholder="Author name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-publisher">Publisher</Label>
              <Input
                id="b-publisher"
                value={bookForm.publisher}
                onChange={(e) => setBookField('publisher', e.target.value)}
                placeholder="Publisher"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-isbn">ISBN</Label>
              <Input
                id="b-isbn"
                value={bookForm.isbn}
                onChange={(e) => setBookField('isbn', e.target.value)}
                placeholder="ISBN number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-edition">Edition</Label>
              <Input
                id="b-edition"
                value={bookForm.edition}
                onChange={(e) => setBookField('edition', e.target.value)}
                placeholder="e.g. 2nd"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={bookForm.categoryId || 'NONE'}
                onValueChange={(v) => setBookField('categoryId', (v ?? '') === 'NONE' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <span className="truncate">
                    {categories?.find((c) => c.id === bookForm.categoryId)?.name ?? 'Select category'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-language">Language</Label>
              <Input
                id="b-language"
                value={bookForm.language}
                onChange={(e) => setBookField('language', e.target.value)}
                placeholder="Nepali"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="b-desc">Description</Label>
              <Textarea
                id="b-desc"
                value={bookForm.description}
                onChange={(e) => setBookField('description', e.target.value)}
                placeholder="Short description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBookOpen(false)}>Cancel</Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleAddBook}
              disabled={addBook.isPending || !bookForm.title.trim()}
            >
              {addBook.isPending ? 'Adding…' : 'Add Book'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedBookId} onOpenChange={(open) => { if (!open) { setSelectedBookId(null); setShowAddCopyForm(false); } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{bookDetail?.title ?? 'Book Detail'}</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="mt-4 space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : bookDetail ? (
            <div className="p-4 space-y-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Author</span>
                  <p className="text-gray-800 font-medium">{bookDetail.author ?? '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Publisher</span>
                  <p className="text-gray-800">{bookDetail.publisher ?? '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Edition</span>
                  <p className="text-gray-800">{bookDetail.edition ?? '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">ISBN</span>
                  <p className="text-gray-800 font-mono">{bookDetail.isbn ?? '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Language</span>
                  <p className="text-gray-800">{bookDetail.language}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Category</span>
                  <p className="text-gray-800">{bookDetail.categoryName ?? '—'}</p>
                </div>
                {bookDetail.description && (
                  <div className="col-span-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Description</span>
                    <p className="text-gray-700 mt-0.5">{bookDetail.description}</p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Copies ({bookDetail.copies.length})
                    <span className="ml-2 text-success-600 font-normal">{bookDetail.availableCopies} available</span>
                  </h3>
                </div>

                <div className="space-y-2">
                  {bookDetail.copies.map((copy) => (
                    <div
                      key={copy.id}
                      className="rounded-lg border border-gray-200 p-3 text-sm flex items-start justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-gray-800">{copy.copyNumber}</span>
                          {copy.accessionNumber && (
                            <span className="text-xs text-gray-400 font-mono">Acc: {copy.accessionNumber}</span>
                          )}
                        </div>
                        {copy.shelfLocation && (
                          <p className="text-xs text-gray-500">Shelf: {copy.shelfLocation}</p>
                        )}
                        <p className="text-xs text-gray-500">Condition: {copy.condition}</p>
                        {!copy.isAvailable && copy.currentIssue && (
                          <div className="mt-1 text-xs text-orange-700 space-y-0.5">
                            <p>Member: <span className="font-mono">{copy.currentIssue.memberNumber}</span></p>
                            <p className="flex items-center gap-1">
                              Due: <BsDate date={copy.currentIssue.dueDate} showAd={false} />
                              {copy.currentIssue.isOverdue && (
                                <Badge className="bg-error-100 text-error-700 border-0 text-xs ml-1">Overdue</Badge>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      <Badge
                        className={`text-xs border-0 ${copy.isAvailable ? 'bg-success-100 text-success-700' : 'bg-orange-100 text-orange-700'}`}
                      >
                        {copy.isAvailable ? 'Available' : 'Checked Out'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center justify-between"
                  onClick={() => setShowAddCopyForm((v) => !v)}
                >
                  <span>Add Copy</span>
                  {showAddCopyForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                {showAddCopyForm && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-number">Copy Number *</Label>
                      <Input
                        id="cp-number"
                        value={copyForm.copyNumber}
                        onChange={(e) => setCopyField('copyNumber', e.target.value)}
                        placeholder="e.g. C001"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-acc">Accession Number</Label>
                      <Input
                        id="cp-acc"
                        value={copyForm.accessionNumber}
                        onChange={(e) => setCopyField('accessionNumber', e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-shelf">Shelf Location</Label>
                      <Input
                        id="cp-shelf"
                        value={copyForm.shelfLocation}
                        onChange={(e) => setCopyField('shelfLocation', e.target.value)}
                        placeholder="e.g. A-12"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Condition</Label>
                      <Select
                        value={copyForm.condition || 'NONE'}
                        onValueChange={(v) => setCopyField('condition', (v ?? '') === 'NONE' ? '' : (v ?? ''))}
                      >
                        <SelectTrigger>
                          <span className="truncate">
                            {copyForm.condition ? copyForm.condition.charAt(0) + copyForm.condition.slice(1).toLowerCase() : 'Select condition'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Select condition</SelectItem>
                          {CONDITIONS.map((c) => (
                            <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full bg-brand-500 hover:bg-brand-600 text-white"
                      onClick={handleAddCopy}
                      disabled={addCopy.isPending || !copyForm.copyNumber.trim()}
                    >
                      {addCopy.isPending ? 'Adding…' : 'Add Copy'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
