# Credential Provisioning Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email login credentials (login email + temporary password + school code) to a student/staff/parent when their account is created or password is reset, and to a school owner when a school is onboarded; give admins a CRUD surface to update the login email and reset the password.

**Architecture:** A new `MailModule` provides `MailService` (nodemailer SMTP transport + best-effort `email_log` recording, mock transport when SMTP is unconfigured) and `CredentialMailer` (composes the credential/email-changed messages, resolves school name+slug from the public `tenants` table). Existing account flows (student, staff, guardian, school onboarding) are changed to auto-generate the password when none is supplied, then call `CredentialMailer`. New endpoints update the login email and reset the password (reset = the "resend" mechanism, since plaintext is never stored).

**Tech Stack:** NestJS 11, Prisma 6 (raw SQL via `PublicPrismaService` / `TenantPrismaService`), PostgreSQL 17, nodemailer, bcrypt, Jest.

## Global Constraints

- Response format: success `{ success: true, data }` / error `{ success: false, error: { code, message } }` — handled by the global `ResponseInterceptor`/`HttpExceptionFilter`; services return raw data, throw Nest exceptions.
- Multi-tenancy: tenant code uses `TenantPrismaService`; public-schema code uses `PublicPrismaService`. Never use the default `PrismaService` directly in module code.
- `email_log` lives in the **public** schema (nullable `tenant_id`); always written via `PublicPrismaService`.
- **Never store plaintext passwords or full message bodies** in `email_log` — metadata only.
- Best-effort: a failed email must NEVER roll back or fail the account create/update/reset.
- Auto-generated temp password: 12 chars, mixed character classes, ambiguous chars (`0 O 1 l I`) excluded.
- School code = tenant `slug`. Login URL = `https://<slug>.<APP_DOMAIN>` (APP_DOMAIN from env, default `aaramvashikshya.com`).
- `bcrypt` rounds: match the file being edited (student/guardian use `10`; staff/provisioning use `BCRYPT_ROUNDS = 12`).
- Verify gate per task: `cd apps/api && npx tsc --noEmit` exits 0; relevant Jest specs pass.
- DTO note: global `ValidationPipe` is `{ whitelist: true, transform: true }` (no `forbidNonWhitelisted`) — optional fields are simply omitted; use `@IsOptional()`.

---

### Task 1: email_log table + nodemailer dependency

**Files:**
- Modify: `apps/api/package.json` (add `nodemailer`, `@types/nodemailer`)
- Create: `apps/api/prisma/migrations/20260620000000_add_email_log/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (add `EmailLog` model in public schema)

**Interfaces:**
- Produces: public table `email_log` with columns `id, tenant_id, recipient_email, email_type, subject, status, provider_message_id, error, related_user_id, created_at, updated_at`.

- [ ] **Step 1: Install nodemailer**

Run:
```bash
cd apps/api && npm install nodemailer && npm install -D @types/nodemailer
```
Expected: `package.json` gains `nodemailer` in dependencies and `@types/nodemailer` in devDependencies; no install errors.

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260620000000_add_email_log/migration.sql`:
```sql
-- email_log: observability for credential/notification emails (public schema, nullable tenant_id).
-- No plaintext passwords or message bodies are stored here.
CREATE TABLE "email_log" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"           UUID,
  "recipient_email"     TEXT NOT NULL,
  "email_type"          TEXT NOT NULL,
  "subject"             TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'PENDING',
  "provider_message_id" TEXT,
  "error"               TEXT,
  "related_user_id"     UUID,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "email_log_tenant_id_idx" ON "email_log" ("tenant_id");
CREATE INDEX "email_log_related_user_id_idx" ON "email_log" ("related_user_id");
```

- [ ] **Step 3: Add the Prisma model**

In `apps/api/prisma/schema.prisma`, alongside the other public-schema models (e.g. near `Tenant`/`Plan`), add:
```prisma
model EmailLog {
  id                String   @id @default(uuid()) @db.Uuid
  tenantId          String?  @map("tenant_id") @db.Uuid
  recipientEmail    String   @map("recipient_email")
  emailType         String   @map("email_type")
  subject           String
  status            String   @default("PENDING")
  providerMessageId String?  @map("provider_message_id")
  error             String?
  relatedUserId     String?  @map("related_user_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([tenantId])
  @@index([relatedUserId])
  @@map("email_log")
}
```

- [ ] **Step 4: Apply migration + regenerate client**

Run:
```bash
cd apps/api && npx prisma migrate dev --name add_email_log
```
Expected: migration applies cleanly; `Prisma Client` regenerates with no errors. (If the DB is unreachable, instead run `npx prisma generate` and apply SQL manually — the model + raw SQL are what matter.)

- [ ] **Step 5: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/prisma/
git commit -m "feat(api): add email_log table + nodemailer dependency"
```

---

### Task 2: Temporary password generator

**Files:**
- Create: `apps/api/src/modules/mail/password.util.ts`
- Test: `apps/api/src/modules/mail/__tests__/password.util.spec.ts`

**Interfaces:**
- Produces: `export function generateTemporaryPassword(length = 12): string`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/mail/__tests__/password.util.spec.ts`:
```typescript
import { generateTemporaryPassword } from '../password.util';

describe('generateTemporaryPassword', () => {
  it('returns a string of the requested length (default 12)', () => {
    expect(generateTemporaryPassword()).toHaveLength(12);
    expect(generateTemporaryPassword(16)).toHaveLength(16);
  });

  it('excludes ambiguous characters 0 O 1 l I', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('includes a lowercase, an uppercase, a digit, and a symbol', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[2-9]/);
      expect(pw).toMatch(/[!@#$%^&*]/);
    }
  });

  it('produces distinct values across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(set.size).toBeGreaterThan(95);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest password.util -t "returns a string"`
Expected: FAIL — cannot find module `../password.util`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/mail/password.util.ts`:
```typescript
import { randomInt } from 'node:crypto';

// Ambiguous characters (0 O 1 l I) are excluded for legibility in emails.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/**
 * Generates a strong temporary password with at least one lowercase, uppercase,
 * digit, and symbol. Ambiguous characters are excluded.
 */
export function generateTemporaryPassword(length = 12): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Fisher–Yates shuffle so required chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest password.util`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mail/password.util.ts apps/api/src/modules/mail/__tests__/password.util.spec.ts
git commit -m "feat(api): temporary password generator"
```

---

### Task 3: MailService (transport + email_log)

**Files:**
- Create: `apps/api/src/modules/mail/mail.service.ts`
- Test: `apps/api/src/modules/mail/__tests__/mail.service.spec.ts`

