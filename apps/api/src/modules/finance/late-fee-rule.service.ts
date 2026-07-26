import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  LateFeeRuleRow,
  toLateFeeRuleResponse,
  LateFeeRuleResponseDto,
} from './entities/bill-catalog.entity';
import {
  CreateLateFeeRuleDto,
  UpdateLateFeeRuleDto,
  LateFeeRuleQueryDto,
} from './dto/late-fee-rule.dto';

@Injectable()
export class LateFeeRuleService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateLateFeeRuleDto): Promise<LateFeeRuleResponseDto> {
    if (dto.scope === 'FEE_HEAD' && !dto.feeHeadId) {
      throw new BadRequestException('feeHeadId is required when scope is FEE_HEAD');
    }
    // scope=GLOBAL is school-wide by definition — never scoped to a single head.
    const feeHeadId = dto.scope === 'GLOBAL' ? null : dto.feeHeadId;

    const rows = await this.tenantPrisma.query<LateFeeRuleRow>(
      `INSERT INTO late_fee_rules
         (scope, fee_head_id, type, value, grace_days, cap_amount, is_enabled, effective_from, effective_to)
       VALUES ($1, $2::uuid, $3, $4::numeric, $5, $6::numeric, $7, $8::date, $9::date)
       RETURNING *`,
      dto.scope,
      feeHeadId,
      dto.type,
      dto.value,
      dto.graceDays ?? 0,
      dto.capAmount ?? null,
      dto.isEnabled ?? false,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
    );
    return toLateFeeRuleResponse(rows[0]);
  }

  async findAll(query: LateFeeRuleQueryDto): Promise<{
    data: LateFeeRuleResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.isEnabled !== undefined) { conditions.push(`is_enabled = $${idx++}`); params.push(query.isEnabled); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<LateFeeRuleRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM late_fee_rules ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toLateFeeRuleResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateLateFeeRuleDto): Promise<LateFeeRuleResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.value !== undefined) { sets.push(`value = $${idx++}::numeric`); params.push(dto.value); }
    if (dto.graceDays !== undefined) { sets.push(`grace_days = $${idx++}`); params.push(dto.graceDays); }
    if (dto.capAmount !== undefined) { sets.push(`cap_amount = $${idx++}::numeric`); params.push(dto.capAmount); }
    if (dto.isEnabled !== undefined) { sets.push(`is_enabled = $${idx++}`); params.push(dto.isEnabled); }
    if (dto.effectiveFrom !== undefined) { sets.push(`effective_from = $${idx++}::date`); params.push(dto.effectiveFrom); }
    if (dto.effectiveTo !== undefined) { sets.push(`effective_to = $${idx++}::date`); params.push(dto.effectiveTo); }

    params.push(id);
    const rows = await this.tenantPrisma.query<LateFeeRuleRow>(
      `UPDATE late_fee_rules SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Late fee rule ${id} not found`);
    return toLateFeeRuleResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE late_fee_rules SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Late fee rule ${id} not found`);
  }
}
