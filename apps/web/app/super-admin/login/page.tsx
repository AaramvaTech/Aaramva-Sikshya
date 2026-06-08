'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';
import { superAdminApi } from '@/lib/api/super-admin.api';
import { useAuthStore } from '@/store/auth.store';
import { superAdminLoginSchema, type SuperAdminLoginValues } from '@/lib/schemas/super-admin.schema';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SuperAdminLoginValues>({
    resolver: zodResolver(superAdminLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: SuperAdminLoginValues) {
    setIsLoading(true);
    try {
      const { data } = await superAdminApi.login(values);
      const { accessToken, admin } = data.data;
      setAuth(accessToken, {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: 'PLATFORM_ADMIN',
        tenantId: null,
        tenantSlug: null,
      });
      router.push('/super-admin/dashboard');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Invalid email or password';
      toast.error('Login failed', { description: message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 bg-white dark:bg-gray-900">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 dark:bg-gray-800">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Platform Admin</h1>
            <p className="mt-1.5 text-theme-sm text-gray-500 dark:text-gray-400">
              Sign in to the administration console
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="admin@aaramvashikshya.com"
                {...register('email')}
                className="w-full rounded-lg border border-gray-200 bg-white py-3.5 px-4 text-theme-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:focus:border-brand-800"
              />
              {errors.email && (
                <p className="mt-1 text-theme-xs text-error-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className="w-full rounded-lg border border-gray-200 bg-white py-3.5 pl-4 pr-10 text-theme-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:focus:border-brand-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-theme-xs text-error-500">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3.5 text-theme-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In as Platform Admin
            </button>
          </form>
        </div>
      </div>

      {/* Right — Branding */}
      <div className="hidden lg:flex w-[480px] flex-col items-center justify-center bg-gray-900 px-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative z-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Aaramva Shikshya</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400 max-w-xs">
            Platform administration console. Manage schools, subscriptions, and platform-wide settings from one place.
          </p>
        </div>
      </div>
    </div>
  );
}
