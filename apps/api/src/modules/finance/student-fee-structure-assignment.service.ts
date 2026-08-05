import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  StudentFeeStructureAssignmentRow,
  toStudentFeeStructureAssignmentResponse,
  StudentFeeStructureAssignmentResponseDto,
} from './entities/bill-assignment.entity';
import { AssignFeeStructureDto } from './dto/student-fee-structure-assignment.dto';

@Injectable()
export class StudentFeeStructureAssignmentService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Assigns a whole bill_fee_structure to one student (spec §6:
   * "one active assignment per student per academic year"). Any existing
   * OPEN assignment for the same (student, year) is closed the day before
   * the new one starts — never deleted, so assignment history is preserved.
   */
  async assign(
    studentId: string,
    dto: AssignFeeStructureDto,
    assignedById: string,
  ): Promise<StudentFeeStructureAssignmentResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const structureRows = await tx.$queryRawUnsafe<{ id: string; academic_year_id: string }[]>(
        `SELECT id, academic_year_id FROM bill_fee_structures WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.feeStructureId,
      );
      if (!structureRows[0]) throw new NotFoundException(`Fee structure ${dto.feeStructureId} not found`);
      const academicYearId = structureRows[0].academic_year_id;

      const studentRows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
        studentId,
      );
      if (!studentRows[0]) throw new NotFoundException(`Student ${studentId} not found`);

      await tx.$executeRawUnsafe(
        `UPDATE student_fee_structure_assignments
           SET effective_to = $3::date - 1, updated_at = NOW()
         WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
           AND effective_to IS NULL AND deleted_at IS NULL`,
        studentId,
        academicYearId,
        dto.effectiveFrom,
      );

      const [row] = await tx.$queryRawUnsafe<StudentFeeStructureAssignmentRow[]>(
        `INSERT INTO student_fee_structure_assignments
           (student_id, fee_structure_id, academic_year_id, effective_from, assigned_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::uuid)
         RETURNING *`,
        studentId,
        dto.feeStructureId,
        academicYearId,
        dto.effectiveFrom,
        assignedById,
      );

      return toStudentFeeStructureAssignmentResponse(row);
    });
  }

  /**
   * UI-2 §2 — the read endpoint overrides/concessions/transport-assignments
   * already had and this resource didn't. Full history (or one academic
   * year's worth, filtered), newest-first; the row(s) with effective_to
   * NULL are "current" — assign() always closes the prior open row before
   * inserting a new one, so there's at most one per academic year.
   */
  async findAllForStudent(
    studentId: string,
    academicYearId?: string,
  ): Promise<StudentFeeStructureAssignmentResponseDto[]> {
    const conditions = ['student_id = $1::uuid', 'deleted_at IS NULL'];
    const params: unknown[] = [studentId];
    if (academicYearId) {
      conditions.push(`academic_year_id = $${params.length + 1}::uuid`);
      params.push(academicYearId);
    }

    const rows = await this.tenantPrisma.query<StudentFeeStructureAssignmentRow>(
      `SELECT * FROM student_fee_structure_assignments
       WHERE ${conditions.join(' AND ')}
       ORDER BY effective_from DESC`,
      ...params,
    );
    return rows.map(toStudentFeeStructureAssignmentResponse);
  }

  /**
   * The single row FeePreviewService (and the bulk-assign job runner) needs:
   * the assignment covering `asOfDate` for a student in a given year.
   */
  async findActiveAssignment(
    studentId: string,
    academicYearId: string,
    asOfDate: string,
  ): Promise<StudentFeeStructureAssignmentRow | null> {
    const rows = await this.tenantPrisma.query<StudentFeeStructureAssignmentRow>(
      `SELECT * FROM student_fee_structure_assignments
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
         AND deleted_at IS NULL
         AND effective_from <= $3::date
         AND (effective_to IS NULL OR effective_to >= $3::date)
       ORDER BY effective_from DESC
       LIMIT 1`,
      studentId,
      academicYearId,
      asOfDate,
    );
    return rows[0] ?? null;
  }

  /**
   * BILL-4 Checkpoint C (proration, B4-5): unlike findActiveAssignment
   * (a single asOfDate snapshot), this finds an assignment covering ANY
   * part of [periodStart, periodEnd] — required to find a student whose
   * effective_from starts mid-period, who findActiveAssignment(periodStart)
   * would incorrectly miss.
   */
  async findAssignmentOverlappingPeriod(
    studentId: string,
    academicYearId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<StudentFeeStructureAssignmentRow | null> {
    const rows = await this.tenantPrisma.query<StudentFeeStructureAssignmentRow>(
      `SELECT * FROM student_fee_structure_assignments
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
         AND deleted_at IS NULL
         AND effective_from <= $4::date
         AND (effective_to IS NULL OR effective_to >= $3::date)
       ORDER BY effective_from DESC
       LIMIT 1`,
      studentId,
      academicYearId,
      periodStart,
      periodEnd,
    );
    return rows[0] ?? null;
  }
}