**Interfaces:**
- Consumes: `PublicPrismaService` from `../super-admin/public-prisma.service` (`.query`, `.execute`).
- Produces:
  ```typescript
  export interface SendMailInput {
    to: string; subject: string; html: string; text: string;
    type: string; tenantId?: string | null; relatedUserId?: string | null;
  }
  export interface SendMailResult { status: 'SENT' | 'FAILED' | 'MOCK'; logId: string }
  class MailService { send(input: SendMailInput): Promise<SendMailResult> }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/mail/__tests__/mail.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../mail.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';

const mockPublicPrisma = { query: jest.fn(), execute: jest.fn() };

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: PublicPrismaService, useValue: mockPublicPrisma },
      ],
    }).compile();
    service = module.get(MailService);
    jest.clearAllMocks();
    delete process.env.SMTP_HOST;
    // INSERT ... RETURNING id, then UPDATE status
    mockPublicPrisma.query.mockResolvedValue([{ id: 'log-1' }]);
    mockPublicPrisma.execute.mockResolvedValue(1);
  });

  it('records a MOCK send and returns its log id when SMTP is unconfigured', async () => {
    const res = await service.send({
      to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', type: 'CREDENTIALS_NEW',
    });
    expect(res).toEqual({ status: 'MOCK', logId: 'log-1' });
    // first query = INSERT email_log PENDING
    expect(mockPublicPrisma.query).toHaveBeenCalled();
    // status updated to MOCK
    expect(mockPublicPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE email_log'),
      'MOCK', null, null, 'log-1',
    );
  });

  it('never throws and records FAILED when the transport throws', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    // Force the transporter to fail by stubbing the private send.
    jest.spyOn(service as any, 'deliver').mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const res = await service.send({
      to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', type: 'CREDENTIALS_NEW',
    });
    expect(res.status).toBe('FAILED');
    expect(mockPublicPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE email_log'),
      'FAILED', null, 'connect ECONNREFUSED', 'log-1',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest mail.service`
Expected: FAIL — cannot find module `../mail.service`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/mail/mail.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PublicPrismaService } from '../super-admin/public-prisma.service';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  type: string;
  tenantId?: string | null;
  relatedUserId?: string | null;
}

