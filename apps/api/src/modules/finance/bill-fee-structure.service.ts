import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  BillFeeStructureRow,
  BillFeeStructureItemRow,
  toBillFeeStructureResponse,
  BillFeeStructureResponseDto,
} from './entities/bill-catalog.entity';
import {
  CreateBillFeeStructureDto,
  UpdateBillFeeStructureItemsDto,
  BillFeeStructureQueryDto,
} from './dto/bill-fee-structure.dto';

@Injectable()
export class BillFeeStructureService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * BILL-1: the reason this table exists. UNIQUE NULLS NOT DISTINCT
   * (academic_year_id, class_id, section_id, name) at the DB level allows
   * any number of structures per class+year as long as their names differ —
   * "Grade 5 — Day scholar" and "Grade 5 — Hosteller" both persist, which
   * the old fee_structures' UNIQUE(class_id, academic_year_id) could never
   * express. This pre-check (mirroring the old service's own convention of
   * a SELECT-before-INSERT rather than catching a DB constraint violation)
   * only rejects an exact name collision in the same scope.
   */
  async createFeeStructure(
    dto: CreateBillFeeStructureDto,
    createdById: string,
  ): Promise<BillFeeStructureResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM bill_fee_structures
         WHERE academic_year_id = $1::uuid AND class_id = $2::uuid
           AND section_id IS NOT DISTINCT FROM $3::uuid
           AND name = $4 AND deleted_at IS NULL`,
        dto.academicYearId,
        dto.classId,
        dto.sectionId ?? null,
        dto.name,
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `A fee structure named "${dto.name}" already exists for this class/section/year`,
        );
      }

      const [structure] = await tx.$queryRawUnsafe<BillFeeStructureRow[]>(
        `INSERT INTO bill_fee_structures (academic_year_id, class_id, section_id, name, created_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)
         RETURNING *`,
        dto.academicYearId,
        dto.classId,
        dto.sectionId ?? null,
        dto.name,
        createdById,
      );

      for (const item of dto.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO bill_fee_structure_items
             (fee_structure_id, fee_head_id, amount, recurrence_override, effective_from, effective_to)
           VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5::date, $6::date)`,
          structure.id,
          item.feeHeadId,
          item.amount,
          item.recurrenceOverride ?? null,
          item.effectiveFrom,
          item.effectiveTo ?? null,
        );
      }

      return toBillFeeStructureResponse(structure);
    });
  }

  async findAll(query: BillFeeStructureQueryDto): Promise<{
    data: BillFeeStructureResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['fs.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.academicYearId) { conditions.push(`fs.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.classId) { conditions.push(`fs.class_id = $${idx++}::uuid`); params.push(query.classId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<BillFeeStructureRow & { total_count: string }>(
      `SELECT fs.*, COUNT(*) OVER() AS total_count
       FROM bill_fee_structures fs
       ${where}
       ORDER BY fs.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map((r) => toBillFeeStructureResponse(r)), meta: { page, limit, total } };
  }

  async findOne(id: string): Promise<BillFeeStructureResponseDto> {
    const rows = await this.tenantPrisma.query<BillFeeStructureRow>(
      `SELECT * FROM bill_fee_structures WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Fee structure ${id} not found`);

    const items = await this.tenantPrisma.query<BillFeeStructureItemRow>(
      `SELECT bfsi.*, fh.name AS fee_head_name
       FROM bill_fee_structure_items bfsi
       JOIN fee_heads fh ON fh.id = bfsi.fee_head_id
       WHERE bfsi.fee_structure_id = $1::uuid
       ORDER BY bfsi.created_at`,
      id,
    );

    return toBillFeeStructureResponse(rows[0], items);
  }

  async updateItems(id: string, dto: UpdateBillFeeStructureItemsDto): Promise<BillFeeStructureResponseDto> {
    const rows = await this.tenantPrisma.query<BillFeeStructureRow>(
      `SELECT * FROM bill_fee_structures WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Fee structure ${id} not found`);

    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM bill_fee_structure_items WHERE fee_structure_id = $1::uuid`,
        id,
      );
      for (const item of dto.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO bill_fee_structure_items
             (fee_structure_id, fee_head_id, amount, recurrence_override, effective_from, effective_to)
           VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5::date, $6::date)`,
          id,
          item.feeHeadId,
          item.amount,
          item.recurrenceOverride ?? null,
          item.effectiveFrom,
          item.effectiveTo ?? null,
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE bill_fee_structures SET updated_at = NOW() WHERE id = $1::uuid`,
        id,
      );
    });

    return this.findOne(id);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE bill_fee_structures SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Fee structure ${id} not found`);
  }
}
