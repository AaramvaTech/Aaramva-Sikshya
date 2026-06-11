'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { editStudentSchema, type EditStudentFormValues } from '@/lib/schemas/student.schema';
import { useStudent, useUpdateStudent, useClasses, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
  SelectValue,
} from '@/components/ui/select';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const RELATIONS = [
  'Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandfather', 'Grandmother', 'Other',
];

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: student, isLoading } = useStudent(id);
  const update = useUpdateStudent(id);
  const { data: classes } = useClasses();
  const { data: currentYear } = useCurrentAcademicYear();

  const form = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentSchema),
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      dateOfBirth: '',
      gender: undefined,
      phone: '',
      email: '',
      address: '',
      bloodGroup: '',
      religion: '',
      academicYearId: '',
      classId: '',
      sectionId: '',
      rollNumber: undefined,
      guardians: [],
    },
  });

  const { fields: guardianFields, append, remove } = useFieldArray({
    control: form.control,
    name: 'guardians',
  });

  const watchedClassId = form.watch('classId');
  const selectedClass = classes?.find((c) => c.id === watchedClassId);
  const sections = selectedClass?.sections ?? [];

  // Reset section when class changes
  useEffect(() => {
    form.setValue('sectionId', '');
  }, [watchedClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!student) return;
    form.reset({
      firstName: student.firstName,
      middleName: '',
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth.ad,
      gender: student.gender as 'MALE' | 'FEMALE' | 'OTHER',
      phone: student.phone ?? '',
      email: student.email ?? '',
      address: student.permanentAddress
        ? Object.values(student.permanentAddress).filter(Boolean).join(', ')
        : '',
      bloodGroup: student.bloodGroup ?? '',
      religion: student.religion ?? '',
      guardians: student.guardians.map((g) => ({
        relation: g.relation,
        firstName: g.firstName,
        lastName: g.lastName,
        phone: g.phone,
        email: g.email ?? '',
        isPrimary: g.isPrimary,
      })),
    });
  }, [student, form]);

  async function onSubmit(values: EditStudentFormValues) {
    try {
      await update.mutateAsync({
        ...values,
        middleName: values.middleName || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        bloodGroup: values.bloodGroup || undefined,
        religion: values.religion || undefined,
        classId: values.classId || undefined,
        sectionId: values.sectionId || undefined,
        academicYearId: values.academicYearId || undefined,
        rollNumber: values.rollNumber || undefined,
        guardians: values.guardians?.map((g) => ({
          ...g,
          email: g.email || undefined,
        })),
      });
      toast.success('Student profile updated');
      router.push(`/students/${id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Failed to update student';
      toast.error('Update failed', { description: msg });
    }
  }

  function addGuardian() {
    append({ relation: '', firstName: '', lastName: '', phone: '', email: '', isPrimary: guardianFields.length === 0 });
  }

  function setPrimary(index: number) {
    guardianFields.forEach((_, i) => {
      form.setValue(`guardians.${i}.isPrimary`, i === index);
    });
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

  if (!student) {
    return <p className="text-sm text-gray-500">Student not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={`Edit — ${student.fullName}`}
          description={`Student ID: ${student.studentId}`}
        />
        <Button variant="ghost" size="sm" onClick={() => router.push(`/students/${id}`)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Personal Info */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">Personal Information</h4>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="middleName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Middle Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth (BS) *</FormLabel>
                      <FormControl>
                        <BsDateInput value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MALE">Male</SelectItem>
                          <SelectItem value="FEMALE">Female</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
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
                  name="bloodGroup"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blood Group</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select blood group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BLOOD_GROUPS.map((bg) => (
                            <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="religion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Religion</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">Contact Information</h4>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input type="tel" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Class Assignment */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
              <h4 className="text-base font-semibold text-black dark:text-white">
                Class Assignment
                {student?.className && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    (current: {student.className}{student.sectionName ? ` — ${student.sectionName}` : ''})
                  </span>
                )}
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">Select new class/section to change enrollment, or leave blank to keep current</p>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Class</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <span className={field.value ? '' : 'text-muted-foreground'}>
                              {field.value
                                ? (classes?.find((c) => c.id === field.value)?.name ?? 'Loading...')
                                : 'No change'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {classes?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sectionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                        disabled={!watchedClassId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <span className={field.value ? '' : 'text-muted-foreground'}>
                              {field.value
                                ? (sections.find((s) => s.id === field.value)?.name ?? 'Loading...')
                                : watchedClassId ? 'Select section' : 'Select class first'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sections.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                  name="rollNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roll Number</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder={student?.rollNumber ? String(student.rollNumber) : 'Optional'}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="academicYearId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic Year</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <span className={field.value ? '' : 'text-muted-foreground'}>
                              {field.value
                                ? (currentYear?.id === field.value
                                    ? `${currentYear.name} (Current)`
                                    : field.value)
                                : 'No change'}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {currentYear && (
                            <SelectItem value={currentYear.id}>
                              {currentYear.name} (Current)
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Guardians */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5 flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold text-black dark:text-white">Guardians</h4>
                <p className="text-xs text-gray-500 mt-0.5">At least one guardian is required</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addGuardian}
                className="text-brand-500 border-brand-500/40 hover:bg-brand-50"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Guardian
              </Button>
            </div>
            <div className="p-4 sm:p-6 xl:p-7.5 space-y-5">
              {guardianFields.length === 0 && (
                <div className="text-center py-6 text-sm text-gray-400">
                  No guardians added. Click &ldquo;Add Guardian&rdquo; to add one.
                </div>
              )}

              {guardianFields.map((field, index) => (
                <div
                  key={field.id}
                  className="p-4 rounded-lg border border-gray-100 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/20 space-y-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Guardian {index + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id={`primary-${index}`}
                          checked={form.watch(`guardians.${index}.isPrimary`)}
                          onCheckedChange={() => setPrimary(index)}
                        />
                        <Label htmlFor={`primary-${index}`} className="text-xs text-gray-600 cursor-pointer">
                          Primary
                        </Label>
                      </div>
                      {guardianFields.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.relation`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Relation *</FormLabel>
                          <Select onValueChange={f.onChange} value={f.value}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm">
                                <span className={f.value ? '' : 'text-muted-foreground'}>
                                  {f.value || 'Select'}
                                </span>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {RELATIONS.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.firstName`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">First Name *</FormLabel>
                          <FormControl><Input className="h-9 text-sm" {...f} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.lastName`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Last Name *</FormLabel>
                          <FormControl><Input className="h-9 text-sm" {...f} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.phone`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Phone *</FormLabel>
                          <FormControl><Input className="h-9 text-sm" type="tel" {...f} placeholder="98XXXXXXXX" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.email`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Email</FormLabel>
                          <FormControl><Input className="h-9 text-sm" type="email" {...f} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/students/${id}`)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              disabled={update.isPending}
            >
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
