import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Users } from 'lucide-react';

export default function StudentsPage() {
  return (
    <div>
      <PageHeader title="Students" description="Manage student admissions and profiles" />
      <EmptyState message="Student management is coming in Session 12." icon={Users} />
    </div>
  );
}
