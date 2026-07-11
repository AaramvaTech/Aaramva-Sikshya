/**
 * Mail events (MAIL-1): domain services EMIT these and move on — MailListener
 * consumes them asynchronously, so a slow SMTP server never blocks an HTTP
 * response (same fire-and-forget pattern as the SMS/notification listeners).
 */
export const MAIL_EVENTS = {
  credentialsIssued: 'mail.credentials.issued',
  loginEmailChanged: 'mail.login-email.changed',
  passwordResetRequested: 'mail.password-reset.requested',
} as const;

export interface CredentialsIssuedEvent {
  tenantId: string;
  to: string;
  loginEmail: string;
  /** Plaintext temp password — exists only inside this in-process event. */
  password: string;
  relatedUserId: string;
  /** 'new' = first credentials; 'reset' = admin-triggered regeneration. */
  kind: 'new' | 'reset';
}

export interface LoginEmailChangedEvent {
  tenantId: string;
  to: string;
  newLoginEmail: string;
  relatedUserId: string;
}

export interface PasswordResetRequestedEvent {
  tenantId: string;
  to: string;
  resetUrl: string;
  relatedUserId: string;
}
