'use client';

import { useRouter } from 'next/navigation';
import { Users, CalendarOff, DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffList, useLeaveRequests, usePayrollMonths } from '@/lib/hooks/use-hr';

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];

export default function HrPage() {
  const router = useRouter();

  const { data: staffResponse, isLoading: staffLoading } = useStaffList({ page: 1, limit: 1 });
  const { data: leaveResponse, isLoading: leaveLoading } = useLeaveRequests({ page: 1, limit: 1, status: 'PENDING' });
  const { data: payrollMonths, isLoading: payrollLoading } = usePayrollMonths();

  const totalStaff = staffResponse?.meta?.total ?? 0;
  const pendingLeave = leaveResponse?.meta?.total ?? 0;
  const lastMonth = payrollMonths && payrollMonths.length > 0 ? payrollMonths[payrollMonths.length - 1] : null;

  const statusColor: Record<string, string> = {
    DRAFT: 'bg-yellow-100 text-yellow-700',
    FINALIZED: 'bg-blue-100 text-blue-700',
    PAID: 'bg-success-100 text-success-700',
  };

  return (
    <div className="space-y-6">
      <PageHeader title="HR & Staff" description="Staff directory, leave management, and payroll" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-50">
                <Users className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Staff Directory</p>
                <p className="text-xs text-gray-500">Manage employee profiles</p>
              </div>
            </div>
            {staffLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <p className="text-sm text-gray-600">
                <span className="font-bold text-brand-500 text-lg">{totalStaff}</span> staff members
              </p>
            )}
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              size="sm"
              onClick={() => router.push('/hr/staff')}
            >
              Go to Staff →
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-50">
                <CalendarOff className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Leave Management</p>
                <p className="text-xs text-gray-500">Approve or reject requests</p>
              </div>
            </div>
            {leaveLoading ? (
              <Skeleton className="h-5 w-28" />
            ) : (
              <p className="text-sm text-gray-600">
                <span className="font-bold text-orange-600 text-lg">{pendingLeave}</span> pending requests
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/hr/leave')}
            >
              Go to Leave →
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Payroll</p>
                <p className="text-xs text-gray-500">Monthly salary management</p>
              </div>
            </div>
            {payrollLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : lastMonth ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>{BS_MONTHS[(lastMonth.monthBs - 1) % 12]} {lastMonth.yearBs}</span>
                <Badge className={`text-xs border-0 ${statusColor[lastMonth.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {lastMonth.status}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No payroll months yet</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/hr/payroll')}
            >
              Go to Payroll →
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
