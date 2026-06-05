import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CreditCard } from 'lucide-react';

export default function FinancePage() {
  return (
    <div>
      <PageHeader title="Finance" description="Fee structures, invoices, and payments" />
      <EmptyState message="Finance management is coming in Session 14." icon={CreditCard} />
    </div>
  );
}