export interface SendMailResult {
  status: 'SENT' | 'FAILED' | 'MOCK';
  logId: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly publicPrisma: PublicPrismaService) {}

  private get isConfigured(): boolean {
    return !!process.env.SMTP_HOST;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    return this.transporter;
  }

  /** Actual network delivery. Separated so tests can stub it. Returns provider message id. */
  private async deliver(input: SendMailInput): Promise<string | null> {
    const fromName = process.env.MAIL_FROM_NAME ?? 'Aaramva Shikshya';
    const fromAddr = process.env.MAIL_FROM ?? 'no-reply@aaramvashikshya.com';
    const info = await this.getTransporter().sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return info?.messageId ?? null;
  }

  /**
   * Best-effort send: always records an email_log row, never throws to the caller.
   */
  async send(input: SendMailInput): Promise<SendMailResult> {
    const rows = await this.publicPrisma.query<{ id: string }>(
      `INSERT INTO email_log (tenant_id, recipient_email, email_type, subject, status, related_user_id)
       VALUES ($1::uuid, $2, $3, $4, 'PENDING', $5::uuid)
       RETURNING id`,
      input.tenantId ?? null,
      input.to,
      input.type,
      input.subject,
      input.relatedUserId ?? null,
    );
    const logId = rows[0].id;

    if (!this.isConfigured) {
      this.logger.log(`[MAIL MOCK] To: ${input.to} | ${input.subject}`);
      await this.updateStatus(logId, 'MOCK', null, null);
      return { status: 'MOCK', logId };
    }

    try {
      const messageId = await this.deliver(input);
      await this.updateStatus(logId, 'SENT', messageId, null);
      return { status: 'SENT', logId };
    } catch (err) {
      const message = (err as Error)?.message ?? 'Unknown email error';
      this.logger.error(`Email send failed to ${input.to}: ${message}`);
      await this.updateStatus(logId, 'FAILED', null, message);
      return { status: 'FAILED', logId };
    }
  }

  private async updateStatus(
    logId: string,
    status: 'SENT' | 'FAILED' | 'MOCK',
    providerMessageId: string | null,
    error: string | null,
  ): Promise<void> {
    await this.publicPrisma.execute(
      `UPDATE email_log
       SET status = $1, provider_message_id = $2, error = $3, updated_at = NOW()
       WHERE id = $4::uuid`,
      status,
      providerMessageId,
      error,
      logId,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest mail.service`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mail/mail.service.ts apps/api/src/modules/mail/__tests__/mail.service.spec.ts
git commit -m "feat(api): MailService transport + email_log recording"
```

---

### Task 4: CredentialMailer + MailModule

**Files:**
- Create: `apps/api/src/modules/mail/credential-mailer.service.ts`
- Create: `apps/api/src/modules/mail/mail.module.ts`
- Test: `apps/api/src/modules/mail/__tests__/credential-mailer.service.spec.ts`

**Interfaces:**
- Consumes: `MailService.send` (Task 3), `PublicPrismaService` (school lookup).
- Produces:
  ```typescript
  class CredentialMailer {
    sendNewCredentials(p: { tenantId: string; to: string; loginEmail: string; password: string; relatedUserId: string }): Promise<void>;
    sendPasswordReset(p: { tenantId: string; to: string; loginEmail: string; password: string; relatedUserId: string }): Promise<void>;
    sendLoginEmailChanged(p: { tenantId: string; to: string; newLoginEmail: string; relatedUserId: string }): Promise<void>;
  }
  // MailModule exports: MailService, CredentialMailer
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/mail/__tests__/credential-mailer.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CredentialMailer } from '../credential-mailer.service';
import { MailService } from '../mail.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';

const mockMail = { send: jest.fn().mockResolvedValue({ status: 'MOCK', logId: 'l1' }) };
const mockPublicPrisma = {
  query: jest.fn().mockResolvedValue([{ name: 'Sunrise School', slug: 'sunrise' }]),
};

describe('CredentialMailer', () => {
  let mailer: CredentialMailer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialMailer,
        { provide: MailService, useValue: mockMail },
        { provide: PublicPrismaService, useValue: mockPublicPrisma },
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
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest credential-mailer`
Expected: FAIL — cannot find module `../credential-mailer.service`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/mail/credential-mailer.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { MailService } from './mail.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';

interface CredentialParams {
  tenantId: string;
  to: string;
  loginEmail: string;
  password: string;
  relatedUserId: string;
}

interface EmailChangedParams {
  tenantId: string;
  to: string;
  newLoginEmail: string;
  relatedUserId: string;
}

@Injectable()
export class CredentialMailer {
  constructor(
    private readonly mail: MailService,
    private readonly publicPrisma: PublicPrismaService,
  ) {}

  private async resolveSchool(tenantId: string): Promise<{ name: string; slug: string }> {
    const rows = await this.publicPrisma.query<{ name: string; slug: string }>(
      `SELECT name, slug FROM tenants WHERE id = $1::uuid`,
      tenantId,
    );
    return rows[0] ?? { name: 'your school', slug: '' };
  }

  private loginUrl(slug: string): string {
    const domain = process.env.APP_DOMAIN ?? 'aaramvashikshya.com';
    return `https://${slug}.${domain}`;
  }

  async sendNewCredentials(p: CredentialParams): Promise<void> {
    const school = await this.resolveSchool(p.tenantId);
    await this.sendCredentialEmail(p, school, 'CREDENTIALS_NEW', `Your ${school.name} login is ready`);
  }

  async sendPasswordReset(p: CredentialParams): Promise<void> {
    const school = await this.resolveSchool(p.tenantId);
    await this.sendCredentialEmail(p, school, 'CREDENTIALS_RESET', `Your ${school.name} password was reset`);
  }

  private async sendCredentialEmail(
    p: CredentialParams,
    school: { name: string; slug: string },
    type: string,
    subject: string,
  ): Promise<void> {
    const url = this.loginUrl(school.slug);
    const text = [
      `Hello,`,
      ``,
      `Your login for ${school.name} on Aaramva Shikshya is ready.`,
      ``,
      `School code: ${school.slug}`,
      `Login email: ${p.loginEmail}`,
      `Temporary password: ${p.password}`,
      ``,
      `Web: ${url}`,
      `Mobile app: open Aaramva Shikshya, enter the school code "${school.slug}", then log in.`,
      ``,
      `Please change your password after your first login.`,
    ].join('\n');
    const html = `
      <p>Hello,</p>
      <p>Your login for <strong>${school.name}</strong> on Aaramva Shikshya is ready.</p>
      <ul>
        <li><strong>School code:</strong> ${school.slug}</li>
        <li><strong>Login email:</strong> ${p.loginEmail}</li>
        <li><strong>Temporary password:</strong> ${p.password}</li>
      </ul>
      <p><strong>Web:</strong> <a href="${url}">${url}</a><br/>
      <strong>Mobile app:</strong> open Aaramva Shikshya, enter the school code "<strong>${school.slug}</strong>", then log in.</p>
      <p>Please change your password after your first login.</p>`;
    await this.mail.send({
      to: p.to, subject, html, text, type, tenantId: p.tenantId, relatedUserId: p.relatedUserId,
    });
  }

  async sendLoginEmailChanged(p: EmailChangedParams): Promise<void> {
    const school = await this.resolveSchool(p.tenantId);
    const url = this.loginUrl(school.slug);
    const subject = `Your ${school.name} login email was changed`;
    const text = [
      `Hello,`,
      ``,
      `The login email for your ${school.name} account was changed to ${p.newLoginEmail}.`,
      ``,
      `School code: ${school.slug}`,
      `Web: ${url}`,
      ``,
      `If you did not expect this change, contact your school administrator.`,
    ].join('\n');
    const html = `
      <p>Hello,</p>
      <p>The login email for your <strong>${school.name}</strong> account was changed to <strong>${p.newLoginEmail}</strong>.</p>
      <ul><li><strong>School code:</strong> ${school.slug}</li></ul>
      <p><strong>Web:</strong> <a href="${url}">${url}</a></p>
      <p>If you did not expect this change, contact your school administrator.</p>`;
    await this.mail.send({
      to: p.to, subject, html, text, type: 'LOGIN_EMAIL_CHANGED', tenantId: p.tenantId, relatedUserId: p.relatedUserId,
    });
  }
}
```

- [ ] **Step 4: Create MailModule**

Create `apps/api/src/modules/mail/mail.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { CredentialMailer } from './credential-mailer.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';

@Module({
  providers: [MailService, CredentialMailer, PublicPrismaService],
  exports: [MailService, CredentialMailer],
})
export class MailModule {}
```
(`PrismaService` that `PublicPrismaService` depends on is provided by the `@Global` `PrismaModule`, so no extra import is needed.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest credential-mailer && npx tsc --noEmit`
Expected: PASS (2 tests); tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mail/credential-mailer.service.ts apps/api/src/modules/mail/mail.module.ts apps/api/src/modules/mail/__tests__/credential-mailer.service.spec.ts
git commit -m "feat(api): CredentialMailer + MailModule"
```

---

### Task 5: Student credential flows

**Files:**
- Modify: `apps/api/src/modules/student/dto/create-student-account.dto.ts` (password optional)
- Create: `apps/api/src/modules/student/dto/update-student-account.dto.ts`
- Modify: `apps/api/src/modules/student/student.service.ts` (auto-generate + email; add `updateStudentAccountEmail`, `resetStudentPassword`)
- Modify: `apps/api/src/modules/student/student.controller.ts` (PATCH account, POST reset-password)
- Modify: `apps/api/src/modules/student/student.module.ts` (import `MailModule`)
- Test: `apps/api/src/modules/student/__tests__/student.service.spec.ts` (append cases)

**Interfaces:**
- Consumes: `CredentialMailer` (Task 4), `generateTemporaryPassword` (Task 2), `TenantContextService.getOrThrow().tenantId`.
- Produces (service):
  ```typescript
  createStudentAccount(studentId, dto): Promise<{ userId; studentId; email; linked: true; temporaryPassword: string; emailStatus: string }>
  updateStudentAccountEmail(studentId, dto: { email: string }): Promise<{ userId; studentId; email; emailStatus: string }>
  resetStudentPassword(studentId): Promise<{ userId; studentId; email; temporaryPassword: string; emailStatus: string }>
  ```

- [ ] **Step 1: Make password optional + add update DTO**

Edit `apps/api/src/modules/student/dto/create-student-account.dto.ts`:
```typescript
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStudentAccountDto {
  @IsEmail()
  email!: string;

  // Optional: when omitted a strong temporary password is generated and emailed.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
```
Create `apps/api/src/modules/student/dto/update-student-account.dto.ts`:
```typescript
import { IsEmail } from 'class-validator';

export class UpdateStudentAccountDto {
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/src/modules/student/__tests__/student.service.spec.ts` (inside the existing `describe`). Ensure the test module provides `TenantContextService` and `CredentialMailer` mocks — check the file's existing `beforeEach` and add these providers if missing:
```typescript
// add near the other mocks at top of file:
const mockTenantContext = { getOrThrow: jest.fn().mockReturnValue({ tenantId: 't1', slug: 'sunrise', schemaName: 'tenant_sunrise' }) };
const mockCredentialMailer = {
  sendNewCredentials: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendLoginEmailChanged: jest.fn().mockResolvedValue(undefined),
};
// add to providers array in the TestingModule:
//   { provide: TenantContextService, useValue: mockTenantContext },
//   { provide: CredentialMailer, useValue: mockCredentialMailer },

describe('createStudentAccount credential email', () => {
  it('auto-generates a password when none is supplied and emails credentials', async () => {
    mockTenantPrisma.query.mockResolvedValueOnce([{ id: 's1' }]); // preCheck
    mockTenantPrisma.run.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([{ id: 's1', user_id: null, first_name: 'A', last_name: 'B' }]) // FOR UPDATE
          .mockResolvedValueOnce([]) // email conflict none
          .mockResolvedValueOnce([{ id: 'u1', email: 'kid@x.com' }]), // user INSERT
        $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1),
      };
      return fn(tx);
    });

    const res = await service.createStudentAccount('s1', { email: 'kid@x.com' });

    expect(res.temporaryPassword).toHaveLength(12);
    expect(res.emailStatus).toBeDefined();
    expect(mockCredentialMailer.sendNewCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', to: 'kid@x.com', loginEmail: 'kid@x.com', relatedUserId: 'u1' }),
    );
  });

  it('still links the account even if the email send throws', async () => {
    mockCredentialMailer.sendNewCredentials.mockRejectedValueOnce(new Error('smtp down'));
    mockTenantPrisma.query.mockResolvedValueOnce([{ id: 's1' }]);
    mockTenantPrisma.run.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([{ id: 's1', user_id: null, first_name: 'A', last_name: 'B' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'u1', email: 'kid@x.com' }]),
        $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1),
      };
      return fn(tx);
    });

    const res = await service.createStudentAccount('s1', { email: 'kid@x.com' });
    expect(res.userId).toBe('u1');
    expect(res.emailStatus).toBe('FAILED');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest student.service -t "credential email"`
Expected: FAIL — `createStudentAccount` returns no `temporaryPassword` / `sendNewCredentials` not called.

- [ ] **Step 4: Implement service changes**

In `apps/api/src/modules/student/student.service.ts`:

Add imports at the top:
```typescript
import { TenantContextService } from '../tenant/tenant-context.service';
import { CredentialMailer } from '../mail/credential-mailer.service';
import { generateTemporaryPassword } from '../mail/password.util';
import { UpdateStudentAccountDto } from './dto/update-student-account.dto';
```
Add to the constructor params (keep existing ones):
```typescript
    private readonly tenantContext: TenantContextService,
    private readonly credentialMailer: CredentialMailer,
