import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { BulkAssignFailure, BulkAssignJobRow } from './entities/bill-assignment.entity';
import { ClassScope, isClassMismatch, mismatchMessage } from './bill-class-guard.util';
import { ScopeRow, toScope } from './student-fee-structure-assignment.service';

const CHUNK_SIZE = 200;

/**
 * Spec §6: "Chunked createMany inside a transaction, with a job row exposing
 * progress and a per-student failure list." Each chunk is ONE set-based
 * transaction (validate the slice against real students, close any existing
 * OPEN assignment for the valid ones, batch-insert the new row via
 * `unnest(...)` — the same bulk-insert shape as
 * NotificationService.createNotificationsBulk — then update the job row's
 * progress in the SAME transaction). That last part matters for resumability:
 * a crash mid-chunk leaves neither the assignment rows nor the progress
 * counter changed, so the next poll re-attempts the identical slice rather
 * than double-counting or silently skipping it.
 */
@Injectable()
export class BulkAssignRunnerService {
  private readonly logger = new Logger(BulkAssignRunnerService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Drains every PENDING/RUNNING job in the CURRENT tenant. Call inside tenantContext.run(). */
  async drainCurrentTenant(): Promise<{ jobsDrained: number; studentsProcessed: number }> {
    const jobs = await this.tenantPrisma.query<BulkAssignJobRow>(
      `SELECT * FROM bulk_assign_jobs WHERE status IN ('PENDING','RUNNING') ORDER BY created_at`,
    );
    let jobsDrained = 0;
    let studentsProcessed = 0;
    for (const job of jobs) {
      try {
        const result = await this.runJob(job);
        studentsProcessed += result.studentsProcessed;
        jobsDrained++;
      } catch (err) {
        this.logger.error(`Bulk-assign job ${job.id} failed`, err as Error);
        await this.tenantPrisma.execute(
          `UPDATE bulk_assign_jobs SET status = 'FAILED' WHERE id = $1::uuid`,
          job.id,
        );
      }
    }
    return { jobsDrained, studentsProcessed };
  }

  private async runJob(job: BulkAssignJobRow): Promise<{ studentsProcessed: number }> {
    if (job.status === 'PENDING') {
      await this.tenantPrisma.execute(
        `UPDATE bulk_assign_jobs SET status = 'RUNNING', started_at = NOW()
         WHERE id = $1::uuid AND status = 'PENDING'`,
        job.id,
      );
    }

    // FEE-CLASS-GUARD: the structure's own class/section, read once per job —
    // it can't change mid-run, and re-reading it per chunk would only add
    // queries. The per-STUDENT comparison still happens inside each chunk
    // (spec §2: scope can be a hand-picked list spanning several classes).
    const structureScope = await this.loadStructureScope(job.fee_structure_id);

    const allIds = job.scope_student_ids ?? [];
    let processed = job.processed;
    let studentsProcessed = 0;

    while (processed < allIds.length) {
      const chunk = allIds.slice(processed, processed + CHUNK_SIZE);
      await this.processChunk(job, chunk, structureScope);
      processed += chunk.length;
      studentsProcessed += chunk.length;
    }

    await this.tenantPrisma.execute(
      `UPDATE bulk_assign_jobs SET status = 'COMPLETED', completed_at = NOW()
       WHERE id = $1::uuid AND status = 'RUNNING'`,
      job.id,
    );
    return { studentsProcessed };
  }

  /** The fee structure's own class/section + display names (FEE-CLASS-GUARD). */
  private async loadStructureScope(feeStructureId: string): Promise<ClassScope> {
    const rows = await this.tenantPrisma.query<ScopeRow>(
      `SELECT bfs.class_id, bfs.section_id, c.name AS class_name, sec.name AS section_name
         FROM bill_fee_structures bfs
         LEFT JOIN classes  c   ON c.id   = bfs.class_id
         LEFT JOIN sections sec ON sec.id = bfs.section_id
        WHERE bfs.id = $1::uuid`,
      feeStructureId,
    );
    return toScope(rows[0] ?? { class_id: null, section_id: null, class_name: null, section_name: null });
  }

  private async processChunk(
    job: BulkAssignJobRow,
    chunk: string[],
    structureScope: ClassScope,
  ): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      const validRows = await tx.$queryRawUnsafe<({ id: string } & ScopeRow)[]>(
        `SELECT s.id, s.class_id, s.section_id,
                c.name AS class_name, sec.name AS section_name
           FROM students s
           LEFT JOIN classes  c   ON c.id   = s.class_id
           LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = ANY($1::uuid[]) AND s.deleted_at IS NULL AND s.status = 'ACTIVE'`,
        chunk,
      );
      const byId = new Map(validRows.map((r) => [r.id, r]));
      const newFailures: BulkAssignFailure[] = [];
      const validIds: string[] = [];
      // Parallel to validIds — true where THAT student's assignment is a
      // deliberately-overridden mismatch, so the stamp lands only on the rows
      // it's actually true for, not uniformly across the run.
      const overridden: boolean[] = [];

      for (const id of chunk) {
        const row = byId.get(id);
        if (!row) {
          newFailures.push({ studentId: id, error: 'Student not found or inactive', reason: 'STUDENT_INVALID' });
          continue;
        }
        const studentScope = toScope(row);
        const mismatch = isClassMismatch(structureScope, studentScope);
        if (mismatch && !job.allow_cross_class) {
          // FEE-CLASS-GUARD spec §2: one student's mismatch skips only that
          // student — every other student in the chunk proceeds untouched.
          newFailures.push({
            studentId: id,
            error: `Class mismatch. ${mismatchMessage(structureScope, studentScope)}`,
            reason: 'CLASS_MISMATCH',
          });
          continue;
        }
        validIds.push(id);
        overridden.push(mismatch);
      }

      if (validIds.length > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE student_fee_structure_assignments
             SET effective_to = $3::date - 1, updated_at = NOW()
           WHERE student_id = ANY($1::uuid[]) AND academic_year_id = $2::uuid
             AND effective_to IS NULL AND deleted_at IS NULL`,
          validIds,
          job.academic_year_id,
          job.effective_from,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO student_fee_structure_assignments
             (student_id, fee_structure_id, academic_year_id, effective_from, assigned_by,
              class_mismatch_overridden, overridden_by_user_id, overridden_at)
           SELECT s, $2::uuid, $3::uuid, $4::date, $5::uuid,
                  m, CASE WHEN m THEN $5::uuid END, CASE WHEN m THEN NOW() END
             FROM unnest($1::uuid[], $6::boolean[]) AS t(s, m)`,
          validIds,
          job.fee_structure_id,
          job.academic_year_id,
          job.effective_from,
          job.created_by,
          overridden,
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE bulk_assign_jobs
           SET processed = processed + $2, failed_count = failed_count + $3,
               failures = failures || $4::jsonb
         WHERE id = $1::uuid`,
        job.id,
        chunk.length,
        newFailures.length,
        JSON.stringify(newFailures),
      );
    });
  }
}
