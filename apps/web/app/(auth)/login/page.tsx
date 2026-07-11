'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { homeRoute } from '@/lib/route-access';

const loginSchema = z.object({
  schoolSlug: z.string().min(1, 'School code is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { setTenant } = useTenantStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      schoolSlug:
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('tenant') ?? ''
          : '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setIsLoading(true);
    setTenant({ slug: values.schoolSlug.trim().toLowerCase() });
    try {
      const { data } = await authApi.login({ email: values.email, password: values.password });
      const token = data.data.accessToken;
      setAuth(token, data.data.user);
      setTenant(data.data.tenant);
      let role = data.data.user.role;
      try {
        const meRes = await authApi.me();
        setAuth(token, meRes.data.data);
        role = meRes.data.data.role;
      } catch {
        // non-critical
      }
      // Role-aware landing (D4): accountant → /finance, librarian → /library,
      // everyone else → /dashboard. Avoids dropping a role onto a page it can't see.
      router.push(homeRoute(role));
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
    <div className="flex w-full h-screen">
      {/* Left panel — form */}
      <div className="flex flex-col flex-1 items-center justify-center p-6 lg:w-1/2 bg-white dark:bg-gray-900">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <Image
              src="/logo.png"
              alt="Aaramva Shikshya"
              width={180}
              height={46}
              className="object-contain"
              priority
            />
          </div>

          <div className="mb-6 text-center">
            <h1 className="text-title-sm2 font-semibold text-gray-800 dark:text-white">
              School Login
            </h1>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* School Code */}
            <div>
              <label className="mb-2.5 block font-medium text-black dark:text-white">
                School Code <span className="text-error-500">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('schoolSlug')}
                  type="text"
                  placeholder="Enter your school code"
                  autoComplete="organization"
                  className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary focus-visible:shadow-none dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                />
                <span className="absolute right-4 top-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
              {errors.schoolSlug && (
                <p className="mt-1.5 text-theme-xs text-error-500">{errors.schoolSlug.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="mb-2.5 block font-medium text-black dark:text-white">
                Email <span className="text-error-500">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('email')}
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary focus-visible:shadow-none dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                />
                <span className="absolute right-4 top-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
              {errors.email && (
                <p className="mt-1.5 text-theme-xs text-error-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block font-medium text-black dark:text-white">
                  Password <span className="text-error-500">*</span>
                </label>
                <Link
                  href="/forgot-password"
                  className="text-theme-xs text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary focus-visible:shadow-none dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-theme-xs text-error-500">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-4 text-white text-theme-sm font-medium transition-colors hover:bg-brand-600 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>
      </div>

      {/* Right panel — decorative branding */}
      <div className="hidden lg:flex lg:w-1/2 h-full bg-brand-950 dark:bg-white/5 items-center justify-center relative overflow-hidden">
        {/* Decorative grid dots */}
        <div className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative z-10 flex flex-col items-center max-w-sm px-8 text-center">
          <Image
            src="/logo.png"
            alt="Aaramva Shikshya"
            width={200}
            height={50}
            className="object-contain mb-6 brightness-0 invert"
          />
          <h2 className="text-2xl font-semibold text-white mb-3">
            Aaramva Shikshya
          </h2>
          <p className="text-gray-400 text-theme-sm leading-relaxed">
            Simple school management for every school in Nepal.
            Manage students, attendance, exams, fees and more — all in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
