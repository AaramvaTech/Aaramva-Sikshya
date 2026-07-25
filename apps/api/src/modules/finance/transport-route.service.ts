import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  TransportRouteRow,
  toTransportRouteResponse,
  TransportRouteResponseDto,
} from './entities/bill-catalog.entity';
import {
  CreateTransportRouteDto,
  UpdateTransportRouteDto,
  TransportRouteQueryDto,
} from './dto/transport-route.dto';

@Injectable()
export class TransportRouteService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateTransportRouteDto): Promise<TransportRouteResponseDto> {
    const rows = await this.tenantPrisma.query<TransportRouteRow>(
      `INSERT INTO transport_routes (name, code, monthly_amount)
       VALUES ($1, $2, $3::numeric)
       RETURNING *`,
      dto.name,
      dto.code,
      dto.monthlyAmount,
    );
    return toTransportRouteResponse(rows[0]);
  }

  async findAll(query: TransportRouteQueryDto): Promise<{
    data: TransportRouteResponseDto[];
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

    const rows = await this.tenantPrisma.query<TransportRouteRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM transport_routes ${where}
       ORDER BY name
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toTransportRouteResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateTransportRouteDto): Promise<TransportRouteResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.code !== undefined) { sets.push(`code = $${idx++}`); params.push(dto.code); }
    if (dto.monthlyAmount !== undefined) { sets.push(`monthly_amount = $${idx++}::numeric`); params.push(dto.monthlyAmount); }
    if (dto.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(dto.isActive); }

    params.push(id);
    const rows = await this.tenantPrisma.query<TransportRouteRow>(
      `UPDATE transport_routes SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Transport route ${id} not found`);
    return toTransportRouteResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE transport_routes SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Transport route ${id} not found`);
  }
}
