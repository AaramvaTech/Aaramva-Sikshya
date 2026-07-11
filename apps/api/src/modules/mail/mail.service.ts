import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  /** Ethereal dev mode only: message preview URL (live-proof evidence). */
  previewUrl?: string;
}

type MailMode = 'smtp' | 'ethereal' | 'disabled';

/**
 * Cherry-picked from feat/credential-emails, adapted for MAIL-1:
 * config via ConfigService (vars registered in the SEC-1 Joi schema),
 * Ethereal dev-proof mode, OPS-1-style boot notice. Behavior contract
 * unchanged: always records an email_log row, never throws to the caller.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private etherealUser: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly publicPrisma: PublicPrismaService,
  ) {}

  get mode(): MailMode {
    if (this.config.get<string>('SMTP_HOST')) return 'smtp';
    if (this.config.get<boolean>('MAIL_ETHEREAL')) return 'ethereal';
    return 'disabled';
  }

  onModuleInit(): void {
    const mode = this.mode;
    if (mode === 'smtp') {
      this.logger.log(`Mail ENABLED via SMTP (${this.config.get<string>('SMTP_HOST')})`);
    } else if (mode === 'ethereal') {
      this.logger.log('Mail in ETHEREAL dev mode — sends go to a nodemailer test inbox with preview URLs');
    } else {
      this.logger.log('Mail disabled (no SMTP_HOST, MAIL_ETHEREAL off) — sends are logged as MOCK and skipped');
    }
  }

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;
    if (this.mode === 'ethereal') {
      const account = await nodemailer.createTestAccount();
      this.etherealUser = account.user;
      this.transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
      this.logger.log(`Ethereal test inbox provisioned: ${account.user}`);
      return this.transporter;
    }
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });
    return this.transporter;
  }

  /** Actual network delivery. Separated so tests can stub it. */
  private async deliver(
    input: SendMailInput,
  ): Promise<{ messageId: string | null; previewUrl?: string }> {
    const fromName = this.config.get<string>('MAIL_FROM_NAME') || 'Aaramva Shikshya';
    const fromAddr =
      this.config.get<string>('MAIL_FROM') ||
      (this.mode === 'ethereal' && this.etherealUser ? this.etherealUser : 'no-reply@aaramvashikshya.com');
    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    let previewUrl: string | undefined;
    if (this.mode === 'ethereal') {
      const url = nodemailer.getTestMessageUrl(info);
      if (url) {
        previewUrl = url;
        this.logger.log(`[ETHEREAL PREVIEW] ${input.type} to ${input.to}: ${url}`);
      }
    }
    return { messageId: info?.messageId ?? null, previewUrl };
  }

  /**
   * Best-effort send: always records an email_log row, never throws to the caller.
   */
  async send(input: SendMailInput): Promise<SendMailResult> {
    let logId: string;
    try {
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
      logId = rows[0].id;
    } catch (err) {
      const message = (err as Error)?.message ?? 'Unknown error';
      this.logger.error(`Email log INSERT failed for ${input.to}: ${message}`);
      return { status: 'FAILED', logId: '' };
    }

    if (this.mode === 'disabled') {
      this.logger.log(`[MAIL MOCK] To: ${input.to} | ${input.subject}`);
      await this.updateStatus(logId, 'MOCK', null, null);
      return { status: 'MOCK', logId };
    }

    try {
      const { messageId, previewUrl } = await this.deliver(input);
      await this.updateStatus(logId, 'SENT', messageId, null);
      return { status: 'SENT', logId, previewUrl };
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
