import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  ExamTypeRow,
  ExamTypeResponseDto,
  toExamTypeResponse,
  toNum,
} from './entities/examination.entity';
import { CreateExamTypeDto, UpdateExamTypeDto, ExamTypeQueryDto } from './dto/examination.dto';

@Injectable()
export class ExamTypeService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateExamTypeDto): Promise<ExamTypeResponseDto & { totalWeight: number; isComplete: boolean }> {
    const rows = await this.tenantPrisma.query<ExamTypeRow>(
      `INSERT INTO exam_types (name, weight_percent, academic_year_id, grading_scale_id, order_index)
         VALUES ($1, $2, $3::uuid, $4::uuid, $5)
         RETURNING *`,
      dto.name,
      dto.weightPercent,
      dto.academicYearId,
      dto.gradingScaleId ?? null,
      dto.orderIndex,
    );

    const totalWeight = await this._getTotalWeight(dto.academicYearId);
    return { ...toExamTypeResponse(rows[0]), totalWeight, isComplete: Math.abs(totalWeight - 100) < 0.01 };
  }

  async findAll(query: ExamTypeQueryDto): Promise<(ExamTypeResponseDto & { totalWeight: number; isComplete: boolean })[]> {
    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.academicYearId) {
      conditions.push(`academic_year_id = $${idx++}::uuid`);
      params.push(query.academicYearId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await this.tenantPrisma.query<ExamTypeRow>(
      `SELECT * FROM exam_types ${where} ORDER BY order_index ASC`,
      ...params,
    );
    // Compute total weight per academic year for isComplete flag
    const academicYearId = query.academicYearId ?? (rows[0]?.academic_year_id ?? '');
    const totalWeight = academicYearId ? await this._getTotalWeight(academicYearId) : 0;
    return rows.map((r) => ({ ...toExamTypeResponse(r), totalWeight, isComplete: Math.abs(totalWeight - 100) < 0.01 }));
  }

  async update(id: string, dto: UpdateExamTypeDto): Promise<ExamTypeResponseDto & { totalWeight: number; isComplete: boolean }> {
    const existing = await this.tenantPrisma.query<ExamTypeRow>(
      `SELECT * FROM exam_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`ExamType ${id} not found`);

    const e = existing[0];
    const rows = await this.tenantPrisma.query<ExamTypeRow>(
      `UPDATE exam_types SET
         name             = $1,
         weight_percent   = $2,
         grading_scale_id = $3,
         order_index      = $4,
         updated_at       = NOW()
       WHERE id = $5::uuid
       RETURNING *`,
      dto.name ?? e.name,
      dto.weightPercent !== undefined ? dto.weightPercent : toNum(e.weight_percent),
      dto.gradingScaleId !== undefined ? dto.gradingScaleId : e.grading_scale_id,
      dto.orderIndex !== undefined ? dto.orderIndex : e.order_index,
      id,
    );
    const totalWeight = await this._getTotalWeight(rows[0].academic_year_id);
    return { ...toExamTypeResponse(rows[0]), totalWeight, isComplete: Math.abs(totalWeight - 100) < 0.01 };
  }

  async setPublished(
    id: string,
    published: boolean,
  ): Promise<ExamTypeResponseDto & { totalWeight: number; isComplete: boolean }> {
    const existing = await this.tenantPrisma.query<ExamTypeRow>(
      `SELECT id, results_published_at FROM exam_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`ExamType ${id} not found`);

    // NULL = unpublished (hidden from students/parents); NOW() = published.
    const rows = await this.tenantPrisma.query<ExamTypeRow>(
      `UPDATE exam_types
         SET results_published_at = ${published ? 'NOW()' : 'NULL'}, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      id,
    );

    // PUSH-1 (NEW event): fan-out only on the unpublished→published edge —
    // re-publishing must not re-notify. Fire-and-forget.
    if (published && existing[0].results_published_at == null) {
      const { slug } = this.tenantContext.getOrThrow();
      this.eventEmitter.emit('result.published', {
        tenantSlug: slug,
        examTypeId: rows[0].id,
        examTypeName: rows[0].name,
        academicYearId: rows[0].academic_year_id,
      });
    }
    const totalWeight = await this._getTotalWeight(rows[0].academic_year_id);
    return { ...toExamTypeResponse(rows[0]), totalWeight, isComplete: Math.abs(totalWeight - 100) < 0.01 };
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.tenantPrisma.query<ExamTypeRow>(
      `SELECT id FROM exam_types WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`ExamType ${id} not found`);
    await this.tenantPrisma.execute(
      `UPDATE exam_types SET deleted_at = NOW() WHERE id = $1::uuid`,
      id,
    );
  }

  private async _getTotalWeight(academicYearId: string): Promise<number> {
    const rows = await this.tenantPrisma.query<{ total: string }>(
      `SELECT COALESCE(SUM(weight_percent), 0) AS total
         FROM exam_types
         WHERE academic_year_id = $1::uuid AND deleted_at IS NULL`,
      academicYearId,
    );
    return toNum(rows[0]?.total ?? '0');
  }
}
