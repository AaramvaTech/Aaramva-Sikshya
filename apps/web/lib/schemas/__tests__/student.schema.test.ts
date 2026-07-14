import { describe, it, expect } from 'vitest';
import { createStudentSchema } from '../student.schema';

const guardian = {
  relation: 'Father',
  firstName: 'Prakash',
  lastName: 'Sharma',
  phone: '9812345678',
  email: 'prakash@home.np',
  isPrimary: true,
};

const base = {
  firstName: 'Aarav',
  lastName: 'Sharma',
  dateOfBirth: '2013-05-20',
  admissionDate: '2024-01-10',
  gender: 'MALE',
  guardians: [guardian],
};

describe('createStudentSchema (REG-1 §2)', () => {
  it('accepts a valid student with exactly one primary guardian', () => {
    expect(createStudentSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a guardian with a MISSING email (mandatory)', () => {
    expect(
      createStudentSchema.safeParse({ ...base, guardians: [{ ...guardian, email: '' }] }).success,
    ).toBe(false);
  });

  it('rejects a guardian with a non-Nepali phone', () => {
    expect(
      createStudentSchema.safeParse({ ...base, guardians: [{ ...guardian, phone: '12345' }] })
        .success,
    ).toBe(false);
  });

  it('rejects ZERO primary guardians', () => {
    expect(
      createStudentSchema.safeParse({ ...base, guardians: [{ ...guardian, isPrimary: false }] })
        .success,
    ).toBe(false);
  });

  it('rejects MORE THAN ONE primary guardian', () => {
    expect(
      createStudentSchema.safeParse({
        ...base,
        guardians: [
          guardian,
          { ...guardian, firstName: 'Gita', phone: '9822222222', isPrimary: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates the student's own phone when provided", () => {
    expect(createStudentSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...base, phone: '9800000000' }).success).toBe(true);
  });
});
