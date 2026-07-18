import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { EmploymentTypeRow, toEmploymentTypeResponse, EmploymentTypeResponseDto } from './entities/hr.entity';
import { CreateEmploymentTypeDto, UpdateEmploymentTypeDto, EmploymentTypeQueryDto } from './dto/employment-type.dto';

@Injectable()
export class EmploymentTypeService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateEmploymentTypeDto): Promise<EmploymentTypeResponseDto> {
    const rows = await this.tenantPrisma.query<EmploymentTypeRow>(
      `INSERT INTO employment_types (name) VALUES ($1) RETURNING *, 0 AS staff_count`,
      dto.name,
    );
    return toEmploymentTypeResponse(rows[0]);
  }

  async findAll(query: EmploymentTypeQueryDto): Promise<{
    data: EmploymentTypeResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['et.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) {
      conditions.push(`et.name ILIKE $${idx++}`);
      params.push(`%${query.search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<EmploymentTypeRow & { total_count: string }>(
      `SELECT et.*,
              COUNT(sp.id) FILTER (WHERE sp.deleted_at IS NULL) AS staff_count,
              COUNT(*) OVER() AS total_count
         FROM employment_types et
         LEFT JOIN staff_profiles sp ON sp.employment_type_id = et.id
         ${where}
         GROUP BY et.id
         ORDER BY et.name ASC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toEmploymentTypeResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateEmploymentTypeDto): Promise<EmploymentTypeResponseDto> {
    const existing = await this.tenantPrisma.query<EmploymentTypeRow>(
      `SELECT * FROM employment_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Employment type ${id} not found`);

    const rows = await this.tenantPrisma.query<EmploymentTypeRow>(
      `UPDATE employment_types SET name = $1, updated_at = NOW()
         WHERE id = $2::uuid
         RETURNING *, 0 AS staff_count`,
      dto.name ?? existing[0].name,
      id,
    );
    return toEmploymentTypeResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.tenantPrisma.query<EmploymentTypeRow>(
      `SELECT id FROM employment_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Employment type ${id} not found`);
    await this.tenantPrisma.execute(
      `UPDATE employment_types SET deleted_at = NOW() WHERE id = $1::uuid`,
      id,
    );
  }
}
