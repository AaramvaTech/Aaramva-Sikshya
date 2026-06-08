import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsService } from '../sms.service';
import { NotificationService } from '../notification.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

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
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @OnEvent('payment.received')
  async handlePayment(payload: PaymentReceivedEvent): Promise<void> {
    try {
      const parentUser = await this.findParentUser(payload.studentId);
      if (!parentUser) return;

      const studentName = await this.getStudentName(payload.studentId);
      await this.notificationService.createNotification(
        parentUser.id,
        'Fee Payment Received',
        `Aaramva Shikshya: Rs.${payload.amount} received for ${studentName}. Thank you.`,
        'FEE',
        { invoiceId: payload.invoiceId, studentId: payload.studentId },
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
        guardians: { phone?: string; is_primary?: boolean }[] | null;
      }>(
        `SELECT first_name, last_name, guardians FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
        payload.studentId,
      );
      if (!studentRows[0]) return;

      const { first_name, last_name, guardians } = studentRows[0];
      const studentName = `${first_name} ${last_name}`;
      const primaryGuardian = (guardians ?? []).find((g) => g.is_primary);

      if (primaryGuardian?.phone) {
        const smsMessage = `Aaramva Shikshya: Fee of Rs.${payload.balance} is overdue for ${studentName}. Please pay at the earliest.`;
        try {
          await this.smsService.send(primaryGuardian.phone, smsMessage, 'FEE_OVERDUE', payload.studentId);
        } catch {
          // Silently swallow SMS errors
        }
      }

      const parentUser = await this.findParentUser(payload.studentId);
      if (parentUser) {
        await this.notificationService.createNotification(
          parentUser.id,
          'Fee Overdue',
          `Fee of Rs.${payload.balance} is overdue for ${studentName}. Please pay at the earliest.`,
          'FEE',
          { invoiceId: payload.invoiceId, studentId: payload.studentId },
        );
      }
    } catch {
      // Silently swallow — must not crash the recalculation job
    }
  }

  private async findParentUser(studentId: string): Promise<{ id: string } | null> {
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN students s ON (s.guardians @> jsonb_build_array(jsonb_build_object('user_id', u.id::text)))
       WHERE s.id = $1::uuid AND u.role = 'PARENT' AND u.deleted_at IS NULL
       LIMIT 1`,
      studentId,
    );
    return rows[0] ?? null;
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