```
Replace the body of `createStudentAccount` so the password is generated when absent, and credentials are emailed best-effort after the transaction. Change the hash line and the return:
```typescript
    const password = dto.password ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
```
Then capture the transaction result and email after it (replace the final `return this.tenantPrisma.run(...)` so it assigns to a variable, then):
```typescript
    const result = await this.tenantPrisma.run(async (tx) => {
      // ...unchanged transaction body, returning { userId, studentId, email: dto.email, linked: true } ...
    });

    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendNewCredentials({
        tenantId: this.tenantContext.getOrThrow().tenantId,
        to: dto.email,
        loginEmail: dto.email,
        password,
        relatedUserId: result.userId,
      }),
    );

    return { ...result, temporaryPassword: password, emailStatus };
```
Add a private helper at the bottom of the class:
```typescript
  /** Sends best-effort; never throws. Returns 'SENT-ish' on success, 'FAILED' on error. */
  private async safeSend(fn: () => Promise<void>): Promise<string> {
    try {
      await fn();
      return 'SENT';
    } catch {
      return 'FAILED';
    }
  }
```
Add the two new methods:
```typescript
  async updateStudentAccountEmail(studentId: string, dto: UpdateStudentAccountDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<{ user_id: string | null }>(
      `SELECT user_id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      studentId, tenantId,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${studentId} not found`);
    if (!rows[0].user_id) throw new NotFoundException('Student has no login account');
    const userId = rows[0].user_id;

    const conflict = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND id <> $2::uuid`, dto.email, userId,
    );
    if (conflict[0]) throw new ConflictException('Email is already in use');

    await this.tenantPrisma.execute(
      `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2::uuid`, dto.email, userId,
    );

    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendLoginEmailChanged({
        tenantId, to: dto.email, newLoginEmail: dto.email, relatedUserId: userId,
      }),
    );
    return { userId, studentId, email: dto.email, emailStatus };
  }

  async resetStudentPassword(studentId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<{ user_id: string | null; email: string | null }>(
      `SELECT s.user_id, u.email
       FROM students s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = $1::uuid AND s.tenant_id = $2::uuid AND s.deleted_at IS NULL`,
      studentId, tenantId,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${studentId} not found`);
    if (!rows[0].user_id || !rows[0].email) throw new NotFoundException('Student has no login account');
    const userId = rows[0].user_id;
    const email = rows[0].email;

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await this.tenantPrisma.execute(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`, passwordHash, userId,
    );

    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendPasswordReset({
        tenantId, to: email, loginEmail: email, password, relatedUserId: userId,
      }),
    );
    return { userId, studentId, email, temporaryPassword: password, emailStatus };
  }
```
Confirm `ConflictException` and `NotFoundException` are already imported in this file (they are used elsewhere in it).

- [ ] **Step 5: Wire controller + module**

In `apps/api/src/modules/student/student.controller.ts` add the import:
```typescript
import { UpdateStudentAccountDto } from './dto/update-student-account.dto';
```
and add two routes after `createStudentAccount`:
```typescript
  @Patch(':id/account')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  updateStudentAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentAccountDto,
  ) {
    return this.studentService.updateStudentAccountEmail(id, dto);
  }

  @Post(':id/account/reset-password')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  resetStudentPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.resetStudentPassword(id);
  }
```
In `apps/api/src/modules/student/student.module.ts` add `imports: [MailModule]`:
```typescript
import { MailModule } from '../mail/mail.module';
// ...
@Module({
  imports: [MailModule],
  controllers: [StudentController],
  providers: [StudentService, StudentMeService, GuardianService],
  exports: [StudentService],
})
```

- [ ] **Step 6: Run tests + build**

Run: `cd apps/api && npx jest student.service && npx tsc --noEmit`
Expected: all student.service tests PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/student/
git commit -m "feat(api): student credential auto-gen + email + update-email/reset endpoints"
```

---

### Task 6: Staff credential flows

**Files:**
- Modify: `apps/api/src/modules/hr/dto/staff.dto.ts` (`CreateStaffDto.password` optional; add `UpdateStaffAccountDto`)
- Modify: `apps/api/src/modules/hr/staff.service.ts` (auto-generate + email; add `updateStaffAccountEmail`, `resetStaffPassword`)
- Modify: `apps/api/src/modules/hr/hr.controller.ts` (PATCH staff account, POST reset-password)
- Modify: `apps/api/src/modules/hr/hr.module.ts` (import `MailModule`)
- Test: `apps/api/src/modules/hr/__tests__/staff.service.spec.ts` (append cases)

**Interfaces:**
- Consumes: `CredentialMailer`, `generateTemporaryPassword`, `TenantContextService` (already injected in `StaffService`).
- Produces (service):
  ```typescript
  createStaff(dto): StaffResponseDto & emails credentials (temporaryPassword + emailStatus added to return)
  updateStaffAccountEmail(staffId, dto: { email }): Promise<{ userId; staffId; email; emailStatus }>
  resetStaffPassword(staffId): Promise<{ userId; staffId; email; temporaryPassword; emailStatus }>
  ```

- [ ] **Step 1: DTO changes**

In `apps/api/src/modules/hr/dto/staff.dto.ts`: change `CreateStaffDto.password` to optional and add a new DTO. Replace the password field:
```typescript
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
```
(ensure `IsOptional` and `MinLength` are in the `class-validator` import — `IsOptional` already is; add `MinLength` if absent.)
Add at the end of the file:
```typescript
export class UpdateStaffAccountDto {
  @IsEmail()
  email: string;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/src/modules/hr/__tests__/staff.service.spec.ts`. Add a `CredentialMailer` mock to the test module providers (the spec already provides `TenantPrismaService` and `TenantContextService` — confirm and reuse):
```typescript
const mockCredentialMailer = {
  sendNewCredentials: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendLoginEmailChanged: jest.fn().mockResolvedValue(undefined),
};
// provider: { provide: CredentialMailer, useValue: mockCredentialMailer }

describe('staff credential email', () => {
  it('auto-generates a password when none supplied and emails credentials on create', async () => {
    // Arrange the existing createStaff transaction mock as the file already does for createStaff,
    // returning a user id of 'u1' and email 'teacher@x.com'.
    // (Reuse the existing createStaff happy-path mock setup from this spec.)
    const res: any = await service.createStaff({
      email: 'teacher@x.com', firstName: 'T', lastName: 'R', role: 'TEACHER',
      joinDate: '2026-01-01', baseSalary: 30000,
    } as any);
    expect(res.temporaryPassword).toHaveLength(12);
    expect(mockCredentialMailer.sendNewCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'teacher@x.com', loginEmail: 'teacher@x.com' }),
    );
  });
});
```
Note for the implementer: mirror the exact `tenantPrisma.run`/`$queryRawUnsafe` mock sequence already used by the existing `createStaff` test in this file (sequence row → user INSERT → staff_profiles INSERT). Set the user INSERT to return `[{ id: 'u1' }]`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest staff.service -t "credential email"`
Expected: FAIL — no `temporaryPassword` on result / mailer not called.

