'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, ChevronLeft } from 'lucide-react';
import type { Path } from 'react-hook-form';
import {
  createStudentSchema,
  type CreateStudentFormValues,
} from '@/lib/schemas/student.schema';
import { useCreateStudent } from '@/lib/hooks/use-students';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { todayBs } from '@/lib/bs-calendar';
import { BsDate } from '@/components/shared/bs-date';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';

const STEPS = ['Personal Info', 'Guardian Info', 'Review & Submit'];

const STEP_FIELDS: Path<CreateStudentFormValues>[][] = [
  ['firstName', 'lastName', 'dateOfBirth', 'admissionDate', 'gender'],
  ['guardians'],
  [],
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function NewStudentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const createStudent = useCreateStudent();
  const todayBsYear = todayBs().year;

  const form = useForm<CreateStudentFormValues>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      dateOfBirth: '',
      admissionDate: new Date().toISOString().split('T')[0],
      gender: undefined,
      phone: '',
      email: '',
      address: '',
      bloodGroup: '',
      religion: '',
      guardians: [
        {
          relation: '',
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          isPrimary: true,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'guardians',
  });

  async function goNext() {
    const fieldsToValidate = STEP_FIELDS[step];
    const valid =
      fieldsToValidate.length === 0 ||
      (await form.trigger(fieldsToValidate));
    if (valid) setStep((s) => s + 1);
  }

  async function onSubmit(values: CreateStudentFormValues) {
    try {
      const payload = {
        ...values,
        middleName: values.middleName || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        bloodGroup: values.bloodGroup || undefined,
        religion: values.religion || undefined,
        guardians: values.guardians.map((g) => ({
          ...g,
          email: g.email || undefined,
        })),
      };
      const result = await createStudent.mutateAsync(payload);
      const student = result.data.data;
      toast.success(`Student admitted: ${student.studentId}`);
      router.push(`/students/${student.id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Failed to admit student';
      toast.error('Admission failed', { description: msg });
    }
  }

  const values = form.watch();

  return (
    <div>
      <PageHeader
        title="Admit Student"
        description="Add a new student to the school"
      />

      {/* Progress indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2',
                  i < step
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : i === step
                      ? 'border-brand-500 text-brand-500'
                      : 'border-gray-300 text-gray-400',
                )}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs mt-1 whitespace-nowrap',
                  i === step ? 'text-brand-500 font-medium' : 'text-gray-400',
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-16 mx-2 mb-5',
                  i < step ? 'bg-brand-500' : 'bg-gray-200',
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* ── Step 1: Personal Info ──────────────────────────────── */}
          {step === 0 && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                <h4 className="text-xl font-semibold text-black dark:text-white">Personal Information</h4>
              </div>
              <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
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
                          <BsDateInput
                            value={field.value}
                            onChange={field.onChange}
                          />
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
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ''}
                        >
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
                    name="admissionDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admission Date (BS) *</FormLabel>
                        <FormControl>
                          <BsDateInput
                            value={field.value}
                            onChange={field.onChange}
                            minYear={todayBsYear - 1}
                            maxYear={todayBsYear + 1}
                          />
                        </FormControl>
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
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ''}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select blood group" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BLOOD_GROUPS.map((bg) => (
                              <SelectItem key={bg} value={bg}>
                                {bg}
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
                    name="religion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Religion</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
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
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Guardian Info ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              {fields.map((fieldItem, index) => (
                <div key={fieldItem.id} className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                  <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold text-black dark:text-white">
                        Guardian {index + 1}
                      </h4>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-error-500 hover:text-error-700 hover:bg-error-50"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`guardians.${index}.relation`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Relation *</FormLabel>
                            <FormControl>
                              <Input placeholder="Father" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`guardians.${index}.firstName`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`guardians.${index}.lastName`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`guardians.${index}.phone`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone *</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`guardians.${index}.email`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.isPrimary`}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">
                            Primary Guardian
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}

              {fields.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      relation: '',
                      firstName: '',
                      lastName: '',
                      phone: '',
                      email: '',
                      isPrimary: false,
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add another guardian
                </Button>
              )}
            </div>
          )}

          {/* ── Step 3: Review & Submit ────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                  <h4 className="text-xl font-semibold text-black dark:text-white">Personal Information</h4>
                </div>
                <div className="p-4 sm:p-6 xl:p-7.5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <ReviewRow
                      label="Full Name"
                      value={[
                        values.firstName,
                        values.middleName,
                        values.lastName,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                    <ReviewRow label="Gender" value={values.gender} />
                    <ReviewRow
                      label="Date of Birth (BS)"
                      value={
                        values.dateOfBirth ? (
                          <BsDate date={values.dateOfBirth} />
                        ) : (
                          '—'
                        )
                      }
                    />
                    <ReviewRow
                      label="Admission Date (BS)"
                      value={
                        values.admissionDate ? (
                          <BsDate date={values.admissionDate} />
                        ) : (
                          '—'
                        )
                      }
                    />
                    {values.bloodGroup && (
                      <ReviewRow label="Blood Group" value={values.bloodGroup} />
                    )}
                    {values.religion && (
                      <ReviewRow label="Religion" value={values.religion} />
                    )}
                    {values.phone && (
                      <ReviewRow label="Phone" value={values.phone} />
                    )}
                    {values.email && (
                      <ReviewRow label="Email" value={values.email} />
                    )}
                    {values.address && (
                      <div className="col-span-2">
                        <ReviewRow label="Address" value={values.address} />
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                  <h4 className="text-xl font-semibold text-black dark:text-white">Guardians</h4>
                </div>
                <div className="p-4 sm:p-6 xl:p-7.5">
                  <div className="space-y-3 divide-y divide-stroke dark:divide-strokedark">
                    {values.guardians.map((g, i) => (
                      <div
                        key={i}
                        className="text-sm pb-3 last:pb-0"
                      >
                        <p className="font-medium text-black dark:text-white">
                          {g.firstName} {g.lastName}
                          {g.isPrimary && (
                            <span className="ml-2 text-xs bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-sm">
                              Primary
                            </span>
                          )}
                        </p>
                        <p className="text-gray-500 mt-0.5">
                          {g.relation} · {g.phone}
                          {g.email ? ` · ${g.email}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>

            {step < 2 ? (
              <Button
                type="button"
                className="bg-brand-500 hover:bg-brand-600 text-white"
                onClick={goNext}
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                className="bg-brand-500 hover:bg-brand-600 text-white"
                disabled={createStudent.isPending}
              >
                {createStudent.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  );
}
