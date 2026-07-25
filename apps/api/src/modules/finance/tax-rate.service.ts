import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import {
  TaxRateRow,
  toTaxRateResponse,
  TaxRateResponseDto,
} from './entities/bill-catalog.entity';
import { CreateTaxRateDto, UpdateTaxRateDto, TaxRateQueryDto } from './dto/tax-rate.dto';

@Injectable()
export class TaxRateService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * R6: at most one tax rate may be effective on any given date, so "no tax
   * row prints unless a rate exists for the invoice date" is unambiguous.
   * excludeId lets update() re-check without the row colliding with itself.
   */
  private async assertNoOverlap(
    tx: TenantTx,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string,
  ): Promise<void> {
    const params: unknown[] = [effectiveFrom, effectiveTo];
    let excludeClause = '';
    if (excludeId) {
      params.push(excludeId);
      excludeClause = `AND id <> $3::uuid`;
    }
    const overlapping = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM tax_rates
       WHERE deleted_at IS NULL
         AND effective_from <= COALESCE($2::date, 'infinity'::date)
         AND COALESCE(effective_to, 'infinity'::date) >= $1::date
         ${excludeClause}`,
      ...params,
    );
    if (overlapping.length > 0) {
      throw new ConflictException('Effective range overlaps an existing tax rate');
    }
  }

  async create(dto: CreateTaxRateDto, createdById: string): Promise<TaxRateResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      await this.assertNoOverlap(tx, dto.effectiveFrom, dto.effectiveTo ?? null);

      const [row] = await tx.$queryRawUnsafe<TaxRateRow[]>(
        `INSERT INTO tax_rates (name, rate, applies_to, effective_from, effective_to, created_by)
         VALUES ($1, $2, $3, $4::date, $5::date, $6::uuid)
         RETURNING *`,
        dto.name,
        dto.rate,
        dto.appliesTo ?? 'ALL',
        dto.effectiveFrom,
        dto.effectiveTo ?? null,
        createdById,
      );
      return toTaxRateResponse(row);
    });
  }

  async findAll(query: TaxRateQueryDto): Promise<{
    data: TaxRateResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.isActive !== undefined) {
      // "Active" = today falls within [effective_from, effective_to]. Must be
      // parenthesized: bare OR clauses would rewrite the AND-joined
      // deleted_at IS NULL filter above via operator precedence.
      conditions.push(
        query.isActive
          ? `(effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE))`
          : `(effective_from > CURRENT_DATE OR effective_to < CURRENT_DATE)`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<TaxRateRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM tax_rates ${where}
       ORDER BY effective_from DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toTaxRateResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateTaxRateDto): Promise<TaxRateResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const [existing] = await tx.$queryRawUnsafe<TaxRateRow[]>(
        `SELECT * FROM tax_rates WHERE id = $1::uuid AND deleted_at IS NULL`,
        id,
      );
      if (!existing) throw new NotFoundException(`Tax rate ${id} not found`);

      const nextFrom = dto.effectiveFrom ?? (existing.effective_from as unknown as string);
      const nextTo = dto.effectiveTo !== undefined
        ? dto.effectiveTo
        : (existing.effective_to as unknown as string | null);
      if (dto.effectiveFrom !== undefined || dto.effectiveTo !== undefined) {
        await this.assertNoOverlap(tx, nextFrom, nextTo, id);
      }

      const sets: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      let idx = 1;

      if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
      if (dto.effectiveFrom !== undefined) { sets.push(`effective_from = $${idx++}::date`); params.push(dto.effectiveFrom); }
      if (dto.effectiveTo !== undefined) { sets.push(`effective_to = $${idx++}::date`); params.push(dto.effectiveTo); }

      params.push(id);
      const [row] = await tx.$queryRawUnsafe<TaxRateRow[]>(
        `UPDATE tax_rates SET ${sets.join(', ')}
         WHERE id = $${idx}::uuid AND deleted_at IS NULL
         RETURNING *`,
        ...params,
      );
      return toTaxRateResponse(row);
    });
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE tax_rates SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Tax rate ${id} not found`);
  }
}