- [ ] **Step 4: Implement service changes**

In `apps/api/src/modules/hr/staff.service.ts`:

Add imports:
```typescript
import { CredentialMailer } from '../mail/credential-mailer.service';
import { generateTemporaryPassword } from '../mail/password.util';
import { UpdateStaffAccountDto } from './dto/staff.dto';
```
Add to constructor:
```typescript
    private readonly credentialMailer: CredentialMailer,
```
In `createStaff`, replace the hash line:
```typescript
      const password = dto.password ?? generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```
The inner transaction returns the assembled profile object plus the new user id. Capture the user id: after `[user] = ...INSERT INTO users... RETURNING id`, the variable `user.id` is available. Return it from the transaction by adding `userId: user.id` to the returned object, then after `tenantPrisma.run(...)` resolves to `profile`:
```typescript
    const tenantId = this.tenantContext.getOrThrow().tenantId;
    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendNewCredentials({
        tenantId, to: dto.email, loginEmail: dto.email, password, relatedUserId: (profile as any).userId,
      }),
    );
    const response = toStaffResponse(profile as StaffProfileRow & { /* extra display fields already present */ } as any);
    return { ...response, temporaryPassword: password, emailStatus } as any;
```
Implementer note: the existing code already maps `profile` → response via `toStaffResponse` at the end of `createStaff`. Keep that mapping; just (a) thread `userId` out of the transaction, (b) compute `emailStatus`, and (c) spread `temporaryPassword` + `emailStatus` onto the returned response object. Add the same `safeSend` helper used in Task 5:
```typescript
  private async safeSend(fn: () => Promise<void>): Promise<string> {
    try { await fn(); return 'SENT'; } catch { return 'FAILED'; }
  }
```
Add the two account methods (resolve staff → user via `staff_profiles.user_id`):
```typescript
  async updateStaffAccountEmail(staffId: string, dto: UpdateStaffAccountDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<{ user_id: string }>(
      `SELECT user_id FROM staff_profiles WHERE id = $1::uuid`, staffId,
    );
    if (!rows[0]) throw new NotFoundException(`Staff ${staffId} not found`);
    const userId = rows[0].user_id;

    const conflict = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND id <> $2::uuid`, dto.email, userId,
    );
    if (conflict[0]) throw new ConflictException('A user with this email already exists');

    await this.tenantPrisma.execute(
      `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2::uuid`, dto.email, userId,
    );
    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendLoginEmailChanged({
        tenantId, to: dto.email, newLoginEmail: dto.email, relatedUserId: userId,
      }),
    );
    return { userId, staffId, email: dto.email, emailStatus };
  }

  async resetStaffPassword(staffId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<{ user_id: string; email: string }>(
      `SELECT sp.user_id, u.email FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
       WHERE sp.id = $1::uuid`, staffId,
    );
    if (!rows[0]) throw new NotFoundException(`Staff ${staffId} not found`);
    const { user_id: userId, email } = rows[0];

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.tenantPrisma.execute(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`, passwordHash, userId,
    );
    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendPasswordReset({
        tenantId, to: email, loginEmail: email, password, relatedUserId: userId,
      }),
    );
    return { userId, staffId, email, temporaryPassword: password, emailStatus };
  }
```
Ensure `NotFoundException`/`ConflictException` are imported (file already imports them).

- [ ] **Step 5: Wire controller + module**

In `apps/api/src/modules/hr/hr.controller.ts`, add `UpdateStaffAccountDto` to the staff DTO import, and add (mirror the role guards already used for staff create — typically `Role.SCHOOL_OWNER, Role.PRINCIPAL`):
```typescript
  @Patch('staff/:id/account')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  updateStaffAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffAccountDto,
  ) {
    return this.staffService.updateStaffAccountEmail(id, dto);
  }

  @Post('staff/:id/account/reset-password')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  resetStaffPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.resetStaffPassword(id);
  }
```
Implementer note: match the controller's existing route prefix for staff (it may be `@Controller('hr')` with `staff/...` paths, or a dedicated path — read the file and follow its convention; keep the `staff/:id/account` shape relative to that). In `hr.module.ts` add `imports: [MailModule]` (import `MailModule` from `../mail/mail.module`).

- [ ] **Step 6: Run tests + build**

Run: `cd apps/api && npx jest staff.service && npx tsc --noEmit`
Expected: staff.service tests PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/hr/
git commit -m "feat(api): staff credential auto-gen + email + update-email/reset endpoints"
```

---

### Task 7: Guardian (parent) credential flows

**Files:**
- Modify: `apps/api/src/modules/student/dto/create-guardian-account.dto.ts` (password optional)
- Modify: `apps/api/src/modules/student/guardian.service.ts` (auto-generate + email; add `resetGuardianPassword`)
- Modify: `apps/api/src/modules/student/student.controller.ts` (POST guardian reset-password)
- Test: `apps/api/src/modules/student/__tests__/guardian.service.spec.ts` (append cases)

**Interfaces:**
- Consumes: `CredentialMailer`, `generateTemporaryPassword`, `TenantContextService`.
- Produces (service):
  ```typescript
  createGuardianAccount(studentId, guardianId, dto): adds { temporaryPassword?: string; emailStatus: string } to the existing return
  resetGuardianPassword(studentId, guardianId): Promise<{ userId; guardianId; email; temporaryPassword; emailStatus }>
  ```
  Note: when an *existing* PARENT user is reused (not newly created), no new password is generated — `temporaryPassword` is omitted and a `LOGIN_EMAIL_CHANGED`-style "linked to a new child" email is skipped (out of scope); only newly created users get `sendNewCredentials`.

- [ ] **Step 1: DTO change**

Edit `apps/api/src/modules/student/dto/create-guardian-account.dto.ts`:
```typescript
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGuardianAccountDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
```

- [ ] **Step 2: Write the failing test**

Append to `apps/api/src/modules/student/__tests__/guardian.service.spec.ts`. Add `TenantContextService` + `CredentialMailer` mocks to the test module providers:
```typescript
const mockTenantContext = { getOrThrow: jest.fn().mockReturnValue({ tenantId: 't1', slug: 'sunrise', schemaName: 'tenant_sunrise' }) };
const mockCredentialMailer = {
  sendNewCredentials: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};
// providers: add TenantContextService + CredentialMailer with the mocks above

it('emails new credentials when a new PARENT user is created', async () => {
  const dto = { email: 'parent@test.com' }; // no password
  mockTenantPrisma.query.mockResolvedValueOnce([{ id: 'student-uuid' }]); // student check
  mockTenantPrisma.run.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: 'g1', student_id: 'student-uuid', relation: 'FATHER', first_name: 'Ram', last_name: 'S', phone: null, email: null, is_primary: true, user_id: null }])
        .mockResolvedValueOnce([]) // no existing user
        .mockResolvedValueOnce([{ id: 'u1', email: 'parent@test.com', role: 'PARENT', first_name: 'Ram', last_name: 'S' }]),
      $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1),
    };
    return fn(tx);
  });

  const res: any = await service.createGuardianAccount('student-uuid', 'g1', dto as any);
  expect(res.temporaryPassword).toHaveLength(12);
  expect(res.emailStatus).toBeDefined();
  expect(mockCredentialMailer.sendNewCredentials).toHaveBeenCalledWith(
    expect.objectContaining({ to: 'parent@test.com', relatedUserId: 'u1' }),
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest guardian.service -t "emails new credentials"`
Expected: FAIL — no `temporaryPassword`; mailer not called.

- [ ] **Step 4: Implement service changes**

In `apps/api/src/modules/student/guardian.service.ts`:

Add imports:
```typescript
import { TenantContextService } from '../tenant/tenant-context.service';
import { CredentialMailer } from '../mail/credential-mailer.service';
import { generateTemporaryPassword } from '../mail/password.util';
```
Add constructor params:
```typescript
    private readonly tenantContext: TenantContextService,
    private readonly credentialMailer: CredentialMailer,
```
Replace the hash line:
```typescript
    const password = dto.password ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
```
Inside the transaction, track whether a new user was created. Add `let createdNewUser = false;` before the `if (existingUser)` branch and set `createdNewUser = true;` in the `else` branch (new INSERT). Return it from the transaction object: `return { userId, guardianId, email: dto.email, linked: true, createdNewUser };`.
After the `tenantPrisma.run(...)` resolves to `result`:
```typescript
    let emailStatus = 'SKIPPED';
    if (result.createdNewUser) {
      emailStatus = await this.safeSend(() =>
        this.credentialMailer.sendNewCredentials({
          tenantId: this.tenantContext.getOrThrow().tenantId,
          to: dto.email, loginEmail: dto.email, password, relatedUserId: result.userId,
        }),
      );
      return { ...result, temporaryPassword: password, emailStatus };
    }
    return { ...result, emailStatus };
```
Add the `safeSend` helper (same as Task 5) and `resetGuardianPassword`:
```typescript
  private async safeSend(fn: () => Promise<void>): Promise<string> {
    try { await fn(); return 'SENT'; } catch { return 'FAILED'; }
  }

  async resetGuardianPassword(studentId: string, guardianId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<{ user_id: string | null; email: string | null }>(
      `SELECT g.user_id, u.email FROM guardians g LEFT JOIN users u ON u.id = g.user_id
       WHERE g.id = $1::uuid AND g.student_id = $2::uuid`, guardianId, studentId,
    );
    if (!rows[0]) throw new NotFoundException('Guardian not found');
    if (!rows[0].user_id || !rows[0].email) throw new NotFoundException('Guardian has no linked account');
    const userId = rows[0].user_id;
    const email = rows[0].email;

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await this.tenantPrisma.execute(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`, passwordHash, userId,
    );
    const emailStatus = await this.safeSend(() =>
      this.credentialMailer.sendPasswordReset({
        tenantId, to: email, loginEmail: email, password, relatedUserId: userId,
      }),
    );
    return { userId, guardianId, email, temporaryPassword: password, emailStatus };
  }
```
(`NotFoundException` is already imported in this file.)

- [ ] **Step 5: Wire controller**

In `apps/api/src/modules/student/student.controller.ts`, after `createGuardianAccount`:
```typescript
  @Post(':studentId/guardians/:guardianId/account/reset-password')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  resetGuardianPassword(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
  ) {
    return this.guardianService.resetGuardianPassword(studentId, guardianId);
  }
```
(`StudentModule` already imports `MailModule` from Task 5, which provides `CredentialMailer` to `GuardianService` — confirm `GuardianService` remains in `StudentModule.providers`.)

- [ ] **Step 6: Run tests + build**

Run: `cd apps/api && npx jest guardian.service && npx tsc --noEmit`
Expected: guardian.service tests PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/student/
git commit -m "feat(api): guardian credential auto-gen + email + reset endpoint"
```

---

### Task 8: School owner credential flows

**Files:**
- Modify: `apps/api/src/modules/super-admin/tenant-provisioning.service.ts` (`adminPassword` optional → auto-generate + email owner)
- Modify: `apps/api/src/modules/super-admin/dto/tenant-admin.dto.ts` (`ManualOnboardTenantDto.adminPassword` optional)
- Modify: `apps/api/src/modules/super-admin/tenant-admin.service.ts` (add `resendOwnerCredentials`)
- Modify: `apps/api/src/modules/super-admin/super-admin.controller.ts` (POST `tenants/:id/resend-owner-credentials`)
- Modify: `apps/api/src/modules/super-admin/super-admin.module.ts` (import `MailModule`)
- Test: `apps/api/src/modules/super-admin/__tests__/tenant-admin.service.spec.ts` (append a `resendOwnerCredentials` case)

**Interfaces:**
- Consumes: `CredentialMailer`, `generateTemporaryPassword`, `PublicPrismaService`, `TenantContextService`.
- Produces:
  ```typescript
  // provision(input): adminPassword optional; ProvisionResult unchanged but credentials emailed to owner.
  resendOwnerCredentials(tenantId: string, adminId: string): Promise<{ userId; email; emailStatus }>
  ```

- [ ] **Step 1: DTO change**

In `apps/api/src/modules/super-admin/dto/tenant-admin.dto.ts`, find `ManualOnboardTenantDto.adminPassword` and make it optional:
```typescript
  @IsOptional()
  @IsString()
  @MinLength(8)
  adminPassword?: string;
```
(add `IsOptional`/`MinLength` to the `class-validator` import if missing.)

- [ ] **Step 2: Write the failing test**

Append to `apps/api/src/modules/super-admin/__tests__/tenant-admin.service.spec.ts`. Add a `CredentialMailer` mock provider:
```typescript
const mockCredentialMailer = {
  sendNewCredentials: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};
// provider: { provide: CredentialMailer, useValue: mockCredentialMailer }

it('resendOwnerCredentials resets the owner password and emails it', async () => {
  // Owner lookup: tenant + SCHOOL_OWNER user
  mockPublicPrisma.query
    .mockResolvedValueOnce([{ id: 'tenant-1', name: 'Sunrise', slug: 'sunrise' }]); // tenant
  // The implementation runs the password UPDATE inside the tenant schema via TenantContextService.run;
  // mock tenantContext.run to invoke the callback, and tenantPrisma.query/execute for the user lookup + update.
  (mockTenantContext.run as jest.Mock).mockImplementation(async (_ctx: any, cb: any) => cb());
  mockTenantPrisma.query.mockResolvedValueOnce([{ id: 'owner-1', email: 'owner@x.com' }]); // SCHOOL_OWNER user
  mockTenantPrisma.execute.mockResolvedValueOnce(1); // password update

  const res = await service.resendOwnerCredentials('tenant-1', 'admin-1');

  expect(res.email).toBe('owner@x.com');
  expect(mockCredentialMailer.sendPasswordReset).toHaveBeenCalledWith(
    expect.objectContaining({ tenantId: 'tenant-1', to: 'owner@x.com', relatedUserId: 'owner-1' }),
  );
});
```
Implementer note: confirm the spec's existing mocks for `PublicPrismaService`, `TenantPrismaService`, `TenantContextService`, `AuditService` and reuse their names; add `CredentialMailer`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest tenant-admin.service -t "resendOwnerCredentials"`
Expected: FAIL — `service.resendOwnerCredentials` is not a function.

- [ ] **Step 4: Implement provisioning change**

In `apps/api/src/modules/super-admin/tenant-provisioning.service.ts`:

Add imports:
```typescript
import { CredentialMailer } from '../mail/credential-mailer.service';
import { generateTemporaryPassword } from '../mail/password.util';
```
Add constructor param:
```typescript
    private readonly credentialMailer: CredentialMailer,
```
In `provision`, replace the hash with auto-generate, and email after the user is created. Change:
```typescript
        const password = input.adminPassword ?? generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```
After building the return object (still inside the `tenantContext.run` callback, after `const user = rows[0];`), capture for emailing. Move the email send to AFTER the `tenantContext.run(...)` resolves to avoid sending inside the rollback-on-error block. Restructure so `provision` collects `{ result, ownerPassword, ownerEmail, ownerUserId, tenantId }` from the try-block, then emails best-effort:
```typescript
      const provisioned = await this.tenantContext.run(ctx, async () => {
        // ...unchanged INSERT users... returning user...
        return {
          result: {
            tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
            user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
          },
          ownerPassword: password,
          ownerEmail: user.email,
          ownerUserId: user.id,
        };
      });

      // best-effort credential email (outside the rollback block)
      try {
        await this.credentialMailer.sendNewCredentials({
          tenantId: tenant.id,
          to: provisioned.ownerEmail,
          loginEmail: provisioned.ownerEmail,
          password: provisioned.ownerPassword,
          relatedUserId: provisioned.ownerUserId,
        });
      } catch { /* best-effort: never fail onboarding on email error */ }

      return provisioned.result;
```
Keep the existing `catch (err)` cleanup block unchanged (it wraps `provisionSchema` + the run). Ensure the email send is INSIDE the `try` of the existing try/catch only if it must not trigger schema cleanup on failure — since it is wrapped in its own `try/catch` that swallows errors, placement after `tenantContext.run` within the outer try is safe.

- [ ] **Step 5: Implement resendOwnerCredentials**

In `apps/api/src/modules/super-admin/tenant-admin.service.ts` add imports:
```typescript
import { CredentialMailer } from '../mail/credential-mailer.service';
import { generateTemporaryPassword } from '../mail/password.util';
import * as bcrypt from 'bcrypt';
```
Add constructor param `private readonly credentialMailer: CredentialMailer,`. Add the method:
```typescript
  async resendOwnerCredentials(tenantId: string, adminId: string) {
    const tenants = await this.publicPrisma.query<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM tenants WHERE id = $1::uuid AND "deletedAt" IS NULL`,
      tenantId,
    );
    if (!tenants[0]) throw new NotFoundException(`Tenant ${tenantId} not found`);
    const t = tenants[0];

    const ctx = {
      tenantId: t.id,
      slug: t.slug,
      schemaName: TenantService.schemaNameFor(t.slug),
    };

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const owner = await this.tenantContext.run(ctx, async () => {
      const rows = await this.tenantPrisma.query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE role = 'SCHOOL_OWNER' ORDER BY created_at ASC LIMIT 1`,
      );
      if (!rows[0]) throw new NotFoundException('School owner account not found');
      await this.tenantPrisma.execute(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`,
        passwordHash, rows[0].id,
      );
      return rows[0];
    });

    let emailStatus = 'SENT';
    try {
      await this.credentialMailer.sendPasswordReset({
        tenantId: t.id, to: owner.email, loginEmail: owner.email, password, relatedUserId: owner.id,
      });
    } catch { emailStatus = 'FAILED'; }

    await this.audit.log(adminId, 'TENANT_OWNER_CREDENTIALS_RESENT', 'TENANT', tenantId);
    return { userId: owner.id, email: owner.email, emailStatus };
  }
