import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { generateTemporaryPassword } from '../mail/password.util';
import { toE164Nepal } from '../common/utils/phone.util';
import {
  encryptSecret,
  decryptSecret,
  credentialKeyConfigured,
} from './credential-crypto.util';
import {
  isRateLimitError,
  rateLimitBackoffSeconds,
  MAX_RETRY_HOLDS,
} from './retry-classifier.util';

export type DeliveryChannel = 'EMAIL' | 'SMS';

export interface DeliveryTarget {
  channel: DeliveryChannel;
  recipient: string; // email address or E.164 phone
  recipientUserId?: string | null; // guardian's user id, when routing student creds
}

export interface EnqueueParams {
  userId: string;
  plaintext: string; // temp password — encrypted at rest, never persisted plain
  studentName?: string; // set when creds are a student's, routed to a guardian
  targets: DeliveryTarget[];
}

interface DeliveryRow {
  id: string;
  user_id: string;
  recipient_user_id: string | null;
  channel: DeliveryChannel;
  recipient: string;
  attempts: number;
  retry_holds: number;
}

interface SecretRow {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

export interface DrainTally {
  processed: number;
  sent: number;
  dry: number;
  failed: number;
  retried: number;
  /** MAIL-2: rate-limit holds (rescheduled with NO attempt burned). */
  held: number;
}

const MAX_ATTEMPTS = 3;

/** School identity woven into the credential email (MAIL-2-OBS-1 fix). */
interface SchoolInfo {
  name: string;
  code: string; // the tenant slug — what the mobile app asks for
  loginUrl: string;
}

const escHtml = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

@Injectable()
export class CredentialDeliveryService {
  private readonly logger = new Logger(CredentialDeliveryService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly mail: MailService,
    private readonly tenantContext: TenantContextService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * REG-1 §4 — inside the registration transaction: write the encrypted secret
   * (one per user) + one PENDING ledger row per target. Returns the new row ids
   * so the API response can hand them back for polling.
   */
  async enqueueInTx(tx: TenantTx, params: EnqueueParams): Promise<string[]> {
    const enc = encryptSecret(params.plaintext);
    await tx.$executeRawUnsafe(
      `INSERT INTO credential_delivery_secrets (user_id, ciphertext, iv, auth_tag, created_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
             auth_tag = EXCLUDED.auth_tag, created_at = NOW()`,
      params.userId,
      enc.ciphertext,
      enc.iv,
      enc.authTag,
    );
    const ids: string[] = [];
    for (const t of params.targets) {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO credential_deliveries
           (user_id, recipient_user_id, channel, recipient, status, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'PENDING', NOW())
         RETURNING id`,
        params.userId,
        t.recipientUserId ?? null,
        t.channel,
        t.recipient,
      );
      ids.push(rows[0].id);
    }
    return ids;
  }

  /** Admin ledger read (GET /credential-deliveries?userId=). */
  async listForUser(userId: string) {
    return this.tenantPrisma.query(
      `SELECT id, user_id, recipient_user_id, channel, recipient, status,
              attempts, last_error, next_attempt_at, created_at, updated_at
       FROM credential_deliveries WHERE user_id = $1::uuid
       ORDER BY created_at ASC`,
      userId,
    );
  }

  /**
   * Drain the CURRENT tenant's due PENDING rows. One row per transaction, claimed
   * FOR UPDATE SKIP LOCKED so concurrent/multi-instance pollers never double-send.
   * A RETRY pushes next_attempt_at into the future (leaving the loop), so this
   * terminates once every currently-due row has been handled.
   */
  async drainCurrentTenant(maxRows = 500): Promise<DrainTally> {
    const tally: DrainTally = {
      processed: 0,
      sent: 0,
      dry: 0,
      failed: 0,
      retried: 0,
      held: 0,
    };
    for (let i = 0; i < maxRows; i++) {
      const outcome = await this.processOneDueRow();
      if (!outcome) break;
      tally.processed++;
      if (outcome === 'SENT') tally.sent++;
      else if (outcome === 'SENT_DRY') tally.dry++;
      else if (outcome === 'FAILED') tally.failed++;
      else if (outcome === 'HELD') tally.held++;
      else tally.retried++;
    }
    return tally;
  }

  private async processOneDueRow(): Promise<
    'SENT' | 'SENT_DRY' | 'FAILED' | 'RETRY' | 'HELD' | null
  > {
    return this.tenantPrisma.run(async (tx) => {
      const rows = await tx.$queryRawUnsafe<DeliveryRow[]>(
        `SELECT id, user_id, recipient_user_id, channel, recipient, attempts, retry_holds
         FROM credential_deliveries
         WHERE status = 'PENDING' AND next_attempt_at <= NOW()
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      const row = rows[0];
      if (!row) return null;

      let result: 'SENT' | 'SENT_DRY' | 'FAILED' | 'RETRY' | 'HELD';
      let lastError: string | null = null;
      try {
        const plaintext = await this.decryptFor(tx, row.user_id);
        result =
          row.channel === 'SMS'
            ? await this.deliverSms(tx, row, plaintext)
            : await this.deliverEmail(tx, row, plaintext);
      } catch (err) {
        result = 'RETRY';
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (result === 'SENT' || result === 'SENT_DRY') {
        await tx.$executeRawUnsafe(
          `UPDATE credential_deliveries
             SET status = $1, attempts = attempts + 1, last_error = NULL, updated_at = NOW()
           WHERE id = $2::uuid`,
          result,
          row.id,
        );
      } else if (isRateLimitError(lastError)) {
        // MAIL-2 §2 — RETRYABLE_NO_ATTEMPT: a provider rate-limit / greylist must
        // NOT burn an attempt. Reschedule, bump retry_holds, keep status PENDING.
        // A genuinely stuck row hits the cap → FAILED.
        const holds = (row.retry_holds ?? 0) + 1;
        if (holds >= MAX_RETRY_HOLDS) {
          result = 'FAILED';
          await tx.$executeRawUnsafe(
            `UPDATE credential_deliveries
               SET status = 'FAILED', retry_holds = $1, last_error = $2, updated_at = NOW()
             WHERE id = $3::uuid`,
            holds,
            'retry hold cap exceeded',
            row.id,
          );
        } else {
          result = 'HELD';
          const backoffSec = rateLimitBackoffSeconds(holds);
          this.logger.warn(
            `Credential delivery ${row.id} (${row.channel}) held on rate-limit ` +
              `(retry_holds=${holds}/${MAX_RETRY_HOLDS}) — no attempt burned, retry in ${backoffSec}s`,
          );
          await tx.$executeRawUnsafe(
            `UPDATE credential_deliveries
               SET retry_holds = $1, last_error = $2,
                   next_attempt_at = NOW() + ($3 || ' seconds')::interval, updated_at = NOW()
             WHERE id = $4::uuid`,
            holds,
            lastError,
            String(backoffSec),
            row.id,
          );
        }
      } else {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          result = 'FAILED';
          await tx.$executeRawUnsafe(
            `UPDATE credential_deliveries
               SET status = 'FAILED', attempts = $1, last_error = $2, updated_at = NOW()
             WHERE id = $3::uuid`,
            attempts,
            lastError,
            row.id,
          );
        } else {
          const backoffSec = 2 ** attempts * 60; // 2 min, then 4 min
          await tx.$executeRawUnsafe(
            `UPDATE credential_deliveries
               SET attempts = $1, last_error = $2,
                   next_attempt_at = NOW() + ($3 || ' seconds')::interval, updated_at = NOW()
             WHERE id = $4::uuid`,
            attempts,
            lastError,
            String(backoffSec),
            row.id,
          );
        }
      }

      // Delete the secret once the user has no non-terminal deliveries left.
      const pending = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM credential_deliveries
         WHERE user_id = $1::uuid AND status = 'PENDING'`,
        row.user_id,
      );
      if (pending[0].n === 0) {
        await tx.$executeRawUnsafe(
          `DELETE FROM credential_delivery_secrets WHERE user_id = $1::uuid`,
          row.user_id,
        );
      }
      return result;
    });
  }

  private async decryptFor(tx: TenantTx, userId: string): Promise<string> {
    const secret = await tx.$queryRawUnsafe<SecretRow[]>(
      `SELECT ciphertext, iv, auth_tag FROM credential_delivery_secrets WHERE user_id = $1::uuid`,
      userId,
    );
    if (!secret[0]) {
      throw new Error('credential secret missing (expired or already delivered)');
    }
    return decryptSecret({
      ciphertext: secret[0].ciphertext,
      iv: secret[0].iv,
      authTag: secret[0].auth_tag,
    });
  }

  /**
   * Resolve the account owner (whose credentials these are) + whether this row is
   * routed to a DIFFERENT person — a guardian — signalled by recipient_user_id.
   * Guardian-routed rows name the student + their username in the message.
   */
  private async ownerContext(
    tx: TenantTx,
    row: DeliveryRow,
  ): Promise<{
    ownerName: string;
    ownerUsername: string;
    ownerRole: string | null;
    guardianRouted: boolean;
  }> {
    const u = await tx.$queryRawUnsafe<
      { first_name: string; last_name: string | null; email: string; role: string | null }[]
    >(`SELECT first_name, last_name, email, role FROM users WHERE id = $1::uuid`, row.user_id);
    const o = u[0];
    const name = o ? `${o.first_name} ${o.last_name ?? ''}`.trim() : '';
    return {
      ownerName: name || (o?.email ?? row.recipient),
      ownerUsername: o?.email ?? row.recipient,
      ownerRole: o?.role ?? null,
      guardianRouted: row.recipient_user_id != null,
    };
  }

  /**
   * MAIL-2-OBS-1 — the school identity the recipient needs to actually log in:
   * name (framing), code (= tenant slug, what the mobile app asks for) and the web
   * login URL. Resolved from the current tenant context + the public tenants table
   * (slug is a plain lowercase text column, unlike the camelCase/TEXT id).
   */
  private async schoolContext(): Promise<SchoolInfo> {
    const code = this.tenantContext.get()?.slug ?? '';
    let name = 'your school';
    if (code) {
      const rows = await this.publicPrisma.query<{ name: string }>(
        `SELECT name FROM tenants WHERE slug = $1`,
        code,
      );
      if (rows[0]?.name) name = rows[0].name;
    }
    const domain = this.config.get<string>('APP_DOMAIN') || 'aaramvashikshya.com';
    return { name, code, loginUrl: code ? `https://${code}.${domain}` : `https://${domain}` };
  }

  /** Friendly account-type label so the recipient knows what the credentials are for. */
  private accountTypeLabel(role: string | null): string {
    switch (role) {
      case 'STUDENT':
        return 'student';
      case 'PARENT':
        return 'parent';
      case 'SCHOOL_OWNER':
        return 'school owner';
      default:
        return 'staff';
    }
  }

  private async deliverEmail(
    tx: TenantTx,
    row: DeliveryRow,
    plaintext: string,
  ): Promise<'SENT'> {
    const c = await this.ownerContext(tx, row);
    const school = await this.schoolContext();
    const accountType = this.accountTypeLabel(c.ownerRole);
    const res = await this.mail.send({
      to: row.recipient,
      subject: c.guardianRouted
        ? `Login details for ${c.ownerName} at ${school.name}`
        : `Your ${school.name} ${accountType} login is ready`,
      html: c.guardianRouted
        ? this.guardianHtml(c.ownerName, c.ownerUsername, plaintext, school)
        : this.selfHtml(c.ownerUsername, plaintext, school, accountType),
      text: c.guardianRouted
        ? this.guardianText(c.ownerName, c.ownerUsername, plaintext, school)
        : this.selfText(c.ownerUsername, plaintext, school, accountType),
      type: 'CREDENTIALS',
      relatedUserId: row.user_id,
    });
    // MAIL-1: dev without SMTP → MOCK (treated as delivered). MAIL-2: a real send
    // failure THROWS the transport error text (never a body) so the poller's
    // channel-generic classifier can see SMTP 421/450/451 etc. and hold vs. burn
    // an attempt. A null error still throws a generic message → normal retry path.
    if (res.status === 'FAILED') {
      throw new Error(res.error ?? 'email delivery failed');
    }
    return 'SENT';
  }

  private async deliverSms(
    tx: TenantTx,
    row: DeliveryRow,
    plaintext: string,
  ): Promise<'SENT' | 'SENT_DRY'> {
    if (process.env.SMS_DRY_RUN === 'true') {
      // dev/CI: never call Sparrow, never build a body carrying the password.
      return 'SENT_DRY';
    }
    const c = await this.ownerContext(tx, row);
    const message = c.guardianRouted
      ? `Login for ${c.ownerName} (username ${c.ownerUsername}): temporary password ${plaintext}. Change it on first login.`
      : `Your school login temporary password: ${plaintext}. Please change it on first login.`;
    // REG-NOTE-3: deliberately NOT via communication/SmsService — that service
    // persists the message body to sms_logs AND console-logs it in MOCK mode, which
    // would leak the temp password (visible in a pg_dump / logs). This in-memory
    // Sparrow POST never persists the body — redaction-safe by construction.
    const resp = await fetch('https://api.sparrowsms.com/v2/sms/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SPARROW_SMS_TOKEN ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SPARROW_SMS_SENDER,
        to: row.recipient,
        text: message,
      }),
    });
    if (!resp.ok) throw new Error(`Sparrow SMS failed: HTTP ${resp.status}`);
    return 'SENT';
  }

