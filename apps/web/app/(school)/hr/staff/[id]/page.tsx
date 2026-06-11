'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera, Edit2, FileText, Loader2, Mail, Phone, User,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useStaffDetail,
  useUpdateStaff,
  useLeaveBalance,
  useStaffDocuments,
} from '@/lib/hooks/use-hr';
import { hrApi } from '@/lib/api/hr.api';
import { AmountDisplay } from '@/components/finance/amount-display';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { BsDate } from '@/components/shared/bs-date';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { StaffDocument } from '@/types/api.types';

type Tab = 'overview' | 'documents' | 'leave';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'leave', label: 'Leave' },
];

const DOCUMENT_TYPES = [
  'CV', 'CERTIFICATE', 'ID_PROOF', 'CONTRACT', 'PHOTO', 'TRANSCRIPT', 'OTHER',
];

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docType, setDocType] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const { data: staff, isLoading } = useStaffDetail(id);
  const updateStaff = useUpdateStaff(id);

  const { data: documents, isLoading: docsLoading } = useStaffDocuments(id);

  const { data: leaveBalance, isLoading: balanceLoading } = useLeaveBalance(
    staff?.userId ?? '',
  );

  // ── Photo upload ──────────────────────────────────────────────────────
  function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      await updateStaff.mutateAsync({ photoUrl: pendingPhoto });
      await queryClient.invalidateQueries({ queryKey: ['hr', 'staff', id] });
      await queryClient.invalidateQueries({ queryKey: ['hr', 'staff'] });
      toast.success('Profile photo updated');
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

  // ── Document upload ───────────────────────────────────────────────────
  function handleDocFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be less than 5 MB');
      return;
    }
    setDocFile(file);
  }

  async function handleDocUpload() {
    if (!docType || !docFile) {
      toast.error('Please select document type and file');
      return;
    }
    setDocUploading(true);
    try {
      // Read file as data URL and store in DB (same base64 pattern as student)
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          await hrApi.addStaffDocument(id, {
            documentType: docType,
            fileUrl: reader.result as string,
            fileName: docFile.name,
          });
          await queryClient.invalidateQueries({ queryKey: ['hr', 'staff-documents', id] });
          toast.success('Document uploaded');
          setDocDialogOpen(false);
          setDocType('');
          setDocFile(null);
        } catch {
          toast.error('Failed to upload document');
        } finally {
          setDocUploading(false);
        }
      };
      reader.readAsDataURL(docFile);
    } catch {
      toast.error('Failed to upload document');
      setDocUploading(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────
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
          {TABS.map((t) => (
            <Skeleton key={t.key} className="h-9 w-24" />
          ))}
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

  // ── Not found ─────────────────────────────────────────────────────────
  if (!staff) {
    return (
      <div className="text-center py-12 text-gray-500">
        Staff member not found.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={staff.fullName}
        description={`Employee ID: ${staff.employeeId}`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/hr/staff/${id}/edit`)}
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

      {/* ── Overview ──────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Hero card */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="p-5 sm:p-7 flex items-center gap-6">
              {/* Avatar with upload button */}
              <div className="relative shrink-0 group">
                <Avatar className="h-24 w-24 ring-2 ring-brand-100">
                  <AvatarImage
                    src={staff.photoUrl ?? undefined}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-2xl bg-brand-50 text-brand-500">
                    {initials(staff.fullName)}
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
                    {staff.fullName}
                  </h2>
                  <StatusBadge
                    status={staff.isActive ? 'ACTIVE' : 'INACTIVE'}
                  />
                </div>
                <p className="text-sm text-gray-500 font-mono mb-3">
                  {staff.employeeId}
                </p>

                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {staff.departmentName && (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-black dark:text-white">
                        Dept:
                      </span>
                      {staff.departmentName}
                    </span>
                  )}
                  {staff.designationTitle && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {staff.designationTitle}
                    </span>
                  )}
                  {staff.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {staff.phone}
                    </span>
                  )}
                  {staff.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {staff.email}
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end gap-1.5 text-sm text-right shrink-0">
                <span className="text-gray-400">Joined</span>
                <span className="font-medium">
                  <BsDate date={staff.joinDate} />
                </span>
                <span className="text-gray-400 mt-1">Employment</span>
                <span className="font-medium">
                  {staff.employmentType.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Two column: personal + employment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Personal details */}
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
                <h4 className="font-semibold text-black dark:text-white">
                  Personal Details
                </h4>
              </div>
              <div className="p-5 space-y-3">
                <InfoRow
                  label="Date of Birth"
                  value={
                    staff.dateOfBirth ? (
                      <BsDate date={staff.dateOfBirth} />
                    ) : null
                  }
                />
                <InfoRow
                  label="Gender"
                  value={
                    staff.gender
                      ? staff.gender.charAt(0) +
                        staff.gender.slice(1).toLowerCase()
                      : null
                  }
                />
                <InfoRow label="Phone" value={staff.phone} />
                <InfoRow label="Email" value={staff.email} />
                <InfoRow label="Address" value={staff.permanentAddress} />
              </div>
            </div>

            {/* Employment details */}
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
                <h4 className="font-semibold text-black dark:text-white">
                  Employment Details
                </h4>
              </div>
              <div className="p-5 space-y-3">
                <InfoRow
                  label="Role"
                  value={staff.role.replace(/_/g, ' ')}
                />
                <InfoRow label="Department" value={staff.departmentName} />
                <InfoRow
                  label="Designation"
                  value={staff.designationTitle}
                />
                <InfoRow
                  label="Employment Type"
                  value={staff.employmentType.replace(/_/g, ' ')}
                />
                <InfoRow
                  label="Join Date"
                  value={<BsDate date={staff.joinDate} />}
                />
                {staff.endDate && (
                  <InfoRow
                    label="End Date"
                    value={<BsDate date={staff.endDate} />}
                  />
                )}
                <InfoRow
                  label="Base Salary"
                  value={<AmountDisplay amount={staff.baseSalary} />}
                />
                <InfoRow label="PAN Number" value={staff.panNumber} />
                <InfoRow label="Bank Name" value={staff.bankName} />
                <InfoRow label="Bank Account" value={staff.bankAccount} />
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          {(staff.emergencyContactName || staff.emergencyContactPhone) && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
                <h4 className="font-semibold text-black dark:text-white">
                  Emergency Contact
                </h4>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow
                    label="Name"
                    value={staff.emergencyContactName}
                  />
                  <InfoRow
                    label="Phone"
                    value={staff.emergencyContactPhone}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Documents ─────────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-black dark:text-white">
                Documents
              </h4>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDocType('');
                  setDocFile(null);
                  setDocDialogOpen(true);
                }}
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Upload Document
              </Button>
            </div>
          </div>
          <div className="p-5">
            {docsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
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
                  {documents.map((doc: StaffDocument) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-gray-2 dark:hover:bg-meta-4"
                    >
                      <td className="py-2 text-black dark:text-white">
                        <Badge variant="outline" className="text-xs">
                          {doc.documentType}
                        </Badge>
                      </td>
                      <td className="py-2 text-gray-500">
                        {doc.fileName ?? '—'}
                      </td>
                      <td className="py-2 text-gray-500">
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
              <div className="text-center py-8">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">
                  No documents uploaded yet.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Leave ──────────────────────────────────────────────────────── */}
      {activeTab === 'leave' && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
            <h4 className="font-semibold text-black dark:text-white">
              Leave Balance
            </h4>
          </div>
          <div className="p-5">
            {balanceLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : leaveBalance && leaveBalance.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-3 text-left font-semibold">Leave Type</th>
                    <th className="pb-3 text-right font-semibold">Entitlement</th>
                    <th className="pb-3 text-right font-semibold">Used</th>
                    <th className="pb-3 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {leaveBalance.map((lb) => (
                    <tr
                      key={lb.leaveTypeId}
                      className="hover:bg-gray-2 dark:hover:bg-meta-4"
                    >
                      <td className="py-3 font-medium text-black dark:text-white">
                        {lb.leaveTypeName}
                      </td>
                      <td className="py-3 text-right text-gray-500">
                        {lb.entitlement}
                      </td>
                      <td className="py-3 text-right text-gray-500">
                        {lb.used}
                      </td>
                      <td
                        className={cn(
                          'py-3 text-right font-semibold',
                          lb.balance <= 0
                            ? 'text-red-600'
                            : lb.balance < 3
                              ? 'text-orange-500'
                              : 'text-green-600',
                        )}
                      >
                        {lb.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                No leave balance data available.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Photo upload dialog ────────────────────────────────────────── */}
      <Dialog
        open={photoDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPhotoDialogOpen(false);
            setPendingPhoto(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Profile Photo</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <Avatar className="h-28 w-28 ring-2 ring-brand-100">
                <AvatarImage
                  src={pendingPhoto ?? staff.photoUrl ?? undefined}
                  className="object-cover"
                />
                <AvatarFallback className="text-3xl bg-brand-50 text-brand-500">
                  {initials(staff.fullName)}
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
              onChange={handlePhotoFileChange}
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
              onClick={() => {
                setPhotoDialogOpen(false);
                setPendingPhoto(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handlePhotoSave}
              disabled={!pendingPhoto || photoLoading}
            >
              {photoLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Document upload dialog ─────────────────────────────────────── */}
      <Dialog
        open={docDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDocDialogOpen(false);
            setDocType('');
            setDocFile(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Document Type *</Label>
              <div className="flex flex-wrap gap-2">
                {DOCUMENT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDocType(type)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-full border transition-colors',
                      docType === type
                        ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400',
                    )}
                  >
                    {type.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>File *</Label>
              <input
                ref={docInputRef}
                type="file"
                className="hidden"
                onChange={handleDocFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => docInputRef.current?.click()}
                className="w-full"
                disabled={!docType}
              >
                <FileText className="h-4 w-4 mr-2" />
                {docFile ? docFile.name : 'Choose file'}
              </Button>
              {docFile && (
                <p className="text-xs text-gray-400">
                  {(docFile.size / 1024).toFixed(0)} KB · {docFile.type || 'unknown type'}
                </p>
              )}
              <p className="text-xs text-gray-400">Max 5 MB</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDocDialogOpen(false);
                setDocType('');
                setDocFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleDocUpload}
              disabled={!docType || !docFile || docUploading}
            >
              {docUploading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Upload
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
      <span className="font-medium text-right text-black dark:text-white">
        {value ?? '—'}
      </span>
    </div>
  );
}
