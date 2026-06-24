# Frontend Session 12 — Student Module UI
# Aaramva Shikshya

## Prerequisites
- Session 11 complete — Next.js foundation, auth, shell layout, shared components working
- Backend running on port 3001
- Login works, dashboard loads with stat cards
- Shared components exist: DataTable, BsDate, StatusBadge, PageHeader, EmptyState, ConfirmDialog

## Goal
Build the complete Student module UI:
- Student list page with search, filters, pagination
- Student admission form (multi-step)
- Student profile page (full detail view)
- Enrollment UI (assign to class + section)
- Document upload

After this session, a school admin can admit a new student,
view the full list, open a student's profile, and enroll them in a class.

---

## API functions to create first

File: `lib/api/students.api.ts`

```typescript
import api from '../api';
import type { ApiResponse, PaginatedResponse } from '../types/api.types';

export const studentsApi = {
  // List
  list: (params: {
    page?: number; limit?: number; search?: string;
    classId?: string; sectionId?: string; status?: string;
  }) => api.get<ApiResponse<PaginatedResponse<StudentSummary>>>('/students', { params }),

  // Detail
  getById: (id: string) => api.get<ApiResponse<StudentDetail>>(`/students/${id}`),

  // Create
  create: (data: CreateStudentData) =>
    api.post<ApiResponse<StudentDetail>>('/students', data),

  // Update
  update: (id: string, data: Partial<CreateStudentData>) =>
    api.patch<ApiResponse<StudentDetail>>(`/students/${id}`, data),

  // Soft delete
  delete: (id: string) => api.delete(`/students/${id}`),

  // Enroll
  enroll: (id: string, data: EnrollStudentData) =>
    api.post<ApiResponse<Enrollment>>(`/students/${id}/enroll`, data),

  // Get presigned upload URL
  getUploadUrl: (id: string, data: { fileName: string; documentType: string; contentType: string }) =>
    api.post<ApiResponse<{ presignedUrl: string; fileUrl: string }>>(`/students/${id}/documents/presign`, data),

  // Confirm upload
  confirmUpload: (id: string, data: { fileUrl: string; fileName: string; documentType: string }) =>
    api.post(`/students/${id}/documents/confirm`, data),

  // List documents
  getDocuments: (id: string) =>
    api.get<ApiResponse<StudentDocument[]>>(`/students/${id}/documents`),
};

// Supporting API calls needed by student forms
export const classesApi = {
  list: () => api.get<ApiResponse<ClassWithSections[]>>('/classes'),
};

export const academicYearsApi = {
  getCurrent: () => api.get<ApiResponse<AcademicYear>>('/academic-years/current'),
  list: () => api.get<ApiResponse<AcademicYear[]>>('/academic-years'),
};
```

---

## Types to add to api.types.ts

```typescript
export interface StudentSummary {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth: { ad: string; bs: string };
  status: 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'GRADUATED';
  currentEnrollment?: {
    className: string;
    sectionName: string;
    rollNumber: number | null;
  };
  photoUrl: string | null;
}

export interface Guardian {
  id: string;
  relation: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
}

export interface StudentDetail extends StudentSummary {
  phone: string | null;
  email: string | null;
  address: string | null;
  bloodGroup: string | null;
  religion: string | null;
  nationality: string;
  guardians: Guardian[];
  enrollmentHistory: Enrollment[];
}

export interface Enrollment {
  id: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  academicYearId: string;
  academicYearName: string;
  rollNumber: number | null;
  enrolledAt: string;
}

export interface StudentDocument {
  id: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
}

export interface ClassWithSections {
  id: string;
  name: string;
  orderIndex: number;
  sections: { id: string; name: string; capacity: number }[];
}

export interface AcademicYear {
  id: string;
  name: string;
  yearBs: number;
  startDate: { ad: string; bs: string };
  endDate: { ad: string; bs: string };
  isCurrent: boolean;
}

export interface CreateStudentData {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;       // AD date string "YYYY-MM-DD"
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone?: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
  religion?: string;
  guardians: {
    relation: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    isPrimary: boolean;
  }[];
}

export interface EnrollStudentData {
  classId: string;
  sectionId: string;
  academicYearId: string;
  rollNumber?: number;
}
```

---

## Pages to build

### 1. Student List Page — `app/(school)/students/page.tsx`

Layout:
```
<PageHeader title="Students" action={<Button>+ Admit Student</Button>} />

[Search bar]  [Class filter dropdown]  [Status filter]

<DataTable
  columns={studentColumns}
  data={students}
  isLoading={isLoading}
/>
```

