import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStaffDto } from '../dto/staff.dto';

// REG-1 §2 — mandatory-field matrix + Nepali-mobile validation for staff.
const base = {
  email: 'staff@school.com',
  firstName: 'Ram',
  lastName: 'Sharma',
  role: 'TEACHER',
  joinDate: '2024-01-01',
  baseSalary: 25000,
};

const errorsFor = (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateStaffDto, payload));

describe('CreateStaffDto validation (REG-1 §2)', () => {
  it('accepts a valid staff payload with a Nepali mobile', async () => {
    expect(await errorsFor({ ...base, phone: '9812345678' })).toHaveLength(0);
  });

  it('rejects a MISSING phone (mandatory)', async () => {
    const errs = await errorsFor({ ...base }); // no phone
    expect(errs.some((e) => e.property === 'phone')).toBe(true);
  });

  it('rejects a non-Nepali phone with a field-level message', async () => {
    const errs = await errorsFor({ ...base, phone: '12345' });
    const phoneErr = errs.find((e) => e.property === 'phone');
    expect(phoneErr).toBeDefined();
    expect(JSON.stringify(phoneErr!.constraints)).toMatch(/Nepali mobile/i);
  });

  it('rejects a MISSING email (mandatory)', async () => {
    const { email: _omit, ...noEmail } = base;
    const errs = await errorsFor({ ...noEmail, phone: '9812345678' });
    expect(errs.some((e) => e.property === 'email')).toBe(true);
  });
});
