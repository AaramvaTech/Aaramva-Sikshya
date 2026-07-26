import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { bsToAd } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { FeePreviewService } from './fee-preview.service';
import { formatLocalDate, todayAdInNepal } from '../common/utils/date.util';
import { buildBillRunIdempotencyKey, addDaysToAdString, DEFAULT_DUE_DAYS } from './bill-run.util';
import { CreateBillRunDto, BillRunScope, BillRunQueryDto, BillRunLineQueryDto } from './dto/bill-run.dto';
import {
  BillRunRow, BillRunLineRow, BillRunResponseDto, BillRunSummaryResponseDto, BillRunDetailResponseDto,
  toBillRunResponse, toBillRunLineResponse,
} from './entities/bill-run.entity';

interface LineOutcome {
  outcome: string;
  skipReason: string | null;
  gross: number;
  concession: number;
  net: number;
}

@Injectable()
export class BillRunService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly feePreviewService: FeePreviewService,
  ) {}

  /**
   * BILL-4-SPEC.md §3 "Generate draft". Synchronous (no background job —
   * the spec only requires one for *posting*, a whole-school post being
   * "thousands of invoices on 1 vCPU"; a draft's per-student work is a
   * handful of SELECTs, not a write-heavy chunked job). Creates bill_runs +
   * bill_run_lines ONLY — zero bill_invoices, zero ledger entries, per
   * Checkpoint A's explicit scope.
   */
  async generateDraft(dto: CreateBillRunDto, createdById: string): Promise<BillRunSummaryResponseDto> {
    if (dto.scope === BillRunScope.CLASS && !dto.classId) {
      throw new BadRequestException('classId is required when scope is CLASS');
    }

    const { slug } = this.tenantContext.getOrThrow();

    const yearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);

    if (dto.scope === BillRunScope.CLASS) {
      const classRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.classId,
      );
      if (!classRows[0]) throw new NotFoundException(`Class ${dto.classId} not found`);
    }

    const issueDate = dto.issueDate ?? todayAdInNepal();
    const dueDate = dto.dueDate ?? addDaysToAdString(issueDate, DEFAULT_DUE_DAYS);
    const idempotencyKey = buildBillRunIdempotencyKey(slug, dto.academicYearId, dto.bsMonth, dto.scope, dto.classId);

    const existing = await this.tenantPrisma.query<{ id: string; status: string }>(
      `SELECT id, status FROM bill_runs WHERE idempotency_key = $1 AND deleted_at IS NULL`,
      idempotencyKey,
    );
    if (existing[0]) {
      throw new ConflictException(
        `A bill run already exists for this period and scope (id=${existing[0].id}, status=${existing[0].status})`,
      );
    }

    const studentIds = await this.resolveRoster(dto.scope, dto.classId);

    let runRow: BillRunRow;
    try {
      const rows = await this.tenantPrisma.query<BillRunRow>(
        `INSERT INTO bill_runs
           (academic_year_id, bs_year, bs_month, scope, class_id, status,
            issue_date, due_date, total_students, idempotency_key, created_by)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, 'DRAFT',
                 $6::date, $7::date, $8, $9, $10::uuid)
         RETURNING *`,
        dto.academicYearId, dto.bsYear, dto.bsMonth, dto.scope, dto.classId ?? null,
        issueDate, dueDate, studentIds.length, idempotencyKey, createdById,
      );
      runRow = rows[0];
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (msg.includes('23505') || msg.includes('unique constraint')) {
        throw new ConflictException('A bill run already exists for this period and scope');
      }
      throw err;
    }

    // The date used to resolve which fee-structure assignment/override/
    // concession/transport is active for this billing period — first day
    // of the target BS month. bsToAd() returns a locally-constructed Date
    // (FIX-2), so formatLocalDate (not toISOString) is required here.
    const asOfDate = formatLocalDate(bsToAd({ year: dto.bsYear, month: dto.bsMonth, day: 1 }));

    const outcomeCounts: Record<string, number> = {};
    for (const studentId of studentIds) {
      const line = await this.resolveLine(studentId, dto.academicYearId, dto.bsYear, dto.bsMonth, asOfDate);
      await this.tenantPrisma.execute(
        `INSERT INTO bill_run_lines
           (bill_run_id, student_id, outcome, skip_reason, gross, concession, tax, net)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)`,
        runRow.id, studentId, line.outcome, line.skipReason,
        line.gross, line.concession, 0, line.net,
      );
      outcomeCounts[line.outcome] = (outcomeCounts[line.outcome] ?? 0) + 1;
    }

    // R1: "aggregation happens in SQL" — SUM() across (potentially
    // thousands of) bill_run_lines rows, not a JS accumulator.
    const [updatedRun] = await this.tenantPrisma.query<BillRunRow>(
      `UPDATE bill_runs br SET
         total_gross = agg.gross, total_concession = agg.concession,
         total_tax = agg.tax, total_net = agg.net, updated_at = NOW()
       FROM (
         SELECT COALESCE(SUM(gross),0) AS gross, COALESCE(SUM(concession),0) AS concession,
                COALESCE(SUM(tax),0) AS tax, COALESCE(SUM(net),0) AS net
         FROM bill_run_lines WHERE bill_run_id = $1::uuid AND outcome = 'DRAFT'
       ) agg
       WHERE br.id = $1::uuid
       RETURNING br.*`,
      runRow.id,
    );

    return { ...toBillRunResponse(updatedRun), outcomeSummary: outcomeCounts };
  }

  async findAll(query: BillRunQueryDto): Promise<{ data: BillRunResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.academicYearId) { conditions.push(`academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.bsYear) { conditions.push(`bs_year = $${idx++}`); params.push(query.bsYear); }
    if (query.bsMonth) { conditions.push(`bs_month = $${idx++}`); params.push(query.bsMonth); }
    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillRunRow>(
      `SELECT *, COUNT(*) OVER() AS total_count FROM bill_runs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toBillRunResponse), meta: { page, limit, total } };
  }

  async findOne(id: string, lineQuery: BillRunLineQueryDto = {}): Promise<BillRunDetailResponseDto> {
    const runRows = await this.tenantPrisma.query<BillRunRow>(
      `SELECT * FROM bill_runs WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!runRows[0]) throw new NotFoundException(`Bill run ${id} not found`);

    const summaryRows = await this.tenantPrisma.query<{ outcome: string; count: string }>(
      `SELECT outcome, COUNT(*) AS count FROM bill_run_lines WHERE bill_run_id = $1::uuid GROUP BY outcome`,
      id,
    );
    const outcomeSummary: Record<string, number> = {};
    for (const row of summaryRows) outcomeSummary[row.outcome] = parseInt(row.count, 10);

    const page = lineQuery.page ?? 1;
    const limit = lineQuery.limit ?? 20;
    const offset = (page - 1) * limit;
    const conditions = ['brl.bill_run_id = $1::uuid'];
    const params: unknown[] = [id];
    let idx = 2;
    if (lineQuery.outcome) { conditions.push(`brl.outcome = $${idx++}`); params.push(lineQuery.outcome); }
    params.push(limit, offset);

    const lineRows = await this.tenantPrisma.query<BillRunLineRow>(
      `SELECT brl.*, s.first_name || ' ' || s.last_name AS student_name, s.student_id AS admission_number
       FROM bill_run_lines brl
       JOIN students s ON s.id = brl.student_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.student_id
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    return {
      ...toBillRunResponse(runRows[0]),
      lines: lineRows.map(toBillRunLineResponse),
      outcomeSummary,
    };
  }

  private async resolveRoster(scope: BillRunScope, classId?: string): Promise<string[]> {
    if (scope === BillRunScope.CLASS) {
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE class_id = $1::uuid AND deleted_at IS NULL AND status = 'ACTIVE' ORDER BY student_id`,
        classId,
      );
      return rows.map((r) => r.id);
    }
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE deleted_at IS NULL AND status = 'ACTIVE' ORDER BY student_id`,
    );
    return rows.map((r) => r.id);
  }

  private async resolveLine(
    studentId: string,
    academicYearId: string,
    bsYear: number,
    bsMonth: number,
    asOfDate: string,
  ): Promise<LineOutcome> {
    const already = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM bill_invoices
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
         AND bs_year = $3 AND bs_month = $4 AND deleted_at IS NULL`,
      studentId, academicYearId, bsYear, bsMonth,
    );
    if (already[0]) {
      return {
        outcome: 'SKIPPED_ALREADY_BILLED',
        skipReason: `Already billed (invoice ${already[0].id})`,
        gross: 0, concession: 0, net: 0,
      };
    }

    try {
      const preview = await this.feePreviewService.preview(studentId, { academicYearId, asOfDate });
      return { outcome: 'DRAFT', skipReason: null, gross: preview.grossTotal, concession: preview.concessionTotal, net: preview.netTotal };
    } catch (err) {
      if (err instanceof NotFoundException) {
        return { outcome: 'SKIPPED_NO_ASSIGNMENT', skipReason: err.message, gross: 0, concession: 0, net: 0 };
      }
      return { outcome: 'FAILED', skipReason: (err as Error).message, gross: 0, concession: 0, net: 0 };
    }
  }
}
