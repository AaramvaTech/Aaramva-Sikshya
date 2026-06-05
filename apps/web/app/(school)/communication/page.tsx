import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageSquare } from 'lucide-react';

export default function CommunicationPage() {
  return (
    <div>
      <PageHeader title="Communication" description="Notices, SMS, and notifications" />
      <EmptyState message="Communication is coming in Session 16." icon={MessageSquare} />
    </div>
  );
}
