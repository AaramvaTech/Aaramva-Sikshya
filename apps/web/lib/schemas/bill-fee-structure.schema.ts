import { z } from 'zod';

export const billFeeStructureItemSchema = z.object({
  feeHeadId: z.string().min(1, 'Select a fee head'),
  amount: z.number().min(0.01, 'Must be > 0'),
  recurrenceOverride: z.string().optional(),
  effectiveFrom: z.string().min(1, 'Required'),
  effectiveTo: z.string().optional(),
});

export const billFeeStructureSchema = z.object({
  classId: z.string().min(1, 'Select a class'),
  academicYearId: z.string().min(1, 'Select an academic year'),
  sectionId: z.string().optional(),
  name: z.string().min(1, 'Name is required').max(200),
  items: z.array(billFeeStructureItemSchema).min(1, 'Add at least one fee item'),
});

export type BillFeeStructureFormValues = z.infer<typeof billFeeStructureSchema>;
