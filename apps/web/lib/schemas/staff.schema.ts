import { z } from 'zod';

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
