import { z } from 'zod';

export const assignFeeStructureSchema = z.object({
  feeStructureId: z.string().min(1, 'Select a fee structure'),
  effectiveFrom: z.string().min(1, 'Required'),
});
export type AssignFeeStructureFormValues = z.infer<typeof assignFeeStructureSchema>;

export const studentFeeOverrideSchema = z.object({
  feeHeadId: z.string().min(1, 'Select a fee head'),
  overrideAmount: z.number().min(0, 'Must be >= 0'),
  reason: z.string().max(500).optional(),
  effectiveFrom: z.string().min(1, 'Required'),
  effectiveTo: z.string().optional(),
});
export type StudentFeeOverrideFormValues = z.infer<typeof studentFeeOverrideSchema>;

export const studentConcessionSchema = z.object({
  feeHeadId: z.string().optional(), // omitted = whole bill
  type: z.enum(['PERCENT', 'AMOUNT']),
  value: z.number().min(0.01, 'Must be > 0'),
  capAmount: z.number().min(0).optional(),
  discountReasonId: z.string().min(1, 'Select a reason'),
  effectiveFrom: z.string().min(1, 'Required'),
  effectiveTo: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type StudentConcessionFormValues = z.infer<typeof studentConcessionSchema>;

export const studentTransportAssignmentSchema = z.object({
  transportRouteId: z.string().min(1, 'Select a route'),
  effectiveFrom: z.string().min(1, 'Required'),
  effectiveTo: z.string().optional(),
});
export type StudentTransportAssignmentFormValues = z.infer<typeof studentTransportAssignmentSchema>;
