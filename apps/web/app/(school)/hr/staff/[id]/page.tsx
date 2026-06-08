'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStaffDetail, useLeaveBalance } from '@/lib/hooks/use-hr';

export default function StaffProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const { data: staff, isLoading: staffLoading } = useStaffDetail(id);
  const { data: leaveBalance, isLoading: balanceLoading } = useLeaveBalance(staff?.userId ?? '');

  if (staffLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!staff) {
    return <p className="text-gray-500">Staff member not found.</p>;
  }

  function labelValue(label: string, value: React.ReactNode) {
    return (
      <div>
        <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{label}</dt>
        <dd className="text-sm text-gray-800">{value ?? '—'}</dd>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={staff.fullName} description={staff.employeeId} />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="leave">Leave Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Personal Information</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {labelValue('Full Name', staff.fullName)}
                {labelValue('Email', staff.email)}
                {labelValue('Phone', staff.phone)}
                {labelValue('Gender', staff.gender ? staff.gender.charAt(0) + staff.gender.slice(1).toLowerCase() : null)}
                {labelValue('Date of Birth', staff.dateOfBirth ? <BsDate date={staff.dateOfBirth} /> : null)}
                {labelValue('Address', staff.permanentAddress)}
              </dl>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">HR Information</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {labelValue('Role', staff.role.replace(/_/g, ' '))}
                {labelValue('Department', staff.departmentName)}
                {labelValue('Designation', staff.designationTitle)}
                {labelValue('Employment Type', staff.employmentType.replace(/_/g, ' '))}
                {labelValue('Join Date', <BsDate date={staff.joinDate} />)}
                {labelValue('Base Salary', <AmountDisplay amount={staff.baseSalary} />)}
                {labelValue('PAN Number', staff.panNumber)}
                {labelValue('Bank Name', staff.bankName)}
                {labelValue('Bank Account', staff.bankAccount)}
              </dl>
            </div>
          </div>

          {(staff.emergencyContactName || staff.emergencyContactPhone) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Emergency Contact</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {labelValue('Name', staff.emergencyContactName)}
                {labelValue('Phone', staff.emergencyContactPhone)}
              </dl>
            </div>
          )}
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {balanceLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : leaveBalance && leaveBalance.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave Type</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entitlement</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Used</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaveBalance.map((lb) => (
                    <tr key={lb.leaveTypeId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{lb.leaveTypeName}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{lb.entitlement}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{lb.used}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${lb.balance <= 0 ? 'text-error-600' : lb.balance < 3 ? 'text-orange-500' : 'text-success-600'}`}>
                        {lb.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No leave balance data available</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
