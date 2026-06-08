import { Injectable, NotFoundException } from '@nestjs/common';
import { getCurrentFiscalYear } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  InvoiceRow,
  InvoiceItemRow,
  PaymentRow,
  toDateField,
  toInvoiceResponse,
  toNum,
} from './entities/finance.entity';

@Injectable()
export class ReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getCollectionReport(academicYearId: string): Promise<object> {
    const fiscalYear = getCurrentFiscalYear();
    const today = new Date().toISOString().split('T')[0];

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

    const totalInvoiced = byClassRows.reduce((s, r) => s + toNum(r.invoiced), 0);
    const totalCollected = byClassRows.reduce((s, r) => s + toNum(r.collected), 0);
    const totalPending = Math.round((totalInvoiced - totalCollected) * 100) / 100;
    const collectionRate = totalInvoiced > 0
      ? Math.round((totalCollected / totalInvoiced) * 10000) / 100
      : 0;

    return {
      fiscalYear,
      academicYearId,
      asOf: toDateField(today),
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      totalPending,
      collectionRate,
      byClass: byClassRows.map((r) => {
        const inv = toNum(r.invoiced);
        const col = toNum(r.collected);
        return {
          classId: r.class_id,
          className: r.class_name,
          invoiced: inv,
          collected: col,
          pending: Math.round((inv - col) * 100) / 100,
          rate: inv > 0 ? Math.round((col / inv) * 10000) / 100 : 0,
        };
      }),
      byCategory: byCategoryRows.map((r) => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        invoiced: toNum(r.invoiced),
        collected: toNum(r.collected),
        pending: Math.round((toNum(r.invoiced) - toNum(r.collected)) * 100) / 100,
      })),
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
    const today = new Date().toISOString().split('T')[0];

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
              COALESCE((s.guardians->0->>'phone')::text, s.phone, '') AS guardian_phone
       FROM students s
       JOIN invoices i ON i.student_id = s.id
         AND i.academic_year_id = $1::uuid
         AND i.status = 'OVERDUE'
         AND i.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
       GROUP BY s.id, s.student_id, s.first_name, s.last_name, s.class_name, s.section_name, s.guardians, s.phone
       ORDER BY SUM(i.balance) DESC`,
      academicYearId,
    );

    const totalOutstanding = rows.reduce((s, r) => s + toNum(r.total_due), 0);

    return {
      asOf: toDateField(today),
      totalDefaulters: rows.length,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      students: rows.map((r) => ({
        studentId: r.student_id,
        admissionNumber: r.admission_number,
        fullName: r.full_name,
        className: r.class_name,
        sectionName: r.section_name,
        overdueInvoices: parseInt(r.overdue_invoices, 10),
        totalDue: toNum(r.total_due),
        oldestDueDate: toDateField(r.oldest_due_date),
        guardianPhone: r.guardian_phone,
      })),
    };
  }

  async getStudentLedger(
    studentId: string,
    academicYearId: string,
  ): Promise<{
    student: { id: string; admissionNumber: string; fullName: string; className: string };
    academicYear: { id: string; name: string };
    invoices: import('./entities/finance.entity').InvoiceResponseDto[];
    summary: { totalInvoiced: number; totalPaid: number; totalBalance: number };
  }> {
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

    let totalInvoiced = 0, totalPaid = 0;
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

      totalInvoiced += toNum(inv.total_amount);
      totalPaid += toNum(inv.paid_amount);
      invoices.push(toInvoiceResponse(inv, items, payments));
    }

    const totalBalance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

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
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalBalance,
      },
    };
  }
}
