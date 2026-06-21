import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { Role } from '../common/enums/role.enum';
import { assertSelfOrHrAdmin } from './hr-access.util';
import {
  PayrollMonthRow,
  SalarySlipRow,
  StaffProfileRow,
  toNum,
  toPayrollMonthResponse,
  toSalarySlipResponse,
  PayrollMonthResponseDto,
  SalarySlipResponseDto,
} from './entities/hr.entity';
import {
  OpenPayrollMonthDto,
  GeneratePayrollDto,
  AdjustSlipDto,
  PayrollMonthQueryDto,
} from './dto/payroll.dto';

@Injectable()
export class PayrollService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // ─── Payroll Months ─────────────────────────────────────────────────────────

  async openPayrollMonth(dto: OpenPayrollMonthDto, createdById: string): Promise<PayrollMonthResponseDto> {
    const rows = await this.tenantPrisma.query<PayrollMonthRow>(
      `INSERT INTO payroll_months (month_bs, year_bs, academic_year_id, created_by)
         VALUES ($1, $2, $3::uuid, $4::uuid)
         RETURNING *`,
      dto.monthBs,
      dto.yearBs,
      dto.academicYearId,
      createdById,
    );
    return toPayrollMonthResponse(rows[0]);
  }

  async listPayrollMonths(query: PayrollMonthQueryDto): Promise<{
    data: PayrollMonthResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<PayrollMonthRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
         FROM payroll_months
         ${where}
         ORDER BY year_bs DESC, month_bs DESC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toPayrollMonthResponse), meta: { page, limit, total } };
  }

  // ─── Salary Slips ────────────────────────────────────────────────────────────

  async generatePayroll(monthId: string, dto: GeneratePayrollDto): Promise<SalarySlipResponseDto[]> {
    const months = await this.tenantPrisma.query<PayrollMonthRow>(
      `SELECT * FROM payroll_months WHERE id = $1::uuid`,
      monthId,
    );
    if (!months[0]) throw new NotFoundException(`Payroll month ${monthId} not found`);
    if (months[0].status === 'FINALIZED') {
      throw new BadRequestException('Payroll is finalized');
    }

    const activeStaff = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT id, user_id, base_salary
         FROM staff_profiles
        WHERE end_date IS NULL AND deleted_at IS NULL`,
    );

    const overrideMap = new Map(
      (dto.overrides ?? []).map((o) => [o.userId, o]),
    );

    const slips: SalarySlipResponseDto[] = [];

    for (const staff of activeStaff) {
      // Check for existing slip (idempotency)
      const existing = await this.tenantPrisma.query<SalarySlipRow>(
        `SELECT * FROM salary_slips
           WHERE payroll_month_id = $1::uuid AND user_id = $2::uuid`,
        monthId,
        staff.user_id,
      );
      if (existing[0]) {
        slips.push(toSalarySlipResponse(existing[0]));
        continue;
      }

      const override = overrideMap.get(staff.user_id);
      const baseSalary = override?.customBaseSalary ?? toNum(staff.base_salary);
      const allowances = override?.additionalAllowances ?? [];
      const deductions = override?.additionalDeductions ?? [];
      const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
      const deductionTotal = deductions.reduce((s, d) => s + d.amount, 0);

      const [slip] = await this.tenantPrisma.query<SalarySlipRow>(
        `INSERT INTO salary_slips
           (payroll_month_id, user_id, staff_profile_id,
            base_salary, allowance_total, allowances,
            deduction_total, deductions,
            unpaid_leave_days, leave_deduction)
         VALUES
           ($1::uuid, $2::uuid, $3::uuid,
            $4, $5, $6::jsonb,
            $7, $8::jsonb,
            $9, $10)
         RETURNING *`,
        monthId,
        staff.user_id,
        staff.id,
        baseSalary,
        allowanceTotal,
        JSON.stringify(allowances),
        deductionTotal,
        JSON.stringify(deductions),
        0,
        0,
      );
      slips.push(toSalarySlipResponse(slip));
    }

    return slips;
  }

  async listSlips(monthId: string): Promise<SalarySlipResponseDto[]> {
    const rows = await this.tenantPrisma.query<SalarySlipRow>(
      `SELECT ss.*, u.first_name, u.last_name, sp.employee_id
         FROM salary_slips ss
         JOIN users u ON u.id = ss.user_id
         JOIN staff_profiles sp ON sp.id = ss.staff_profile_id
        WHERE ss.payroll_month_id = $1::uuid
        ORDER BY u.first_name ASC`,
      monthId,
    );
    return rows.map(toSalarySlipResponse);
  }

  async getSlip(slipId: string): Promise<SalarySlipResponseDto> {
    const rows = await this.tenantPrisma.query<SalarySlipRow>(
      `SELECT ss.*, u.first_name, u.last_name, sp.employee_id
         FROM salary_slips ss
         JOIN users u ON u.id = ss.user_id
         JOIN staff_profiles sp ON sp.id = ss.staff_profile_id
        WHERE ss.id = $1::uuid`,
      slipId,
    );
    if (!rows[0]) throw new NotFoundException(`Salary slip ${slipId} not found`);
    return toSalarySlipResponse(rows[0]);
  }

  async adjustSlip(monthId: string, slipId: string, dto: AdjustSlipDto): Promise<SalarySlipResponseDto> {
    const months = await this.tenantPrisma.query<PayrollMonthRow>(
      `SELECT * FROM payroll_months WHERE id = $1::uuid`,
      monthId,
    );
    if (!months[0]) throw new NotFoundException(`Payroll month ${monthId} not found`);
    if (months[0].status === 'FINALIZED') {
      throw new BadRequestException('Payroll is finalized');
    }

    const slips = await this.tenantPrisma.query<SalarySlipRow>(
      `SELECT * FROM salary_slips WHERE id = $1::uuid AND payroll_month_id = $2::uuid`,
      slipId,
      monthId,
    );
    if (!slips[0]) throw new NotFoundException(`Salary slip ${slipId} not found`);

    const existing = slips[0];
    const allowances = dto.allowances ?? (existing.allowances as { name: string; amount: number }[]);
    const deductions = dto.deductions ?? (existing.deductions as { name: string; amount: number }[]);
    const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
    const deductionTotal = deductions.reduce((s, d) => s + d.amount, 0);
    const unpaidLeaveDays = dto.unpaidLeaveDays ?? existing.unpaid_leave_days;
    const leaveDeduction = (toNum(existing.base_salary) / 30) * unpaidLeaveDays;

    const updated = await this.tenantPrisma.query<SalarySlipRow>(
      `UPDATE salary_slips
          SET allowances = $1::jsonb, allowance_total = $2,
              deductions = $3::jsonb, deduction_total = $4,
              unpaid_leave_days = $5, leave_deduction = $6,
              notes = COALESCE($7, notes),
              updated_at = NOW()
        WHERE id = $8::uuid
        RETURNING *`,
      JSON.stringify(allowances),
      allowanceTotal,
      JSON.stringify(deductions),
      deductionTotal,
      unpaidLeaveDays,
      leaveDeduction,
      dto.notes ?? null,
      slipId,
    );
    return toSalarySlipResponse(updated[0]);
  }

  async finalizePayroll(monthId: string): Promise<PayrollMonthResponseDto> {
    const months = await this.tenantPrisma.query<PayrollMonthRow>(
      `SELECT * FROM payroll_months WHERE id = $1::uuid`,
      monthId,
    );
    if (!months[0]) throw new NotFoundException(`Payroll month ${monthId} not found`);
    if (months[0].status === 'FINALIZED') {
      throw new BadRequestException('Payroll is already finalized');
    }

    await this.tenantPrisma.execute(
      `UPDATE payroll_months
          SET status = 'FINALIZED', finalized_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid`,
      monthId,
    );

    const updated = await this.tenantPrisma.query<PayrollMonthRow>(
      `SELECT * FROM payroll_months WHERE id = $1::uuid`,
      monthId,
    );
    return toPayrollMonthResponse(updated[0]);
  }

  async deletePayrollMonth(monthId: string): Promise<void> {
    const months = await this.tenantPrisma.query<PayrollMonthRow>(
      `SELECT * FROM payroll_months WHERE id = $1::uuid`,
      monthId,
    );
    if (!months[0]) throw new NotFoundException(`Payroll month ${monthId} not found`);
    if (months[0].status === 'FINALIZED') {
      throw new BadRequestException('Cannot delete a finalized payroll month');
    }
    await this.tenantPrisma.execute(
      `DELETE FROM salary_slips WHERE payroll_month_id = $1::uuid`,
      monthId,
    );
    await this.tenantPrisma.execute(
      `DELETE FROM payroll_months WHERE id = $1::uuid`,
      monthId,
    );
  }

  async getStaffSalaryHistory(
    userId: string,
    callerId?: string,
    callerRole?: Role,
  ): Promise<SalarySlipResponseDto[]> {
    // BUG-2: HR confidentiality — only the staff member themselves, or an
    // admin/principal, may read salary history. Peers (incl. teachers) rejected.
    assertSelfOrHrAdmin(userId, callerId, callerRole);

    const rows = await this.tenantPrisma.query<SalarySlipRow>(
      `SELECT ss.*, u.first_name, u.last_name, sp.employee_id
         FROM salary_slips ss
         JOIN users u ON u.id = ss.user_id
         JOIN staff_profiles sp ON sp.id = ss.staff_profile_id
         JOIN payroll_months pm ON pm.id = ss.payroll_month_id
        WHERE ss.user_id = $1::uuid
        ORDER BY pm.year_bs DESC, pm.month_bs DESC`,
      userId,
    );
    return rows.map(toSalarySlipResponse);
  }
}
