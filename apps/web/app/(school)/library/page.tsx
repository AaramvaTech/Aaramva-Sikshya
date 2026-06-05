import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Library } from 'lucide-react';

export default function LibraryPage() {
  return (
    <div>
      <PageHeader title="Library" description="Books, members, and issue/return" />
      <EmptyState message="Library management is coming in Session 16." icon={Library} />
    </div>
  );
}
