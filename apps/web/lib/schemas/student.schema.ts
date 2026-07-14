import { z } from 'zod';

// REG-1 §2 mirror (client-side field-level validation matching the API):
//  - Nepali mobile: 10 digits starting 96/97/98.
//  - Guardian email is MANDATORY.
//  - A student must have EXACTLY ONE primary guardian.
const NEPAL_MOBILE = /^9[678]\d{8}$/;
const NEPAL_MOBILE_MSG = 'Enter a valid Nepali mobile (10 digits starting 96/97/98)';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIMARY_MSG = 'Select exactly one primary guardian';

const exactlyOnePrimary = (guardians: { isPrimary: boolean }[]) =>
  guardians.filter((g) => g.isPrimary).length === 1;

const guardianSchema = z.object({
  relation: z.string().min(1, 'Relation is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(1, 'Phone is required').regex(NEPAL_MOBILE, NEPAL_MOBILE_MSG),
  // REG-1 §2: guardian email is mandatory (credentials delivered to own email).
  email: z.string().min(1, 'Email is required').regex(EMAIL_RE, 'Enter a valid email'),
  isPrimary: z.boolean(),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  admissionDate: z.string().min(1, 'Admission date is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], {
    error: 'Gender is required',
  }),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || NEPAL_MOBILE.test(v), NEPAL_MOBILE_MSG),
  email: z
    .string()
    .refine((v) => !v || v === '' || EMAIL_RE.test(v), { message: 'Invalid email' })
    .optional(),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
  religion: z.string().optional(),
  academicYearId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  rollNumber: z.number().int().positive().optional(),
  guardians: z
    .array(guardianSchema)
    .min(1, 'At least one guardian is required')
    .refine(exactlyOnePrimary, { message: PRIMARY_MSG }),
});

export const enrollStudentSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year is required'),
  classId: z.string().min(1, 'Class is required'),
  sectionId: z.string().min(1, 'Section is required'),
  rollNumber: z.number().int().positive().optional(),
});

const editGuardianSchema = z.object({
  relation: z.string().min(1, 'Relation is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(1, 'Phone is required').regex(NEPAL_MOBILE, NEPAL_MOBILE_MSG),
  email: z.string().min(1, 'Email is required').regex(EMAIL_RE, 'Enter a valid email'),
  isPrimary: z.boolean(),
});

export const editStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { error: 'Gender is required' }),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || NEPAL_MOBILE.test(v), NEPAL_MOBILE_MSG),
  email: z
    .string()
    .refine((v) => !v || v === '' || EMAIL_RE.test(v), { message: 'Invalid email' })
    .optional(),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
  religion: z.string().optional(),
  academicYearId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  rollNumber: z.number().int().positive().optional(),
  guardians: z
    .array(editGuardianSchema)
    // When guardians are edited, still require exactly one primary (empty = unchanged).
    .refine((g) => g.length === 0 || exactlyOnePrimary(g), { message: PRIMARY_MSG })
    .optional(),
});

export type CreateStudentFormValues = z.infer<typeof createStudentSchema>;
export type EditStudentFormValues = z.infer<typeof editStudentSchema>;
export type EditGuardianFormValues = z.infer<typeof editGuardianSchema>;
export type EnrollStudentFormValues = z.infer<typeof enrollStudentSchema>;
