import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { GuardianService } from '../student/guardian.service';
import type { BulkSmsDto } from './dto/sms.dto';

export function normaliseNepalPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('977') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 10) {
    const rest = digits.slice(1);
    if (rest.startsWith('97') || rest.startsWith('98')) return '977' + rest;
    return null;
  }
  if (digits.length === 10 && (digits.startsWith('97') || digits.startsWith('98'))) {
    return '977' + digits;
  }
  return null;
}

export interface BulkSendResult {
  sent: number;
  failed: number;
  skipped: number;
}

export interface SmsLogDto {
  id: string;
  toNumber: string;
  message: string;
  trigger: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'MOCK';
  sentAt: string | null;
  errorMessage: string | null;
  studentName: string | null;
}

function toSmsLogResponse(row: {
  id: string;
  to_number: string;
  message: string;
  trigger: string;
  status: string;
  student_id: string | null;
  sent_at: Date | string | null;
  error_message: string | null;
  created_at: Date | string;
}): SmsLogDto {
  return {
    id: row.id,
    toNumber: row.to_number,
    message: row.message,
    trigger: row.trigger,
    status: row.status as SmsLogDto['status'],
    sentAt: row.sent_at
      ? (row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at))
      : null,
    errorMessage: row.error_message ?? null,
    studentName: null, // resolved via JOIN if needed; placeholder for now
  };
}