```
Confirm `NotFoundException`, `TenantService`, `tenantContext`, `tenantPrisma`, `audit`, `publicPrisma` are already injected/imported in this file (they are, per existing methods).

- [ ] **Step 6: Wire controller + module**

In `apps/api/src/modules/super-admin/super-admin.controller.ts`, after `suspendTenant` (or near the tenant routes):
```typescript
  @Post('tenants/:id/resend-owner-credentials')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  resendOwnerCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.resendOwnerCredentials(id, user.userId);
  }
```
In `apps/api/src/modules/super-admin/super-admin.module.ts` add `MailModule` to `imports` (import from `../mail/mail.module`).
> Note: `MailModule` provides its own `PublicPrismaService` instance; `SuperAdminModule` also provides one. Both depend only on the global `PrismaService`, so duplicate providers are harmless (each module gets its own). No conflict.

- [ ] **Step 7: Run tests + build**

Run: `cd apps/api && npx jest tenant-admin.service && npx tsc --noEmit`
Expected: tenant-admin.service tests PASS; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/super-admin/
git commit -m "feat(api): school-owner credential auto-gen + email + resend endpoint"
```

---

### Task 9: Env config, docs, and full verification

**Files:**
- Modify: `apps/api/.env.example` (add SMTP vars) — create if absent
- Modify: `CLAUDE.md` (document the feature + env)

