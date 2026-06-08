import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  GradingScaleRow,
  GradeThresholdRow,
  GradingScaleResponseDto,
  toGradingScaleResponse,
} from './entities/examination.entity';
import { CreateGradingScaleDto } from './dto/examination.dto';

@Injectable()
export class GradingScaleService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createScale(dto: CreateGradingScaleDto): Promise<GradingScaleResponseDto> {
    if (!dto.thresholds.length) {
      throw new BadRequestException('At least one threshold is required');
    }

    return this.tenantPrisma.run(async (tx) => {
      const scaleRows = await tx.$queryRawUnsafe<GradingScaleRow[]>(
        `INSERT INTO grading_scales (name) VALUES ($1) RETURNING *`,
        dto.name,
      );
      const scale = scaleRows[0];

      const thresholds: GradeThresholdRow[] = [];
      for (const t of dto.thresholds) {
        const rows = await tx.$queryRawUnsafe<GradeThresholdRow[]>(
          `INSERT INTO grade_thresholds
             (grading_scale_id, grade, gpa_point, min_percent, max_percent, remarks)
           VALUES ($1::uuid, $2, $3, $4, $5, $6)
           RETURNING *`,
          scale.id,
          t.grade,
          t.gpaPoint ?? null,
          t.minPercent,
          t.maxPercent,
          t.remarks ?? null,
        );
        thresholds.push(rows[0]);
      }

      return toGradingScaleResponse(scale, thresholds);
    });
  }

  async findAll(): Promise<GradingScaleResponseDto[]> {
    const rows = await this.tenantPrisma.query<GradingScaleRow>(
      `SELECT * FROM grading_scales WHERE deleted_at IS NULL ORDER BY name ASC`,
    );
    return rows.map((r) => toGradingScaleResponse(r));
  }

  async findOne(id: string): Promise<GradingScaleResponseDto> {
    const rows = await this.tenantPrisma.query<GradingScaleRow>(
      `SELECT * FROM grading_scales WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`GradingScale ${id} not found`);

    const thresholds = await this.tenantPrisma.query<GradeThresholdRow>(
      `SELECT * FROM grade_thresholds WHERE grading_scale_id = $1::uuid ORDER BY min_percent DESC`,
      id,
    );
    return toGradingScaleResponse(rows[0], thresholds);
  }

  async setDefault(id: string): Promise<GradingScaleResponseDto> {
    const rows = await this.tenantPrisma.query<GradingScaleRow>(
      `SELECT * FROM grading_scales WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`GradingScale ${id} not found`);

    await this.tenantPrisma.execute(
      `UPDATE grading_scales SET is_default = false WHERE deleted_at IS NULL`,
    );
    const updated = await this.tenantPrisma.query<GradingScaleRow>(
      `UPDATE grading_scales SET is_default = true WHERE id = $1::uuid RETURNING *`,
      id,
    );
    return toGradingScaleResponse(updated[0]);
  }

  async calculateGrade(
    percentage: number,
    scaleId: string,
  ): Promise<{ grade: string; gpaPoint: number | null; remarks: string | null }> {
    const thresholds = await this.tenantPrisma.query<GradeThresholdRow>(
      `SELECT * FROM grade_thresholds
       WHERE grading_scale_id = $1::uuid
       ORDER BY min_percent DESC`,
      scaleId,
    );
    return this.findGrade(percentage, thresholds);
  }

  findGrade(
    percentage: number,
    thresholds: GradeThresholdRow[],
  ): { grade: string; gpaPoint: number | null; remarks: string | null } {
    const t = thresholds.find(
      (th) =>
        percentage >= parseFloat(th.min_percent) &&
        percentage <= parseFloat(th.max_percent),
    );
    if (t) {
      return {
        grade: t.grade,
        gpaPoint: t.gpa_point ? parseFloat(t.gpa_point) : null,
        remarks: t.remarks ?? null,
      };
    }
    return { grade: 'NG', gpaPoint: null, remarks: null };
  }
}
