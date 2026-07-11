'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { authApi } from '@/lib/api/auth.api';
import { useTenantStore } from '@/store/tenant.store';

const schema = z.object({
  schoolSlug: z.string().min(1, 'School code is required'),
  email: z.string().email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { setTenant } = useTenantStore();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      schoolSlug:
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('tenant') ?? ''
          : '',
      email: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setTenant({ slug: values.schoolSlug.trim().toLowerCase() });
    try {
      await authApi.forgotPassword({ email: values.email });
    } catch {
      // Oracle-free UX too: the confirmation below is shown regardless.
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-black dark:text-white">
        Forgot your password?
      </h1>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
        Enter your school code and account email. If an account exists, we will
        email a reset link valid for 30 minutes.
      </p>

      {submitted ? (
        <div className="rounded-lg border border-stroke p-6 text-center dark:border-form-strokedark">
          <MailCheck className="mx-auto mb-3 h-10 w-10 text-brand-500" />
          <p className="font-medium text-black dark:text-white">Check your email</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            If an account exists for that email, a reset link has been sent.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm text-brand-500 hover:text-brand-600">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="mb-2.5 block font-medium text-black dark:text-white">
              School code <span className="text-error-500">*</span>
            </label>
            <input
              {...register('schoolSlug')}
              type="text"
              placeholder="e.g. motherland-school"
              className="w-full rounded-lg border border-stroke bg-transparent px-6 py-4 text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
            />
            {errors.schoolSlug && (
              <p className="mt-1.5 text-theme-xs text-error-500">{errors.schoolSlug.message}</p>
            )}
          </div>
          <div>
            <label className="mb-2.5 block font-medium text-black dark:text-white">
              Email <span className="text-error-500">*</span>
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-stroke bg-transparent px-6 py-4 text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
            />
            {errors.email && (
              <p className="mt-1.5 text-theme-xs text-error-500">{errors.email.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 font-medium text-white transition hover:bg-opacity-90 disabled:opacity-60"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </button>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Remembered it?{' '}
            <Link href="/login" className="text-brand-500 hover:text-brand-600">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
