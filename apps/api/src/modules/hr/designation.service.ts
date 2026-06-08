import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { DesignationRow, toDesignationResponse, DesignationResponseDto } from './entities/hr.entity';
import { CreateDesignationDto, UpdateDesignationDto, DesignationQueryDto } from './dto/designation.dto';

@Injectable()
export class DesignationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateDesignationDto): Promise<DesignationResponseDto> {
    const rows = await this.tenantPrisma.query<DesignationRow>(
      `INSERT INTO designations (title, department_id)
         VALUES ($1, $2::uuid)
         RETURNING *, NULL AS department_name`,
      dto.title,
      dto.departmentId ?? null,
    );
    return toDesignationResponse(rows[0]);
  }

  async findAll(query: DesignationQueryDto): Promise<{
    data: DesignationResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['des.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) {
      conditions.push(`des.title ILIKE $${idx++}`);
      params.push(`%${query.search}%`);
    }
    if (query.departmentId) {
      conditions.push(`des.department_id = $${idx++}::uuid`);
      params.push(query.departmentId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<DesignationRow & { total_count: string }>(
      `SELECT des.*, d.name AS department_name, COUNT(*) OVER() AS total_count
         FROM designations des
         LEFT JOIN departments d ON d.id = des.department_id AND d.deleted_at IS NULL
         ${where}
         ORDER BY des.title ASC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toDesignationResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateDesignationDto): Promise<DesignationResponseDto> {
    const existing = await this.tenantPrisma.query<DesignationRow>(
      `SELECT * FROM designations WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Designation ${id} not found`);

    const rows = await this.tenantPrisma.query<DesignationRow>(
      `UPDATE designations
          SET title = $1, department_id = $2::uuid, updated_at = NOW()
        WHERE id = $3::uuid
        RETURNING *, NULL AS department_name`,
      dto.title ?? existing[0].title,
      dto.departmentId !== undefined ? dto.departmentId : existing[0].department_id,
      id,
    );
    return toDesignationResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.tenantPrisma.query<DesignationRow>(
      `SELECT id FROM designations WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Designation ${id} not found`);
    await this.tenantPrisma.execute(
      `UPDATE designations SET deleted_at = NOW() WHERE id = $1::uuid`,
      id,
    );
  }
}
