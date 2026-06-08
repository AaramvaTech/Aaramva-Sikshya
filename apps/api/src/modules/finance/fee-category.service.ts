import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  FeeCategoryRow,
  toFeeCategoryResponse,
  FeeCategoryResponseDto,
} from './entities/finance.entity';
import {
  CreateFeeCategoryDto,
  UpdateFeeCategoryDto,
  FeeCategoryQueryDto,
} from './dto/fee-category.dto';

@Injectable()
export class FeeCategoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateFeeCategoryDto): Promise<FeeCategoryResponseDto> {
    const rows = await this.tenantPrisma.query<FeeCategoryRow>(
      `INSERT INTO fee_categories (name, type, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      dto.name,
      dto.type,
      dto.description ?? null,
    );
    return toFeeCategoryResponse(rows[0]);
  }

  async findAll(query: FeeCategoryQueryDto): Promise<{
    data: FeeCategoryResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) { conditions.push(`name ILIKE $${idx++}`); params.push(`%${query.search}%`); }
    if (query.type) { conditions.push(`type = $${idx++}`); params.push(query.type); }
    if (query.isActive !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(query.isActive); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<FeeCategoryRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM fee_categories ${where}
       ORDER BY name
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toFeeCategoryResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateFeeCategoryDto): Promise<FeeCategoryResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.type !== undefined) { sets.push(`type = $${idx++}`); params.push(dto.type); }
    if (dto.description !== undefined) { sets.push(`description = $${idx++}`); params.push(dto.description); }
    if (dto.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(dto.isActive); }

    params.push(id);
    const rows = await this.tenantPrisma.query<FeeCategoryRow>(
      `UPDATE fee_categories SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Fee category ${id} not found`);
    return toFeeCategoryResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE fee_categories SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Fee category ${id} not found`);
  }
}
