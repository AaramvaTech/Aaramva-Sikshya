import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { LedgerService } from './ledger.service';
import { toMoney } from './entities/finance.entity';
import { OpeningBalanceImportDto, OpeningBalanceRowDto } from './dto/ledger.dto';

export type OpeningBalanceRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface OpeningBalancePreviewRow {
  rowNumber: number;
  data: OpeningBalanceRowDto;
  status: OpeningBalanceRowStatus;
  errors: string[];
}

export interface OpeningBalancePreviewResult {
  rows: OpeningBalancePreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicate: number };
}

export interface OpeningBalanceCommitResult {
  created: { rowNumber: number; entryId: string; studentId: string }[];
  skipped: { rowNumber: number; reason: string }[];
  summary: { created: number; skipped: number };
}

/**
 * Spec §7 "Follows the E.164 backfill precedent from REG-1" — mirrors this
 * codebase's actual dry-run/confirm shape (student/import.service.ts's
 * preview()/commit(), PreviewRow/PreviewResult/CommitResult), not the phone
 * backfill migration itself (which was a one-shot forward SQL migration with
 * no HTTP dry-run step at all).
 */
@Injectable()
export class OpeningBalanceImportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /** Pure validation — no writes. Invariant #6: dry-run creates zero rows. */
  async preview(dto: OpeningBalanceImportDto): Promise<OpeningBalancePreviewResult> {
    const rows: OpeningBalancePreviewRow[] = [];
    let valid = 0;
    let invalid = 0;
    let duplicate = 0;

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      const rowNumber = i + 1;
      const errors: string[] = [];

      const studentRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
        row.studentId,
      );
      if (!studentRows[0]) errors.push('Student not found');

      const yearRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM academic_years WHERE id = $1::uuid`,
        row.academicYearId,
      );
      if (!yearRows[0]) errors.push('Academic year not found');

      if (toMoney(row.amount).isZero()) errors.push('Amount must be greater than zero');

      let status: OpeningBalanceRowStatus = errors.length > 0 ? 'invalid' : 'valid';

      if (status === 'valid') {
        const existing = await this.tenantPrisma.query<{ id: string }>(
          `SELECT id FROM student_ledger_entries
           WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND entry_type = 'OPENING_BALANCE'`,
          row.studentId,
          row.academicYearId,
        );
        if (existing.length > 0) {
          status = 'duplicate';
          errors.push('Student already has an opening balance for this academic year');
        }
      }

      if (status === 'valid') valid++;
      else if (status === 'duplicate') duplicate++;
      else invalid++;

      rows.push({ rowNumber, data: row, status, errors });
    }

    return { rows, summary: { total: dto.rows.length, valid, invalid, duplicate } };
  }

  /** Re-validates fresh (never trusts a client-echoed preview) before posting each valid row. */
  async confirm(dto: OpeningBalanceImportDto, createdById: string): Promise<OpeningBalanceCommitResult> {
    const preview = await this.preview(dto);
    const created: OpeningBalanceCommitResult['created'] = [];
    const skipped: OpeningBalanceCommitResult['skipped'] = [];

    for (const row of preview.rows) {
      if (row.status !== 'valid') {
        skipped.push({ rowNumber: row.rowNumber, reason: row.errors.join('; ') });
        continue;
      }
      try {
        const entry = await this.ledgerService.openingBalance(
          row.data.studentId,
          row.data.academicYearId,
          row.data.amount,
          row.data.direction,
          row.data.narration,
          createdById,
        );
        created.push({ rowNumber: row.rowNumber, entryId: entry.id, studentId: row.data.studentId });
      } catch (e) {
        skipped.push({ rowNumber: row.rowNumber, reason: (e as Error).message });
      }
    }

    return { created, skipped, summary: { created: created.length, skipped: skipped.length } };
  }
}