@Injectable()
export class SmsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianService: GuardianService,
  ) {}

  async send(
    to: string,
    message: string,
    trigger: string,
    studentId?: string,
  ): Promise<void> {
    const normalised = normaliseNepalPhone(to);
    if (!normalised) throw new BadRequestException(`Invalid Nepal phone: ${to}`);

    const logId = await this.tenantPrisma.run(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO sms_logs (to_number, message, trigger, status, student_id)
         VALUES ($1, $2, $3, 'PENDING', $4::uuid)
         RETURNING id`,
        normalised,
        message,
        trigger,
        studentId ?? null,
      );
      return rows[0].id;
    });

    if (process.env.SPARROW_SMS_ENABLED !== 'true') {
      console.log(`[SMS MOCK] To: ${normalised} | ${message}`);
      await this.tenantPrisma.run((tx) =>
        tx.$executeRawUnsafe(
          `UPDATE sms_logs SET status = 'MOCK' WHERE id = $1::uuid`,
          logId,
        ),
      );
      return;
    }

    try {
      const resp = await fetch('https://api.sparrowsms.com/v2/sms/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SPARROW_SMS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SPARROW_SMS_SENDER,
          to: normalised,
          text: message,
        }),
      });
      const data = (await resp.json()) as { response_code: number; uid?: number; error?: string };
      if (data.response_code === 200) {
        await this.tenantPrisma.run((tx) =>
          tx.$executeRawUnsafe(
            `UPDATE sms_logs SET status = 'SENT', provider_ref = $2, sent_at = NOW() WHERE id = $1::uuid`,
            logId,
            data.uid != null ? String(data.uid) : null,
          ),
        );
      } else {
        await this.tenantPrisma.run((tx) =>
          tx.$executeRawUnsafe(
            `UPDATE sms_logs SET status = 'FAILED', error_message = $2 WHERE id = $1::uuid`,
            logId,
            data.error ?? 'Unknown error',
          ),
        );
      }
    } catch (err: unknown) {
      await this.tenantPrisma.run((tx) =>
        tx.$executeRawUnsafe(
          `UPDATE sms_logs SET status = 'FAILED', error_message = $2 WHERE id = $1::uuid`,
          logId,
          (err as Error).message,
        ),
      );
    }
  }

  async bulkSend(dto: {
    audience: string;
    classId?: string;
    sectionId?: string;
    customNumbers?: string[];
    message: string;
    trigger?: string;
  }): Promise<BulkSendResult> {
    const phones = await this.collectPhones(dto);
    const unique = [...new Set(phones.filter(Boolean))];
    const skipped = phones.length - unique.length;

    let sent = 0;
    let failed = 0;
    const trigger = dto.trigger ?? 'BULK_SMS';

    for (const phone of unique) {
      try {
        await this.send(phone, dto.message, trigger);
        sent++;
      } catch {
        failed++;
      }
    }

    return { sent, failed, skipped };
  }

  async retrySms(logId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{
      id: string;
      to_number: string;
      message: string;
      trigger: string;
      student_id: string | null;
      status: string;
    }>(
      `SELECT id, to_number, message, trigger, student_id, status FROM sms_logs WHERE id = $1::uuid`,
      logId,
    );

    if (!rows[0]) throw new BadRequestException(`SMS log ${logId} not found`);
    if (rows[0].status !== 'FAILED') {
      throw new BadRequestException(`Can only retry FAILED SMS logs, current status: ${rows[0].status}`);
    }

    const { to_number, message, trigger, student_id } = rows[0];
    // Reset to PENDING before retry
    await this.tenantPrisma.execute(
      `UPDATE sms_logs SET status = 'PENDING', error_message = NULL WHERE id = $1::uuid`,
      logId,
    );

    await this.send(to_number, message, trigger, student_id ?? undefined);
  }

  async getSmsLogs(
    query: { page?: number; limit?: number; status?: string },
  ): Promise<{ data: SmsLogDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<{
      id: string;
      to_number: string;
      message: string;
      trigger: string;
      status: string;
      student_id: string | null;
      sent_at: Date | string | null;
      error_message: string | null;
      created_at: Date | string;
      total_count: string;
    }>(
      `SELECT sl.id, sl.to_number, sl.message, sl.trigger, sl.status, sl.student_id,
              sl.sent_at, sl.error_message, sl.created_at,
              COUNT(*) OVER() AS total_count
       FROM sms_logs sl
       ${where}
       ORDER BY sl.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toSmsLogResponse), meta: { page, limit, total } };
  }

  private async collectPhones(dto: {
    audience: string;
    classId?: string;
    sectionId?: string;
    customNumbers?: string[];
  }): Promise<string[]> {
    if (dto.audience === 'CUSTOM') {
      return dto.customNumbers ?? [];
    }

    if (dto.audience === 'ALL_PARENTS') {
      // FIX-1B: resolve one contact per student from the normalized `guardians`
      // table via the shared CL helper (primary-flagged, else earliest —
      // and now filtered to ACTIVE guardian links). The legacy
      // students.guardians JSONB is deprecated and no longer read.
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE deleted_at IS NULL`,
      );
      const phones = await this.guardianService.getPrimaryGuardianPhones(rows.map((r) => r.id));
      return [...phones.values()];
    }

    if (dto.audience === 'ALL_TEACHERS') {
      const rows = await this.tenantPrisma.query<{ phone: string }>(
        `SELECT phone FROM users WHERE role = 'TEACHER' AND deleted_at IS NULL AND phone IS NOT NULL`,
      );
      return rows.map((r) => r.phone);
    }

    if (dto.audience === 'CLASS' && dto.classId) {
      // Same normalized primary-else-earliest rule as ALL_PARENTS, scoped to a class.
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT s.id FROM students s
         JOIN enrollments e ON e.student_id = s.id
         WHERE e.class_id = $1::uuid AND s.deleted_at IS NULL`,
        dto.classId,
      );
      const phones = await this.guardianService.getPrimaryGuardianPhones(rows.map((r) => r.id));
      return [...phones.values()];
    }

    if (dto.audience === 'SECTION' && dto.sectionId) {
      // Same normalized primary-else-earliest rule as ALL_PARENTS, scoped to a section.
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE section_id = $1::uuid AND deleted_at IS NULL`,
        dto.sectionId,
      );
      const phones = await this.guardianService.getPrimaryGuardianPhones(rows.map((r) => r.id));
      return [...phones.values()];
    }

    return [];
  }
}
