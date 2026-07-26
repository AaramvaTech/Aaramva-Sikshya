import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  DiscountReasonRow,
  toDiscountReasonResponse,
  DiscountReasonResponseDto,
} from './entities/bill-catalog.entity';
import {
  CreateDiscountReasonDto,
  UpdateDiscountReasonDto,
  DiscountReasonQueryDto,
} from './dto/discount-reason.dto';

@Injectable()
export class DiscountReasonService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateDiscountReasonDto): Promise<DiscountReasonResponseDto> {
    const rows = await this.tenantPrisma.query<DiscountReasonRow>(
      `INSERT INTO discount_reasons (name, code, gl_account_code)
       VALUES ($1, $2, $3)
       RETURNING *`,
      dto.name,
      dto.code,
      dto.glAccountCode ?? null,
    );
    return toDiscountReasonResponse(rows[0]);
  }

  async findAll(query: DiscountReasonQueryDto): Promise<{
    data: DiscountReasonResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) { conditions.push(`name ILIKE $${idx++}`); params.push(`%${query.search}%`); }
    if (query.isActive !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(query.isActive); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<DiscountReasonRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM discount_reasons ${where}
       ORDER BY name
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toDiscountReasonResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateDiscountReasonDto): Promise<DiscountReasonResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.code !== undefined) { sets.push(`code = $${idx++}`); params.push(dto.code); }
    if (dto.glAccountCode !== undefined) { sets.push(`gl_account_code = $${idx++}`); params.push(dto.glAccountCode); }
    if (dto.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(dto.isActive); }

    params.push(id);
    const rows = await this.tenantPrisma.query<DiscountReasonRow>(
      `UPDATE discount_reasons SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Discount reason ${id} not found`);
    return toDiscountReasonResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE discount_reasons SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Discount reason ${id} not found`);
  }
}
