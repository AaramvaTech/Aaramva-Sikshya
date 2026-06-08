import { z } from 'zod';

const guardianSchema = z.object({
  relation: z.string().min(1, 'Relation is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z
    .string()
    .refine(
      (v) => !v || v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: 'Invalid email' },
    )
    .optional(),
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
  phone: z.string().optional(),
  email: z
    .string()
    .refine(
      (v) => !v || v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: 'Invalid email' },
    )
    .optional(),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
  religion: z.string().optional(),
  guardians: z.array(guardianSchema).min(1, 'At least one guardian is required'),
});

export const enrollStudentSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year is required'),
  classId: z.string().min(1, 'Class is required'),
  sectionId: z.string().min(1, 'Section is required'),
  rollNumber: z.number().int().positive().optional(),
});

export const editStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { error: 'Gender is required' }),
  phone: z.string().optional(),
  email: z
    .string()
    .refine(
      (v) => !v || v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: 'Invalid email' },
    )
    .optional(),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
  religion: z.string().optional(),
});

export type CreateStudentFormValues = z.infer<typeof createStudentSchema>;
export type EditStudentFormValues = z.infer<typeof editStudentSchema>;
export type EnrollStudentFormValues = z.infer<typeof enrollStudentSchema>;
