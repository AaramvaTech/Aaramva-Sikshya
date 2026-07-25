import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  FeeHeadRow,
  toFeeHeadResponse,
  FeeHeadResponseDto,
} from './entities/bill-catalog.entity';
import { CreateFeeHeadDto, UpdateFeeHeadDto, FeeHeadQueryDto } from './dto/fee-head.dto';

@Injectable()
export class FeeHeadService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateFeeHeadDto): Promise<FeeHeadResponseDto> {
    const rows = await this.tenantPrisma.query<FeeHeadRow>(
      `INSERT INTO fee_heads
         (name, code, recurrence, is_taxable, is_refundable, proration_policy, gl_account_code, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      dto.name,
      dto.code,
      dto.recurrence,
      dto.isTaxable ?? false,
      dto.isRefundable ?? false,
      dto.prorationPolicy ?? 'NONE',
      dto.glAccountCode ?? null,
      dto.displayOrder ?? 0,
    );
    return toFeeHeadResponse(rows[0]);
  }

  async findAll(query: FeeHeadQueryDto): Promise<{
    data: FeeHeadResponseDto[];
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

    const rows = await this.tenantPrisma.query<FeeHeadRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM fee_heads ${where}
       ORDER BY display_order, name
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toFeeHeadResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateFeeHeadDto): Promise<FeeHeadResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.code !== undefined) { sets.push(`code = $${idx++}`); params.push(dto.code); }
    if (dto.recurrence !== undefined) { sets.push(`recurrence = $${idx++}`); params.push(dto.recurrence); }
    if (dto.isTaxable !== undefined) { sets.push(`is_taxable = $${idx++}`); params.push(dto.isTaxable); }
    if (dto.isRefundable !== undefined) { sets.push(`is_refundable = $${idx++}`); params.push(dto.isRefundable); }
    if (dto.prorationPolicy !== undefined) { sets.push(`proration_policy = $${idx++}`); params.push(dto.prorationPolicy); }
    if (dto.glAccountCode !== undefined) { sets.push(`gl_account_code = $${idx++}`); params.push(dto.glAccountCode); }
    if (dto.displayOrder !== undefined) { sets.push(`display_order = $${idx++}`); params.push(dto.displayOrder); }
    if (dto.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(dto.isActive); }

    params.push(id);
    const rows = await this.tenantPrisma.query<FeeHeadRow>(
      `UPDATE fee_heads SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Fee head ${id} not found`);
    return toFeeHeadResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE fee_heads SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Fee head ${id} not found`);
  }
}
