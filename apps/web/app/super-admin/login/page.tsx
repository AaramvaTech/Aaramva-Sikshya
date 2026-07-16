'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { superAdminApi } from '@/lib/api/super-admin.api';
import { getErrorDisplay } from '@/lib/errors';
import { useAuthStore } from '@/store/auth.store';
import { superAdminLoginSchema, type SuperAdminLoginValues } from '@/lib/schemas/super-admin.schema';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { setAuth, accessToken, user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Skip the login screen only when a LIVE in-memory platform session exists
  // (token-based, NOT the spoofable `_auth` marker). A stale marker with no token
  // must NOT redirect — otherwise the user could never reach this page to log in.
  useEffect(() => {
    if (accessToken && user?.role === 'PLATFORM_ADMIN') {
      router.replace('/super-admin/dashboard');
    }
  }, [accessToken, user, router]);

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
    setFormError(null);
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
      // Route through the ONE client contract (§1.4). The old bespoke fallback
      // (`?? 'Invalid email or password'`) reported ANY failure as bad
      // credentials — so an unreachable API sent you hunting a password problem.
      // getErrorDisplay distinguishes network / server / credentials honestly.
      setFormError(getErrorDisplay(err).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 bg-white dark:bg-gray-900">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image src="/icon.png" alt="Aaramva Shikshya" width={56} height={56} className="object-contain mb-5" priority />
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

            {formError && (
              <p
                role="alert"
                className="rounded-lg bg-error-50 px-4 py-3 text-theme-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
              >
                {formError}
              </p>
            )}

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
        <div className="relative z-10 text-center flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="Aaramva Shikshya"
            width={220}
            height={56}
            className="object-contain mb-6 brightness-0 invert"
            priority
          />
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold text-white">Platform Admin</h2>
          </div>
          <p className="text-sm leading-relaxed text-gray-400 max-w-xs">
            Administration console. Manage schools, subscriptions, and platform-wide settings from one place.
          </p>
        </div>
      </div>
    </div>
  );
}
