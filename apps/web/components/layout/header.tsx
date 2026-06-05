'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { authApi } from '@/lib/api/auth.api';

export function Header() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantStore((s) => s.clear);
  const tenantName = useTenantStore((s) => s.name);

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U';

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout();
      clearTenant();
      router.push('/login');
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100">
      <div>
        <span className="text-sm font-medium text-gray-700">{tenantName ?? ''}</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2 rounded-full bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-[#1A5C38] focus:ring-offset-2 cursor-pointer"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-[#1A5C38]/10 text-[#1A5C38] text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:block text-sm text-gray-700">
            {user ? `${user.firstName} ${user.lastName}` : 'User'}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem disabled>
            <User className="mr-2 h-3 w-3" />
            <span className="text-xs text-gray-500">
              {user?.role?.replace(/_/g, ' ')}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 cursor-pointer"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
