'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { FeeStructureForm } from '@/components/finance/fee-structure-form';
import { AmountDisplay } from '@/components/finance/amount-display';
import { useFeeStructures, useFeeStructure } from '@/lib/hooks/use-finance';
import { useAcademicYears, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { FileText } from 'lucide-react';

function FeeStructureDetail({ id }: { id: string }) {
  const { data, isLoading } = useFeeStructure(id);
  if (isLoading) return <div className="p-4"><Skeleton className="h-32 w-full" /></div>;
  if (!data) return null;
  return (
    <div className="mt-3 border-t pt-3 space-y-1.5">
      {data.items.map((item) => (
        <div key={item.id} className="flex justify-between text-sm">
          <span className="text-gray-600">{item.feeCategoryName}</span>
          <AmountDisplay amount={item.amount} className="text-gray-700" />
        </div>
      ))}
    </div>
  );
}

export default function FeeStructuresPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const [selectedYearId, setSelectedYearId] = useState<string>('');

  const academicYearId = selectedYearId || currentYear?.id || '';
  const { data: structures, isLoading } = useFeeStructures(academicYearId || undefined);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fee Structures"
        description="Define fee items per class and academic year"
        action={
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white"
            onClick={() => setFormOpen(true)}
          >
            + Create Structure
          </Button>
        }
      />

      <div className="flex gap-3 items-center">
        <Select
          value={academicYearId}
          onValueChange={(v) => setSelectedYearId(v ?? '')}
        >
          <SelectTrigger className="w-48">
            <span className={academicYearId ? '' : 'text-muted-foreground'}>
              {academicYearId
                ? (() => {
                    const y = allYears?.find((y) => y.id === academicYearId);
                    return y ? `${y.name}${y.isCurrent ? ' (Current)' : ''}` : 'Loading…';
                  })()
                : 'Select academic year'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {allYears?.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name} {y.isCurrent && '(Current)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-sm" />
          ))}
        </div>
      ) : !structures || structures.length === 0 ? (
        <EmptyState
          message="No fee structures found for this academic year."
          icon={FileText}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 2xl:gap-7.5">
          {structures.map((s) => (
            <div key={s.id} className="rounded-sm border border-stroke bg-white shadow-default transition-shadow hover:shadow-md dark:border-strokedark dark:bg-boxdark">
              <div className="p-4 sm:p-6 xl:p-7.5">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-black dark:text-white">{s.className}</h3>
                  <span className="text-xs text-gray-500">{s.academicYearName}</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {s.itemCount} fee item{s.itemCount !== 1 ? 's' : ''}
                </p>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500">Total / year</p>
                    <AmountDisplay amount={s.totalAmount} className="font-semibold text-black dark:text-white" />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    {expandedId === s.id ? 'Hide' : 'View'}
                  </Button>
                </div>
                {expandedId === s.id && <FeeStructureDetail id={s.id} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <FeeStructureForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => setFormOpen(false)}
      />
    </div>
  );
}
