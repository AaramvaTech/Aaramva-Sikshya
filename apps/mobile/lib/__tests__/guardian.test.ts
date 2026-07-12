import { describe, it, expect } from '@jest/globals';
import { guardianDisplayName, guardianInitials, nameFromEmail } from '../guardian';
import type { GuardianProfile } from '../../types';

const guardian = (over: Partial<GuardianProfile> = {}): GuardianProfile => ({
  userId: 'u1',
  firstName: 'Ramesh',
  lastName: 'Shrestha',
  relation: 'Father',
  phone: '9841000001',
  email: 'login@school.np',
  children: [],
  ...over,
});

describe('guardianDisplayName (POL-2 T5)', () => {
  it('prefers the real name from GET /guardians/me', () => {
    expect(guardianDisplayName(guardian(), 'ramesh.shrestha@gmail.com')).toBe('Ramesh Shrestha');
  });

  it('handles a guardian with no last name', () => {
    expect(guardianDisplayName(guardian({ lastName: null }), 'x@y.z')).toBe('Ramesh');
  });

  it('falls back to the email-synthesized name while the profile is unavailable', () => {
    expect(guardianDisplayName(undefined, 'ramesh.shrestha@gmail.com')).toBe('Ramesh Shrestha');
  });

  it('falls back to the email when the profile name is blank', () => {
    expect(guardianDisplayName(guardian({ firstName: '', lastName: null }), 'sita.rai@mail.np')).toBe('Sita Rai');
  });

  it('returns "Parent" when neither profile nor email is available', () => {
    expect(guardianDisplayName(undefined, undefined)).toBe('Parent');
  });
});

describe('nameFromEmail', () => {
  it('title-cases the dotted local part', () => {
    expect(nameFromEmail('ramesh.shrestha@gmail.com')).toBe('Ramesh Shrestha');
  });
  it('handles underscores and hyphens', () => {
    expect(nameFromEmail('sita_devi-rai@x.np')).toBe('Sita Devi Rai');
  });
});

describe('guardianInitials', () => {
  it('takes the first two initials', () => {
    expect(guardianInitials('Ramesh Shrestha')).toBe('RS');
  });
  it('handles a single name', () => {
    expect(guardianInitials('Ramesh')).toBe('R');
  });
});
