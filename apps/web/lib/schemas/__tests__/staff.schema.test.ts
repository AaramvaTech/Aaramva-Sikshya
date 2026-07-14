import { describe, it, expect } from 'vitest';
import { createStaffSchema } from '../staff.schema';

const base = {
  firstName: 'Ram',
  lastName: 'Sharma',
  email: 'ram@school.np',
  role: 'TEACHER',
  phone: '9812345678',
  joinDate: '2024-01-01',
  baseSalary: 25000,
};

describe('createStaffSchema (REG-1 §2)', () => {
  it('accepts a valid staff payload with a Nepali mobile', () => {
    expect(createStaffSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a MISSING phone (mandatory)', () => {
    const { phone: _p, ...noPhone } = base;
    expect(createStaffSchema.safeParse(noPhone).success).toBe(false);
  });

  it('rejects a non-Nepali phone', () => {
    expect(createStaffSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
  });

  it('rejects a MISSING email', () => {
    const { email: _e, ...noEmail } = base;
    expect(createStaffSchema.safeParse(noEmail).success).toBe(false);
  });
});
