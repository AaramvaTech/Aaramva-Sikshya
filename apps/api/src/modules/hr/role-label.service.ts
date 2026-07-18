import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { RoleLabelRow, RoleLabelResponseDto } from './entities/hr.entity';
import { Role } from '../common/enums/role.enum';

export const EDITABLE_ROLES: Role[] = [
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
  Role.LIBRARIAN,
  Role.TEACHER,
];

function defaultLabelFor(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

@Injectable()
export class RoleLabelService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async findAll(): Promise<RoleLabelResponseDto[]> {
    const rows = await this.tenantPrisma.query<RoleLabelRow>(`SELECT * FROM role_labels`);
    const overrides = new Map(rows.map((r) => [r.role, r.label]));

    return EDITABLE_ROLES.map((role) => ({
      role,
      label: overrides.get(role) ?? defaultLabelFor(role),
      isOverridden: overrides.has(role),
    }));
  }

  async upsert(role: string, label: string): Promise<RoleLabelResponseDto> {
    if (!EDITABLE_ROLES.includes(role as Role)) {
      throw new BadRequestException(`Role ${role} is not editable`);
    }
    await this.tenantPrisma.execute(
      `INSERT INTO role_labels (role, label) VALUES ($1, $2)
         ON CONFLICT (role) DO UPDATE SET label = $2, updated_at = NOW()`,
      role,
      label,
    );
    return { role, label, isOverridden: true };
  }

  async reset(role: string): Promise<RoleLabelResponseDto> {
    if (!EDITABLE_ROLES.includes(role as Role)) {
      throw new BadRequestException(`Role ${role} is not editable`);
    }
    await this.tenantPrisma.execute(`DELETE FROM role_labels WHERE role = $1`, role);
    return { role, label: defaultLabelFor(role), isOverridden: false };
  }
}
