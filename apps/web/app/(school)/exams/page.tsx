import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FileText } from 'lucide-react';

export default function ExamsPage() {
  return (
    <div>
      <PageHeader title="Examinations" description="Exams, marks, and report cards" />
      <EmptyState message="Examination management is coming in Session 15." icon={FileText} />
    </div>
  );
}
