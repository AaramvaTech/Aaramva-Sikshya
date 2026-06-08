import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicPrismaService } from './public-prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

interface DbPlan {
  id: string;
  name: string;
  monthly_price: string;
  annual_price: string;
  max_students: number;
  max_staff: number;
  features: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PlanService {
  constructor(private readonly publicPrisma: PublicPrismaService) {}

  async create(dto: CreatePlanDto) {
    const rows = await this.publicPrisma.query<DbPlan>(
      `INSERT INTO plans (name, monthly_price, annual_price, max_students, max_staff, features)
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
      `SELECT * FROM plans ORDER BY monthly_price ASC`,
    );
    return rows.map((r) => this.format(r));
  }

  async update(id: string, dto: UpdatePlanDto) {
    const sets: string[] = [];
    const params: unknown[] = [id];

    if (dto.monthlyPrice !== undefined) {
      params.push(dto.monthlyPrice);
      sets.push(`monthly_price = $${params.length}`);
    }
    if (dto.annualPrice !== undefined) {
      params.push(dto.annualPrice);
      sets.push(`annual_price = $${params.length}`);
    }
    if (dto.maxStudents !== undefined) {
      params.push(dto.maxStudents);
      sets.push(`max_students = $${params.length}`);
    }
    if (dto.maxStaff !== undefined) {
      params.push(dto.maxStaff);
      sets.push(`max_staff = $${params.length}`);
    }
    if (dto.features !== undefined) {
      params.push(JSON.stringify(dto.features));
      sets.push(`features = $${params.length}::jsonb`);
    }
    if (dto.isActive !== undefined) {
      params.push(dto.isActive);
      sets.push(`is_active = $${params.length}`);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push(`updated_at = NOW()`);
    const rows = await this.publicPrisma.query<DbPlan>(
      `UPDATE plans SET ${sets.join(', ')} WHERE id = $1::uuid RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Plan ${id} not found`);
    return this.format(rows[0]);
  }

  async deactivate(id: string) {
    const rows = await this.publicPrisma.query<DbPlan>(
      `UPDATE plans SET is_active = false, updated_at = NOW()
       WHERE id = $1::uuid RETURNING *`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Plan ${id} not found`);
    return this.format(rows[0]);
  }

  private async findById(id: string) {
    const rows = await this.publicPrisma.query<DbPlan>(
      `SELECT * FROM plans WHERE id = $1::uuid`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Plan ${id} not found`);
    return this.format(rows[0]);
  }

  private format(r: DbPlan) {
    return {
      id: r.id,
      name: r.name,
      monthlyPrice: parseFloat(r.monthly_price),
      annualPrice: parseFloat(r.annual_price),
      maxStudents: r.max_students,
      maxStaff: r.max_staff,
      features: r.features,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
