import { SchoolShell } from '@/components/layout/school-shell';

export default function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SchoolShell>{children}</SchoolShell>;
}
