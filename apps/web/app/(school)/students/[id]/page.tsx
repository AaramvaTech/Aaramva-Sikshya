'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Edit2, Loader2, Mail, Phone, User } from 'lucide-react';
import { toast } from 'sonner';
import { useStudent } from '@/lib/hooks/use-students';
import { studentsApi } from '@/lib/api/students.api';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { EnrollmentForm } from '@/components/students/enrollment-form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: student, isLoading } = useStudent(id);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['student-documents', id],
    queryFn: () => studentsApi.getDocuments(id).then((r) => r.data.data),
    enabled: activeTab === 'documents' && !!id,
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setPendingPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handlePhotoSave() {
    if (!pendingPhoto) return;
    setPhotoLoading(true);
    try {
      await studentsApi.update(id, { photoUrl: pendingPhoto });
      await queryClient.invalidateQueries({ queryKey: ['student', id] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Photo updated');
      setPhotoDialogOpen(false);
      setPendingPhoto(null);
    } catch {
      toast.error('Failed to update photo');
    } finally {
      setPhotoLoading(false);
    }
  }

  function openPhotoDialog() {
    setPendingPhoto(null);
    setPhotoDialogOpen(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TABS.map((t) => <Skeleton key={t.key} className="h-9 w-24" />)}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!student) {
    return <div className="text-center py-12 text-gray-500">Student not found.</div>;
  }

  const validGuardians = student.guardians.filter((g) => g.id);
  const primaryGuardian = validGuardians.find((g) => g.isPrimary) ?? validGuardians[0];

  return (
    <div>
      <PageHeader
        title={student.fullName}
        description={`Student ID: ${student.studentId}`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/students/${id}/edit`)}
          >
            <Edit2 className="h-4 w-4 mr-1.5" />
            Edit Profile
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="flex border-b border-stroke dark:border-strokedark mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setShowEnrollForm(false); }}
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
        <div className="space-y-5">
          {/* Hero card */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="p-5 sm:p-7 flex items-center gap-6">
              {/* Avatar with upload button */}
              <div className="relative shrink-0 group">
                <Avatar className="h-24 w-24 ring-2 ring-brand-100">
                  <AvatarImage src={student.photoUrl ?? undefined} className="object-cover" />
                  <AvatarFallback className="text-2xl bg-brand-50 text-brand-500">
                    {initials(student.fullName)}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={openPhotoDialog}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Change photo"
                >
                  <Camera className="h-6 w-6 text-white" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-black dark:text-white truncate">
                    {student.fullName}
                  </h2>
                  <StatusBadge status={student.status} />
                </div>
                <p className="text-sm text-gray-500 font-mono mb-3">{student.studentId}</p>

                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {student.className && (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-black dark:text-white">Class:</span>
                      {student.className}{student.sectionName ? ` — ${student.sectionName}` : ''}
                      {student.rollNumber ? ` · Roll ${student.rollNumber}` : ''}
                    </span>
                  )}
                  {primaryGuardian && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {primaryGuardian.firstName} {primaryGuardian.lastName}
                      <span className="text-gray-400">({primaryGuardian.relation})</span>
                    </span>
                  )}
                  {student.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {student.phone}
                    </span>
                  )}
                  {student.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {student.email}
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end gap-1.5 text-sm text-right shrink-0">
                <span className="text-gray-400">Admitted</span>
                <span className="font-medium"><BsDate date={student.admissionDate} /></span>
                {student.academicYear && (
                  <>
                    <span className="text-gray-400 mt-1">Academic Year</span>
                    <span className="font-medium">{student.academicYear}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Two column: personal info + guardians */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Personal details */}
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
                <h4 className="font-semibold text-black dark:text-white">Personal Details</h4>
              </div>
              <div className="p-5 space-y-3">
                <InfoRow label="Date of Birth" value={<BsDate date={student.dateOfBirth} />} />
                <InfoRow
                  label="Gender"
                  value={student.gender.charAt(0) + student.gender.slice(1).toLowerCase()}
                />
                {student.bloodGroup && <InfoRow label="Blood Group" value={student.bloodGroup} />}
                {student.religion && <InfoRow label="Religion" value={student.religion} />}
                {student.ethnicity && <InfoRow label="Ethnicity" value={student.ethnicity} />}
                {student.motherTongue && <InfoRow label="Mother Tongue" value={student.motherTongue} />}
                <InfoRow label="Nationality" value={student.nationality} />
                {student.previousSchool && (
                  <InfoRow label="Previous School" value={student.previousSchool} />
                )}
                {student.permanentAddress && Object.values(student.permanentAddress).some(Boolean) && (
                  <InfoRow
                    label="Address"
                    value={Object.values(student.permanentAddress).filter(Boolean).join(', ')}
                  />
                )}
              </div>
            </div>

            {/* Guardians */}
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark flex items-center justify-between">
                <h4 className="font-semibold text-black dark:text-white">Guardians</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-brand-500 h-7 text-xs"
                  onClick={() => router.push(`/students/${id}/edit`)}
                >
                  Edit
                </Button>
              </div>
              <div className="p-5">
                {validGuardians.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-400 mb-3">No guardians on record</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/students/${id}/edit`)}
                    >
                      Add Guardian
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {validGuardians.map((g) => (
                      <div
                        key={g.id}
                        className="p-3.5 rounded-lg border border-gray-100 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-800/30"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <div>
                            <p className="font-medium text-sm text-black dark:text-white">
                              {g.firstName} {g.lastName}
                            </p>
                            <p className="text-xs text-gray-500 capitalize mt-0.5">
                              {g.relation.toLowerCase()}
                            </p>
                          </div>
                          {g.isPrimary && (
                            <Badge
                              variant="outline"
                              className="text-xs border-brand-500/30 text-brand-500 shrink-0"
                            >
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />{g.phone}
                          </span>
                          {g.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />{g.email}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Enrollment ────────────────────────────────────────────── */}
      {activeTab === 'enrollment' && (
        <div className="space-y-4">
          {/* Current enrollment summary */}
          {student.className ? (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark flex items-center justify-between">
                <h4 className="font-semibold text-black dark:text-white">Current Enrollment</h4>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-brand-500 border-brand-500/40 hover:bg-brand-50 h-8"
                  onClick={() => setShowEnrollForm((v) => !v)}
                >
                  {showEnrollForm ? 'Cancel' : 'Change Enrollment'}
                </Button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <InfoRow label="Class" value={student.className} />
                  {student.sectionName && <InfoRow label="Section" value={student.sectionName} />}
                  {student.rollNumber && <InfoRow label="Roll Number" value={String(student.rollNumber)} />}
                  {student.academicYear && <InfoRow label="Academic Year" value={student.academicYear} />}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-5">
              <p className="text-sm text-gray-400 mb-4">This student is not currently enrolled in any class.</p>
              <Button
                size="sm"
                className="bg-brand-500 hover:bg-brand-600 text-white"
                onClick={() => setShowEnrollForm(true)}
              >
                Enroll Student
              </Button>
            </div>
          )}

          {/* Enrollment form (shown when changing or first enrollment) */}
          {(showEnrollForm || !student.className) && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
                <h4 className="font-semibold text-black dark:text-white">
                  {student.className ? 'Change Enrollment' : 'Enroll in a Class'}
                </h4>
              </div>
              <div className="p-5">
                <EnrollmentForm
                  studentId={id}
                  onSuccess={() => {
                    setShowEnrollForm(false);
                    queryClient.invalidateQueries({ queryKey: ['student', id] });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Documents ─────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-black dark:text-white">Documents</h4>
              <Button size="sm" variant="outline">Upload Document</Button>
            </div>
          </div>
          <div className="p-5">
            {docsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : documents && documents.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-2 text-left font-semibold">Type</th>
                    <th className="pb-2 text-left font-semibold">File Name</th>
                    <th className="pb-2 text-left font-semibold">Uploaded On</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {documents.map((doc: StudentDocument) => (
                    <tr key={doc.id} className="hover:bg-gray-2 dark:hover:bg-meta-4">
                      <td className="py-2 text-black dark:text-white">{doc.documentType}</td>
                      <td className="py-2 text-gray-500">{doc.fileName}</td>
                      <td className="py-2 text-gray-500"><BsDate date={doc.uploadedAt} /></td>
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
              <p className="text-sm text-gray-400 text-center py-8">No documents uploaded yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Photo upload dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={(open) => { if (!open) { setPhotoDialogOpen(false); setPendingPhoto(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Profile Photo</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            {/* Preview */}
            <div className="relative">
              <Avatar className="h-28 w-28 ring-2 ring-brand-100">
                <AvatarImage
                  src={pendingPhoto ?? student.photoUrl ?? undefined}
                  className="object-cover"
                />
                <AvatarFallback className="text-3xl bg-brand-50 text-brand-500">
                  {initials(student.fullName)}
                </AvatarFallback>
              </Avatar>
              {pendingPhoto && (
                <span className="absolute -top-1 -right-1 text-xs bg-green-500 text-white rounded-full px-1.5 py-0.5">
                  New
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Camera className="h-4 w-4 mr-2" />
              {pendingPhoto ? 'Change selection' : 'Select photo'}
            </Button>
            <p className="text-xs text-gray-400 -mt-2">Max 2 MB · JPG, PNG, WEBP</p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setPhotoDialogOpen(false); setPendingPhoto(null); }}
            >
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handlePhotoSave}
              disabled={!pendingPhoto || photoLoading}
            >
              {photoLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-right text-black dark:text-white">{value}</span>
    </div>
  );
}
