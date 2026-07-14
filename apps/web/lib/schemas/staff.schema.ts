import { z } from 'zod';

// REG-1 §2: staff registration requires a valid email + MANDATORY Nepali mobile.
const NEPAL_MOBILE = /^9[678]\d{8}$/;
const NEPAL_MOBILE_MSG = 'Enter a valid Nepali mobile (10 digits starting 96/97/98)';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createStaffSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').regex(EMAIL_RE, 'Enter a valid email'),
  role: z.string().min(1, 'Role is required'),
  phone: z.string().min(1, 'Phone is required').regex(NEPAL_MOBILE, NEPAL_MOBILE_MSG),
  joinDate: z.string().min(1, 'Join date is required'),
  baseSalary: z.number().min(0, 'Base salary must be 0 or more'),
});

export type CreateStaffFormValues = z.infer<typeof createStaffSchema>;

export const editStaffSchema = z.object({
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  phone: z.string().optional(),
  employmentType: z.enum(['PERMANENT', 'TEMPORARY', 'PART_TIME', 'CONTRACT']).optional(),
  baseSalary: z.number().min(0).optional(),
  panNumber: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  permanentAddress: z.string().optional(),
  temporaryAddress: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

export type EditStaffFormValues = z.infer<typeof editStaffSchema>;
