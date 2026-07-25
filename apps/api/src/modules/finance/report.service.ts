import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { getCurrentFiscalYear } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { todayAdInNepal } from '../common/utils/date.util';
import {
  InvoiceRow,
  InvoiceItemRow,
  PaymentRow,
  toDateField,
  toInvoiceResponse,
  toMoney,
} from './entities/finance.entity';
import { Money } from '../../common/money/money';

@Injectable()
export class ReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getCollectionReport(academicYearId: string): Promise<object> {
    const fiscalYear = getCurrentFiscalYear();
    const today = todayAdInNepal(); // QA-1 OBS-E-2: Nepal-today asOf

    const byClassRows = await this.tenantPrisma.query<{
      class_id: string;
      class_name: string;
      invoiced: string;
      collected: string;
    }>(
      `SELECT c.id AS class_id, c.name AS class_name,
              COALESCE(SUM(i.total_amount), 0) AS invoiced,
              COALESCE(SUM(i.paid_amount), 0) AS collected
       FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN invoices i ON i.student_id = s.id AND i.academic_year_id = $1::uuid AND i.deleted_at IS NULL
       WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL
       GROUP BY c.id, c.name
       ORDER BY c.order_index`,
      academicYearId,
    );

    const byCategoryRows = await this.tenantPrisma.query<{
      category_id: string;
      category_name: string;
      invoiced: string;
      collected: string;
    }>(
      `SELECT fc.id AS category_id, fc.name AS category_name,
              COALESCE(SUM(ii.discounted_amount), 0) AS invoiced,
              COALESCE(SUM(CASE WHEN i.status = 'PAID' THEN ii.discounted_amount ELSE 0 END), 0) AS collected
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id AND i.academic_year_id = $1::uuid AND i.deleted_at IS NULL
       JOIN fee_categories fc ON fc.id = ii.fee_category_id
       GROUP BY fc.id, fc.name
       ORDER BY fc.name`,
      academicYearId,
    );

    const totalInvoiced = byClassRows.reduce((s, r) => s.add(toMoney(r.invoiced)), Money.zero());
    const totalCollected = byClassRows.reduce((s, r) => s.add(toMoney(r.collected)), Money.zero());
    const totalPending = totalInvoiced.sub(totalCollected);
    const collectionRate = totalInvoiced.isZero()
      ? 0
      : totalCollected.div(totalInvoiced.toNumber()).mul(100).toNumber();