**Interfaces:** none (config + docs + final gate).

- [ ] **Step 1: Add env example**

Append to `apps/api/.env.example` (create the file if it does not exist):
```
# Email (credential provisioning). Leave SMTP_HOST blank to use the mock transport (dev).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
MAIL_FROM=no-reply@aaramvashikshya.com
MAIL_FROM_NAME=Aaramva Shikshya
```

- [ ] **Step 2: Document in CLAUDE.md**

Add a short bullet under "What's built so far":
```markdown
- [x] Credential provisioning emails — `MailModule` (`apps/api/src/modules/mail/`): `MailService` (nodemailer SMTP, mock transport when `SMTP_HOST` unset, best-effort `email_log` recording in public schema) + `CredentialMailer` (composes credential/email-changed messages, resolves school name+slug). Account flows auto-generate a temporary password when none supplied and email login email + temp password + school code: students (`POST/PATCH /students/:id/account`, `POST /students/:id/account/reset-password`), staff (`POST/PATCH /hr/staff/:id/account`, reset-password), guardians (`POST /students/:sid/guardians/:gid/account` + reset-password), school owner (onboarding + `POST /super-admin/tenants/:id/resend-owner-credentials`). Email failures never roll back the account. Plaintext passwords are never stored; "resend" = reset-password.
```

