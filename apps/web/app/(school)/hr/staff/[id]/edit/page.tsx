'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ChevronLeft, Loader2 } from 'lucide-react';
import {
  editStaffSchema,
  type EditStaffFormValues,
} from '@/lib/schemas/staff.schema';
import {
  useStaffDetail,
  useUpdateStaff,
  useDepartments,
  useDesignations,
} from '@/lib/hooks/use-hr';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

const EMPLOYMENT_TYPES = ['PERMANENT', 'TEMPORARY', 'PART_TIME', 'CONTRACT'];

export default function EditStaffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: staff, isLoading } = useStaffDetail(id);
  const update = useUpdateStaff(id);
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();

  const form = useForm<EditStaffFormValues>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: {
      departmentId: '',
      designationId: '',
      phone: '',
      employmentType: undefined,
      baseSalary: undefined,
      panNumber: '',
      bankName: '',
      bankAccount: '',
      permanentAddress: '',
      temporaryAddress: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
    },
  });

  // Reset form when staff data loads
  useEffect(() => {
    if (!staff) return;
    form.reset({
      departmentId: staff.departmentId ?? '',
      designationId: staff.designationId ?? '',
      phone: staff.phone ?? '',
      employmentType: staff.employmentType as EditStaffFormValues['employmentType'],
      baseSalary: staff.baseSalary,
      panNumber: staff.panNumber ?? '',
      bankName: staff.bankName ?? '',
      bankAccount: staff.bankAccount ?? '',
      permanentAddress: staff.permanentAddress ?? '',
      temporaryAddress: '',
      emergencyContactName: staff.emergencyContactName ?? '',
      emergencyContactPhone: staff.emergencyContactPhone ?? '',
    });
  }, [staff, form]);

  async function onSubmit(values: EditStaffFormValues) {
    try {
      await update.mutateAsync({
        departmentId: values.departmentId || undefined,
        designationId: values.designationId || undefined,
        phone: values.phone || undefined,
        employmentType: values.employmentType,
        baseSalary: values.baseSalary,
        panNumber: values.panNumber || undefined,
        bankName: values.bankName || undefined,
        bankAccount: values.bankAccount || undefined,
        permanentAddress: values.permanentAddress || undefined,
        temporaryAddress: values.temporaryAddress || undefined,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
      });
      toast.success('Staff profile updated');
      router.push(`/hr/staff/${id}`);
    } catch (err: unknown) {
      const msg =
        (
          err as {
            response?: { data?: { error?: { message?: string } } };
          }
        )?.response?.data?.error?.message ?? 'Failed to update staff';
      toast.error('Update failed', { description: msg });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!staff) {
    return <p className="text-sm text-gray-500">Staff member not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={`Edit — ${staff.fullName}`}
          description={`Employee ID: ${staff.employeeId}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/hr/staff/${id}`)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Employment Information */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">
                Employment Information
              </h4>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <span className="truncate">
                              {departments?.find((d) => d.id === field.value)
                                ?.name ?? 'Select department'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {departments?.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="designationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <span className="truncate">
                              {designations?.find((d) => d.id === field.value)
                                ?.title ?? 'Select designation'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {designations?.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <span className="truncate">
                              {field.value
                                ? field.value.replace(/_/g, ' ')
                                : 'Select type'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EMPLOYMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="baseSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Salary (NPR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            )
                          }
                          placeholder="e.g. 25000"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">
                Contact Information
              </h4>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" {...field} placeholder="98XXXXXXXX" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="permanentAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Permanent Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="temporaryAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temporary Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Financial Information */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">
                Financial Information
              </h4>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
              <FormField
                control={form.control}
                name="panNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PAN Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. 123456789" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Nabil Bank" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankAccount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Account</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. 0123456789012345" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">
                Emergency Contact
              </h4>
            </div>
            <div className="p-4 sm:p-6 xl-p-7.5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emergencyContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Full name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          {...field}
                          placeholder="98XXXXXXXX"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Read-only info notice */}
          <div className="rounded-sm border border-blue-100 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-900/10 p-4">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              <strong>Note:</strong> Name, email, role, date of birth, and join
              date cannot be changed from this page. Please contact the platform
              administrator for such changes.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/hr/staff/${id}`)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              disabled={update.isPending}
            >
              {update.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
