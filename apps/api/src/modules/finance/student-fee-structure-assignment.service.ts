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
}