- [ ] **Step 3: Full test suite + build**

Run: `cd apps/api && npx tsc --noEmit && npm test`
Expected: tsc exits 0; Jest suite green (pre-existing failures in `student-attendance.service.spec.ts` noted in CLAUDE.md may remain — confirm no NEW failures were introduced).

- [ ] **Step 4: Commit**

```bash
git add apps/api/.env.example CLAUDE.md
git commit -m "docs(api): document credential provisioning emails + SMTP env"
```

---

## Self-Review

**Spec coverage:**
- Auto-generate passwords → Task 2 (util) + Tasks 5–8 (`?? generateTemporaryPassword()`). ✓
- nodemailer SMTP + mock transport → Task 3. ✓
- `email_log` public table, metadata only, best-effort → Task 1 (schema) + Task 3 (`send` never throws, records status). ✓
- All four flows (student/staff/guardian/school owner) → Tasks 5/6/7/8. ✓
- CRUD update login email + reset password → Tasks 5–8 (`updateStudentAccountEmail`/`updateStaffAccountEmail` + `resetXPassword` + `resendOwnerCredentials`). ✓
- School code (slug) + login URL + mobile instructions + advisory in content → Task 4 `CredentialMailer`. ✓
- Env config → Task 9. ✓
- "Force change on first login" explicitly out of scope → reflected (advisory text only). ✓
- Resend semantics (reset = resend; no generic replay) → Tasks 5–8 reset endpoints; no replay endpoint. ✓

**Placeholder scan:** Code is provided for every implementation step. Two steps ("staff createStaff transaction mock", "resendOwnerCredentials spec mocks") direct the implementer to mirror an existing in-file mock sequence rather than reproduce it — this is intentional (the exact prior sequence lives in the file and must match it), not a content gap.

**Type consistency:** `generateTemporaryPassword` (Task 2) used identically in 5–8. `CredentialMailer` method names (`sendNewCredentials`/`sendPasswordReset`/`sendLoginEmailChanged`) consistent across Tasks 4–8. `MailService.send` `SendMailInput` shape consistent between Tasks 3 and 4. `safeSend` helper defined per-service (Tasks 5/6/7) with identical signature. `email_log` columns identical between Task 1 SQL and Task 3 INSERT/UPDATE. ✓
