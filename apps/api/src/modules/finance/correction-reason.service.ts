import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  CorrectionReasonRow,
  toCorrectionReasonResponse,
  CorrectionReasonResponseDto,
} from './entities/bill-correction.entity';
import {
  CreateCorrectionReasonDto,
  UpdateCorrectionReasonDto,
  CorrectionReasonQueryDto,
} from './dto/correction-reason.dto';

/** BILL-6: reason lookup for credit notes/refunds/write-offs — deliberately
 * separate from discount_reasons (see 0029_bill_corrections.sql), same CRUD
 * shape as DiscountReasonService. */
@Injectable()
export class CorrectionReasonService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateCorrectionReasonDto): Promise<CorrectionReasonResponseDto> {
    const rows = await this.tenantPrisma.query<CorrectionReasonRow>(
      `INSERT INTO correction_reasons (name, code, gl_account_code)
       VALUES ($1, $2, $3)
       RETURNING *`,
      dto.name,
      dto.code,
      dto.glAccountCode ?? null,
    );
    return toCorrectionReasonResponse(rows[0]);
  }

  async findAll(query: CorrectionReasonQueryDto): Promise<{
    data: CorrectionReasonResponseDto[];
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

    const rows = await this.tenantPrisma.query<CorrectionReasonRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM correction_reasons ${where}
       ORDER BY name
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toCorrectionReasonResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateCorrectionReasonDto): Promise<CorrectionReasonResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.code !== undefined) { sets.push(`code = $${idx++}`); params.push(dto.code); }
    if (dto.glAccountCode !== undefined) { sets.push(`gl_account_code = $${idx++}`); params.push(dto.glAccountCode); }
    if (dto.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(dto.isActive); }

    params.push(id);
    const rows = await this.tenantPrisma.query<CorrectionReasonRow>(
      `UPDATE correction_reasons SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Correction reason ${id} not found`);
    return toCorrectionReasonResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE correction_reasons SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Correction reason ${id} not found`);
  }
}