Table columns:
```typescript
const studentColumns = [
  { header: 'Photo', cell: (row) => <Avatar src={row.photoUrl} fallback={initials} /> },
  { header: 'Admission No.', accessor: 'admissionNumber' },
  { header: 'Full Name', cell: (row) => <Link href={`/students/${row.id}`}>{row.fullName}</Link> },
  { header: 'Class', cell: (row) => row.currentEnrollment?.className ?? '—' },
  { header: 'Section', cell: (row) => row.currentEnrollment?.sectionName ?? '—' },
  { header: 'Gender', accessor: 'gender' },
  { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  { header: '', cell: (row) => <ActionMenu studentId={row.id} /> },
];
```

Filters:
- Search input (debounced 400ms) → `?search=Ram`
- Class dropdown (from classesApi.list()) → `?classId=xxx`
- Status select → `?status=ACTIVE`

All filters update URL search params (use `useRouter` + `useSearchParams`).
TanStack Query refetches when params change.

---

### 2. Student Admission Form — `app/(school)/students/new/page.tsx`

Multi-step form with 3 steps:

**Step 1 — Personal Information**
```
First Name*    Middle Name    Last Name*
Date of Birth* (input as BS date)    Gender*
Blood Group    Religion    Nationality
Phone    Email
Address (textarea)
```

**Step 2 — Guardian Information**
At least one guardian required.
```
[Guardian 1]
Relation*   First Name*   Last Name*
Phone*      Email
[✓] Primary Guardian

[+ Add another guardian]
```
Can have up to 3 guardians. Dynamic add/remove.

**Step 3 — Review & Submit**
Show a summary of all entered data.
"Back" to edit. "Submit" to create.

Progress indicator at top: Step 1 → Step 2 → Step 3

On submit:
```typescript
const { data } = await studentsApi.create(formData);
toast.success(`Student admitted: ${data.data.admissionNumber}`);
router.push(`/students/${data.data.id}`);
```

**Important — date of birth input:**
Students enter their birth date in BS. Convert to AD before sending to API.
Use a simple 3-dropdown input: Year (BS) | Month (BS name) | Day
Convert using bsToAd() from bs-calendar before submitting.

```typescript
// components/shared/bs-date-input.tsx
// Three dropdowns: BS Year | BS Month | BS Day
// onChange provides: { bsDate: BsDate, adDateString: string }
```

---

### 3. Student Profile Page — `app/(school)/students/[id]/page.tsx`

Layout:
```
<PageHeader
  title={student.fullName}
  description={`Admission No: ${student.admissionNumber}`}
  action={<Button>Edit</Button>}
/>

[Tab: Overview] [Tab: Enrollment] [Tab: Documents]

--- Overview tab ---
Left column (1/3):
  Photo (large avatar)
  Status badge
  Admission Number
  Gender | DOB (BS)
  Blood Group | Religion
  Phone | Email | Address

Right column (2/3):
  Guardians section:
    [Card per guardian: Name, Relation, Phone, Email, Primary badge]

  Current Enrollment:
    Class, Section, Roll No., Academic Year

--- Enrollment tab ---
  <EnrollmentHistory /> — table of all past enrollments

  If no current enrollment:
    <Card>
      <h3>Enroll in a Class</h3>
      <EnrollmentForm studentId={id} />
    </Card>

--- Documents tab ---
  Document list (type, filename, upload date, download link)
  Upload button → file picker → presign → S3 upload → confirm
```

---

### 4. Enrollment Form Component — `components/students/enrollment-form.tsx`

```typescript
interface EnrollmentFormProps {
  studentId: string;
  onSuccess?: () => void;
}
```

Form fields:
- Academic Year (select, defaults to current)
- Class (select, fetched from classesApi.list())
- Section (select, filtered by selected class — reacts to class selection)
- Roll Number (optional number input)

On submit: call studentsApi.enroll(), show toast, invalidate student query.

The section dropdown is **dependent on class selection**:
```typescript
const selectedClass = classes.find(c => c.id === watchedClassId);
const sections = selectedClass?.sections ?? [];
```

---

### 5. BS Date Input Component — `components/shared/bs-date-input.tsx`

Three dropdowns that together form a BS date, with AD conversion output:

```typescript
interface BsDateInputProps {
  value?: string;       // AD date string "YYYY-MM-DD"
  onChange: (adDate: string) => void;
  label?: string;
}
```

