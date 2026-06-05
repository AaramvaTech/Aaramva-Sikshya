import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { BookOpen } from 'lucide-react';

export default function AcademicPage() {
  return (
    <div>
      <PageHeader title="Academic" description="Classes, sections, subjects, and timetable" />
      <EmptyState message="Academic management is coming in Session 15." icon={BookOpen} />
    </div>
  );
}
