import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getBsYear } from 'bs-calendar';
import { todayAdInNepal } from '../common/utils/date.util';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  InvoiceRow,
  PaymentRow,
  toPaymentResponse,
  PaymentResponseDto,
  toMoney,
} from './entities/finance.entity';
import { RecordPaymentDto, PaymentQueryDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Derive invoice status from paid amount ─────────────────────────────────

  private deriveStatus(totalAmount: number, paidAmount: number, dueDate: Date | string): string {
    if (paidAmount >= totalAmount) return 'PAID';
    if (paidAmount > 0) return 'PARTIAL';
    // QA-1 OBS-F: OVERDUE vs UNPAID against Nepal's calendar today (lexical
    // 'YYYY-MM-DD' compare — TZ-independent), not the server-local midnight.
    const dueAd = dueDate instanceof Date ? dueDate.toISOString().slice(0, 10) : String(dueDate).slice(0, 10);
    return dueAd < todayAdInNepal() ? 'OVERDUE' : 'UNPAID';
  }

  // ─── Record payment (atomic: insert payment + update invoice) ───────────────

  async recordPayment(dto: RecordPaymentDto, receivedById: string): Promise<PaymentResponseDto> {
    const payment = await this.tenantPrisma.run((tx) =>
      this.recordPaymentInTx(tx, dto, receivedById),
    );

    // Emit after successful transaction
    this.emitPaymentReceived(payment);

    return toPaymentResponse(payment);
  }

  /**
   * The transaction body of recordPayment, exposed so gateway verification
   * (PAY-1 eSewa) can record the payment INSIDE the same DB transaction as its
   * INITIATED→VERIFIED conditional claim — the exactly-once guarantee lives at
   * the DB level, not in application code. Behavior is identical to the
   * original inline body. Callers must emit via emitPaymentReceived AFTER the
   * transaction commits.
   */
  async recordPaymentInTx(
    tx: TenantTx,
    dto: RecordPaymentDto,
    receivedById: string,
  ): Promise<PaymentRow> {
    {
      // Get invoice inside transaction (with lock semantics via the transaction)
      const [invoice] = await tx.$queryRawUnsafe<InvoiceRow[]>(
        `SELECT * FROM invoices WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.invoiceId,
      );
      if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);

      // Get next payment sequence (QA-1 OBS-F: BS year from Nepal-today)
      const bsYear = getBsYear(new Date(todayAdInNepal()));
      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ('payment_seq', 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
      );
      const paymentNumber = `PAY-${bsYear}-${seqRow.value.toString().padStart(6, '0')}`;

      // Insert payment
      const [payment] = await tx.$queryRawUnsafe<PaymentRow[]>(
        `INSERT INTO payments
           (payment_number, invoice_id, student_id, amount, method, reference, notes, received_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid)
         RETURNING *`,
        paymentNumber,
        dto.invoiceId,
        invoice.student_id,
        dto.amount,
        dto.method,
        dto.reference ?? null,
        dto.notes ?? null,
        receivedById,
      );

      // Recalculate total paid (sum of all non-deleted payments including the new one)
      const [sumRow] = await tx.$queryRawUnsafe<{ total_paid: string }[]>(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid
         FROM payments
         WHERE invoice_id = $1::uuid AND deleted_at IS NULL`,
        dto.invoiceId,
      );
      const totalPaid = toMoney(sumRow.total_paid).toNumber();
      const totalAmount = toMoney(invoice.total_amount).toNumber();
      const newStatus = this.deriveStatus(totalAmount, totalPaid, invoice.due_date);

      // Update invoice atomically — status is first param (matches test assertions)
      await tx.$executeRawUnsafe(
        `UPDATE invoices SET status = $1, paid_amount = $2, updated_at = NOW() WHERE id = $3::uuid`,
        newStatus,
        totalPaid,
        dto.invoiceId,
      );

      return payment;
    }
  }

  /** Post-commit notification shared by direct recording and gateway crediting. */
  emitPaymentReceived(payment: PaymentRow): void {
    const { slug } = this.tenantContext.getOrThrow();
    this.eventEmitter.emit('payment.received', {
      studentId: payment.student_id,
      invoiceId: payment.invoice_id,
      amount: toMoney(payment.amount).toNumber(),
      tenantSlug: slug,
    });
  }

  // ─── Cancel (soft-delete) payment ──────────────────────────────────────────

  async cancelPayment(id: string): Promise<void> {
    const rows = await this.tenantPrisma.query<PaymentRow>(
      `SELECT * FROM payments WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${id} not found`);
    const payment = rows[0];

    await this.tenantPrisma.run(async (tx) => {
      // Soft-delete payment
      await tx.$executeRawUnsafe(
        `UPDATE payments SET deleted_at = NOW() WHERE id = $1::uuid`,
        id,
      );

      // Single query: get updated paid sum + invoice total/due_date
      const [infoRow] = await tx.$queryRawUnsafe<{
        total_paid: string;
        total_amount: string;
        due_date: Date | string;
      }[]>(
        `SELECT COALESCE(SUM(p.amount), 0) AS total_paid, i.total_amount, i.due_date
         FROM invoices i
         LEFT JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
         WHERE i.id = $1::uuid
         GROUP BY i.total_amount, i.due_date`,
        payment.invoice_id,
      );

      if (!infoRow) return;

      const totalPaid = toMoney(infoRow.total_paid).toNumber();
      const totalAmount = toMoney(infoRow.total_amount).toNumber();
      const newStatus = this.deriveStatus(totalAmount, totalPaid, infoRow.due_date);

      await tx.$executeRawUnsafe(
        `UPDATE invoices SET status = $1, paid_amount = $2, updated_at = NOW() WHERE id = $3::uuid`,
        newStatus,
        totalPaid,
        payment.invoice_id,
      );
    });
  }

  // ─── List / get payments ────────────────────────────────────────────────────

  async findAll(query: PaymentQueryDto): Promise<{
    data: PaymentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.invoiceId) { conditions.push(`invoice_id = $${idx++}::uuid`); params.push(query.invoiceId); }
    if (query.studentId) { conditions.push(`student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.method) { conditions.push(`method = $${idx++}`); params.push(query.method); }
    if (query.fromDate) { conditions.push(`created_at >= $${idx++}::date`); params.push(query.fromDate); }
    if (query.toDate) { conditions.push(`created_at <= $${idx++}::date`); params.push(query.toDate); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<PaymentRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM payments ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toPaymentResponse), meta: { page, limit, total } };
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const rows = await this.tenantPrisma.query<PaymentRow>(
      `SELECT * FROM payments WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Payment ${id} not found`);
    return toPaymentResponse(rows[0]);
  }
}