Year range: current BS year - 25 to current BS year - 2 (for students' DOB).
Month: dropdown of BS month names.
Day: dropdown 1–N based on selected year+month using daysInBsMonth().

---

### 6. Action Menu Component — `components/students/student-action-menu.tsx`

Dropdown with options:
- View Profile → router.push(`/students/${id}`)
- Edit → router.push(`/students/${id}/edit`)  (placeholder for now)
- Deactivate → ConfirmDialog → studentsApi.delete()

---

## Zod schemas for forms

```typescript
// lib/schemas/student.schema.ts

const guardianSchema = z.object({
  relation: z.string().min(1, 'Relation is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z.string().email().optional().or(z.literal('')),
  isPrimary: z.boolean(),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.string().min(1, 'Date of birth is required'), // AD string
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  bloodGroup: z.enum(['A+','A-','B+','B-','AB+','AB-','O+','O-','']).optional(),
  religion: z.string().optional(),
  guardians: z.array(guardianSchema).min(1, 'At least one guardian is required'),
});

export const enrollStudentSchema = z.object({
  academicYearId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  rollNumber: z.number().int().positive().optional(),
});
```

---

## TanStack Query hooks

```typescript
// lib/hooks/use-students.ts

export function useStudents(params: StudentListParams) {
  return useQuery({
    queryKey: ['students', params],
    queryFn: () => studentsApi.list(params).then(r => r.data.data),
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: () => studentsApi.getById(id).then(r => r.data.data),
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: studentsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students'] }),
  });
}

export function useEnrollStudent(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EnrollStudentData) => studentsApi.enroll(studentId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', studentId] }),
  });
}
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full — especially the frontend rules section added in Session 11.
Then read docs/api-contracts/12-student-ui.md in full.

Session 11 frontend foundation is complete. Working:
- Next.js 14 App Router, Tailwind, shadcn/ui
- Auth flow: login → token stored in Zustand → authenticated shell layout
- Shared components: DataTable, BsDate, StatusBadge, PageHeader, EmptyState, ConfirmDialog
- 8 placeholder pages exist

Session 12 task: Build the complete Student module UI.

Work in this exact order:

1. Add types to types/api.types.ts:
   StudentSummary, StudentDetail, Guardian, Enrollment,
   StudentDocument, ClassWithSections, AcademicYear, CreateStudentData

2. Create API functions:
   lib/api/students.api.ts — list, getById, create, update, delete, enroll,
                             getUploadUrl, confirmUpload, getDocuments
   lib/api/classes.api.ts — list (returns ClassWithSections[])
   lib/api/academic-years.api.ts — getCurrent, list

3. Create TanStack Query hooks in lib/hooks/:
   use-students.ts — useStudents, useStudent, useCreateStudent, useEnrollStudent

4. Create Zod schemas: lib/schemas/student.schema.ts

5. Build shared component: components/shared/bs-date-input.tsx
   Three dropdowns: BS Year | BS Month | BS Day
   Converts to AD string via bsToAd() before calling onChange

6. Build the Student List page (app/(school)/students/page.tsx):
   - Fetch with useStudents(params)
   - Search input (debounced 400ms using setTimeout + cleanup)
   - Class filter and Status filter dropdowns
   - Filters update URL search params
   - DataTable with columns: Photo, Admission No., Name (link), Class, Section, Gender, Status, Actions

7. Build multi-step Admission Form (app/(school)/students/new/page.tsx):
   - Step 1: Personal info with BsDateInput for DOB
   - Step 2: Guardian info (dynamic add/remove, up to 3)
   - Step 3: Review + Submit
   - Progress indicator at top

8. Build Student Profile page (app/(school)/students/[id]/page.tsx):
   - Fetch with useStudent(id)
   - 3 tabs: Overview, Enrollment, Documents
   - Overview: photo, personal info, guardians list
   - Enrollment tab: history table + EnrollmentForm if no current enrollment
   - Documents tab: list + upload button

9. Build components/students/enrollment-form.tsx:
   - Dependent class → section dropdown
   - useEnrollStudent mutation

10. Build components/students/student-action-menu.tsx:
    - View, Edit (placeholder), Deactivate with ConfirmDialog

Frontend rules (always):
- Never localStorage for tokens
- Always <BsDate> for date display — never raw date strings
- Always TanStack Query — no useEffect + fetch
- Tailwind only — no inline styles
- shadcn/ui for all primitives
- Every form uses React Hook Form + Zod
- Loading states on all async operations (Skeleton or spinner)
- Error states: show toast + keep user on page (don't crash)
```

---

## Learning checkpoint for Session 12

After this session, you should be able to answer:
- What is a "controlled" vs "uncontrolled" input in React?
- What does TanStack Query's queryKey do — why does it include the filter params?
- What is URL search params state and why is it better than useState for filters?
- What does "invalidate query" do after a mutation?
- Why do we convert BS date input to AD before sending to the API?
