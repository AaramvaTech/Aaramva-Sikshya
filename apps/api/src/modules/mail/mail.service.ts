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
