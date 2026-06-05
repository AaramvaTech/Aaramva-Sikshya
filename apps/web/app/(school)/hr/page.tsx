import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { UserCog } from 'lucide-react';

export default function HrPage() {
  return (
    <div>
      <PageHeader title="HR & Staff" description="Staff profiles, leave, and payroll" />
      <EmptyState message="HR management is coming in Session 16." icon={UserCog} />
    </div>
  );
}
