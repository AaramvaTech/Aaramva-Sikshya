import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { Money } from '../../common/money/money';
import { toMoney } from './entities/finance.entity';
import { todayAdInNepal } from '../common/utils/date.util';
import { bsOf, directionToDebitCredit } from './ledger.util';
import { LedgerEntryRow, toLedgerEntryResponse, LedgerEntryResponseDto } from './entities/ledger.entity';
import { LedgerAdjustmentDto, LedgerQueryDto } from './dto/ledger.dto';
import { Role } from '../common/enums/role.enum';

/** Distinct from tenant-migration's advisory-lock namespace (4271) — advisory
 * locks are instance-global, not schema-scoped, so a separate constant keeps
 * the two lock domains from ever theoretically colliding. */
const LEDGER_LOCK_NAMESPACE = 5301;

interface PostEntryParams {
  studentId: string;
  academicYearId: string;
  entryType: string;
  debit: string;
  credit: string;
  narration?: string | null;
  refDocType?: string | null;
  refDocId?: string | null;
  reversesEntryId?: string | null;
  entryDate?: string;
  createdById: string;
}

/**
 * BILL-3 §7 — the ledger core. Every write goes through `withStudentLock` so
 * two cashiers posting for the same student serialize (spec's Concurrency
 * requirement) — `pg_advisory_xact_lock` auto-releases at commit/rollback,
 * so no explicit unlock is needed. `insertEntry` never runs outside a lock.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Public so other services (e.g. BillRunPostRunnerService) can compose a
   * BIGGER caller-owned transaction under the same per-student lock, rather
   * than calling a LedgerService method that opens its own separate
   * top-level transaction (which would NOT participate in the caller's own
   * transaction/rollback). Mirrors the recordPaymentInTx extraction
   * precedent (PAY-1): shared write logic, composed into a bigger
   * transaction by a different caller.
   */
  async withStudentLock<T>(studentId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.tenantPrisma.run(async (tx) => {
      // Namespace inlined as a literal, not bound as a parameter — mirrors
      // tenant-migration.service.ts's own advisory-lock call. A bound JS
      // number defaults to bigint over this driver, and Postgres has no
      // pg_advisory_xact_lock(bigint, integer) overload (only (bigint) or
      // (int, int)); found live while proofing this exact call.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}, hashtext($1))`,
        studentId,
      );
      return fn(tx);
    });
  }

  private async insertEntry(tx: TenantTx, params: PostEntryParams): Promise<LedgerEntryRow> {
    const entryDate = params.entryDate ?? todayAdInNepal();
    const bs = bsOf(entryDate);
    const [row] = await tx.$queryRawUnsafe<LedgerEntryRow[]>(
      `INSERT INTO student_ledger_entries
         (student_id, academic_year_id, entry_date, entry_bs_year, entry_bs_month, entry_bs_day,
          entry_type, debit, credit, ref_doc_type, ref_doc_id, narration, reverses_entry_id, created_by)
       VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8::numeric, $9::numeric,
               $10, $11::uuid, $12, $13::uuid, $14::uuid)
       RETURNING *`,
      params.studentId,
      params.academicYearId,
      entryDate,
      bs.year,
      bs.month,
      bs.day,
      params.entryType,
      params.debit,
      params.credit,
      params.refDocType ?? null,
      params.refDocId ?? null,
      params.narration ?? null,
      params.reversesEntryId ?? null,
      params.createdById,
    );
    return row;
  }

  private async bumpBalance(
    tx: TenantTx,
    studentId: string,
    academicYearId: string,
    delta: Money,
    lastEntryId: string,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO student_account_balances (student_id, academic_year_id, balance, last_entry_id, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4::uuid, NOW())
       ON CONFLICT (student_id) DO UPDATE SET
         academic_year_id = EXCLUDED.academic_year_id,
         balance = student_account_balances.balance + $3::numeric,
         last_entry_id = EXCLUDED.last_entry_id,
         updated_at = NOW()`,
      studentId,
      academicYearId,
      delta.toDb(),
      lastEntryId,
    );
  }

  /**
   * Participates in an ALREADY-OPEN, ALREADY-LOCKED transaction — for
   * callers that need the entry insert to be one atomic unit with OTHER
   * writes (e.g. BillRunPostRunnerService's bill_invoice insert), not a
   * second, separate top-level transaction. Does NOT acquire the advisory
   * lock itself — the caller must already hold it (via withStudentLock).
   */
  async postEntryInTx(tx: TenantTx, params: PostEntryParams): Promise<LedgerEntryResponseDto> {
    const entry = await this.insertEntry(tx, params);
    const delta = toMoney(params.debit).sub(toMoney(params.credit));
    await this.bumpBalance(tx, params.studentId, params.academicYearId, delta, entry.id);
    return toLedgerEntryResponse(entry);
  }

  /** Generic posting path — used directly by callers that already know their entry_type. */
  async postEntry(params: PostEntryParams): Promise<LedgerEntryResponseDto> {
    return this.withStudentLock(params.studentId, (tx) => this.postEntryInTx(tx, params));
  }

  /** One row of an opening-balance import. Guards against double-import under the same lock that posts it. */
  async openingBalance(
    studentId: string,
    academicYearId: string,
    amount: string,
    direction: 'DEBIT' | 'CREDIT',
    narration: string | undefined,
    createdById: string,
  ): Promise<LedgerEntryResponseDto> {
    return this.withStudentLock(studentId, async (tx) => {
      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM student_ledger_entries
         WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND entry_type = 'OPENING_BALANCE'`,
        studentId,
        academicYearId,
      );
      if (existing.length > 0) {
        throw new ConflictException(`Student ${studentId} already has an opening balance for this academic year`);
      }
      const { debit, credit } = directionToDebitCredit(amount, direction);
      const entry = await this.insertEntry(tx, {
        studentId, academicYearId, entryType: 'OPENING_BALANCE', debit, credit,
        narration: narration ?? 'Opening balance import', createdById,
      });
      const delta = toMoney(debit).sub(toMoney(credit));
      await this.bumpBalance(tx, studentId, academicYearId, delta, entry.id);
      return toLedgerEntryResponse(entry);
    });
  }

  /** OWNER_ONLY. Reason and narration are both required by spec but the table has one text column — stored as "[reason] narration". */
  async adjustment(dto: LedgerAdjustmentDto, createdById: string): Promise<LedgerEntryResponseDto> {
    return this.withStudentLock(dto.studentId, async (tx) => {
      const { debit, credit } = directionToDebitCredit(dto.amount, dto.direction);
      const narration = `[${dto.reason}] ${dto.narration}`;
      const entry = await this.insertEntry(tx, {
        studentId: dto.studentId, academicYearId: dto.academicYearId,
        entryType: 'ADJUSTMENT', debit, credit, narration, createdById,
      });
      const delta = toMoney(debit).sub(toMoney(credit));
      await this.bumpBalance(tx, dto.studentId, dto.academicYearId, delta, entry.id);
      return toLedgerEntryResponse(entry);
    });
  }

  /**
   * Participates in an ALREADY-OPEN, ALREADY-LOCKED transaction — mirrors
   * postEntryInTx's relationship to postEntry. Used by BillPaymentService's
   * void and CLEARED->BOUNCED paths (B5-11) to compose the reversal into
   * the SAME transaction as the bill_payments status flip, rather than
   * reverse()'s own separate top-level transaction. Does NOT acquire the
   * advisory lock itself, and does NOT re-fetch the original entry — the
   * caller supplies it (already fetched via their own tx), so this stays a
   * pure "given this row, mirror it" operation with exactly one guard query
   * (already-reversed) before the insert — deliberately NOT a fresh SELECT
   * of `original` by id, which would add a second tx query here and change
   * reverse()'s own call count below.
   */
  async reverseInTx(tx: TenantTx, original: LedgerEntryRow, createdById: string): Promise<LedgerEntryResponseDto> {
    const alreadyReversed = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM student_ledger_entries WHERE reverses_entry_id = $1::uuid`,
      original.id,
    );
    if (alreadyReversed.length > 0) {
      throw new ConflictException(`Ledger entry ${original.id} has already been reversed`);
    }

    const mirrorDebit = toMoney(original.credit).toDb();
    const mirrorCredit = toMoney(original.debit).toDb();
    const narration = `Reversal of entry ${original.id}${original.narration ? `: ${original.narration}` : ''}`;

    const entry = await this.insertEntry(tx, {
      studentId: original.student_id,
      academicYearId: original.academic_year_id,
      entryType: original.entry_type,
      debit: mirrorDebit,
      credit: mirrorCredit,
      narration,
      reversesEntryId: original.id,
      createdById,
    });
    const delta = toMoney(mirrorDebit).sub(toMoney(mirrorCredit));
    await this.bumpBalance(tx, original.student_id, original.academic_year_id, delta, entry.id);
    return toLedgerEntryResponse(entry);
  }

  /**
   * OWNER_ONLY. Mirrors the original with debit/credit swapped — net effect on
   * the balance is exactly the inverse, leaving it unchanged from before the
   * original entry (invariant 4). Reuses the original's own entry_type (the
   * enum has no dedicated REVERSAL value); `reverses_entry_id` is what marks
   * it as a reversal. The "already reversed" check runs under the same lock
   * as the insert, so two concurrent reverse calls can't both succeed.
   */
  async reverse(entryId: string, createdById: string): Promise<LedgerEntryResponseDto> {
    const originalRows = await this.tenantPrisma.query<LedgerEntryRow>(
      `SELECT * FROM student_ledger_entries WHERE id = $1::uuid`,
      entryId,
    );
    const original = originalRows[0];
    if (!original) throw new NotFoundException(`Ledger entry ${entryId} not found`);

    return this.withStudentLock(original.student_id, (tx) => this.reverseInTx(tx, original, createdById));
  }

  /** Paginated statement, chronological, each row carrying the running balance as of that entry. */
  async getStudentLedger(
    studentId: string,
    query: LedgerQueryDto,
    callerId?: string,
    callerRole?: Role,
  ): Promise<{ data: LedgerEntryResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    if (callerRole === Role.PARENT && callerId) {
      await this.assertGuardianOwnsStudent(studentId, callerId);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<LedgerEntryRow & { total_count: string }>(
      `SELECT *,
              SUM(debit - credit) OVER (ORDER BY entry_date, created_at ROWS UNBOUNDED PRECEDING) AS running_balance,
              COUNT(*) OVER() AS total_count
       FROM student_ledger_entries
       WHERE student_id = $1::uuid
       ORDER BY entry_date, created_at
       LIMIT $2 OFFSET $3`,
      studentId,
      limit,
      offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toLedgerEntryResponse), meta: { page, limit, total } };
  }

  /** Single-student reads always recompute the live SQL sum — the cache is for list views only (spec). */
  async getBalance(
    studentId: string,
    callerId?: string,
    callerRole?: Role,
  ): Promise<{ studentId: string; balance: number; sign: 'OWES' | 'ADVANCE' | 'ZERO' }> {
    if (callerRole === Role.PARENT && callerId) {
      await this.assertGuardianOwnsStudent(studentId, callerId);
    }

    const rows = await this.tenantPrisma.query<{ sum: string }>(
      `SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS sum FROM student_ledger_entries WHERE student_id = $1::uuid`,
      studentId,
    );
    const balance = toMoney(rows[0]?.sum ?? 0);
    const cmp = balance.compare(Money.zero());
    return {
      studentId,
      balance: balance.toNumber(),
      sign: cmp === 0 ? 'ZERO' : cmp > 0 ? 'OWES' : 'ADVANCE',
    };
  }

  /** Nightly job's core: recompute every student's balance from the ledger, correct and report drift. */
  async reconcile(): Promise<{ checked: number; drifted: string[] }> {
    const students = await this.tenantPrisma.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM student_ledger_entries`,
    );
    const drifted: string[] = [];

    for (const { student_id: studentId } of students) {
      await this.withStudentLock(studentId, async (tx) => {
        const [{ sum }] = await tx.$queryRawUnsafe<{ sum: string }[]>(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS sum FROM student_ledger_entries WHERE student_id = $1::uuid`,
          studentId,
        );
        const cacheRows = await tx.$queryRawUnsafe<{ balance: string }[]>(
          `SELECT balance FROM student_account_balances WHERE student_id = $1::uuid`,
          studentId,
        );
        const truth = toMoney(sum);
        const cached = cacheRows[0] ? toMoney(cacheRows[0].balance) : Money.zero();
        if (truth.compare(cached) !== 0) {
          drifted.push(studentId);
          const [latest] = await tx.$queryRawUnsafe<{ academic_year_id: string; id: string }[]>(
            `SELECT academic_year_id, id FROM student_ledger_entries
             WHERE student_id = $1::uuid ORDER BY entry_date DESC, created_at DESC LIMIT 1`,
            studentId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO student_account_balances (student_id, academic_year_id, balance, last_entry_id, updated_at)
             VALUES ($1::uuid, $2::uuid, $3::numeric, $4::uuid, NOW())
             ON CONFLICT (student_id) DO UPDATE SET
               academic_year_id = EXCLUDED.academic_year_id, balance = EXCLUDED.balance,
               last_entry_id = EXCLUDED.last_entry_id, updated_at = NOW()`,
            studentId,
            latest.academic_year_id,
            truth.toDb(),
            latest.id,
          );
        }
      });
    }

    return { checked: students.length, drifted };
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
