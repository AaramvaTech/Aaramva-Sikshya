'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { BulkAssignDialog } from '@/components/finance/bulk-assign-dialog';

/**
 * UI-2 §5.2 — bulk-assign action + job-progress tracking only. Per-student
 * assignment/override/concession/transport lives on the student detail
 * page's "Billing" tab instead (UI-2-SPEC.md §3) — assignment is inherently
 * per-student. There is no "browse all current assignments" table here: the
 * backend has no school-wide list endpoint (assignment reads are always
 * per-student), and no bulk-assign job-history list either — this page only
 * ever tracks the one job you just launched (§5.2's noted, accepted gap).
 */
export default function BillAssignmentPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignment"
        description="Bulk-assign a fee structure to a class or a picked list of students"
        action={
          <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setDialogOpen(true)}>
            <Users className="mr-2 h-4 w-4" />
            Bulk Assign
          </Button>
        }
      />

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <EmptyState
          icon={Users}
          message="Assign a fee structure to a whole class (or section) or a picked list of students. To manage one student's assignment, overrides, concessions, or transport individually, open that student's profile and use the Billing tab."
          action={
            <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setDialogOpen(true)}>
              <Users className="mr-2 h-4 w-4" />
              Bulk Assign
            </Button>
          }
        />
      </div>

      <BulkAssignDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