  /** Shared "how to log in" block (web + mobile school-code instructions). */
  private howToLogIn(school: SchoolInfo): string {
    return `<p><strong>How to log in</strong><br/>
Web: <a href="${school.loginUrl}">${escHtml(school.loginUrl)}</a><br/>
Mobile: open the Aaramva Shikshya app, enter the school code "<strong>${escHtml(school.code)}</strong>", then log in.</p>`;
  }

  private credentialList(username: string, tempPassword: string, school: SchoolInfo): string {
    return `<ul>
  <li><strong>School code:</strong> ${escHtml(school.code)}</li>
  <li><strong>Login email:</strong> ${escHtml(username)}</li>
  <li><strong>Temporary password:</strong> ${escHtml(tempPassword)}</li>
</ul>`;
  }

  private selfHtml(
    username: string,
    tempPassword: string,
    school: SchoolInfo,
    accountType: string,
  ): string {
    return `<p>Your Aaramva Shikshya ${escHtml(accountType)} account for <strong>${escHtml(school.name)}</strong> has been created.</p>
${this.credentialList(username, tempPassword, school)}
${this.howToLogIn(school)}
<p>For your security, you will be asked to change this password the first time you log in.</p>`;
  }

  private guardianHtml(
    studentName: string,
    username: string,
    tempPassword: string,
    school: SchoolInfo,
  ): string {
    return `<p>Login details for <strong>${escHtml(studentName)}</strong>'s student account at <strong>${escHtml(school.name)}</strong>.</p>
${this.credentialList(username, tempPassword, school)}
${this.howToLogIn(school)}
<p>${escHtml(studentName)} will be asked to change this password the first time they log in.</p>`;
  }

