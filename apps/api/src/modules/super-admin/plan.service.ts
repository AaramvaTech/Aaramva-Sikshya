import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicPrismaService } from './public-prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

interface DbPlan {
  id: string;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  maxStudents: number;
  maxStaff: number;
  features: unknown;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class PlanService {
  constructor(private readonly publicPrisma: PublicPrismaService) {}

  async create(dto: CreatePlanDto) {
    const rows = await this.publicPrisma.query<DbPlan>(
      `INSERT INTO plans (name, "monthlyPrice", "annualPrice", "maxStudents", "maxStaff", features)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      dto.name,
      dto.monthlyPrice,
      dto.annualPrice,
      dto.maxStudents,
      dto.maxStaff,
      JSON.stringify(dto.features),
    );
    return this.format(rows[0]);
  }

  async list() {
    const rows = await this.publicPrisma.query<DbPlan>(
      `SELECT * FROM plans ORDER BY "monthlyPrice" ASC`,
    );
    return rows.map((r) => this.format(r));
  }

  async update(id: string, dto: UpdatePlanDto) {
    const sets: string[] = [];
    const params: unknown[] = [id];

    if (dto.monthlyPrice !== undefined) {
      params.push(dto.monthlyPrice);
      sets.push(`"monthlyPrice" = $${params.length}`);
    }
    if (dto.annualPrice !== undefined) {
      params.push(dto.annualPrice);
      sets.push(`"annualPrice" = $${params.length}`);
    }
    if (dto.maxStudents !== undefined) {
      params.push(dto.maxStudents);
      sets.push(`"maxStudents" = $${params.length}`);
    }
    if (dto.maxStaff !== undefined) {
      params.push(dto.maxStaff);
      sets.push(`"maxStaff" = $${params.length}`);
    }
    if (dto.features !== undefined) {
      params.push(JSON.stringify(dto.features));
      sets.push(`features = $${params.length}::jsonb`);
    }
    if (dto.isActive !== undefined) {
      params.push(dto.isActive);
      sets.push(`"isActive" = $${params.length}`);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    const rows = await this.publicPrisma.query<DbPlan>(
      `UPDATE plans SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Plan ${id} not found`);
    return this.format(rows[0]);
  }

  async deactivate(id: string) {
    const rows = await this.publicPrisma.query<DbPlan>(
      `UPDATE plans SET "isActive" = false WHERE id = $1 RETURNING *`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Plan ${id} not found`);
    return this.format(rows[0]);
  }

  private async findById(id: string) {
    const rows = await this.publicPrisma.query<DbPlan>(
      `SELECT * FROM plans WHERE id = $1`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Plan ${id} not found`);
    return this.format(rows[0]);
  }

  private format(r: DbPlan) {
    return {
      id: r.id,
      name: r.name,
      monthlyPrice: parseFloat(r.monthlyPrice),
      annualPrice: parseFloat(r.annualPrice),
      maxStudents: r.maxStudents,
      maxStaff: r.maxStaff,
      features: r.features,
      isActive: r.isActive,
      createdAt: r.createdAt,
    };
  }
}
