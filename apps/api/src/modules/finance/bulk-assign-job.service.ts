import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  BulkAssignJobRow,
  toBulkAssignJobResponse,
  BulkAssignJobResponseDto,
} from './entities/bill-assignment.entity';
import { BulkAssignDto, BulkAssignScopeType } from './dto/student-fee-structure-assignment.dto';

@Injectable()
export class BulkAssignJobService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Spec §6: "runs as a background job... not a synchronous request". This
   * method only resolves the roster and writes the job row — the actual
   * per-student writes happen in BulkAssignPoller, outside the HTTP
   * request/response cycle. The roster is resolved to a concrete id list
   * ONCE, here, and frozen onto the job row (`scope_student_ids`) — the
   * poller never re-derives it, so a class roster change after job creation
   * doesn't silently change what the job does.
   */
  async create(
    feeStructureId: string,
    dto: BulkAssignDto,
    createdById: string,
  ): Promise<BulkAssignJobResponseDto> {
    const structureRows = await this.tenantPrisma.query<{ id: string; academic_year_id: string }>(
      `SELECT id, academic_year_id FROM bill_fee_structures WHERE id = $1::uuid AND deleted_at IS NULL`,
      feeStructureId,
    );
    if (!structureRows[0]) throw new NotFoundException(`Fee structure ${feeStructureId} not found`);
    const academicYearId = structureRows[0].academic_year_id;

    let studentIds: string[];
    if (dto.scopeType === BulkAssignScopeType.CLASS) {
      if (!dto.classId) throw new BadRequestException('classId is required when scopeType is CLASS');
      const conditions = ['class_id = $1::uuid', 'deleted_at IS NULL', "status = 'ACTIVE'"];
      const params: unknown[] = [dto.classId];
      if (dto.sectionId) {
        conditions.push(`section_id = $${params.length + 1}::uuid`);
        params.push(dto.sectionId);
      }
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE ${conditions.join(' AND ')}`,
        ...params,
      );
      studentIds = rows.map((r) => r.id);
    } else {
      if (!dto.studentIds?.length) {
        throw new BadRequestException('studentIds is required when scopeType is STUDENT_LIST');
      }
      studentIds = dto.studentIds;
    }

    const rows = await this.tenantPrisma.query<BulkAssignJobRow>(
      `INSERT INTO bulk_assign_jobs
         (fee_structure_id, academic_year_id, scope_type, scope_class_id, scope_section_id,
          scope_student_ids, effective_from, total, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::jsonb, $7::date, $8, $9::uuid)
       RETURNING *`,
      feeStructureId,
      academicYearId,
      dto.scopeType,
      dto.classId ?? null,
      dto.sectionId ?? null,
      JSON.stringify(studentIds),
      dto.effectiveFrom,
      studentIds.length,
      createdById,
    );
    return toBulkAssignJobResponse(rows[0]);
  }

  async findOne(id: string): Promise<BulkAssignJobResponseDto> {
    const rows = await this.tenantPrisma.query<BulkAssignJobRow>(
      `SELECT * FROM bulk_assign_jobs WHERE id = $1::uuid`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Job ${id} not found`);
    return toBulkAssignJobResponse(rows[0]);
  }
}
