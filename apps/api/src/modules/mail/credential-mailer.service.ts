import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    private readonly config: ConfigService,
  ) {}

  private async resolveSchool(tenantId: string): Promise<{ name: string; slug: string }> {
    const rows = await this.publicPrisma.query<{ name: string; slug: string }>(
      // tenants.id is TEXT in the Prisma-managed public schema (uuid() default
      // stores as text) — a ::uuid cast makes the comparison text = uuid and 42883s.
      `SELECT name, slug FROM tenants WHERE id = $1`,
      tenantId,
    );
    return rows[0] ?? { name: 'your school', slug: '' };
  }

  private loginUrl(slug: string): string {
    const domain = this.config.get<string>('APP_DOMAIN') || 'aaramvashikshya.com';
    return slug ? `https://${slug}.${domain}` : `https://${domain}`;
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
      <p>Your login for <strong>${escapeHtml(school.name)}</strong> on Aaramva Shikshya is ready.</p>
      <ul>
        <li><strong>School code:</strong> ${escapeHtml(school.slug)}</li>
        <li><strong>Login email:</strong> ${escapeHtml(p.loginEmail)}</li>
        <li><strong>Temporary password:</strong> ${p.password}</li>
      </ul>
      <p><strong>Web:</strong> <a href="${url}">${url}</a><br/>
      <strong>Mobile app:</strong> open Aaramva Shikshya, enter the school code "<strong>${escapeHtml(school.slug)}</strong>", then log in.</p>
      <p>Please change your password after your first login.</p>`;
    await this.mail.send({
      to: p.to, subject, html, text, type, tenantId: p.tenantId, relatedUserId: p.relatedUserId,
    });
  }

  /** MAIL-1 T3: password-reset link (token-based self-service, not a temp password). */
  async sendPasswordResetLink(p: {
    tenantId: string;
    to: string;
    resetUrl: string;
    relatedUserId: string;
  }): Promise<void> {
    const school = await this.resolveSchool(p.tenantId);
    const subject = `Reset your ${school.name} password`;
    const text = [
      `Hello,`,
      ``,
      `A password reset was requested for your ${school.name} account on Aaramva Shikshya.`,
      ``,
      `Reset link (valid for 30 minutes, single use):`,
      p.resetUrl,
      ``,
      `If you did not request this, you can ignore this email — your password is unchanged.`,
    ].join('\n');
    const html = `
      <p>Hello,</p>
      <p>A password reset was requested for your <strong>${escapeHtml(school.name)}</strong> account on Aaramva Shikshya.</p>
      <p><a href="${p.resetUrl}">Reset your password</a> (valid for 30 minutes, single use).</p>
      <p>If you did not request this, you can ignore this email — your password is unchanged.</p>`;
    await this.mail.send({
      to: p.to, subject, html, text, type: 'PASSWORD_RESET_LINK', tenantId: p.tenantId, relatedUserId: p.relatedUserId,
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
      <p>The login email for your <strong>${escapeHtml(school.name)}</strong> account was changed to <strong>${escapeHtml(p.newLoginEmail)}</strong>.</p>
      <ul><li><strong>School code:</strong> ${escapeHtml(school.slug)}</li></ul>
      <p><strong>Web:</strong> <a href="${url}">${url}</a></p>
      <p>If you did not expect this change, contact your school administrator.</p>`;
    await this.mail.send({
      to: p.to, subject, html, text, type: 'LOGIN_EMAIL_CHANGED', tenantId: p.tenantId, relatedUserId: p.relatedUserId,
    });
  }
}
