import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  FeeStructureRow,
  FeeStructureItemRow,
  toFeeStructureResponse,
  FeeStructureResponseDto,
} from './entities/finance.entity';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureItemsDto,
  FeeStructureQueryDto,
} from './dto/fee-structure.dto';

@Injectable()
export class FeeStructureService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createFeeStructure(
    dto: CreateFeeStructureDto,
    createdById: string,
  ): Promise<FeeStructureResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const existing = await tx.$queryRawUnsafe<FeeStructureRow[]>(
        `SELECT id FROM fee_structures
         WHERE class_id = $1::uuid AND academic_year_id = $2::uuid AND deleted_at IS NULL`,
        dto.classId,
        dto.academicYearId,
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Fee structure already exists for this class and academic year`,
        );
      }

      const [structure] = await tx.$queryRawUnsafe<FeeStructureRow[]>(
        `INSERT INTO fee_structures (class_id, academic_year_id, created_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid)
         RETURNING *`,
        dto.classId,
        dto.academicYearId,
        createdById,
      );

      for (const item of dto.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO fee_structure_items
             (fee_structure_id, fee_category_id, amount, due_day_of_month, due_date,
              fine_per_day, grace_period_days)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
          structure.id,
          item.feeCategoryId,
          item.amount,
          item.dueDayOfMonth,
          item.dueDate ?? null,
          item.finePerDay ?? 0,
          item.gracePeriodDays ?? 0,
        );
      }

      return toFeeStructureResponse(structure);
    });
  }

  async findAll(query: FeeStructureQueryDto): Promise<{
    data: FeeStructureResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['fs.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.classId) { conditions.push(`fs.class_id = $${idx++}::uuid`); params.push(query.classId); }
    if (query.academicYearId) { conditions.push(`fs.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<
      FeeStructureRow & {
        total_count: string;
        class_name: string;
        academic_year_name: string;
        item_count: string;
        total_amount: string;
      }
    >(
      `SELECT fs.*,
              c.name AS class_name,
              ay.name AS academic_year_name,
              COALESCE(ic.cnt, 0) AS item_count,
              COALESCE(ic.total, 0) AS total_amount,
              COUNT(*) OVER() AS total_count
       FROM fee_structures fs
       JOIN classes c ON c.id = fs.class_id
       JOIN academic_years ay ON ay.id = fs.academic_year_id
       LEFT JOIN (
         SELECT fee_structure_id, COUNT(*) AS cnt, SUM(amount) AS total
         FROM fee_structure_items GROUP BY fee_structure_id
       ) ic ON ic.fee_structure_id = fs.id
       ${where}
       ORDER BY fs.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map((r) => ({
        ...toFeeStructureResponse(r),
        className: r.class_name,
        academicYearName: r.academic_year_name,
        itemCount: parseInt(r.item_count, 10),
        totalAmount: parseFloat(r.total_amount),
      })),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<FeeStructureResponseDto & { className: string; academicYearName: string; itemCount: number; totalAmount: number }> {
    const rows = await this.tenantPrisma.query<FeeStructureRow & { class_name: string; academic_year_name: string }>(
      `SELECT fs.*, c.name AS class_name, ay.name AS academic_year_name
       FROM fee_structures fs
       JOIN classes c ON c.id = fs.class_id
       JOIN academic_years ay ON ay.id = fs.academic_year_id
       WHERE fs.id = $1::uuid AND fs.deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Fee structure ${id} not found`);

    const items = await this.tenantPrisma.query<FeeStructureItemRow>(
      `SELECT fsi.*, fc.name AS fee_category_name
       FROM fee_structure_items fsi
       JOIN fee_categories fc ON fc.id = fsi.fee_category_id
       WHERE fsi.fee_structure_id = $1::uuid
       ORDER BY fsi.created_at`,
      id,
    );

    return {
      ...toFeeStructureResponse(rows[0], items),
      className: rows[0].class_name,
      academicYearName: rows[0].academic_year_name,
      itemCount: items.length,
      totalAmount: items.reduce((s, i) => s + parseFloat(String(i.amount)), 0),
    };
  }

  async updateItems(id: string, dto: UpdateFeeStructureItemsDto): Promise<FeeStructureResponseDto> {
    const rows = await this.tenantPrisma.query<FeeStructureRow>(
      `SELECT * FROM fee_structures WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Fee structure ${id} not found`);

    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM fee_structure_items WHERE fee_structure_id = $1::uuid`,
        id,
      );
      for (const item of dto.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO fee_structure_items
             (fee_structure_id, fee_category_id, amount, due_day_of_month, due_date,
              fine_per_day, grace_period_days)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
          id,
          item.feeCategoryId,
          item.amount,
          item.dueDayOfMonth,
          item.dueDate ?? null,
          item.finePerDay ?? 0,
          item.gracePeriodDays ?? 0,
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE fee_structures SET updated_at = NOW() WHERE id = $1::uuid`,
        id,
      );
    });

    return this.findOne(id);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE fee_structures SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Fee structure ${id} not found`);
  }
}
