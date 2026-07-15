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
import {
  CredentialTemplateType,
  CredentialContext,
  SchoolIdentity,
  deriveTemplateType,
  renderCredentialEmail,
  renderCredentialSms,
  resolveSenderIdentity,
} from './credential-template.util';

export type DeliveryChannel = 'EMAIL' | 'SMS';

export interface DeliveryTarget {
  channel: DeliveryChannel;
  recipient: string; // email address or E.164 phone
  recipientUserId?: string | null; // guardian's user id, when routing student creds
  /** MAIL-3: per-recipient template type, stored on the ledger (enqueue MUST set it). */
  templateType: CredentialTemplateType;
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
  template_type: CredentialTemplateType;
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
           (user_id, recipient_user_id, channel, recipient, status, next_attempt_at, template_type)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'PENDING', NOW(), $5)
         RETURNING id`,
        params.userId,
        t.recipientUserId ?? null,
        t.channel,
        t.recipient,
        t.templateType,
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
        `SELECT id, user_id, recipient_user_id, channel, recipient, attempts, retry_holds, template_type
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
   * MAIL-3 — the school identity for framing + Reply-To. name + code (tenant slug)
   * + login URL, plus the school's official email (`tenants.email`, reused as
   * Reply-To). All plain lowercase text columns on the public tenants table.
   */
  private async schoolContext(): Promise<SchoolIdentity> {
    const code = this.tenantContext.get()?.slug ?? '';
    let name = 'your school';
    let officialEmail: string | null = null;
    if (code) {
      const rows = await this.publicPrisma.query<{ name: string; email: string | null }>(
        `SELECT name, email FROM tenants WHERE slug = $1`,
        code,
      );
      if (rows[0]) {
        if (rows[0].name) name = rows[0].name;
        officialEmail = rows[0].email ?? null;
      }
    }
    const domain = this.config.get<string>('APP_DOMAIN') || 'aaramvashikshya.com';
    return {
      name,
      code,
      loginUrl: code ? `https://${code}.${domain}` : `https://${domain}`,
      officialEmail,
    };
  }

  /** Build the render context for a due row (MAIL-3). */
  private async buildContext(
    tx: TenantTx,
    row: DeliveryRow,
    plaintext: string,
  ): Promise<CredentialContext> {
    const c = await this.ownerContext(tx, row);
    const school = await this.schoolContext();
    return {
      school,
      loginEmail: c.ownerUsername,
      tempPassword: plaintext,
      ownerName: c.ownerName,
      ownerRole: c.ownerRole,
      // STUDENT_VIA_GUARDIAN names the student (= the account owner, since user_id is the student).
      studentName: row.template_type === 'STUDENT_VIA_GUARDIAN' ? c.ownerName : undefined,
    };
  }

  private async deliverEmail(
    tx: TenantTx,
    row: DeliveryRow,
    plaintext: string,
  ): Promise<'SENT'> {
    const ctx = await this.buildContext(tx, row, plaintext);
    const { subject, html, text } = renderCredentialEmail(row.template_type, ctx);
    // MAIL-3: tenant-aware From display name + Reply-To (platform identity for NEW_SCHOOL_OWNER).
    const identity = resolveSenderIdentity(row.template_type, ctx.school);
    const res = await this.mail.send({
      to: row.recipient,
      subject,
      html,
      text,
      type: 'CREDENTIALS',
      relatedUserId: row.user_id,
      fromName: identity.fromName,
      replyTo: identity.replyTo,
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
    const ctx = await this.buildContext(tx, row, plaintext);
    const message = renderCredentialSms(row.template_type, ctx); // MAIL-3: ASCII, ≤160 chars
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
      role: string | null;
    }>(
      `SELECT id, email, phone, role FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      userId,
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    const user = rows[0];

    const plaintext = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(plaintext, 10);
    // MAIL-3: re-derive the template type from the owner's role. A resend goes to the
    // account's OWN contacts (not guardian-routed) — a STUDENT resend is STUDENT_SELF.
    const templateType = deriveTemplateType(user.role, false);

    const deliveryIds = await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW()
         WHERE id = $2::uuid`,
        passwordHash,
        userId,
      );
      await tx.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE user_id = $1::uuid`, userId);
      const targets: DeliveryTarget[] = [
        { channel: 'EMAIL', recipient: user.email, templateType },
      ];
      if (user.phone) {
        targets.push({ channel: 'SMS', recipient: toE164Nepal(user.phone) ?? user.phone, templateType });
      }
      return this.enqueueInTx(tx, { userId, plaintext, targets });
    });
    return { userId, deliveryIds };
  }
}
