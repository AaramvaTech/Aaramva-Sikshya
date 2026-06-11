'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  enrollStudentSchema,
  type EnrollStudentFormValues,
} from '@/lib/schemas/student.schema';
import {
  useEnrollStudent,
  useClasses,
  useAcademicYears,
  useCurrentAcademicYear,
} from '@/lib/hooks/use-students';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';

interface EnrollmentFormProps {
  studentId: string;
  onSuccess?: () => void;
}

export function EnrollmentForm({ studentId, onSuccess }: EnrollmentFormProps) {
  const { data: academicYears } = useAcademicYears();
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: classes } = useClasses();
  const enroll = useEnrollStudent(studentId);

  const form = useForm<EnrollStudentFormValues>({
    resolver: zodResolver(enrollStudentSchema),
    defaultValues: {
      academicYearId: '',
      classId: '',
      sectionId: '',
      rollNumber: undefined,
    },
  });

  // Pre-select current academic year once it loads
  useEffect(() => {
    if (currentYear?.id && !form.getValues('academicYearId')) {
      form.setValue('academicYearId', currentYear.id);
    }
  }, [currentYear?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const watchedClassId = form.watch('classId');
  const selectedClass = classes?.find((c) => c.id === watchedClassId);
  const sections = selectedClass?.sections ?? [];

  // Reset section when class changes
  useEffect(() => {
    form.setValue('sectionId', '');
  }, [watchedClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: EnrollStudentFormValues) {
    try {
      await enroll.mutateAsync({
        academicYearId: values.academicYearId,
        classId: values.classId,
        sectionId: values.sectionId,
        rollNumber: values.rollNumber,
      });
      toast.success('Student enrolled successfully');
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Failed to enroll student';
      toast.error('Enrollment failed', { description: msg });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="academicYearId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Academic Year</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <span className={field.value ? '' : 'text-muted-foreground'}>
                      {field.value
                        ? (academicYears?.find((y) => y.id === field.value)?.name ?? 'Loading...')
                        : 'Select academic year'}
                    </span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {academicYears?.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                      {y.isCurrent && ' (Current)'}
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
          name="classId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Class</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
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
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
          name="sectionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Section</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
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
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
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
          name="rollNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Roll Number (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="Leave empty to auto-assign"
                  {...field}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full bg-brand-500 hover:bg-brand-600 text-white"
          disabled={enroll.isPending}
        >
          {enroll.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enroll Student
        </Button>
      </form>
    </Form>
  );
}
