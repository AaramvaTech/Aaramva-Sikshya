import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStudentDto } from '../dto/create-student.dto';

// REG-1 §2 — student contacts optional (validated when present); guardians carry
// mandatory email + Nepali mobile; exactly one primary guardian is required.
const primaryGuardian = {
  relation: 'Father',
  firstName: 'Hari',
  lastName: 'Sharma',
  phone: '9812345678',
  email: 'hari@home.np',
  isPrimary: true,
};

const base = {
  firstName: 'Sita',
  lastName: 'Rai',
  dateOfBirth: '2015-05-20',
  gender: 'FEMALE',
  admissionDate: '2024-01-10',
  guardians: [primaryGuardian],
};

const errorsFor = (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateStudentDto, payload));

describe('CreateStudentDto validation (REG-1 §2)', () => {
  it('accepts a valid student with exactly one primary guardian', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });

  it('rejects a student with NO guardians (primary guardian required)', async () => {
    const { guardians: _g, ...noGuardians } = base;
    const errs = await errorsFor(noGuardians);
    expect(errs.some((e) => e.property === 'guardians')).toBe(true);
  });

  it('rejects when NO guardian is marked primary', async () => {
    const errs = await errorsFor({
      ...base,
      guardians: [{ ...primaryGuardian, isPrimary: false }],
    });
    expect(errs.some((e) => e.property === 'guardians')).toBe(true);
  });

  it('rejects when MORE THAN ONE guardian is marked primary', async () => {
    const errs = await errorsFor({
      ...base,
      guardians: [
        primaryGuardian,
        { ...primaryGuardian, firstName: 'Gita', phone: '9822222222', isPrimary: true },
      ],
    });
    expect(errs.some((e) => e.property === 'guardians')).toBe(true);
  });

  it('rejects a guardian with a MISSING email (mandatory)', async () => {
    const { email: _e, ...noEmail } = primaryGuardian;
    const errs = await errorsFor({ ...base, guardians: [noEmail] });
    expect(errs.some((e) => e.property === 'guardians')).toBe(true);
  });

  it('rejects a guardian with a non-Nepali phone', async () => {
    const errs = await errorsFor({
      ...base,
      guardians: [{ ...primaryGuardian, phone: '12345' }],
    });
    expect(errs.some((e) => e.property === 'guardians')).toBe(true);
  });

  it("validates the student's own phone when provided", async () => {
    const errs = await errorsFor({ ...base, phone: '12345' });
    expect(errs.some((e) => e.property === 'phone')).toBe(true);
  });

  it("accepts the student's own valid Nepali mobile", async () => {
    expect(await errorsFor({ ...base, phone: '9800000000' })).toHaveLength(0);
  });
});
