'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, LogOut } from 'lucide-react';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { ChangePasswordCard } from '@/components/shared/change-password-card';

/**
 * POL-1 T4 — forced first-login password change. Lives in the (auth) group so
 * the school shell (whose effect redirects flagged users HERE) never wraps it —
 * no redirect loop. Changing the password revokes every session server-side,
 * so on success we sign out cleanly and send the user back to login. The
 * sign-out link below is the escape hatch: logout is never blocked by the flag.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { accessToken, isInitialized, user, logout } = useAuthStore();
  const { slug } = useTenantStore();

  useEffect(() => {
    if (isInitialized && !accessToken) {
      router.replace('/login');
    }
  }, [isInitialized, accessToken, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      </div>
    );
  }
  if (!accessToken) return null;

  const loginUrl = slug ? `/login?tenant=${encodeURIComponent(slug)}` : '/login';

  async function signOut() {
    try {
      await authApi.logout();
    } catch {
      // best-effort — the local session is cleared regardless
    }
    logout();
    router.replace(loginUrl);
  }

  async function handleChange(data: { currentPassword: string; newPassword: string }) {
    await authApi.changePassword(data);
    toast.success('Password changed — sign in with your new password.');
    // changePassword revoked all refresh tokens server-side; finish the logout
    // locally (and clear the dead cookie) instead of limping on a 15-min JWT.
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    logout();
    router.replace(loginUrl);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Image src="/logo.png" alt="Aaramva Shikshya" width={180} height={46} className="object-contain" priority />
        </div>
        {user?.mustChangePassword && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            You signed in with a temporary password. Set your own password to continue —
            the rest of the portal stays locked until you do.
          </div>
        )}
        <ChangePasswordCard
          onChange={handleChange}
          note="After changing, you will sign in again with your new password."
        />
        <button
          type="button"
          onClick={signOut}
          className="mx-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out instead
        </button>
      </div>
    </div>
  );
}
