import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-white dark:bg-gray-950 px-4">
      <Image
        src="/logo.png"
        alt="Aaramva Shikshya"
        width={180}
        height={46}
        className="object-contain dark:brightness-0 dark:invert"
        priority
      />
      <div className="text-center">
        <p className="text-8xl font-bold text-brand-500">404</p>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">Page not found</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
