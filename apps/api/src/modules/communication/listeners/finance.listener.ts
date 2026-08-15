import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsService } from '../sms.service';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { GuardianService } from '../../student/guardian.service';

interface PaymentReceivedEvent {
  studentId: string;
  amount: number;
  invoiceId: string;
  tenantSlug: string;
}

interface InvoiceOverdueEvent {
  studentId: string;
  invoiceId: string;
  balance: number;
  tenantSlug: string;
}

@Injectable()
export class FinanceListener {
  constructor(
    private readonly smsService: SmsService,
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianService: GuardianService,
  ) {}

  @OnEvent('payment.received')
  async handlePayment(payload: PaymentReceivedEvent): Promise<void> {
    try {
      const parentUser = await this.findParentUser(payload.studentId);
      if (!parentUser) return;

      const studentName = await this.getStudentName(payload.studentId);
      const title = 'Fee Payment Received';
      const body = `Aaramva Shikshya: Rs.${payload.amount} received for ${studentName}. Thank you.`;
      const notificationId = await this.notificationService.createNotification(
        parentUser.id,
        title,
        body,
        'FEE',
        { invoiceId: payload.invoiceId, studentId: payload.studentId, route: 'fees' },
      );
      await this.pushService.sendToRecipients(
        [{ userId: parentUser.id, notificationId }],
        { title, body, route: 'fees', data: { invoiceId: payload.invoiceId, studentId: payload.studentId } },
      );
    } catch {
      // Silently swallow — must not crash the payment request
    }
  }

  @OnEvent('invoice.overdue')
  async handleOverdue(payload: InvoiceOverdueEvent): Promise<void> {
    try {
      const studentRows = await this.tenantPrisma.query<{
        first_name: string;
        last_name: string;
      }>(
        `SELECT first_name, last_name FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
        payload.studentId,
      );
      if (!studentRows[0]) return;

      const { first_name, last_name } = studentRows[0];
      const studentName = `${first_name} ${last_name}`;
      const guardianPhone = await this.resolveGuardianPhone(payload.studentId);

      if (guardianPhone) {
        const smsMessage = `Aaramva Shikshya: Fee of Rs.${payload.balance} is overdue for ${studentName}. Please pay at the earliest.`;
        try {
          await this.smsService.send(guardianPhone, smsMessage, 'FEE_OVERDUE', payload.studentId);
        } catch {
          // Silently swallow SMS errors
        }
      }

      const parentUser = await this.findParentUser(payload.studentId);
      if (parentUser) {
        const title = 'Fee Overdue';
        const body = `Fee of Rs.${payload.balance} is overdue for ${studentName}. Please pay at the earliest.`;
        const notificationId = await this.notificationService.createNotification(
          parentUser.id,
          title,
          body,
          'FEE',
          { invoiceId: payload.invoiceId, studentId: payload.studentId, route: 'fees' },
        );
        await this.pushService.sendToRecipients(
          [{ userId: parentUser.id, notificationId }],
          { title, body, route: 'fees', data: { invoiceId: payload.invoiceId, studentId: payload.studentId } },
        );
      }
    } catch {
      // Silently swallow — must not crash the recalculation job
    }
  }

  /**
   * Guardian contact for SMS = the primary-flagged guardian, else the earliest by
   * created_at (FIX-1B: normalized `guardians` table is the sole read source; the
   * legacy students.guardians JSONB is deprecated and no longer read). Returns
   * null when the student has no ACTIVE guardian with a phone on file.
   */
  private async resolveGuardianPhone(studentId: string): Promise<string | null> {
    const phones = await this.guardianService.getPrimaryGuardianPhones([studentId]);
    return phones.get(studentId) ?? null;
  }

  private async findParentUser(studentId: string): Promise<{ id: string } | null> {
    // FIX-1B: resolve the linked PARENT via the normalized guardians.user_id
    // linkage (tenant-scoped) instead of the legacy students.guardians JSONB
    // containment query. Prefers the primary guardian's account when several link.
    const id = await this.guardianService.getPrimaryGuardianUserId(studentId);
    return id ? { id } : null;
  }

  private async getStudentName(studentId: string): Promise<string> {
    const rows = await this.tenantPrisma.query<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM students WHERE id = $1::uuid`,
      studentId,
    );
    if (!rows[0]) return 'Student';
    return `${rows[0].first_name} ${rows[0].last_name}`;
  }
}
