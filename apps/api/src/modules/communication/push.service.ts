import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

/**
 * One push per (user, device token). `notificationId` ties the push back to the
 * in-app notification row created FIRST by the emitting listener (mirror rule:
 * the row is the source of truth, the push is a pointer to it).
 */
export interface PushRecipient {
  userId: string;
  /** id of the mirrored `notifications` row; null only for system test sends */
  notificationId: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Logical route key the mobile app maps to a screen: 'attendance' | 'results' | 'fees' | 'notices' */
  route: string;
  data?: Record<string, unknown>;
}

interface DeviceTokenRow {
  user_id: string;
  token: string;
}

/**
 * Expo push sender (PUSH-1).
 *
 * Fire-and-forget: callers never await delivery guarantees — a push failure
 * must never fail the domain request. Tokens Expo reports as
 * `DeviceNotRegistered` (at ticket OR receipt level) are hard-deleted from
 * `device_tokens` with a log line per prune (the table has no soft delete by
 * design — stale tokens are pure noise).
 *
 * EXPO_ACCESS_TOKEN is optional (Expo's push API works unauthenticated unless
 * the EAS project enables enhanced security).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  /**
   * Delay before polling receipts. Expo materializes receipts shortly after
   * delivery attempts; DeviceNotRegistered (the only status we act on) shows
   * up well within 30s. Kept short so dev proofs don't wait 15 minutes.
   */
  static readonly RECEIPT_DELAY_MS = 30_000;

  constructor(private readonly tenantPrisma: TenantPrismaService) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  /**
   * Resolve the recipients' device tokens and send one push per token.
   * Malformed (non-Expo) tokens are pruned immediately; ticket-level
   * DeviceNotRegistered prunes synchronously; receipt-level prunes are
   * scheduled RECEIPT_DELAY_MS later (AsyncLocalStorage tenant context
   * propagates through the timer, so TenantPrismaService still resolves).
   */
  async sendToRecipients(recipients: PushRecipient[], payload: PushPayload): Promise<void> {
    if (recipients.length === 0) return;

    const byUser = new Map(recipients.map((r) => [r.userId, r]));
    const rows = await this.tenantPrisma.query<DeviceTokenRow>(
      `SELECT user_id, token FROM device_tokens WHERE user_id = ANY($1::uuid[])`,
      [...byUser.keys()],
    );
    if (rows.length === 0) return;

    const messages: ExpoPushMessage[] = [];
    for (const row of rows) {
      if (!Expo.isExpoPushToken(row.token)) {
        await this.pruneToken(row.token, 'malformed token');
        continue;
      }
      const recipient = byUser.get(row.user_id);
      messages.push({
        to: row.token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: {
          ...payload.data,
          route: payload.route,
          notificationId: recipient?.notificationId ?? null,
        },
      });
    }
    if (messages.length === 0) return;

    const receiptIdToToken = new Map<string, string>();
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        await this.processTickets(chunk, tickets, receiptIdToToken);
      } catch (err) {
        this.logger.error(`Push chunk send failed: ${(err as Error).message}`);
      }
    }

    if (receiptIdToToken.size > 0) {
      const timer = setTimeout(() => {
        void this.checkReceipts(receiptIdToToken);
      }, PushService.RECEIPT_DELAY_MS);
      timer.unref?.();
    }
  }

  /** Ticket-level errors arrive with the send response; prune immediately. */
  private async processTickets(
    chunk: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
    receiptIdToToken: Map<string, string>,
  ): Promise<void> {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = String(chunk[i]?.to ?? '');
      if (ticket.status === 'ok') {
        if (token) receiptIdToToken.set(ticket.id, token);
        continue;
      }
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await this.pruneToken(token, 'ticket DeviceNotRegistered');
      } else {
        this.logger.warn(`Push ticket error for token ${token}: ${ticket.message}`);
      }
    }
  }

  /** Poll receipts for delivered tickets; prune receipt-level DeviceNotRegistered. */
  async checkReceipts(receiptIdToToken: Map<string, string>): Promise<void> {
    try {
      for (const idChunk of this.expo.chunkPushNotificationReceiptIds([...receiptIdToToken.keys()])) {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(idChunk);
        for (const [receiptId, receipt] of Object.entries(receipts)) {
          if (receipt.status !== 'error') continue;
          const token = receiptIdToToken.get(receiptId) ?? '';
          if (receipt.details?.error === 'DeviceNotRegistered') {
            await this.pruneToken(token, 'receipt DeviceNotRegistered');
          } else {
            this.logger.warn(`Push receipt error for token ${token}: ${receipt.message}`);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Push receipt check failed: ${(err as Error).message}`);
    }
  }

  /** Hard-delete a dead token (the documented device_tokens exception) and log it. */
  private async pruneToken(token: string, reason: string): Promise<void> {
    if (!token) return;
    try {
      const rows = await this.tenantPrisma.query<{ user_id: string }>(
        `DELETE FROM device_tokens WHERE token = $1 RETURNING user_id`,
        token,
      );
      if (rows.length > 0) {
        this.logger.log(`Pruned device token ${token} (user ${rows[0].user_id}): ${reason}`);
      }
    } catch (err) {
      this.logger.error(`Failed to prune device token ${token}: ${(err as Error).message}`);
    }
  }
}
