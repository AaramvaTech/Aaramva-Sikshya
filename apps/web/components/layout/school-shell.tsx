'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuthStore } from '@/store/auth.store';
import { Loader2 } from 'lucide-react';

export function SchoolShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized && !accessToken) {
      router.replace('/login');
    }
  }, [isInitialized, accessToken, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAF9]">
        <Loader2 className="h-6 w-6 text-[#1A5C38] animate-spin" />
      </div>
    );
  }

  if (!accessToken) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAF9]">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
