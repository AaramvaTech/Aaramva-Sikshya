import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { generateTemporaryPassword } from '../mail/password.util';
import { toE164Nepal } from '../common/utils/phone.util';
import {
  encryptSecret,
  decryptSecret,
  credentialKeyConfigured,
} from './credential-crypto.util';

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
}

const MAX_ATTEMPTS = 3;

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
    const tally: DrainTally = { processed: 0, sent: 0, dry: 0, failed: 0, retried: 0 };
    for (let i = 0; i < maxRows; i++) {
      const outcome = await this.processOneDueRow();
      if (!outcome) break;
      tally.processed++;
      if (outcome === 'SENT') tally.sent++;
      else if (outcome === 'SENT_DRY') tally.dry++;
      else if (outcome === 'FAILED') tally.failed++;
      else tally.retried++;
    }
    return tally;
  }

  private async processOneDueRow(): Promise<
    'SENT' | 'SENT_DRY' | 'FAILED' | 'RETRY' | null
  > {
    return this.tenantPrisma.run(async (tx) => {
      const rows = await tx.$queryRawUnsafe<DeliveryRow[]>(
        `SELECT id, user_id, recipient_user_id, channel, recipient, attempts
         FROM credential_deliveries
         WHERE status = 'PENDING' AND next_attempt_at <= NOW()
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      const row = rows[0];
      if (!row) return null;

      let result: 'SENT' | 'SENT_DRY' | 'FAILED' | 'RETRY';
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
  ): Promise<{ ownerName: string; ownerUsername: string; guardianRouted: boolean }> {
    const u = await tx.$queryRawUnsafe<
      { first_name: string; last_name: string | null; email: string }[]
    >(`SELECT first_name, last_name, email FROM users WHERE id = $1::uuid`, row.user_id);
    const o = u[0];
    const name = o ? `${o.first_name} ${o.last_name ?? ''}`.trim() : '';
    return {
      ownerName: name || (o?.email ?? row.recipient),
      ownerUsername: o?.email ?? row.recipient,
      guardianRouted: row.recipient_user_id != null,
    };
  }

  private async deliverEmail(
    tx: TenantTx,
    row: DeliveryRow,
    plaintext: string,
  ): Promise<'SENT' | 'RETRY'> {
    const c = await this.ownerContext(tx, row);
    const res = await this.mail.send({
      to: row.recipient,
      subject: c.guardianRouted
        ? `Login details for ${c.ownerName}`
        : 'Your school account credentials',
      html: c.guardianRouted
        ? this.guardianHtml(c.ownerName, c.ownerUsername, plaintext)
        : this.selfHtml(c.ownerUsername, plaintext),
      text: c.guardianRouted
        ? `Login details for ${c.ownerName} — username: ${c.ownerUsername}, temporary password: ${plaintext}. They will be asked to change it on first login.`
        : `Username: ${c.ownerUsername}\nTemporary password: ${plaintext}\nYou will be asked to change this password on first login.`,
      type: 'CREDENTIALS',
      relatedUserId: row.user_id,
    });
    // MAIL-1: dev without SMTP → MOCK (handled). Only a real send failure → FAILED.
    return res.status === 'FAILED' ? 'RETRY' : 'SENT';
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

  private selfHtml(username: string, tempPassword: string): string {
    return `<p>Your account has been created.</p>
<p><strong>Username:</strong> ${escHtml(username)}<br/>
<strong>Temporary password:</strong> ${escHtml(tempPassword)}</p>
<p>For your security, you will be asked to change this password the first time you log in.</p>`;
  }

  private guardianHtml(studentName: string, username: string, tempPassword: string): string {
    return `<p>Login details for <strong>${escHtml(studentName)}</strong>.</p>
<p><strong>Username:</strong> ${escHtml(username)}<br/>
<strong>Temporary password:</strong> ${escHtml(tempPassword)}</p>
<p>${escHtml(studentName)} will be asked to change this password the first time they log in.</p>`;
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
