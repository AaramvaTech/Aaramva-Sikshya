'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Camera, Plus, Trash2, Loader2, ChevronLeft } from 'lucide-react';
import type { Path } from 'react-hook-form';
import {
  createStudentSchema,
  type CreateStudentFormValues,
} from '@/lib/schemas/student.schema';
import { useCreateStudent, useClasses, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { uploadFile } from '@/lib/upload';
import { BsDateInput } from '@/components/shared/bs-date-input';
import { todayBs } from '@/lib/bs-calendar';
import { BsDate } from '@/components/shared/bs-date';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const STEPS = ['Personal & Enrollment', 'Guardian Info', 'Review & Submit'];

const STEP_FIELDS: Path<CreateStudentFormValues>[][] = [
  ['firstName', 'lastName', 'dateOfBirth', 'admissionDate', 'gender'],
  ['guardians'],
  [],
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function NewStudentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); // local data-URI preview only
  const [photoFile, setPhotoFile] = useState<File | null>(null); // FILE-1: uploaded on submit
  const photoInputRef = useRef<HTMLInputElement>(null);
  const createStudent = useCreateStudent();
  const todayBsYear = todayBs().year;

  const { data: classes } = useClasses();
  const { data: currentYear } = useCurrentAcademicYear();

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be less than 2 MB'); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

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
      academicYearId: '',
      classId: '',
      sectionId: '',
      rollNumber: undefined,
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

  // Pre-select current academic year
  useEffect(() => {
    if (currentYear?.id && !form.getValues('academicYearId')) {
      form.setValue('academicYearId', currentYear.id);
    }
  }, [currentYear?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { fields, append, remove } = useFieldArray({
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

  async function goNext() {
    const fieldsToValidate = STEP_FIELDS[step];
    const valid =
      fieldsToValidate.length === 0 ||
      (await form.trigger(fieldsToValidate));
    if (valid) setStep((s) => s + 1);
  }

  async function onSubmit(values: CreateStudentFormValues) {
    try {
      // FILE-1: presign→PUT→photoFileKey; legacy base64 only when storage is
      // disabled server-side (uploadFile falls back on 503).
      let photoFields: { photoFileKey?: string; photoUrl?: string } = {};
      if (photoFile) {
        const uploaded = await uploadFile(photoFile, 'student-photo');
        photoFields =
          uploaded.mode === 'key'
            ? { photoFileKey: uploaded.key }
            : { photoUrl: uploaded.dataUrl };
      }
      const payload = {
        ...values,
        middleName: values.middleName || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        bloodGroup: values.bloodGroup || undefined,
        religion: values.religion || undefined,
        ...photoFields,
        classId: values.classId || undefined,
        sectionId: values.sectionId || undefined,
        academicYearId: values.academicYearId || undefined,
        rollNumber: values.rollNumber || undefined,
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
          {/* ── Step 1: Personal Info + Enrollment ──────────────────── */}
          {step === 0 && (
            <div className="space-y-5">
              {/* Personal Information */}
              <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                  <h4 className="text-xl font-semibold text-black dark:text-white">Personal Information</h4>
                </div>
                <div className="p-4 sm:p-6 xl:p-7.5 space-y-4">
                  {/* Photo upload */}
                  <div className="flex items-center gap-5 pb-2 border-b border-stroke dark:border-strokedark">
                    <div className="relative group shrink-0">
                      <Avatar className="h-20 w-20 ring-2 ring-brand-100">
                        <AvatarImage src={photoUrl ?? undefined} className="object-cover" />
                        <AvatarFallback className="bg-brand-50 text-brand-400">
                          <Camera className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Camera className="h-5 w-5 text-white" />
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white mb-1">Profile Photo <span className="text-gray-400 font-normal">(optional)</span></p>
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      <Button type="button" size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} className="text-xs h-8">
                        {photoUrl ? 'Change photo' : 'Upload photo'}
                      </Button>
                      {photoUrl && (
                        <button type="button" onClick={() => setPhotoUrl(null)} className="ml-2 text-xs text-red-400 hover:text-red-600">
                          Remove
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-1">Max 2 MB · JPG, PNG, WEBP</p>
                    </div>
                  </div>

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
                                <span className={field.value ? '' : 'text-muted-foreground'}>
                                  {field.value === 'MALE' ? 'Male' : field.value === 'FEMALE' ? 'Female' : field.value === 'OTHER' ? 'Other' : 'Select gender'}
                                </span>
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
                    <FormField
                      control={form.control}
                      name="bloodGroup"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Blood Group</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <FormControl>
                              <SelectTrigger>
                                <span className={field.value ? '' : 'text-muted-foreground'}>
                                  {field.value || 'Select blood group'}
                                </span>
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
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Class & Enrollment */}
              <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                  <h4 className="text-xl font-semibold text-black dark:text-white">
                    Class Assignment
                    <span className="ml-2 text-sm font-normal text-gray-400">(optional — can be set later)</span>
                  </h4>
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
                                    : 'Select class'}
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
                              placeholder="Optional"
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
                                    : 'Select academic year'}
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
                            <FormControl><Input placeholder="Father" {...field} /></FormControl>
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
                            <FormControl><Input {...field} /></FormControl>
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
                            <FormControl><Input {...field} /></FormControl>
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
                            <FormControl><Input type="tel" {...field} /></FormControl>
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
                            <FormControl><Input type="email" {...field} /></FormControl>
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
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">Primary Guardian</FormLabel>
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
                  onClick={() => append({ relation: '', firstName: '', lastName: '', phone: '', email: '', isPrimary: false })}
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
                  {photoUrl && (
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-stroke dark:border-strokedark">
                      <Avatar className="h-14 w-14 ring-2 ring-brand-100">
                        <AvatarImage src={photoUrl} className="object-cover" />
                        <AvatarFallback className="bg-brand-50 text-brand-400 text-lg">
                          {[values.firstName?.[0], values.lastName?.[0]].join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-black dark:text-white">
                          {[values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ')}
                        </p>
                        <p className="text-xs text-green-600">Photo attached</p>
                      </div>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <ReviewRow
                      label="Full Name"
                      value={[values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ')}
                    />
                    <ReviewRow label="Gender" value={values.gender} />
                    <ReviewRow
                      label="Date of Birth (BS)"
                      value={values.dateOfBirth ? <BsDate date={values.dateOfBirth} /> : '—'}
                    />
                    <ReviewRow
                      label="Admission Date (BS)"
                      value={values.admissionDate ? <BsDate date={values.admissionDate} /> : '—'}
                    />
                    {values.bloodGroup && <ReviewRow label="Blood Group" value={values.bloodGroup} />}
                    {values.religion && <ReviewRow label="Religion" value={values.religion} />}
                    {values.phone && <ReviewRow label="Phone" value={values.phone} />}
                    {values.email && <ReviewRow label="Email" value={values.email} />}
                    {values.address && (
                      <div className="col-span-2">
                        <ReviewRow label="Address" value={values.address} />
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {/* Enrollment summary */}
              {values.classId && values.sectionId && (
                <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                  <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                    <h4 className="text-xl font-semibold text-black dark:text-white">Class Assignment</h4>
                  </div>
                  <div className="p-4 sm:p-6 xl:p-7.5">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <ReviewRow
                        label="Class"
                        value={classes?.find((c) => c.id === values.classId)?.name ?? values.classId}
                      />
                      <ReviewRow
                        label="Section"
                        value={
                          classes
                            ?.find((c) => c.id === values.classId)
                            ?.sections.find((s) => s.id === values.sectionId)?.name ?? values.sectionId
                        }
                      />
                      {values.rollNumber && <ReviewRow label="Roll Number" value={String(values.rollNumber)} />}
                    </dl>
                  </div>
                </div>
              )}

              <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6 xl:px-7.5">
                  <h4 className="text-xl font-semibold text-black dark:text-white">Guardians</h4>
                </div>
                <div className="p-4 sm:p-6 xl:p-7.5">
                  <div className="space-y-3 divide-y divide-stroke dark:divide-strokedark">
                    {values.guardians.map((g, i) => (
                      <div key={i} className="text-sm pb-3 last:pb-0">
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