  private howToLogInText(school: SchoolInfo): string[] {
    return [
      `How to log in:`,
      `Web: ${school.loginUrl}`,
      `Mobile: open the Aaramva Shikshya app, enter the school code "${school.code}", then log in.`,
    ];
  }

  private selfText(
    username: string,
    tempPassword: string,
    school: SchoolInfo,
    accountType: string,
  ): string {
    return [
      `Your Aaramva Shikshya ${accountType} account for ${school.name} has been created.`,
      ``,
      `School code: ${school.code}`,
      `Login email: ${username}`,
      `Temporary password: ${tempPassword}`,
      ``,
      ...this.howToLogInText(school),
      ``,
      `For your security, you will be asked to change this password the first time you log in.`,
    ].join('\n');
  }

  private guardianText(
    studentName: string,
    username: string,
    tempPassword: string,
    school: SchoolInfo,
  ): string {
    return [
      `Login details for ${studentName}'s student account at ${school.name}.`,
      ``,
      `School code: ${school.code}`,
      `Login email: ${username}`,
      `Temporary password: ${tempPassword}`,
      ``,
      ...this.howToLogInText(school),
      ``,
      `${studentName} will be asked to change this password the first time they log in.`,
    ].join('\n');
  }

  /**
   * REG-1 §4 (resend) — POST /users/:id/resend-credentials. Generates a NEW temp
   * password (invalidating the old hash), re-sets must_change_password, revokes
   * sessions, and writes fresh PENDING ledger rows + a new encrypted secret. Never
   * returns or re-sends the old password. Soft-deleted / unknown user → 404 (no enqueue).
   */
  async resendForUser(userId: string): Promise<{ userId: string; deliveryIds: string[] }> {
    if (!credentialKeyConfigured()) {
      throw new ServiceUnavailableException(
        'Credential delivery is not configured (CREDENTIAL_SECRET_KEY unset)',
      );
    }
    const rows = await this.tenantPrisma.query<{
      id: string;
      email: string;
      phone: string | null;
    }>(
      `SELECT id, email, phone FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      userId,
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    const user = rows[0];

    const plaintext = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(plaintext, 10);

    const deliveryIds = await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW()
         WHERE id = $2::uuid`,
        passwordHash,
        userId,
      );
      await tx.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE user_id = $1::uuid`, userId);
      const targets: DeliveryTarget[] = [{ channel: 'EMAIL', recipient: user.email }];
      if (user.phone) {
        targets.push({ channel: 'SMS', recipient: toE164Nepal(user.phone) ?? user.phone });
      }
      return this.enqueueInTx(tx, { userId, plaintext, targets });
    });
    return { userId, deliveryIds };
  }
}
