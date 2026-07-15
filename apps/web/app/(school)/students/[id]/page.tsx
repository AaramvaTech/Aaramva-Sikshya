'use client';

import { useRef, useState, type ReactNode, type ElementType } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  Camera,
  CalendarDays,
  Edit2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  TrendingUp,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStudent, useAcademicYears, useCurrentAcademicYear } from '@/lib/hooks/use-students';
import { useStudentAttendanceSummary } from '@/lib/hooks/use-attendance';
import { useStudentLedger } from '@/lib/hooks/use-finance';
import { studentsApi } from '@/lib/api/students.api';
import { uploadFile } from '@/lib/upload';
import { useFileUrl } from '@/lib/hooks/use-file-url';
import { useStudentAssignments, useSetStudentAssignment } from '@/lib/hooks/use-finance';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
import { AmountDisplay } from '@/components/finance/amount-display';
import { EnrollmentForm } from '@/components/students/enrollment-form';
import { LoginAccountsCard } from '@/components/students/login-accounts-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { FeeAssignment, StudentDocument } from '@/types/api.types';

type Tab = 'overview' | 'enrollment' | 'documents' | 'fees';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'enrollment', label: 'Enrollment' },
  { key: 'documents', label: 'Documents' },
  { key: 'fees', label: 'Fees' },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 py-2 border-b border-stroke/50 dark:border-strokedark/50 last:border-0 text-sm">
      <span className="text-gray-500 shrink-0 text-xs uppercase tracking-wide font-medium">{label}</span>
      <span className="font-medium text-right text-black dark:text-white">{value}</span>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'blue',
  loading = false,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: 'blue' | 'green' | 'orange' | 'red';
  loading?: boolean;
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20',
  };
  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-4 flex items-center gap-4">
      <div className={cn('flex-shrink-0 p-2.5 rounded-lg', colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <p className="text-xl font-bold text-black dark:text-white leading-tight">{value}</p>
        )}
        {sub && !loading && (
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── Overview Stats ────────────────────────────────────────────────────────────

function OverviewStats({ studentId, academicYearId }: { studentId: string; academicYearId: string }) {
  const { data: attendance, isLoading: attendanceLoading } = useStudentAttendanceSummary(
    studentId,
    academicYearId || undefined,
  );
  const { data: ledger, isLoading: ledgerLoading } = useStudentLedger(studentId, academicYearId);

  const attendanceRate = attendance?.attendancePercent ?? null;
  const presentDays = attendance?.present ?? null;
  const totalDays = attendance?.totalWorkingDays ?? null;

  const totalBalance = ledger?.summary?.totalBalance ?? null;
  const totalPaid = ledger?.summary?.totalPaid ?? null;

  const attendanceColor: 'green' | 'orange' | 'red' =
    attendanceRate === null ? 'green'
    : attendanceRate >= 75 ? 'green'
    : attendanceRate >= 60 ? 'orange'
    : 'red';

  if (!academicYearId) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={TrendingUp}
        label="Attendance Rate"
        value={attendanceRate !== null ? `${attendanceRate.toFixed(1)}%` : '—'}
        sub="This academic year"
        color={attendanceColor}
        loading={attendanceLoading}
      />
      <StatCard
        icon={CalendarDays}
        label="Present Days"
        value={presentDays !== null ? presentDays : '—'}
        sub={totalDays !== null ? `of ${totalDays} working days` : undefined}
        color="blue"
        loading={attendanceLoading}
      />
      <StatCard
        icon={Wallet}
        label="Fees Paid"
        value={
          totalPaid !== null ? (
            <AmountDisplay amount={totalPaid} className="text-xl font-bold" />
          ) : '—'
        }
        sub="Total payments received"
        color="green"
        loading={ledgerLoading}
      />
      <StatCard
        icon={Activity}
        label="Outstanding Balance"
        value={
          totalBalance !== null ? (
            <AmountDisplay amount={totalBalance} className="text-xl font-bold" />
          ) : '—'
        }
        sub="Amount still due"
        color={totalBalance !== null && totalBalance > 0 ? 'orange' : 'green'}
        loading={ledgerLoading}
      />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: student, isLoading } = useStudent(id);
  const { data: currentYear } = useCurrentAcademicYear();

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['student-documents', id],
    queryFn: () => studentsApi.getDocuments(id).then((r) => r.data.data),
    enabled: activeTab === 'documents' && !!id,
  });

  // FILE-1: storage keys resolve to presigned GETs; legacy values pass through.
  const resolvedPhotoUrl = useFileUrl(student?.photoUrl);

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
    setPendingPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPendingPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handlePhotoSave() {
    if (!pendingPhoto || !pendingPhotoFile) return;
    setPhotoLoading(true);
    try {
      // FILE-1: presign→PUT→photoFileKey; base64 only if storage is disabled.
      const uploaded = await uploadFile(pendingPhotoFile, 'student-photo');
      await studentsApi.update(
        id,
        uploaded.mode === 'key'
          ? { photoFileKey: uploaded.key }
          : { photoUrl: uploaded.dataUrl },
      );
      await queryClient.invalidateQueries({ queryKey: ['student', id] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Photo updated');
      setPhotoDialogOpen(false);
      setPendingPhoto(null);
      setPendingPhotoFile(null);
    } catch {
      toast.error('Failed to update photo');
    } finally {
      setPhotoLoading(false);
    }
  }

  function openPhotoDialog() {
    setPendingPhoto(null);
    setPendingPhotoFile(null);
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
          <Skeleton className="h-44 rounded-lg" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
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
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark overflow-hidden">
            {/* Color stripe */}
            <div className="h-2 bg-gradient-to-r from-brand-400 to-brand-600" />

            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-5">
                {/* Avatar with upload */}
                <div className="relative shrink-0 group mt-1">
                  <Avatar className="h-20 w-20 ring-2 ring-brand-100 ring-offset-2">
                    <AvatarImage src={resolvedPhotoUrl} className="object-cover" />
                    <AvatarFallback className="text-xl bg-brand-50 text-brand-500 font-bold">
                      {initials(student.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={openPhotoDialog}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Change photo"
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-1.5">
                    <h2 className="text-xl font-bold text-black dark:text-white">
                      {student.fullName}
                    </h2>
                    <StatusBadge status={student.status} />
                  </div>

                  <p className="text-xs text-gray-400 font-mono mb-3">{student.studentId}</p>

                  {/* Info chips */}
                  <div className="flex flex-wrap gap-2">
                    {student.className && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <BookOpen className="h-3 w-3" />
                        {student.className}
                        {student.sectionName ? ` · ${student.sectionName}` : ''}
                        {student.rollNumber ? ` · Roll ${student.rollNumber}` : ''}
                      </span>
                    )}
                    {primaryGuardian && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <User className="h-3 w-3" />
                        {primaryGuardian.firstName} {primaryGuardian.lastName}
                        <span className="text-gray-400 capitalize">({primaryGuardian.relation.toLowerCase()})</span>
                      </span>
                    )}
                    {student.phone && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <Phone className="h-3 w-3" />
                        {student.phone}
                      </span>
                    )}
                    {student.email && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <Mail className="h-3 w-3" />
                        {student.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right column: dates + quick actions */}
                <div className="hidden md:flex flex-col items-end gap-3 shrink-0">
                  <div className="text-right text-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Admitted</p>
                    <p className="font-medium text-black dark:text-white mt-0.5">
                      <BsDate date={student.admissionDate} />
                    </p>
                    {student.academicYear && (
                      <>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mt-2">Academic Year</p>
                        <p className="font-medium text-black dark:text-white mt-0.5">{student.academicYear}</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setActiveTab('fees')}
                    >
                      View Fees
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setActiveTab('enrollment')}
                    >
                      Enrollment
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <OverviewStats studentId={id} academicYearId={currentYear?.id ?? ''} />

          {/* Two column: personal info + guardians */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Personal details */}
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-3.5 dark:border-strokedark">
                <h4 className="font-semibold text-sm text-black dark:text-white">Personal Details</h4>
              </div>
              <div className="px-5 py-3">
                <InfoRow label="Date of Birth" value={<BsDate date={student.dateOfBirth} />} />
                <InfoRow
                  label="Gender"
                  value={student.gender.charAt(0) + student.gender.slice(1).toLowerCase()}
                />
                {student.bloodGroup && <InfoRow label="Blood Group" value={
                  <span className="font-bold text-red-600">{student.bloodGroup}</span>
                } />}
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
              <div className="border-b border-stroke px-5 py-3.5 dark:border-strokedark flex items-center justify-between">
                <h4 className="font-semibold text-sm text-black dark:text-white">Guardians</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-brand-500 h-7 text-xs"
                  onClick={() => router.push(`/students/${id}/edit`)}
                >
                  Edit
                </Button>
              </div>
              <div className="p-4">
                {validGuardians.length === 0 ? (
                  <div className="text-center py-6">
                    <User className="h-8 w-8 text-gray-200 mx-auto mb-2" />
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
                  <div className="space-y-2.5">
                    {validGuardians.map((g) => (
                      <div
                        key={g.id}
                        className="p-3.5 rounded-lg border border-gray-100 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-800/30"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-sm text-black dark:text-white">
                              {g.firstName} {g.lastName}
                            </p>
                            <p className="text-xs text-gray-500 capitalize mt-0.5">
                              {g.relation.toLowerCase()}
                            </p>
                          </div>
                          {g.isPrimary && (
                            <Badge
                              variant="outline"
                              className="text-xs border-brand-500/30 bg-brand-50 text-brand-600 shrink-0"
                            >
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-gray-400" />
                            {g.phone}
                          </span>
                          {g.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-gray-400" />
                              {g.email}
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

          <LoginAccountsCard
            studentId={id}
            studentUserId={student.userId}
            studentName={student.fullName}
            studentEmail={student.email}
            guardians={validGuardians}
          />
        </div>
      )}

      {/* ── Enrollment ────────────────────────────────────────────── */}
      {activeTab === 'enrollment' && (
        <div className="space-y-4">
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

      {/* ── Fees ──────────────────────────────────────────────────── */}
      {activeTab === 'fees' && (
        <FeesTab studentId={id} />
      )}

      {/* Photo upload dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={(open) => { if (!open) { setPhotoDialogOpen(false); setPendingPhoto(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Profile Photo</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <Avatar className="h-28 w-28 ring-2 ring-brand-100">
                <AvatarImage
                  src={pendingPhoto ?? resolvedPhotoUrl}
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

// ─── Fee Assignment Row ────────────────────────────────────────────────────────

function AssignmentRow({
  item,
  studentId,
  academicYearId,
}: {
  item: FeeAssignment;
  studentId: string;
  academicYearId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>(
    item.customAmount != null ? String(item.customAmount) : '',
  );
  const [discountPercent, setDiscountPercent] = useState<string>(
    item.discountPercent > 0 ? String(item.discountPercent) : '',
  );
  const [discountReason, setDiscountReason] = useState(item.discountReason ?? '');
  const [isWaived, setIsWaived] = useState(item.isWaived);
  const setAssignment = useSetStudentAssignment();

  function openEdit() {
    setCustomAmount(item.customAmount != null ? String(item.customAmount) : '');
    setDiscountPercent(item.discountPercent > 0 ? String(item.discountPercent) : '');
    setDiscountReason(item.discountReason ?? '');
    setIsWaived(item.isWaived);
    setEditing(true);
  }

  async function save() {
    try {
      await setAssignment.mutateAsync({
        studentId,
        data: {
          feeStructureItemId: item.feeStructureItemId,
          academicYearId,
          customAmount: customAmount ? Number(customAmount) : undefined,
          discountPercent: discountPercent ? Number(discountPercent) : 0,
          discountReason: discountReason || undefined,
          isWaived,
        },
      });
      toast.success('Fee assignment updated');
      setEditing(false);
    } catch {
      toast.error('Failed to update fee assignment');
    }
  }

  return (
    <div className="border-b border-stroke dark:border-strokedark last:border-0">
      <div className="flex items-center justify-between py-3 px-5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-black dark:text-white">{item.feeCategoryName}</p>
          <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
            <span>Original: <AmountDisplay amount={item.originalAmount} className="inline" /></span>
            {item.isWaived && <Badge className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700 border-0">Waived</Badge>}
            {item.discountPercent > 0 && (
              <span className="text-orange-500">{item.discountPercent}% off</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AmountDisplay
            amount={item.effectiveAmount}
            className={cn(
              'font-semibold text-sm',
              item.isWaived ? 'line-through text-gray-400' : 'text-black dark:text-white',
            )}
          />
          <button onClick={openEdit} className="text-gray-400 hover:text-brand-500 p-1">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-gray-50 dark:bg-white/5 px-5 py-4 space-y-3 border-t border-stroke dark:border-strokedark">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Custom Amount (Rs.)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={`Default: ${item.originalAmount}`}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-xs text-gray-400">Leave blank to use structure amount</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Discount %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="0"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Discount Reason</Label>
            <Input
              placeholder="e.g. Staff child, merit scholarship"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isWaived}
              onCheckedChange={(v) => setIsWaived(!!v)}
              id={`waived-${item.feeStructureItemId}`}
            />
            <Label htmlFor={`waived-${item.feeStructureItemId}`} className="text-xs cursor-pointer">
              Waive this fee entirely
            </Label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={save}
              disabled={setAssignment.isPending}
            >
              {setAssignment.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fees Tab ──────────────────────────────────────────────────────────────────

function FeesTab({ studentId }: { studentId: string }) {
  const { data: currentYear } = useCurrentAcademicYear();
  const { data: allYears } = useAcademicYears();
  const [selectedYearId, setSelectedYearId] = useState('');

  const academicYearId = selectedYearId || currentYear?.id || '';

  const { data: assignments, isLoading } = useStudentAssignments(studentId, academicYearId);

  const total = assignments?.reduce((sum, a) => sum + (a.isWaived ? 0 : a.effectiveAmount), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={academicYearId} onValueChange={(v) => setSelectedYearId(v ?? '')}>
          <SelectTrigger className="w-48">
            <span className={academicYearId ? '' : 'text-muted-foreground'}>
              {academicYearId
                ? (() => {
                    const y = allYears?.find((y) => y.id === academicYearId);
                    return y ? `${y.name}${y.isCurrent ? ' (Current)' : ''}` : 'Loading…';
                  })()
                : 'Select year'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {allYears?.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name} {y.isCurrent && '(Current)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400">Override amounts are per-student per-year</p>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-5 py-4 dark:border-strokedark flex items-center justify-between">
          <h4 className="font-semibold text-black dark:text-white">Fee Assignments</h4>
          {!isLoading && assignments && assignments.length > 0 && (
            <div className="text-sm text-gray-500">
              Total payable:{' '}
              <AmountDisplay amount={total} className="font-semibold text-black dark:text-white" />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !assignments || assignments.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">
              No fee structure found for this student in the selected academic year.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Make sure the student is enrolled in a class that has a fee structure.
            </p>
          </div>
        ) : (
          <div>
            {assignments.map((item) => (
              <AssignmentRow
                key={item.feeStructureItemId}
                item={item}
                studentId={studentId}
                academicYearId={academicYearId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
