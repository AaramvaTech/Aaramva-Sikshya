import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CheckSquare } from 'lucide-react';

export default function AttendancePage() {
  return (
    <div>
      <PageHeader title="Attendance" description="Mark and review daily attendance" />
      <EmptyState message="Attendance management is coming in Session 13." icon={CheckSquare} />
    </div>
  );
}