    return {
      fiscalYear,
      academicYearId,
      asOf: toDateField(today),
      totalInvoiced: totalInvoiced.toNumber(),
      totalCollected: totalCollected.toNumber(),
      totalPending: totalPending.toNumber(),
      collectionRate,
      byClass: byClassRows.map((r) => {
        const inv = toMoney(r.invoiced);
        const col = toMoney(r.collected);
        return {
          classId: r.class_id,
          className: r.class_name,
          invoiced: inv.toNumber(),
          collected: col.toNumber(),
          pending: inv.sub(col).toNumber(),
          rate: inv.isZero() ? 0 : col.div(inv.toNumber()).mul(100).toNumber(),
        };
      }),
      byCategory: byCategoryRows.map((r) => {
        const invoiced = toMoney(r.invoiced);
        const collected = toMoney(r.collected);
        return {
          categoryId: r.category_id,
          categoryName: r.category_name,
          invoiced: invoiced.toNumber(),
          collected: collected.toNumber(),
          pending: invoiced.sub(collected).toNumber(),
        };
      }),
    };
  }

  async getDefaulters(academicYearId: string): Promise<{
    asOf: { ad: string; bs: string };
    totalDefaulters: number;
    totalOutstanding: number;
    students: {
      studentId: string;
      admissionNumber: string;
      fullName: string;
      className: string;
      sectionName: string;
      overdueInvoices: number;
      totalDue: number;
      oldestDueDate: { ad: string; bs: string };
      guardianPhone: string;
    }[];
  }> {
    const today = todayAdInNepal(); // QA-1 OBS-E-2: Nepal-today asOf

    const rows = await this.tenantPrisma.query<{
      student_id: string;
      admission_number: string;
      full_name: string;
      class_name: string;
      section_name: string;
      overdue_invoices: string;
      total_due: string;
      oldest_due_date: Date | string;
      guardian_phone: string;
    }>(
      `SELECT s.id AS student_id,
              s.student_id AS admission_number,
              s.first_name || ' ' || s.last_name AS full_name,
              s.class_name, s.section_name,
              COUNT(i.id) AS overdue_invoices,
              SUM(i.balance) AS total_due,
              MIN(i.due_date) AS oldest_due_date,
              COALESCE(
                (SELECT g.phone FROM guardians g
                  WHERE g.student_id = s.id
                  ORDER BY g.is_primary DESC, g.created_at ASC
                  LIMIT 1),
                s.phone, ''
              ) AS guardian_phone
       FROM students s
       JOIN invoices i ON i.student_id = s.id
         AND i.academic_year_id = $1::uuid
         AND i.status = 'OVERDUE'
         AND i.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
       GROUP BY s.id, s.student_id, s.first_name, s.last_name, s.class_name, s.section_name, s.phone
       ORDER BY SUM(i.balance) DESC`,
      academicYearId,
    );

    const totalOutstanding = rows.reduce((s, r) => s.add(toMoney(r.total_due)), Money.zero());

    return {
      asOf: toDateField(today),
      totalDefaulters: rows.length,
      totalOutstanding: totalOutstanding.toNumber(),
      students: rows.map((r) => ({
        studentId: r.student_id,
        admissionNumber: r.admission_number,
        fullName: r.full_name,
        className: r.class_name,
        sectionName: r.section_name,
        overdueInvoices: parseInt(r.overdue_invoices, 10),
        totalDue: toMoney(r.total_due).toNumber(),
        oldestDueDate: toDateField(r.oldest_due_date),
        guardianPhone: r.guardian_phone,
      })),
    };
  }

  async getStudentLedger(
    studentId: string,
    academicYearId: string,
    callerId?: string,
    callerRole?: Role,
  ): Promise<{
    student: { id: string; admissionNumber: string; fullName: string; className: string };
    academicYear: { id: string; name: string };
    invoices: import('./entities/finance.entity').InvoiceResponseDto[];
    summary: { totalInvoiced: number; totalPaid: number; totalBalance: number };
  }> {
    if (callerRole === Role.PARENT && callerId) {
      const children = await this.tenantPrisma.query<{ student_id: string }>(
        `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
        callerId,
      );
      if (!children.some((c) => c.student_id === studentId)) {
        throw new ForbiddenException('Access denied');
      }
    }

    const studentRows = await this.tenantPrisma.query<{
      id: string;
      admission_number: string;
      full_name: string;
      class_name: string;
    }>(
      `SELECT id, student_id AS admission_number,
              first_name || ' ' || last_name AS full_name, class_name
       FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      studentId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${studentId} not found`);

    const yearRows = await this.tenantPrisma.query<{ id: string; name: string }>(
      `SELECT id, name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${academicYearId} not found`);

    const invoiceRows = await this.tenantPrisma.query<InvoiceRow>(
      `SELECT * FROM invoices
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL
       ORDER BY due_date`,
      studentId,
      academicYearId,
    );

    let totalInvoiced = Money.zero();
    let totalPaid = Money.zero();
    const invoices: import('./entities/finance.entity').InvoiceResponseDto[] = [];

    for (const inv of invoiceRows) {
      const items = await this.tenantPrisma.query<InvoiceItemRow>(
        `SELECT * FROM invoice_items WHERE invoice_id = $1::uuid ORDER BY created_at`,
        inv.id,
      );

      const payments = await this.tenantPrisma.query<PaymentRow>(
        `SELECT * FROM payments WHERE invoice_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at`,
        inv.id,
      );

      totalInvoiced = totalInvoiced.add(toMoney(inv.total_amount));
      totalPaid = totalPaid.add(toMoney(inv.paid_amount));
      invoices.push(toInvoiceResponse(inv, items, payments));
    }

    const totalBalance = totalInvoiced.sub(totalPaid);

    const rawStudent = studentRows[0];
    return {
      student: {
        id: rawStudent.id,
        admissionNumber: rawStudent.admission_number,
        fullName: rawStudent.full_name,
        className: rawStudent.class_name,
      },
      academicYear: yearRows[0],
      invoices,
      summary: {
        totalInvoiced: totalInvoiced.toNumber(),
        totalPaid: totalPaid.toNumber(),
        totalBalance: totalBalance.toNumber(),
      },
    };
  }
}
