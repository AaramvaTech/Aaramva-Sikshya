'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api/auth.api';
import { useTenantStore } from '@/store/tenant.store';

const schema = z
  .object({
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Repeat the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setTenant } = useTenantStore();
  const token = params.get('token') ?? '';
  const tenant = params.get('tenant') ?? '';
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // The email link carries the tenant explicitly (works on non-subdomain hosts).
  useEffect(() => {
    if (tenant) setTenant({ slug: tenant });
  }, [tenant, setTenant]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword: values.newPassword });
      toast.success('Password reset. Log in with your new password.');
      router.replace(tenant ? `/login?tenant=${tenant}` : '/login');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Reset failed — the link may be expired or already used.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-lg border border-stroke p-6 text-center dark:border-form-strokedark">
        <p className="font-medium text-black dark:text-white">Missing reset token</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Open the link from your reset email, or request a new one.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm text-brand-500 hover:text-brand-600">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="mb-2.5 block font-medium text-black dark:text-white">
          New password <span className="text-error-500">*</span>
        </label>
        <div className="relative">
          <input
            {...register('newPassword')}
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            aria-label="Toggle password visibility"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.newPassword && (
          <p className="mt-1.5 text-theme-xs text-error-500">{errors.newPassword.message}</p>
        )}
      </div>
      <div>
        <label className="mb-2.5 block font-medium text-black dark:text-white">
          Repeat new password <span className="text-error-500">*</span>
        </label>
        <input
          {...register('confirmPassword')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          className="w-full rounded-lg border border-stroke bg-transparent px-6 py-4 text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
        />
        {errors.confirmPassword && (
          <p className="mt-1.5 text-theme-xs text-error-500">{errors.confirmPassword.message}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 font-medium text-white transition hover:bg-opacity-90 disabled:opacity-60"
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        Reset password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-black dark:text-white">Reset password</h1>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
        Choose a new password for your account. The link is valid for 30 minutes
        and can be used once.
      </p>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
