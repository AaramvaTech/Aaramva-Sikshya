import { z } from 'zod';

export const superAdminLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type SuperAdminLoginValues = z.infer<typeof superAdminLoginSchema>;

export const onboardTenantSchema = z.object({
  schoolName: z.string().min(3, 'Min 3 characters').max(200),
  slug: z
    .string()
    .min(3, 'Min 3 characters')
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
  planId: z.string().uuid('Select a plan'),
  adminEmail: z.string().email('Invalid email'),
  adminFirstName: z.string().min(1, 'Required'),
  adminLastName: z.string().min(1, 'Required'),
  // REG-OBS-5: no chosen password — the owner gets a generated temp password
  // (must_change_password) delivered via the new tenant's ledger.
  phone: z.string().optional(),
  address: z.string().optional(),
  panNumber: z.string().optional(),
  trialDays: z.number().int().min(1).max(90).optional(),
});

export type OnboardTenantValues = z.infer<typeof onboardTenantSchema>;

export const createPlanSchema = z.object({
  name: z.string().min(2).max(50),
  monthlyPrice: z.number().min(0, 'Must be ≥ 0'),
  annualPrice: z.number().min(0, 'Must be ≥ 0'),
  maxStudents: z.number().int().min(1),
  maxStaff: z.number().int().min(1),
  features: z.record(z.string(), z.boolean()),
});

export type CreatePlanValues = z.infer<typeof createPlanSchema>;
