import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CredentialMailer } from './credential-mailer.service';
import { MAIL_EVENTS } from './mail.events';
import type {
  CredentialsIssuedEvent,
  LoginEmailChangedEvent,
  PasswordResetRequestedEvent,
} from './mail.events';

/**
 * Consumes mail events fire-and-forget (MAIL-1 T1). Every handler catches its
 * own errors: a mail failure is logged (and recorded in email_log by
 * MailService) but never propagates anywhere near a request handler.
 */
@Injectable()
export class MailListener {
  private readonly logger = new Logger(MailListener.name);

  constructor(private readonly mailer: CredentialMailer) {}

  @OnEvent(MAIL_EVENTS.credentialsIssued, { async: true })
  async onCredentialsIssued(event: CredentialsIssuedEvent): Promise<void> {
    try {
      if (event.kind === 'reset') {
        await this.mailer.sendPasswordReset(event);
      } else {
        await this.mailer.sendNewCredentials(event);
      }
    } catch (err) {
      this.logger.error(`credentials email failed for ${event.to}`, err as Error);
    }
  }

  @OnEvent(MAIL_EVENTS.loginEmailChanged, { async: true })
  async onLoginEmailChanged(event: LoginEmailChangedEvent): Promise<void> {
    try {
      await this.mailer.sendLoginEmailChanged(event);
    } catch (err) {
      this.logger.error(`login-email-changed email failed for ${event.to}`, err as Error);
    }
  }

  @OnEvent(MAIL_EVENTS.passwordResetRequested, { async: true })
  async onPasswordResetRequested(event: PasswordResetRequestedEvent): Promise<void> {
    try {
      await this.mailer.sendPasswordResetLink(event);
    } catch (err) {
      this.logger.error(`password-reset email failed for ${event.to}`, err as Error);
    }
  }
}
