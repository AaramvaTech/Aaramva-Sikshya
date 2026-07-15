import {
  CREDENTIAL_TEMPLATE_TYPES,
  CredentialTemplateType,
  CredentialContext,
  deriveTemplateType,
  resolveSenderIdentity,
  renderCredentialEmail,
  renderCredentialSms,
} from '../credential-template.util';

const school = (over: Partial<CredentialContext['school']> = {}) => ({
  name: 'Demo School',
  code: 'demo',
  loginUrl: 'https://demo.aaramvashikshya.com',
  officialEmail: null as string | null,
  ...over,
});

const ctx = (over: Partial<CredentialContext> = {}): CredentialContext => ({
  school: school(),
  loginEmail: 'user@demo.school',
  tempPassword: 'TempPw@123456',
  ownerName: 'Aarav Student',
  ownerRole: 'STUDENT',
  ...over,
});

describe('credential-template (MAIL-3)', () => {
  describe('deriveTemplateType', () => {
    it('maps role + guardian-routing to the five types', () => {
      expect(deriveTemplateType('SCHOOL_OWNER', false)).toBe('NEW_SCHOOL_OWNER');
      expect(deriveTemplateType('PARENT', false)).toBe('GUARDIAN_SELF');
      expect(deriveTemplateType('STUDENT', true)).toBe('STUDENT_VIA_GUARDIAN');
      expect(deriveTemplateType('STUDENT', false)).toBe('STUDENT_SELF');
      expect(deriveTemplateType('TEACHER', false)).toBe('STAFF');
      expect(deriveTemplateType('PRINCIPAL', false)).toBe('STAFF');
      expect(deriveTemplateType(null, false)).toBe('STAFF');
    });
  });

  describe('resolveSenderIdentity', () => {
    it('NEW_SCHOOL_OWNER → plain platform identity, no Reply-To', () => {
      const id = resolveSenderIdentity('NEW_SCHOOL_OWNER', { name: 'Demo School', officialEmail: 'office@demo.school' });
      expect(id.fromName).toBe('Aaramva Shikshya');
      expect(id.fromName).not.toContain('via');
      expect(id.replyTo).toBeUndefined();
    });

    it('tenant type with official email → "{School} (via Aaramva Shikshya)" + Reply-To', () => {
      for (const t of ['STAFF', 'GUARDIAN_SELF', 'STUDENT_SELF', 'STUDENT_VIA_GUARDIAN'] as CredentialTemplateType[]) {
        const id = resolveSenderIdentity(t, { name: 'Demo School', officialEmail: 'office@demo.school' });
        expect(id.fromName).toBe('Demo School (via Aaramva Shikshya)');
        expect(id.replyTo).toBe('office@demo.school');
      }
    });

    it('fallback: null official email → NO Reply-To (never the platform address)', () => {
      const id = resolveSenderIdentity('STAFF', { name: 'Demo School', officialEmail: null });
      expect(id.fromName).toBe('Demo School (via Aaramva Shikshya)');
      expect(id.replyTo).toBeUndefined();
    });
  });

  describe('renderCredentialEmail', () => {
    it('subjects + intros differ per type; temp password always present', () => {
      const owner = renderCredentialEmail('NEW_SCHOOL_OWNER', ctx({ ownerRole: 'SCHOOL_OWNER' }));
      expect(owner.subject).toContain('administrator account on Aaramva Shikshya');
      expect(owner.html).not.toContain('powered by Aaramva Shikshya'); // platform = no tenant footer

      const staff = renderCredentialEmail('STAFF', ctx({ ownerRole: 'TEACHER' }));
      expect(staff.subject).toBe('Your Demo School staff account');
      expect(staff.text).toContain('(Teacher)'); // role mentioned
      expect(staff.html).toContain('powered by Aaramva Shikshya'); // tenant footer

      const guardian = renderCredentialEmail('GUARDIAN_SELF', ctx({ ownerRole: 'PARENT' }));
      expect(guardian.text).toContain('parent/guardian account at Demo School');

      const viaG = renderCredentialEmail('STUDENT_VIA_GUARDIAN', ctx({ studentName: 'Aarav Student' }));
      expect(viaG.subject).toBe('Login details for Aarav Student at Demo School');
      expect(viaG.text).toContain('for your child');

      const self = renderCredentialEmail('STUDENT_SELF', ctx());
      expect(self.subject).toBe('Your Demo School student account');

      for (const r of [owner, staff, guardian, viaG, self]) {
        expect(r.text).toContain('TempPw@123456');
        expect(r.html).toContain('TempPw@123456');
      }
    });
  });

  describe('renderCredentialSms — ASCII English, ≤160 chars (1 credit)', () => {
    it('stays ≤160 ASCII for every type at max-length realistic fixtures', () => {
      const fixture = ctx({
        school: school({ name: 'A'.repeat(45), code: 'c'.repeat(30) }),
        studentName: 'B'.repeat(45),
        ownerName: 'B'.repeat(45),
        tempPassword: 'P@ssw0rd123!xyz9', // 16
      });
      for (const t of CREDENTIAL_TEMPLATE_TYPES) {
        const sms = renderCredentialSms(t, fixture);
        expect(sms.length).toBeLessThanOrEqual(160);
        expect(/^[\x20-\x7E]*$/.test(sms)).toBe(true); // printable ASCII only
      }
    });

    it('Devanagari school/student names are ASCII-stripped and still ≤160', () => {
      const fixture = ctx({
        school: school({ name: 'श्री सरस्वती विद्यालय', code: 'demo' }),
        studentName: 'आरव विद्यार्थी',
      });
      for (const t of CREDENTIAL_TEMPLATE_TYPES) {
        const sms = renderCredentialSms(t, fixture);
        expect(sms.length).toBeLessThanOrEqual(160);
        expect(/^[\x20-\x7E]*$/.test(sms)).toBe(true);
        expect(sms).toContain('TempPw@123456'); // password still present
      }
    });
  });
});
