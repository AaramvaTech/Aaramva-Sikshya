import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { toMoney } from './entities/finance.entity';

/**
 * R13 / B4-10: the tenant's invoice-numbering reset policy. Read/written via
 * raw SQL against the PUBLIC schema's `tenants` table (like SettingsService),
 * not the typed Prisma client — `tenants.invoiceNumberingReset` is a plain
 * boolean column, no need for the generated-client round trip a typed
 * `prisma.tenant.update(...)` call would require.
 */
@Injectable()
export class FinanceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getInvoiceNumberingReset(): Promise<{ invoiceNumberingReset: boolean }> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.prisma.$queryRawUnsafe<{ invoiceNumberingReset: boolean }[]>(
      `SELECT "invoiceNumberingReset" FROM tenants WHERE id = $1`,
      tenantId,
    );
    return { invoiceNumberingReset: rows[0]?.invoiceNumberingReset ?? false };
  }

  async setInvoiceNumberingReset(value: boolean): Promise<{ invoiceNumberingReset: boolean }> {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.prisma.$executeRawUnsafe(
      `UPDATE tenants SET "invoiceNumberingReset" = $1, "updatedAt" = NOW() WHERE id = $2`,
      value, tenantId,
    );
    return { invoiceNumberingReset: value };
  }

  /** BILL-6 B6-3: the two-tier credit-note approval threshold, same home as
   * invoiceNumberingReset (public tenants row). The column is Prisma
   * Decimal-typed — $queryRawUnsafe can hand back a Decimal instance, a
   * string, or (in tests) a plain number, so the value is stringified before
   * it reaches Money, never assumed to already be one shape. */
  async getCreditNoteApprovalThreshold(): Promise<{ creditNoteApprovalThreshold: number }> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.prisma.$queryRawUnsafe<{ creditNoteApprovalThreshold: unknown }[]>(
      `SELECT "creditNoteApprovalThreshold" FROM tenants WHERE id = $1`,
      tenantId,
    );
    const value = rows[0]?.creditNoteApprovalThreshold;
    return { creditNoteApprovalThreshold: value != null ? toMoney(String(value)).toNumber() : 5000 };
  }

  async setCreditNoteApprovalThreshold(value: string): Promise<{ creditNoteApprovalThreshold: number }> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const amount = toMoney(value);
    await this.prisma.$executeRawUnsafe(
      `UPDATE tenants SET "creditNoteApprovalThreshold" = $1::numeric, "updatedAt" = NOW() WHERE id = $2`,
      amount.toDb(), tenantId,
    );
    return { creditNoteApprovalThreshold: amount.toNumber() };
  }
}
