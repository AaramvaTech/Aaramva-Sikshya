import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getBsYear } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  LibraryMemberRow,
  BookIssueRow,
  LibraryMemberResponseDto,
  BookIssueResponseDto,
  toLibraryMemberResponse,
  toBookIssueResponse,
} from './entities/library.entity';
import { RegisterMemberDto, UpdateMemberDto, MemberQueryDto } from './dto/library.dto';

@Injectable()
export class LibraryMemberService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async registerMember(dto: RegisterMemberDto): Promise<LibraryMemberResponseDto> {
    if (dto.type === 'STUDENT' && !dto.studentId) {
      throw new BadRequestException('studentId is required for STUDENT type');
    }
    if (dto.type === 'STAFF' && !dto.userId) {
      throw new BadRequestException('userId is required for STAFF type');
    }

    return this.tenantPrisma.run(async (tx) => {
      const existing =
        dto.type === 'STUDENT'
          ? await tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM library_members WHERE student_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
              dto.studentId,
            )
          : await tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM library_members WHERE user_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
              dto.userId,
            );

      if (existing.length > 0) {
        throw new BadRequestException('This student/user is already a library member');
      }

      const bsYear = getBsYear(new Date());
      const seqKey = `lib_seq_${bsYear}`;
      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ($1, 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        seqKey,
      );
      const memberNumber = `LIB-${bsYear}-${String(Number(seqRow.value)).padStart(4, '0')}`;

      const [member] = await tx.$queryRawUnsafe<LibraryMemberRow[]>(
        `INSERT INTO library_members (member_number, student_id, user_id, max_books)
         VALUES ($1, $2::uuid, $3::uuid, $4)
         RETURNING *`,
        memberNumber,
        dto.studentId ?? null,
        dto.userId ?? null,
        dto.maxBooks ?? 2,
      );
      return toLibraryMemberResponse(member);
    });
  }

  async listMembers(
    query: MemberQueryDto,
  ): Promise<{ data: LibraryMemberResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<
      LibraryMemberRow & { member_name: string; member_type: 'STUDENT' | 'STAFF'; current_issue_count: string }
    >(
      `SELECT lm.*,
              COALESCE(s.first_name || ' ' || s.last_name, u.first_name || ' ' || u.last_name) AS member_name,
              CASE WHEN lm.student_id IS NOT NULL THEN 'STUDENT' ELSE 'STAFF' END AS member_type,
              COALESCE(ic.cnt, 0) AS current_issue_count,
              COUNT(*) OVER() AS total_count
       FROM library_members lm
       LEFT JOIN students s ON s.id = lm.student_id
       LEFT JOIN users u ON u.id = lm.user_id
       LEFT JOIN (
         SELECT member_id, COUNT(*) AS cnt FROM book_issues WHERE status = 'ISSUED' GROUP BY member_id
       ) ic ON ic.member_id = lm.id
       WHERE lm.deleted_at IS NULL
       ORDER BY lm.created_at DESC
       LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );
    const total = rows[0] ? parseInt(String(rows[0].total_count ?? '0')) : 0;
    return { data: rows.map(toLibraryMemberResponse), meta: { page, limit, total } };
  }

  async getMemberDetail(
    id: string,
  ): Promise<LibraryMemberResponseDto & { currentIssues: BookIssueResponseDto[] }> {
    const [member] = await this.tenantPrisma.query<LibraryMemberRow>(
      `SELECT * FROM library_members WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!member) throw new NotFoundException(`Member ${id} not found`);

    const issues = await this.tenantPrisma.query<BookIssueRow>(
      `SELECT bi.*
       FROM book_issues bi
       WHERE bi.member_id = $1::uuid AND bi.status = 'ISSUED'
       ORDER BY bi.issued_at DESC`,
      id,
    );

    return { ...toLibraryMemberResponse(member), currentIssues: issues.map(toBookIssueResponse) };
  }

  async updateMember(id: string, dto: UpdateMemberDto): Promise<LibraryMemberResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    if (dto.maxBooks !== undefined) { params.push(dto.maxBooks); sets.push(`max_books = $${params.length}`); }
    if (dto.isActive !== undefined) { params.push(dto.isActive); sets.push(`is_active = $${params.length}`); }

    params.push(id);
    const rows = await this.tenantPrisma.query<LibraryMemberRow>(
      `UPDATE library_members SET ${sets.join(', ')}
       WHERE id = $${params.length}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Member ${id} not found`);
    return toLibraryMemberResponse(rows[0]);
  }
}
