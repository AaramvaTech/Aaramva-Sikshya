import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { BulkAssignJobRow } from './entities/bill-assignment.entity';

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

    const allIds = job.scope_student_ids ?? [];
    let processed = job.processed;
    let studentsProcessed = 0;

    while (processed < allIds.length) {
      const chunk = allIds.slice(processed, processed + CHUNK_SIZE);
      await this.processChunk(job, chunk);
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

  private async processChunk(job: BulkAssignJobRow, chunk: string[]): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      const validRows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM students WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND status = 'ACTIVE'`,
        chunk,
      );
      const validSet = new Set(validRows.map((r) => r.id));
      const validIds = chunk.filter((id) => validSet.has(id));
      const newFailures = chunk
        .filter((id) => !validSet.has(id))
        .map((id) => ({ studentId: id, error: 'Student not found or inactive' }));

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
             (student_id, fee_structure_id, academic_year_id, effective_from, assigned_by)
           SELECT s, $2::uuid, $3::uuid, $4::date, $5::uuid FROM unnest($1::uuid[]) AS s`,
          validIds,
          job.fee_structure_id,
          job.academic_year_id,
          job.effective_from,
          job.created_by,
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
