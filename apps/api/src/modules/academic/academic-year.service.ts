import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  AcademicYearRow,
  AcademicYearResponseDto,
  toAcademicYearResponse,
  toAdString,
} from './entities/academic.entity';
import {
  CreateAcademicYearDto,
  ListAcademicYearsQueryDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto';

@Injectable()
export class AcademicYearService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateAcademicYearDto): Promise<AcademicYearResponseDto> {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('end date must not be before start date');
    }
    await this.assertNoOverlap(dto.startDate, dto.endDate);

    const rows = await this.tenantPrisma.query<AcademicYearRow>(
      `INSERT INTO academic_years (name, year_bs, start_date, end_date)
       VALUES ($1, $2, $3::date, $4::date)
       RETURNING *`,
      dto.name, dto.yearBs, dto.startDate, dto.endDate,
    );
    return toAcademicYearResponse(rows[0]);
  }

  /**
   * BILL-DATA-1 Phase 3: rejects a date range that overlaps any other live
   * academic year for this tenant — the exact class of bug motherland-school
   * had (two AYs with overlapping AD ranges). excludeId lets update() check
   * a row's new range against every OTHER row without conflicting with itself.
   */
  private async assertNoOverlap(startDate: string, endDate: string, excludeId?: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{ id: string; name: string }>(
      `SELECT id, name FROM academic_years
       WHERE deleted_at IS NULL
         AND start_date <= $2::date AND end_date >= $1::date
         AND ($3::uuid IS NULL OR id != $3::uuid)
       LIMIT 1`,
      startDate, endDate, excludeId ?? null,
    );
    if (rows[0]) {
      throw new ConflictException(
        `Date range overlaps existing academic year "${rows[0].name}"`,
      );
    }
  }

  async findAll(query: ListAcademicYearsQueryDto): Promise<{
    data: AcademicYearResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<AcademicYearRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM academic_years
       WHERE deleted_at IS NULL
       ORDER BY year_bs DESC
       LIMIT $1 OFFSET $2`,
      limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toAcademicYearResponse),
      meta: { page, limit, total },
    };
  }

  async findCurrent(): Promise<AcademicYearResponseDto | null> {
    const rows = await this.tenantPrisma.query<AcademicYearRow>(
      `SELECT * FROM academic_years WHERE is_current = true AND deleted_at IS NULL LIMIT 1`,
    );
    return rows[0] ? toAcademicYearResponse(rows[0]) : null;
  }

  async update(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYearResponseDto> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const current = await this.tenantPrisma.query<{ start_date: Date | string; end_date: Date | string }>(
        `SELECT start_date, end_date FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
        id,
      );
      if (!current[0]) throw new NotFoundException(`Academic year ${id} not found`);

      const newStart = dto.startDate ?? toAdString(current[0].start_date);
      const newEnd = dto.endDate ?? toAdString(current[0].end_date);
      if (newEnd < newStart) {
        throw new BadRequestException('end date must not be before start date');
      }
      await this.assertNoOverlap(newStart, newEnd, id);
    }

    if (dto.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.startDate !== undefined) { setClauses.push(`start_date = $${idx++}::date`); params.push(dto.startDate); }
    if (dto.endDate !== undefined) { setClauses.push(`end_date = $${idx++}::date`); params.push(dto.endDate); }

    if (setClauses.length === 0) return this.findOneOrThrow(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const rows = await this.tenantPrisma.query<AcademicYearRow>(
      `UPDATE academic_years SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Academic year ${id} not found`);
    return toAcademicYearResponse(rows[0]);
  }

  async setCurrentYear(id: string): Promise<AcademicYearResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
        id,
      );
      if (!existing[0]) throw new NotFoundException(`Academic year ${id} not found`);

      await tx.$executeRawUnsafe(
        `UPDATE academic_years SET is_current = false, updated_at = NOW() WHERE deleted_at IS NULL`,
      );

      const rows = await tx.$queryRawUnsafe<AcademicYearRow[]>(
        `UPDATE academic_years SET is_current = true, updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING *`,
        id,
      );
      return toAcademicYearResponse(rows[0]);
    });
  }

  async remove(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE academic_years SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (affected === 0) throw new NotFoundException(`Academic year ${id} not found`);
  }

  private async findOneOrThrow(id: string): Promise<AcademicYearResponseDto> {
    const rows = await this.tenantPrisma.query<AcademicYearRow>(
      `SELECT * FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Academic year ${id} not found`);
    return toAcademicYearResponse(rows[0]);
  }
}
