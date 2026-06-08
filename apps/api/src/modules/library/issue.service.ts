import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  BookCopyRow,
  LibraryMemberRow,
  BookIssueRow,
  BookIssueResponseDto,
  toBookIssueResponse,
} from './entities/library.entity';
import { IssueBookDto, ReturnBookDto, IssueQueryDto } from './dto/library.dto';

@Injectable()
export class IssueService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async issueBook(dto: IssueBookDto, issuedBy: string): Promise<BookIssueResponseDto> {
    const [copy] = await this.tenantPrisma.query<BookCopyRow>(
      `SELECT * FROM book_copies WHERE id = $1::uuid AND is_available = true AND deleted_at IS NULL`,
      dto.bookCopyId,
    );
    if (!copy) throw new BadRequestException('Book copy is not available');

    const [member] = await this.tenantPrisma.query<LibraryMemberRow>(
      `SELECT * FROM library_members WHERE id = $1::uuid AND is_active = true AND deleted_at IS NULL`,
      dto.memberId,
    );
    if (!member) throw new BadRequestException('Library member is inactive');

    const [{ count }] = await this.tenantPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM book_issues WHERE member_id = $1::uuid AND status = 'ISSUED'`,
      dto.memberId,
    );
    if (Number(count) >= member.max_books) {
      throw new BadRequestException('Member has reached borrowing limit');
    }

    const [fineRecord] = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM book_issues WHERE member_id = $1::uuid AND fine_amount > 0 AND fine_paid = false LIMIT 1`,
      dto.memberId,
    );
    if (fineRecord) throw new BadRequestException('Member has unpaid fines — please clear dues first');

    return this.tenantPrisma.run(async (tx) => {
      const [issue] = await tx.$queryRawUnsafe<BookIssueRow[]>(
        `INSERT INTO book_issues (book_copy_id, member_id, issued_by, due_date, fine_per_day, notes)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6)
         RETURNING *`,
        dto.bookCopyId,
        dto.memberId,
        issuedBy,
        dto.dueDate,
        dto.finePerDay ?? 5,
        dto.notes ?? null,
      );
      await tx.$executeRawUnsafe(
        `UPDATE book_copies SET is_available = false, updated_at = NOW() WHERE id = $1::uuid`,
        dto.bookCopyId,
      );
      return toBookIssueResponse(issue);
    });
  }

  async returnBook(
    issueId: string,
    dto: ReturnBookDto,
    returnedBy: string,
  ): Promise<BookIssueResponseDto> {
    const [issue] = await this.tenantPrisma.query<BookIssueRow>(
      `SELECT * FROM book_issues WHERE id = $1::uuid AND status = 'ISSUED'`,
      issueId,
    );
    if (!issue) throw new NotFoundException('Issue record not found or already returned');

    return this.tenantPrisma.run(async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueDateStr =
        issue.due_date instanceof Date
          ? issue.due_date.toISOString().split('T')[0]
          : String(issue.due_date).split('T')[0];
      const dueDate = new Date(dueDateStr);
      dueDate.setHours(0, 0, 0, 0);

      let fineDays = 0;
      let fineAmount = 0;
      if (today > dueDate) {
        fineDays = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        fineAmount = fineDays * parseFloat(String(issue.fine_per_day));
      }

      const todayStr = today.toISOString().split('T')[0];

      const [updated] = await tx.$queryRawUnsafe<BookIssueRow[]>(
        `UPDATE book_issues SET
           status = 'RETURNED',
           returned_at = $1::date,
           returned_to = $2::uuid,
           fine_days = $3,
           fine_amount = $4,
           updated_at = NOW()
         WHERE id = $5::uuid
         RETURNING *`,
        todayStr,
        returnedBy,
        fineDays,
        fineAmount,
        issueId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE book_copies SET is_available = true, updated_at = NOW() WHERE id = $1::uuid`,
        issue.book_copy_id,
      );
      return toBookIssueResponse(updated);
    });
  }

  async markLost(issueId: string): Promise<BookIssueResponseDto> {
    const [issue] = await this.tenantPrisma.query<BookIssueRow>(
      `SELECT * FROM book_issues WHERE id = $1::uuid AND status = 'ISSUED'`,
      issueId,
    );
    if (!issue) throw new NotFoundException('Issue record not found or not in ISSUED state');

    return this.tenantPrisma.run(async (tx) => {
      const [updated] = await tx.$queryRawUnsafe<BookIssueRow[]>(
        `UPDATE book_issues SET status = 'LOST', updated_at = NOW() WHERE id = $1::uuid RETURNING *`,
        issueId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE book_copies SET condition = 'LOST', is_available = false, updated_at = NOW() WHERE id = $1::uuid`,
        issue.book_copy_id,
      );
      return toBookIssueResponse(updated);
    });
  }

  async payFine(issueId: string): Promise<BookIssueResponseDto> {
    const rows = await this.tenantPrisma.query<BookIssueRow>(
      `UPDATE book_issues SET fine_paid = true, updated_at = NOW() WHERE id = $1::uuid RETURNING *`,
      issueId,
    );
    if (!rows[0]) throw new NotFoundException(`Issue ${issueId} not found`);
    return toBookIssueResponse(rows[0]);
  }

  async getIssues(
    query: IssueQueryDto,
  ): Promise<{ data: BookIssueResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`bi.status = $${params.length}`);
    }
    if (query.memberId) {
      params.push(query.memberId);
      conditions.push(`bi.member_id = $${params.length}::uuid`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    const limitN = params.length - 1;
    const offsetN = params.length;

    const rows = await this.tenantPrisma.query<BookIssueRow & { book_title: string; copy_number: string; member_name: string }>(
      `SELECT bi.*, lm.member_number,
              b.title AS book_title, bc.copy_number AS copy_number,
              COALESCE(s.first_name || ' ' || s.last_name, u.first_name || ' ' || u.last_name) AS member_name,
              COUNT(*) OVER() AS total_count
       FROM book_issues bi
       JOIN library_members lm ON lm.id = bi.member_id
       JOIN book_copies bc ON bc.id = bi.book_copy_id
       JOIN books b ON b.id = bc.book_id
       LEFT JOIN students s ON s.id = lm.student_id
       LEFT JOIN users u ON u.id = lm.user_id
       ${where}
       ORDER BY bi.created_at DESC
       LIMIT $${limitN} OFFSET $${offsetN}`,
      ...params,
    );
    const total = rows[0] ? parseInt(String(rows[0].total_count ?? '0')) : 0;
    return { data: rows.map(toBookIssueResponse), meta: { page, limit, total } };
  }

  async getOverdueIssues(
    query: IssueQueryDto,
  ): Promise<{ data: (BookIssueResponseDto & { overdueDays: number })[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<BookIssueRow & { book_title: string; copy_number: string; member_name: string }>(
      `SELECT bi.*, lm.member_number,
         CURRENT_DATE - bi.due_date AS overdue_days,
         b.title AS book_title, bc.copy_number AS copy_number,
         COALESCE(s.first_name || ' ' || s.last_name, u.first_name || ' ' || u.last_name) AS member_name,
         COUNT(*) OVER() AS total_count
       FROM book_issues bi
       JOIN library_members lm ON lm.id = bi.member_id
       JOIN book_copies bc ON bc.id = bi.book_copy_id
       JOIN books b ON b.id = bc.book_id
       LEFT JOIN students s ON s.id = lm.student_id
       LEFT JOIN users u ON u.id = lm.user_id
       WHERE bi.status = 'ISSUED' AND bi.due_date < CURRENT_DATE
       ORDER BY bi.due_date ASC
       LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );
    const total = rows[0] ? parseInt(String(rows[0].total_count ?? '0')) : 0;
    return {
      data: rows.map((r) => ({ ...toBookIssueResponse(r), overdueDays: Number(r.overdue_days ?? 0) })),
      meta: { page, limit, total },
    };
  }
}
