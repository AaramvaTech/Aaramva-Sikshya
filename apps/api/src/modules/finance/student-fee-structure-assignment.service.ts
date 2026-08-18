import {
  BadRequestException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { errorBody } from '../common/errors/error-codes';
import {
  StudentFeeStructureAssignmentRow,
  toStudentFeeStructureAssignmentResponse,
  StudentFeeStructureAssignmentResponseDto,
} from './entities/bill-assignment.entity';
import { ClassScope, isClassMismatch, mismatchMessage } from './bill-class-guard.util';
import { AssignFeeStructureDto } from './dto/student-fee-structure-assignment.dto';

/** The class/section columns + their display names — same shape on both sides of the guard. */
export interface ScopeRow {
  class_id: string | null;
  section_id: string | null;
  class_name: string | null;
  section_name: string | null;
}

export function toScope(row: ScopeRow): ClassScope {
  return {
    classId: row.class_id,
    sectionId: row.section_id,
    className: row.class_name,
    sectionName: row.section_name,
  };
}

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
      const structureRows = await tx.$queryRawUnsafe<({ id: string; academic_year_id: string } & ScopeRow)[]>(
        `SELECT bfs.id, bfs.academic_year_id, bfs.class_id, bfs.section_id,
                c.name AS class_name, sec.name AS section_name
           FROM bill_fee_structures bfs
           LEFT JOIN classes  c   ON c.id   = bfs.class_id
           LEFT JOIN sections sec ON sec.id = bfs.section_id
          WHERE bfs.id = $1::uuid AND bfs.deleted_at IS NULL`,
        dto.feeStructureId,
      );
      if (!structureRows[0]) throw new NotFoundException(`Fee structure ${dto.feeStructureId} not found`);
      const academicYearId = structureRows[0].academic_year_id;

      const studentRows = await tx.$queryRawUnsafe<({ id: string } & ScopeRow)[]>(
        `SELECT s.id, s.class_id, s.section_id,
                c.name AS class_name, sec.name AS section_name
           FROM students s
           LEFT JOIN classes  c   ON c.id   = s.class_id
           LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = $1::uuid AND s.deleted_at IS NULL`,
        studentId,
      );
      if (!studentRows[0]) throw new NotFoundException(`Student ${studentId} not found`);

      // Two independent pre-write guards, both landing here in the same merge
      // (FEE-CLASS-GUARD × BILL-DATA-1 Phase 3). Order is deliberate: WHAT is
      // being assigned is checked before WHEN it starts, since a wrong-class
      // assignment is wrong at any date — so a mismatch never even runs the
      // open-row query below.

      // FEE-CLASS-GUARD: blocked by default, overridable only on an explicit,
      // per-request opt-in. The 422 body names both sides so the UI can show
      // the admin exactly what disagrees before they choose to override.
      const structureScope = toScope(structureRows[0]);
      const studentScope = toScope(studentRows[0]);
      const mismatch = isClassMismatch(structureScope, studentScope);
      if (mismatch && !dto.allowCrossClassAssignment) {
        throw new UnprocessableEntityException(
          errorBody('CLASS_MISMATCH', mismatchMessage(structureScope, studentScope), {
            feeStructure: {
              id: dto.feeStructureId,
              className: structureScope.className,
              sectionName: structureScope.sectionName,
            },
            target: {
              studentId,
              className: studentScope.className,
              sectionName: studentScope.sectionName,
            },
          }),
        );
      }

      // BILL-DATA-1 Phase 3: the close-out below sets effective_to = new
      // effective_from - 1 on whatever is currently open. If the new
      // effectiveFrom isn't actually after that row's own effective_from
      // (a backdated re-assignment), that produces effective_to < effective_from
      // on the row being closed — the exact bug found in motherland-school's
      // 10 inverted rows. Reject before writing instead of silently corrupting
      // the row being closed.
      const openRows = await tx.$queryRawUnsafe<{ effective_from: Date | string }[]>(
        `SELECT effective_from FROM student_fee_structure_assignments
         WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
           AND effective_to IS NULL AND deleted_at IS NULL`,
        studentId,
        academicYearId,
      );
      if (openRows[0]) {
        const openFrom = openRows[0].effective_from instanceof Date
          ? openRows[0].effective_from.toISOString().split('T')[0]
          : String(openRows[0].effective_from);
        if (dto.effectiveFrom <= openFrom) {
          throw new BadRequestException(
            `New effectiveFrom (${dto.effectiveFrom}) must be after the current assignment's effectiveFrom (${openFrom})`,
          );
        }
      }

      await tx.$executeRawUnsafe(
        `UPDATE student_fee_structure_assignments
           SET effective_to = $3::date - 1, updated_at = NOW()
         WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
           AND effective_to IS NULL AND deleted_at IS NULL`,
        studentId,
        academicYearId,
        dto.effectiveFrom,
      );

      // The override stamp is written only when a mismatch was actually
      // overridden — passing the flag on a matching assignment is a no-op, so
      // a client that sends it blindly can't fake an audit trail.
      const [row] = await tx.$queryRawUnsafe<StudentFeeStructureAssignmentRow[]>(
        `INSERT INTO student_fee_structure_assignments
           (student_id, fee_structure_id, academic_year_id, effective_from, assigned_by,
            class_mismatch_overridden, overridden_by_user_id, overridden_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::uuid,
                 $6, CASE WHEN $6 THEN $5::uuid END, CASE WHEN $6 THEN NOW() END)
         RETURNING *`,
        studentId,
        dto.feeStructureId,
        academicYearId,
        dto.effectiveFrom,
        assignedById,
        mismatch,
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
