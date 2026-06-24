'use client';

import { PageHeader } from '@/components/shared/page-header';
import { StudentImport } from '@/components/students/student-import';

export default function StudentImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Import Students" description="Bulk-import students and their guardians from a CSV file" />
      <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6">
        <StudentImport />
      </div>
    </div>
  );
}
