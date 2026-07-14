import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { encryptSecret, decryptSecret } from './credential-crypto.util';

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
        `SELECT id, user_id, channel, recipient, attempts
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
            ? await this.deliverSms(row.recipient, plaintext)
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

  private async deliverEmail(
    tx: TenantTx,
    row: DeliveryRow,
    plaintext: string,
  ): Promise<'SENT' | 'RETRY'> {
    const u = await tx.$queryRawUnsafe<{ email: string }[]>(
      `SELECT email FROM users WHERE id = $1::uuid`,
      row.user_id,
    );
    const username = u[0]?.email ?? row.recipient;
    const res = await this.mail.send({
      to: row.recipient,
      subject: 'Your school account credentials',
      html: this.credentialHtml(username, plaintext),
      text: `Username: ${username}\nTemporary password: ${plaintext}\nYou will be asked to change this password on first login.`,
      type: 'CREDENTIALS',
      relatedUserId: row.user_id,
    });
    // MAIL-1: dev without SMTP → MOCK (handled). Only a real send failure → FAILED.
    return res.status === 'FAILED' ? 'RETRY' : 'SENT';
  }

  private async deliverSms(
    recipient: string,
    plaintext: string,
  ): Promise<'SENT' | 'SENT_DRY'> {
    if (process.env.SMS_DRY_RUN === 'true') {
      // dev/CI: never call Sparrow, never build a body carrying the password.
      return 'SENT_DRY';
    }
    // Real send — in-memory only, NOT via SmsService (which persists the body to
    // sms_logs). Redaction-safe: the password leaves only over the Sparrow wire.
    const message = `Your school login temporary password: ${plaintext}. Please change it on first login.`;
    const resp = await fetch('https://api.sparrowsms.com/v2/sms/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SPARROW_SMS_TOKEN ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SPARROW_SMS_SENDER,
        to: recipient,
        text: message,
      }),
    });
    if (!resp.ok) throw new Error(`Sparrow SMS failed: HTTP ${resp.status}`);
    return 'SENT';
  }

  private credentialHtml(username: string, tempPassword: string): string {
    const esc = (s: string) =>
      s.replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
      );
    return `<p>Your account has been created.</p>
<p><strong>Username:</strong> ${esc(username)}<br/>
<strong>Temporary password:</strong> ${esc(tempPassword)}</p>
<p>For your security, you will be asked to change this password the first time you log in.</p>`;
  }
}
