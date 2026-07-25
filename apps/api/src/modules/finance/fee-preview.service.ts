import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { todayAdInNepal } from '../common/utils/date.util';
import { StudentFeeStructureAssignmentService } from './student-fee-structure-assignment.service';
import { StudentFeeOverrideService } from './student-fee-override.service';
import { StudentConcessionService } from './student-concession.service';
import { StudentTransportAssignmentService } from './student-transport-assignment.service';
import { StudentConcessionRow } from './entities/bill-assignment.entity';
import { FeePreviewQueryDto } from './dto/fee-preview.dto';
import { Role } from '../common/enums/role.enum';

export interface FeePreviewConcessionLine {
  concessionId: string;
  discountReasonId: string;
  type: string;
  amount: number;
}

export interface FeePreviewHeadLine {
  feeHeadId: string;
  feeHeadName: string;
  grossAmount: number;
  overrideAmount: number | null;
  effectiveBase: number;
  concessions: FeePreviewConcessionLine[];
  netAmount: number;
}

export interface FeePreviewResponseDto {
  studentId: string;
  feeStructureId: string;
  feeStructureName: string;
  academicYearId: string;
  asOfDate: string;
  heads: FeePreviewHeadLine[];
  transport: { transportRouteId: string; transportRouteName: string; amount: number } | null;
  wholeBillConcessions: FeePreviewConcessionLine[];
  grossTotal: number;
  concessionTotal: number;
  netTotal: number;
}

/** Applies a concession's type+cap to a base amount. cap_amount, if set, bounds the result either way. */
function resolveConcessionAmount(base: Money, concession: StudentConcessionRow): Money {
  const raw = concession.type === 'PERCENT'
    ? base.percentOf(toMoney(concession.value).toNumber())
    : toMoney(concession.value);
  if (concession.cap_amount == null) return raw;
  const cap = toMoney(concession.cap_amount);
  return raw.compare(cap) > 0 ? cap : raw;
}

function clampNonNegative(amount: Money): Money {
  return amount.compare(Money.zero()) < 0 ? Money.zero() : amount;
}

/**
 * Spec §6: "resolves structure + overrides + concessions + transport into
 * what the student would be charged for a given period, without creating
 * anything." Resolution order per fee head: override REPLACES the structure
 * amount (R2's gross/concession split — an override is a different gross,
 * not a discount); head-scoped concessions then apply to that result, cap
 * respected; whole-bill concessions (fee_head_id NULL) then apply against
 * the sum of every head's net-of-head-concession amount plus transport,
 * since transport isn't itself a fee head and "applies to whole bill" reads
 * as the literal total, not just the structure's heads.
 *
 * Deliberately excludes tax: R4/R5's tax-after-concession snapshot behavior
 * belongs to invoice posting, and tax_rates ships empty (R6) — nothing here
 * mirrors the ledger/billing-run phase this table set doesn't build yet.
 * This endpoint's own spec text lists exactly "structure + overrides +
 * concessions + transport", not tax.
 */
