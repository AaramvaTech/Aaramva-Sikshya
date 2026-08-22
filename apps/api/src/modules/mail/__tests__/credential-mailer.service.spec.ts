import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CredentialMailer } from '../credential-mailer.service';
import { MailService } from '../mail.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockMail = guardSurvivingMocks({ send: jest.fn().mockResolvedValue({ status: 'MOCK', logId: 'l1' }) });
const mockPublicPrisma = guardSurvivingMocks({
  query: jest.fn().mockResolvedValue([{ name: 'Sunrise School', slug: 'sunrise' }]),
});

describe('CredentialMailer', () => {
  let mailer: CredentialMailer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialMailer,
        { provide: MailService, useValue: mockMail },
        { provide: PublicPrismaService, useValue: mockPublicPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
      ],
    }).compile();
    mailer = module.get(CredentialMailer);
    jest.clearAllMocks();
    mockMail.send.mockResolvedValue({ status: 'MOCK', logId: 'l1' });
    mockPublicPrisma.query.mockResolvedValue([{ name: 'Sunrise School', slug: 'sunrise' }]);
  });

  it('sendNewCredentials includes slug, login email and password in the body', async () => {
    await mailer.sendNewCredentials({
      tenantId: 't1', to: 'kid@x.com', loginEmail: 'kid@x.com', password: 'Abcd23!x', relatedUserId: 'u1',
    });
    const arg = mockMail.send.mock.calls[0][0];
    expect(arg.type).toBe('CREDENTIALS_NEW');
    expect(arg.to).toBe('kid@x.com');
    expect(arg.tenantId).toBe('t1');
    expect(arg.relatedUserId).toBe('u1');
    expect(arg.html).toContain('sunrise');     // school code
    expect(arg.html).toContain('kid@x.com');   // login email
    expect(arg.html).toContain('Abcd23!x');    // password
    expect(arg.text).toContain('Abcd23!x');
  });

  it('sendLoginEmailChanged omits the password', async () => {
    await mailer.sendLoginEmailChanged({
      tenantId: 't1', to: 'new@x.com', newLoginEmail: 'new@x.com', relatedUserId: 'u1',
    });
    const arg = mockMail.send.mock.calls[0][0];
    expect(arg.type).toBe('LOGIN_EMAIL_CHANGED');
    expect(arg.html).toContain('new@x.com');
    expect(arg.html).not.toMatch(/password/i);
    expect(arg.text).not.toMatch(/password/i);
  });

  it('sendPasswordReset uses CREDENTIALS_RESET type and includes password and login email', async () => {
    await mailer.sendPasswordReset({
      tenantId: 't1', to: 'kid@x.com', loginEmail: 'kid@x.com', password: 'NewPass99!', relatedUserId: 'u1',
    });
    const arg = mockMail.send.mock.calls[0][0];
    expect(arg.type).toBe('CREDENTIALS_RESET');
    expect(arg.html).toContain('NewPass99!');
    expect(arg.html).toContain('kid@x.com');
  });

  it('sendNewCredentials escapes a malicious school name in html', async () => {
    mockPublicPrisma.query.mockResolvedValueOnce([{ name: '<script>x</script>', slug: 'sunrise' }]);
    await mailer.sendNewCredentials({
      tenantId: 't1', to: 'kid@x.com', loginEmail: 'kid@x.com', password: 'Abcd23!x', relatedUserId: 'u1',
    });
    const arg = mockMail.send.mock.calls[0][0];
    expect(arg.html).toContain('&lt;script&gt;');
    expect(arg.html).not.toContain('<script>');
  });
});
