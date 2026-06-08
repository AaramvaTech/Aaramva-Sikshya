'use client';

import { useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useStudent } from '@/lib/hooks/use-students';
import { studentsApi } from '@/lib/api/students.api';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { EnrollmentForm } from '@/components/students/enrollment-form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { StudentDocument } from '@/types/api.types';

type Tab = 'overview' | 'enrollment' | 'documents';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'enrollment', label: 'Enrollment' },
  { key: 'documents', label: 'Documents' },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: student, isLoading } = useStudent(id);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['student-documents', id],
    queryFn: () => studentsApi.getDocuments(id).then((r) => r.data.data),
    enabled: activeTab === 'documents' && !!id,
  });

  if (isLoading) {
    return (
      <div>
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TABS.map((t) => (
            <Skeleton key={t.key} className="h-9 w-24" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-[360px] rounded-lg" />
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-[200px] rounded-lg" />
            <Skeleton className="h-[140px] rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12 text-gray-500">Student not found.</div>
    );
  }

  const hasCurrentEnrollment = !!student.className;
  const validGuardians = student.guardians.filter((g) => g.id);

  return (
    <div>
      <PageHeader
        title={student.fullName}
        description={`Student ID: ${student.studentId}`}
        action={
          <Button
            variant="outline"
            onClick={() => router.push(`/students/${id}/edit`)}
          >
            Edit
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left column: photo + key facts */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6 flex flex-col items-center text-center gap-2">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={student.photoUrl ?? undefined} />
                  <AvatarFallback className="text-2xl bg-brand-50 text-brand-500">
                    {initials(student.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-gray-900">{student.fullName}</p>
                  <p className="text-xs text-gray-400">{student.studentId}</p>
                </div>
                <StatusBadge status={student.status} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-2.5">
                <InfoRow
                  label="Gender"
                  value={
                    student.gender.charAt(0) + student.gender.slice(1).toLowerCase()
                  }
                />
                <InfoRow
                  label="Date of Birth"
                  value={<BsDate date={student.dateOfBirth} />}
                />
                {student.bloodGroup && (
                  <InfoRow label="Blood Group" value={student.bloodGroup} />
                )}
                {student.religion && (
                  <InfoRow label="Religion" value={student.religion} />
                )}
                {student.phone && (
                  <InfoRow label="Phone" value={student.phone} />
                )}
                {student.email && (
                  <InfoRow label="Email" value={student.email} />
                )}
                {student.permanentAddress && Object.keys(student.permanentAddress).length > 0 && (
                  <InfoRow
                    label="Address"
                    value={Object.values(student.permanentAddress).filter(Boolean).join(', ')}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: guardians + enrollment */}
          <div className="col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Guardians</CardTitle>
              </CardHeader>
              <CardContent>
                {validGuardians.length === 0 ? (
                  <p className="text-sm text-gray-400">No guardians on record.</p>
                ) : (
                  <div className="grid gap-3">
                    {validGuardians.map((g) => (
                      <div
                        key={g.id}
                        className="p-3 rounded-lg border border-gray-100 bg-gray-50/60"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm">
                            {g.firstName} {g.lastName}
                          </p>
                          {g.isPrimary && (
                            <Badge
                              variant="outline"
                              className="text-xs border-brand-500/30 text-brand-500"
                            >
                              Primary
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {g.relation} · {g.phone}
                          {g.email && ` · ${g.email}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {student.className && (
              <Card>
                <CardHeader>
                  <CardTitle>Current Enrollment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow label="Class" value={student.className} />
                    {student.sectionName && (
                      <InfoRow label="Section" value={student.sectionName} />
                    )}
                    {student.rollNumber && (
                      <InfoRow label="Roll Number" value={String(student.rollNumber)} />
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── Enrollment ────────────────────────────────────────────── */}
      {activeTab === 'enrollment' && (
        <div className="space-y-6">
          {!hasCurrentEnrollment ? (
            <Card>
              <CardHeader>
                <CardTitle>Enroll in a Class</CardTitle>
              </CardHeader>
              <CardContent>
                <EnrollmentForm studentId={id} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-gray-400">
              Student is currently enrolled in {student.className}
              {student.sectionName ? ` — ${student.sectionName}` : ''}.
            </p>
          )}
        </div>
      )}

      {/* ── Documents ─────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Documents</CardTitle>
              <Button size="sm" variant="outline">
                Upload Document
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {docsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : documents && documents.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500 text-xs uppercase tracking-wide">
                    <th className="pb-2 text-left font-semibold">Type</th>
                    <th className="pb-2 text-left font-semibold">File Name</th>
                    <th className="pb-2 text-left font-semibold">Uploaded On</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc: StudentDocument) => (
                    <tr key={doc.id} className="border-b last:border-0">
                      <td className="py-2">{doc.documentType}</td>
                      <td className="py-2">{doc.fileName}</td>
                      <td className="py-2">
                        <BsDate date={doc.uploadedAt} />
                      </td>
                      <td className="py-2 text-right">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-500 hover:underline text-xs"
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                No documents uploaded yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