@Injectable()
export class FeePreviewService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly assignmentService: StudentFeeStructureAssignmentService,
    private readonly overrideService: StudentFeeOverrideService,
    private readonly concessionService: StudentConcessionService,
    private readonly transportService: StudentTransportAssignmentService,
  ) {}

  async preview(
    studentId: string,
    query: FeePreviewQueryDto,
    callerId?: string,
    callerRole?: Role,
  ): Promise<FeePreviewResponseDto> {
    if (callerRole === Role.PARENT && callerId) {
      await this.assertGuardianOwnsStudent(studentId, callerId);
    }

    const asOfDate = query.asOfDate ?? todayAdInNepal();

    const assignment = await this.assignmentService.findActiveAssignment(
      studentId,
      query.academicYearId,
      asOfDate,
    );
    if (!assignment) {
      throw new NotFoundException(
        `No active fee structure assignment for this student in the given academic year`,
      );
    }

    const structureRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM bill_fee_structures WHERE id = $1::uuid`,
      assignment.fee_structure_id,
    );

    const items = await this.tenantPrisma.query<{
      fee_head_id: string;
      fee_head_name: string;
      amount: string | number;
    }>(
      `SELECT bfsi.fee_head_id, fh.name AS fee_head_name, bfsi.amount
       FROM bill_fee_structure_items bfsi
       JOIN fee_heads fh ON fh.id = bfsi.fee_head_id
       WHERE bfsi.fee_structure_id = $1::uuid
         AND bfsi.effective_from <= $2::date
         AND (bfsi.effective_to IS NULL OR bfsi.effective_to >= $2::date)
       ORDER BY bfsi.created_at`,
      assignment.fee_structure_id,
      asOfDate,
    );

    const overrides = await this.overrideService.findActiveForStudent(studentId, query.academicYearId, asOfDate);
    const overrideByHead = new Map(overrides.map((o) => [o.fee_head_id, o]));

    const concessions = await this.concessionService.findActiveForStudent(studentId, query.academicYearId, asOfDate);
    const headConcessions = concessions.filter((c) => c.fee_head_id != null);
    const wholeBillConcessionRows = concessions.filter((c) => c.fee_head_id == null);

    let grossTotal = Money.zero();
    let concessionTotal = Money.zero();
    let headNetSubtotal = Money.zero();

    const heads: FeePreviewHeadLine[] = items.map((item) => {
      const gross = toMoney(item.amount);
      const override = overrideByHead.get(item.fee_head_id);
      const effectiveBase = override ? toMoney(override.override_amount) : gross;

      const applicable = headConcessions.filter((c) => c.fee_head_id === item.fee_head_id);
      let headConcessionTotal = Money.zero();
      const concessionLines: FeePreviewConcessionLine[] = applicable.map((c) => {
        const amount = resolveConcessionAmount(effectiveBase, c);
        headConcessionTotal = headConcessionTotal.add(amount);
        return { concessionId: c.id, discountReasonId: c.discount_reason_id, type: c.type, amount: amount.toNumber() };
      });

      const netAmount = clampNonNegative(effectiveBase.sub(headConcessionTotal));

      grossTotal = grossTotal.add(gross);
      concessionTotal = concessionTotal.add(headConcessionTotal);
      headNetSubtotal = headNetSubtotal.add(netAmount);

      return {
        feeHeadId: item.fee_head_id,
        feeHeadName: item.fee_head_name,
        grossAmount: gross.toNumber(),
        overrideAmount: override ? effectiveBase.toNumber() : null,
        effectiveBase: effectiveBase.toNumber(),
        concessions: concessionLines,
        netAmount: netAmount.toNumber(),
      };
    });

    let transport: FeePreviewResponseDto['transport'] = null;
    let transportAmount = Money.zero();
    const transportAssignment = await this.transportService.findActiveForStudent(studentId, asOfDate);
    if (transportAssignment) {
      const routeRows = await this.tenantPrisma.query<{ name: string; monthly_amount: string | number }>(
        `SELECT name, monthly_amount FROM transport_routes WHERE id = $1::uuid`,
        transportAssignment.transport_route_id,
      );
      if (routeRows[0]) {
        transportAmount = toMoney(routeRows[0].monthly_amount);
        grossTotal = grossTotal.add(transportAmount);
        transport = {
          transportRouteId: transportAssignment.transport_route_id,
          transportRouteName: routeRows[0].name,
          amount: transportAmount.toNumber(),
        };
      }
    }

    const preWholeBillTotal = headNetSubtotal.add(transportAmount);
    let wholeBillConcessionTotal = Money.zero();
    const wholeBillConcessions: FeePreviewConcessionLine[] = wholeBillConcessionRows.map((c) => {
      const amount = resolveConcessionAmount(preWholeBillTotal, c);
      wholeBillConcessionTotal = wholeBillConcessionTotal.add(amount);
      return { concessionId: c.id, discountReasonId: c.discount_reason_id, type: c.type, amount: amount.toNumber() };
    });

    concessionTotal = concessionTotal.add(wholeBillConcessionTotal);
    const netTotal = clampNonNegative(preWholeBillTotal.sub(wholeBillConcessionTotal));

    return {
      studentId,
      feeStructureId: assignment.fee_structure_id,
      feeStructureName: structureRows[0]?.name ?? '',
      academicYearId: query.academicYearId,
      asOfDate,
      heads,
      transport,
      wholeBillConcessions,
      grossTotal: grossTotal.toNumber(),
      concessionTotal: concessionTotal.toNumber(),
      netTotal: netTotal.toNumber(),
    };
  }

  private async assertGuardianOwnsStudent(studentId: string, callerId: string): Promise<void> {
    const children = await this.tenantPrisma.query<{ student_id: string }>(
      `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
      callerId,
    );
    if (!children.some((c) => c.student_id === studentId)) {
      throw new ForbiddenException('Access denied');
    }
  }
}
