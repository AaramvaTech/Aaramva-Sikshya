import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { DepartmentRow, toDepartmentResponse, DepartmentResponseDto } from './entities/hr.entity';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';

@Injectable()
export class DepartmentService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    const rows = await this.tenantPrisma.query<DepartmentRow>(
      `INSERT INTO departments (name) VALUES ($1) RETURNING *, 0 AS designation_count`,
      dto.name,
    );
    return toDepartmentResponse(rows[0]);
  }

  async findAll(query: DepartmentQueryDto): Promise<{
    data: DepartmentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) {
      conditions.push(`d.name ILIKE $${idx++}`);
      params.push(`%${query.search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<DepartmentRow & { total_count: string }>(
      `SELECT d.*,
              COUNT(DISTINCT des.id) FILTER (WHERE des.deleted_at IS NULL) AS designation_count,
              COUNT(*) OVER() AS total_count
         FROM departments d
         LEFT JOIN designations des ON des.department_id = d.id
         ${where}
         GROUP BY d.id
         ORDER BY d.name ASC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toDepartmentResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentResponseDto> {
    const existing = await this.tenantPrisma.query<DepartmentRow>(
      `SELECT * FROM departments WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Department ${id} not found`);

    const rows = await this.tenantPrisma.query<DepartmentRow>(
      `UPDATE departments SET name = $1, updated_at = NOW()
         WHERE id = $2::uuid
         RETURNING *, 0 AS designation_count`,
      dto.name ?? existing[0].name,
      id,
    );
    return toDepartmentResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.tenantPrisma.query<DepartmentRow>(
      `SELECT id FROM departments WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Department ${id} not found`);
    await this.tenantPrisma.execute(
      `UPDATE departments SET deleted_at = NOW() WHERE id = $1::uuid`,
      id,
    );
  }
}
